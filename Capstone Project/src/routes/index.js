const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { validate, validateObjectId } = require('../middleware/validate');
const S = require('../validators/schemas');
const auth = require('../controllers/authController');
const me = require('../controllers/userController');
const course = require('../controllers/courseController');
const section = require('../controllers/sectionController');
const enrollment = require('../controllers/enrollmentController');
const attendance = require('../controllers/attendanceController');
const announcement = require('../controllers/announcementController');
const report = require('../controllers/reportController');
const userAdmin = require('../controllers/userAdminController');

const router = express.Router();
const students = userAdmin('student');
const faculty = userAdmin('faculty');
const id = validateObjectId('id');

// ---------- Auth ----------
router.post('/auth/register', protect, authorize('admin'), validate(S.auth.register), auth.register);
router.post('/auth/login', validate(S.auth.login), auth.login);
router.post('/auth/refresh', validate(S.auth.token), auth.refresh);
router.post('/auth/logout', validate(S.auth.token), auth.logout);

// Everything below requires a valid access token
router.use(protect);

// ---------- Profile ----------
router.get('/users/me', me.getMe);
router.patch('/users/me', validate(S.user.updateMe), me.updateMe);

// ---------- Students (admin: full CRUD, faculty: read own students) ----------
router.get('/students', authorize('admin', 'faculty'), validate(S.user.listQuery, 'query'), students.list);
router.get('/students/:id', authorize('admin', 'faculty'), id, students.get);
router.post('/students', authorize('admin'), validate(S.user.createStudent), students.create);
router.patch('/students/:id', authorize('admin'), id, validate(S.user.updateStudent), students.update);
router.delete('/students/:id', authorize('admin'), id, students.remove);

// ---------- Faculty (admin only) ----------
router.get('/faculty', authorize('admin'), validate(S.user.listQuery, 'query'), faculty.list);
router.get('/faculty/:id', authorize('admin'), id, faculty.get);
router.post('/faculty', authorize('admin'), validate(S.user.createFaculty), faculty.create);
router.patch('/faculty/:id', authorize('admin'), id, validate(S.user.updateFaculty), faculty.update);
router.delete('/faculty/:id', authorize('admin'), id, faculty.remove);

// ---------- Courses (all read, admin writes) ----------
router.get('/courses', validate(S.course.listQuery, 'query'), course.list);
router.get('/courses/:id', id, course.get);
router.post('/courses', authorize('admin'), validate(S.course.create), course.create);
router.patch('/courses/:id', authorize('admin'), id, validate(S.course.update), course.update);
router.delete('/courses/:id', authorize('admin'), id, course.remove);

// ---------- Sections (all read, admin writes) ----------
router.get('/sections', validate(S.section.listQuery, 'query'), section.list);
router.get('/sections/:id', id, section.get);
router.post('/sections', authorize('admin'), validate(S.section.create), section.create);
router.patch('/sections/:id', authorize('admin'), id, validate(S.section.update), section.update);
router.patch('/sections/:id/faculty', authorize('admin'), id, validate(S.section.assignFaculty), section.assignFaculty);
router.delete('/sections/:id', authorize('admin'), id, section.remove);

// ---------- Enrollments ----------
router.get('/enrollments', validate(S.enrollment.listQuery, 'query'), enrollment.list);
router.get('/enrollments/:id', id, enrollment.get);
router.post('/enrollments', authorize('admin'), validate(S.enrollment.create), enrollment.create);
router.delete('/enrollments/:id', authorize('admin'), id, enrollment.remove);

// ---------- Attendance ----------
router.post('/attendance', authorize('faculty'), validate(S.attendance.mark), attendance.mark);
router.get('/attendance', validate(S.attendance.listQuery, 'query'), attendance.list);
router.get('/attendance/summary', validate(S.attendance.summaryQuery, 'query'), attendance.summary);
router.patch('/attendance/:id', authorize('faculty'), id, validate(S.attendance.correct), attendance.correct);

// ---------- Announcements ----------
router.post('/announcements', authorize('admin', 'faculty'), validate(S.announcement.create), announcement.create);
router.get('/announcements', validate(S.announcement.listQuery, 'query'), announcement.list);
router.get('/announcements/:id', id, announcement.get);
router.patch('/announcements/:id', authorize('admin', 'faculty'), id, validate(S.announcement.update), announcement.update);
router.delete('/announcements/:id', authorize('admin', 'faculty'), id, announcement.remove);

// ---------- Reports (admin + faculty; faculty limited to own sections) ----------
router.use('/reports', authorize('admin', 'faculty'));
router.get('/reports/attendance/summary', validate(S.report.attendanceQuery, 'query'), report.attendanceSummary);
router.get('/reports/attendance/low', validate(S.report.lowAttendanceQuery, 'query'), report.lowAttendance);
router.get('/reports/enrollment/courses', validate(S.report.attendanceQuery, 'query'), report.courseEnrollment);
router.get('/reports/enrollment/sections', validate(S.report.enrollmentQuery, 'query'), report.sectionEnrollment);

module.exports = router;
