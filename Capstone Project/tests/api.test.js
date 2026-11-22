// Integration tests (node:test + supertest) run against a separate database: campus_test
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/campus_test';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const request = require('supertest');
const { io: ioClient } = require('socket.io-client');
const mongoose = require('mongoose');

const connectDB = require('../src/config/db');
const app = require('../src/app');
const { initSocket } = require('../src/sockets');
const { registerListeners } = require('../src/events/listeners');
const User = require('../src/models/User');

let server, port;
const t = {}; // shared state: tokens and ids
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const api = (method, url, token) => {
  const r = request(app)[method](url);
  return token ? r.set('Authorization', `Bearer ${token}`) : r;
};
const login = async (email, password) => (await api('post', '/api/auth/login').send({ email, password })).body.data;

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  await User.create({ name: 'Admin', email: 'admin@test.io', password: 'Admin@123', role: 'admin' });
  server = http.createServer(app);
  initSocket(server);
  registerListeners();
  await new Promise((r) => server.listen(0, r));
  port = server.address().port;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise((r) => server.close(r));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('auth: login success, wrong password, validation, no token, bad token', async () => {
  const ok = await api('post', '/api/auth/login').send({ email: 'admin@test.io', password: 'Admin@123' });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.data.accessToken && ok.body.data.refreshToken);
  assert.equal(ok.body.data.user.password, undefined);
  t.admin = ok.body.data;

  assert.equal((await api('post', '/api/auth/login').send({ email: 'admin@test.io', password: 'nope' })).status, 401);
  const bad = await api('post', '/api/auth/login').send({ email: 'not-an-email' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.errors.length >= 1);
  assert.equal((await api('get', '/api/users/me')).status, 401);
  assert.equal((await api('get', '/api/users/me', 'garbage')).status, 401);
});

test('password is stored as a bcrypt hash', async () => {
  const u = await User.findOne({ email: 'admin@test.io' }).select('+password');
  assert.match(u.password, /^\$2[aby]\$/);
});

test('refresh token rotation and logout invalidation', async () => {
  const r = await api('post', '/api/auth/refresh').send({ refreshToken: t.admin.refreshToken });
  assert.equal(r.status, 200);
  // old refresh token cannot be reused
  assert.equal((await api('post', '/api/auth/refresh').send({ refreshToken: t.admin.refreshToken })).status, 401);
  const newRt = r.body.data.refreshToken;
  assert.equal((await api('post', '/api/auth/logout').send({ refreshToken: newRt })).status, 200);
  assert.equal((await api('post', '/api/auth/refresh').send({ refreshToken: newRt })).status, 401);
  t.admin = await login('admin@test.io', 'Admin@123');
});

test('admin creates faculty, students, course, sections', async () => {
  const A = t.admin.accessToken;
  const f = await api('post', '/api/faculty', A).send({ name: 'Fac One', email: 'f1@test.io', password: 'Faculty@123', employeeId: 'F1', department: 'CS' });
  assert.equal(f.status, 201);
  t.f1Id = f.body.data._id;
  const f2 = await api('post', '/api/faculty', A).send({ name: 'Fac Two', email: 'f2@test.io', password: 'Faculty@123', employeeId: 'F2', department: 'CS' });
  t.f2Id = f2.body.data._id;

  t.studentIds = [];
  for (let i = 1; i <= 3; i++) {
    const s = await api('post', '/api/students', A).send({ name: `Student ${i}`, email: `s${i}@test.io`, password: 'Student@123', rollNumber: `R${i}`, department: 'CS' });
    assert.equal(s.status, 201);
    t.studentIds.push(s.body.data._id);
  }
  const c = await api('post', '/api/courses', A).send({ code: 'cs101', title: 'Intro', department: 'CS', credits: 4, semester: 1 });
  assert.equal(c.status, 201);
  assert.equal(c.body.data.code, 'CS101');
  t.courseId = c.body.data._id;

  const s1 = await api('post', '/api/sections', A).send({ course: t.courseId, name: 'a', term: '2026-Fall', faculty: t.f1Id, capacity: 2 });
  assert.equal(s1.status, 201);
  t.sec1 = s1.body.data._id;
  const s2 = await api('post', '/api/sections', A).send({ course: t.courseId, name: 'B', term: '2026-Fall', faculty: t.f2Id });
  t.sec2 = s2.body.data._id;

  t.f1 = await login('f1@test.io', 'Faculty@123');
  t.f2 = await login('f2@test.io', 'Faculty@123');
  t.s1 = await login('s1@test.io', 'Student@123');
  t.s2 = await login('s2@test.io', 'Student@123');
});

