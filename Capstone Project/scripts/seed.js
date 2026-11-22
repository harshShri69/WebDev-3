// Seeds sample data so the project can be tested immediately.  Usage: npm run seed
// WARNING: clears the users, courses, sections, enrollments, attendance, announcements and tokens collections.
const mongoose = require('mongoose');
require('../src/config/env');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Course = require('../src/models/Course');
const Section = require('../src/models/Section');
const Enrollment = require('../src/models/Enrollment');
const Attendance = require('../src/models/Attendance');
const Announcement = require('../src/models/Announcement');
const RefreshToken = require('../src/models/RefreshToken');

const daysAgo = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

async function seed() {
  await connectDB();
  await Promise.all([User, Course, Section, Enrollment, Attendance, Announcement, RefreshToken].map((m) => m.deleteMany({})));
  await Promise.all([User, Course, Section, Enrollment, Attendance, Announcement, RefreshToken].map((m) => m.syncIndexes()));

  const admin = await User.create({ name: 'Campus Admin', email: 'admin@campus.test', password: 'Admin@123', role: 'admin' });

  const [f1, f2] = await Promise.all([
    User.create({ name: 'Dr. Asha Verma', email: 'asha.verma@campus.test', password: 'Faculty@123', role: 'faculty', employeeId: 'F001', department: 'Computer Science' }),
    User.create({ name: 'Prof. Rahul Mehta', email: 'rahul.mehta@campus.test', password: 'Faculty@123', role: 'faculty', employeeId: 'F002', department: 'Mathematics' }),
  ]);

  const studentData = [
    ['Aarav Sharma', 'aarav@campus.test', 'CS2026001'],
    ['Diya Patel', 'diya@campus.test', 'CS2026002'],
    ['Kabir Singh', 'kabir@campus.test', 'CS2026003'],
    ['Meera Nair', 'meera@campus.test', 'CS2026004'],
    ['Rohan Gupta', 'rohan@campus.test', 'CS2026005'],
    ['Sara Khan', 'sara@campus.test', 'CS2026006'],
  ];
  const students = [];
  for (const [name, email, rollNumber] of studentData) {
    students.push(await User.create({ name, email, password: 'Student@123', role: 'student', rollNumber, department: 'Computer Science' }));
  }

  const [cs101, ma101, cs201] = await Course.create([
    { code: 'CS101', title: 'Introduction to Programming', department: 'Computer Science', credits: 4, semester: 1 },
    { code: 'MA101', title: 'Engineering Mathematics I', department: 'Mathematics', credits: 4, semester: 1 },
    { code: 'CS201', title: 'Data Structures', department: 'Computer Science', credits: 4, semester: 3 },
  ]);

  const term = '2026-Fall';
  const [cs101A, cs101B, ma101A, cs201A] = await Section.create([
    { course: cs101._id, name: 'A', term, faculty: f1._id, capacity: 3 },
    { course: cs101._id, name: 'B', term, faculty: f1._id, capacity: 30 },
    { course: ma101._id, name: 'A', term, faculty: f2._id, capacity: 30 },
    { course: cs201._id, name: 'A', term, capacity: 30 }, // no faculty assigned yet
  ]);

  // enrolments: students 0-2 -> CS101-A, 3-4 -> CS101-B, all of 0-4 -> MA101-A
  const enrol = (s, c, sec) => ({ student: s._id, course: c._id, section: sec._id });
  await Enrollment.create([
    enrol(students[0], cs101, cs101A), enrol(students[1], cs101, cs101A), enrol(students[2], cs101, cs101A),
    enrol(students[3], cs101, cs101B), enrol(students[4], cs101, cs101B),
    ...students.slice(0, 5).map((s) => enrol(s, ma101, ma101A)),
  ]);

  // attendance for CS101-A (5 past sessions) and MA101-A (4 sessions); Kabir is deliberately low
  const rows = [];
  const mark = (sec, course, fac, students_, offsets, absentMap) => {
    offsets.forEach((off, i) => {
      students_.forEach((s) => {
        const absent = (absentMap[s.rollNumber] || []).includes(i);
        rows.push({ course: course._id, section: sec._id, student: s._id, date: daysAgo(off), session: 1, status: absent ? 'absent' : 'present', markedBy: fac._id });
      });
    });
  };
  mark(cs101A, cs101, f1, students.slice(0, 3), [1, 2, 3, 4, 5], { CS2026003: [0, 1, 2], CS2026002: [4] });
  mark(ma101A, ma101, f2, students.slice(0, 5), [1, 2, 3, 4], { CS2026003: [1, 2], CS2026005: [0] });
  await Attendance.insertMany(rows);

  await Announcement.create([
    { title: 'Welcome to Fall 2026', body: 'Classes begin on Monday. Check your section timetable.', scope: 'university', createdBy: admin._id },
    { title: 'CS101 lab instructions', body: 'Bring your laptops to the first lab session.', scope: 'course', course: cs101._id, createdBy: f1._id },
    { title: 'CS101-A quiz', body: 'A short quiz will be held next week.', scope: 'section', course: cs101._id, section: cs101A._id, createdBy: f1._id },
  ]);

  console.log('Seed complete.\n');
  console.log('Login credentials:');
  console.log('  admin    admin@campus.test        Admin@123');
  console.log('  faculty  asha.verma@campus.test   Faculty@123   (teaches CS101-A, CS101-B)');
  console.log('  faculty  rahul.mehta@campus.test  Faculty@123   (teaches MA101-A)');
  console.log('  student  aarav@campus.test        Student@123   (also diya, kabir, meera, rohan, sara)');
  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