test('validation, duplicates, not-found, RBAC on core entities', async () => {
  const A = t.admin.accessToken;
  assert.equal((await api('post', '/api/courses', A).send({ code: 'X' })).status, 400);
  assert.equal((await api('post', '/api/courses', A).send({ code: 'CS101', title: 'Dup', department: 'CS', credits: 3, semester: 1 })).status, 409);
  assert.equal((await api('post', '/api/students', A).send({ name: 'Dup', email: 's1@test.io', password: 'Student@123', rollNumber: 'R9', department: 'CS' })).status, 409);
  assert.equal((await api('get', '/api/courses/64b7f0f0f0f0f0f0f0f0f0f0', A)).status, 404);
  assert.equal((await api('get', '/api/courses/not-an-id', A)).status, 400);
  assert.equal((await api('get', '/api/nope', A)).status, 404);
  assert.equal((await api('post', '/api/courses', t.s1.accessToken).send({ code: 'Z', title: 'Z', department: 'CS', credits: 3, semester: 1 })).status, 403);
  assert.equal((await api('post', '/api/auth/register', t.f1.accessToken).send({})).status, 403);
  assert.equal((await api('get', '/api/faculty', t.s1.accessToken)).status, 403);
  const list = await api('get', '/api/courses?q=intro&page=1&limit=5', t.s1.accessToken);
  assert.equal(list.status, 200);
  assert.equal(list.body.meta.total, 1);
});

test('enrolments: success, duplicate, invalid refs, section full, section/course mismatch', async () => {
  const A = t.admin.accessToken;
  const body = (i, sec) => ({ student: t.studentIds[i], course: t.courseId, section: sec });
  assert.equal((await api('post', '/api/enrollments', A).send(body(0, t.sec1))).status, 201);
  assert.equal((await api('post', '/api/enrollments', A).send(body(0, t.sec1))).status, 409); // duplicate
  assert.equal((await api('post', '/api/enrollments', A).send(body(1, t.sec1))).status, 201);
  assert.equal((await api('post', '/api/enrollments', A).send(body(2, t.sec1))).status, 409); // capacity 2 -> full
  assert.equal((await api('post', '/api/enrollments', A).send({ ...body(2, t.sec2), student: t.f1Id })).status, 400); // faculty is not a student
  assert.equal((await api('post', '/api/enrollments', A).send({ ...body(2, t.sec2), course: '64b7f0f0f0f0f0f0f0f0f0f0' })).status, 400);
  assert.equal((await api('post', '/api/enrollments', t.f1.accessToken).send(body(2, t.sec2))).status, 403);
  const mine = await api('get', '/api/enrollments', t.s1.accessToken);
  assert.equal(mine.body.data.length, 1);
  assert.equal((await api('get', `/api/enrollments?student=${t.studentIds[1]}`, t.s1.accessToken)).status, 403);
});

test('attendance: marking rules, duplicates, correction rule + audit, student privacy', async () => {
  const F1 = t.f1.accessToken;
  const mark = (token, over = {}) =>
    api('post', '/api/attendance', token).send({
      course: t.courseId, section: t.sec1, date: daysAgo(1), session: 1,
      records: [{ student: t.studentIds[0], status: 'present' }, { student: t.studentIds[1], status: 'absent' }], ...over,
    });

  assert.equal((await mark(t.f2.accessToken)).status, 403); // not assigned to section
  assert.equal((await mark(t.s1.accessToken)).status, 403); // student cannot mark
  assert.equal((await mark(F1, { date: '2999-01-01' })).status, 400); // future date
  assert.equal((await mark(F1, { records: [{ student: t.studentIds[2], status: 'present' }] })).status, 400); // not enrolled
  assert.equal((await mark(F1, { records: [] })).status, 400);
  assert.equal((await mark(F1)).status, 201);
  assert.equal((await mark(F1)).status, 409); // duplicate session
  assert.equal((await mark(F1, { date: daysAgo(20) })).status, 201); // old record, used for window test
  assert.equal((await mark(F1, { date: daysAgo(2), records: [{ student: t.studentIds[0], status: 'present' }, { student: t.studentIds[1], status: 'present' }] })).status, 201);

  // student sees own records only
  const own = await api('get', '/api/attendance', t.s1.accessToken);
  assert.equal(own.status, 200);
  assert.ok(own.body.data.every((r) => r.student._id === t.studentIds[0]));
  assert.equal((await api('get', `/api/attendance?student=${t.studentIds[1]}`, t.s1.accessToken)).status, 403);
  assert.equal((await api('get', `/api/attendance/summary?student=${t.studentIds[1]}`, t.s1.accessToken)).status, 403);
  assert.equal((await api('get', `/api/attendance?section=${t.sec1}`, t.f2.accessToken)).status, 403);

  // correction
  const s2Records = await api('get', `/api/attendance?student=${t.studentIds[1]}&limit=50`, F1);
  const absent = s2Records.body.data.find((r) => r.status === 'absent' && r.date.slice(0, 10) === daysAgo(1));
  const old = s2Records.body.data.find((r) => r.date.slice(0, 10) === daysAgo(20));
  assert.equal((await api('patch', `/api/attendance/${absent._id}`, t.f2.accessToken).send({ status: 'present', reason: 'late arrival' })).status, 403);
  assert.equal((await api('patch', `/api/attendance/${absent._id}`, F1).send({ status: 'present' })).status, 400); // reason required
  const fixed = await api('patch', `/api/attendance/${absent._id}`, F1).send({ status: 'present', reason: 'Student was present' });
  assert.equal(fixed.status, 200);
  assert.equal(fixed.body.data.history.length, 1);
  assert.equal(fixed.body.data.history[0].from, 'absent');
  assert.equal((await api('patch', `/api/attendance/${absent._id}`, F1).send({ status: 'present', reason: 'again' })).status, 400); // no change
  assert.equal((await api('patch', `/api/attendance/${old._id}`, F1).send({ status: 'absent', reason: 'too old' })).status, 403); // outside window
});

test('aggregations: student summary and reports', async () => {
  const sum = await api('get', '/api/attendance/summary', t.s1.accessToken);
  assert.equal(sum.status, 200);
  assert.equal(sum.body.data.subjects[0].courseCode, 'CS101');
  assert.equal(sum.body.data.subjects[0].totalClasses, 3);
  assert.equal(sum.body.data.subjects[0].attendancePercentage, 100);

  // student 2 has 2/3 present = 66.67%? (day1 corrected->present, day2 present, day20 absent)
  const low = await api('get', '/api/reports/attendance/low?threshold=90', t.f1.accessToken);
  assert.equal(low.status, 200);
  assert.equal(low.body.data.students.length, 1);
  assert.equal(low.body.data.students[0].rollNumber, 'R2');
  assert.equal(low.body.data.students[0].attendancePercentage, 66.67);
  assert.equal((await api('get', '/api/reports/attendance/low?threshold=abc', t.f1.accessToken)).status, 400);
  assert.equal((await api('get', '/api/reports/attendance/low', t.s1.accessToken)).status, 403);
  assert.equal((await api('get', '/api/reports/attendance/low')).status, 401);

  const summary = await api('get', '/api/reports/attendance/summary', t.admin.accessToken);
  assert.equal(summary.body.data[0].classesHeld, 3);
  const courses = await api('get', '/api/reports/enrollment/courses', t.admin.accessToken);
  assert.equal(courses.body.data[0].enrolledStudents, 2);
  const secs = await api('get', '/api/reports/enrollment/sections', t.admin.accessToken);
  assert.equal(secs.body.data[0].seatsAvailable, 0);
  // faculty 2 sees nothing from section 1
  const f2 = await api('get', '/api/reports/enrollment/sections', t.f2.accessToken);
  assert.equal(f2.body.data.length, 0);
});

test('announcements: scopes, visibility, RBAC', async () => {
  const A = t.admin.accessToken;
  assert.equal((await api('post', '/api/announcements', t.f1.accessToken).send({ title: 'x', body: 'y', scope: 'university' })).status, 403);
  assert.equal((await api('post', '/api/announcements', t.f2.accessToken).send({ title: 'x', body: 'y', scope: 'section', section: t.sec1 })).status, 403);
  assert.equal((await api('post', '/api/announcements', A).send({ title: 'x', body: 'y', scope: 'section' })).status, 400); // section missing
  assert.equal((await api('post', '/api/announcements', A).send({ title: 'All', body: 'Hello everyone', scope: 'university' })).status, 201);
  assert.equal((await api('post', '/api/announcements', t.f1.accessToken).send({ title: 'Sec', body: 'Section A only', scope: 'section', section: t.sec1 })).status, 201);

  const s1 = await api('get', '/api/announcements', t.s1.accessToken); // enrolled in sec1
  assert.equal(s1.body.data.length, 2);
  const s3 = await api('get', '/api/announcements', (await login('s3@test.io', 'Student@123')).accessToken); // not enrolled
  assert.equal(s3.body.data.length, 1);
  assert.equal((await api('get', '/api/announcements', A)).body.meta.total, 2);
});

test('socket.io: auth required, rooms, real-time announcement + attendance events', async () => {
  const url = `http://localhost:${port}`;
  // unauthenticated connection is rejected
  await new Promise((resolve) => {
    const c = ioClient(url, { reconnection: false });
    c.on('connect_error', (e) => { assert.match(e.message, /Authentication/); c.close(); resolve(); });
  });

  const connect = (token) => new Promise((resolve) => {
    const c = ioClient(url, { auth: { token }, reconnection: false });
    c.on('connected', () => resolve(c));
  });
  const stu1 = await connect(t.s1.accessToken); // enrolled in section 1
  const stu2 = await connect(t.s2.accessToken); // enrolled in section 1
  const s3Token = (await login('s3@test.io', 'Student@123')).accessToken;
  const stu3 = await connect(s3Token); // not enrolled

  const got = { a1: [], a3: [], att1: [], att2: [] };
  stu1.on('announcement:new', (p) => got.a1.push(p));
  stu3.on('announcement:new', (p) => got.a3.push(p));
  stu1.on('attendance:updated', (p) => got.att1.push(p));
  stu2.on('attendance:updated', (p) => got.att2.push(p));

  await api('post', '/api/announcements', t.f1.accessToken).send({ title: 'Live', body: 'Section only', scope: 'section', section: t.sec1 });
  await api('post', '/api/attendance', t.f1.accessToken).send({
    course: t.courseId, section: t.sec1, date: daysAgo(3), session: 1,
    records: [{ student: t.studentIds[0], status: 'present' }, { student: t.studentIds[1], status: 'absent' }],
  });
  await new Promise((r) => setTimeout(r, 400));

  assert.equal(got.a1.length, 1);
  assert.equal(got.a1[0].title, 'Live');
  assert.equal(got.a3.length, 0); // not in the section -> not delivered
  assert.equal(got.att1[0].status, 'present');
  assert.equal(got.att2[0].status, 'absent'); // each student only gets their own status
  [stu1, stu2, stu3].forEach((c) => c.close());
});

test('delete rules and profile update', async () => {
  const A = t.admin.accessToken;
  assert.equal((await api('delete', `/api/students/${t.studentIds[0]}`, A)).status, 409); // has enrolments
  assert.equal((await api('delete', `/api/courses/${t.courseId}`, A)).status, 409); // has sections
  assert.equal((await api('delete', `/api/students/${t.studentIds[2]}`, A)).status, 200); // no related records
  const me = await api('patch', '/api/users/me', t.s1.accessToken).send({ name: 'Renamed', role: 'admin' });
  assert.equal(me.status, 200);
  assert.equal(me.body.data.name, 'Renamed');
  assert.equal(me.body.data.role, 'student'); // role cannot be changed through the profile endpoint
  assert.equal((await api('patch', '/api/users/me', t.s1.accessToken).send({})).status, 400);
});
