const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Enrollment = require('../models/Enrollment');
const Section = require('../models/Section');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const appEvents = require('../events/appEvents');
const { correctionWindowDays } = require('../config/env');
const { sendSuccess } = require('../utils/response');
const { getPagination, buildMeta } = require('../utils/pagination');
const { facultySectionIds } = require('../utils/scope');
const { percentageStages } = require('../utils/attendanceStats');

const DAY_MS = 24 * 60 * 60 * 1000;
const toUtcDate = (str) => new Date(`${str}T00:00:00.000Z`);

const populate = [
  { path: 'student', select: 'name rollNumber' },
  { path: 'course', select: 'code title' },
  { path: 'section', select: 'name term' },
];

// Faculty marks attendance for a whole class session in one request.
exports.mark = asyncHandler(async (req, res) => {
  const { course, section, date, session, records } = req.body;

  const sectionDoc = await Section.findById(section);
  if (!sectionDoc) throw ApiError.badRequest('section does not exist');
  if (!sectionDoc.course.equals(course)) throw ApiError.badRequest('section does not belong to the given course');
  // Business rule: faculty can only mark attendance for their own course/section
  if (!sectionDoc.faculty || !sectionDoc.faculty.equals(req.user._id)) {
    throw ApiError.forbidden('You are not assigned to this course/section');
  }

  const classDate = toUtcDate(date);
  if (Number.isNaN(classDate.getTime())) throw ApiError.badRequest('date is invalid');
  if (classDate.getTime() > Date.now()) throw ApiError.badRequest('Attendance cannot be marked for a future date');

  const studentIds = records.map((r) => r.student);
  if (new Set(studentIds).size !== studentIds.length) throw ApiError.badRequest('records contain the same student more than once');

  // every student must be enrolled in this section
  const enrolled = await Enrollment.find({ section, student: { $in: studentIds } }).select('student');
  const enrolledSet = new Set(enrolled.map((e) => e.student.toString()));
  const notEnrolled = studentIds.filter((id) => !enrolledSet.has(id));
  if (notEnrolled.length) {
    throw ApiError.badRequest('Some students are not enrolled in this section', notEnrolled.map((id) => ({ field: 'student', message: `${id} is not enrolled` })));
  }

  // no duplicate record for the same student + class session
  const existing = await Attendance.find({ course, section, date: classDate, session, student: { $in: studentIds } }).select('student');
  if (existing.length) {
    throw ApiError.conflict(`Attendance already marked for ${existing.length} student(s) in this session. Use the correction endpoint to change it.`);
  }

  const docs = await Attendance.insertMany(
    records.map((r) => ({ course, section, date: classDate, session, student: r.student, status: r.status, markedBy: req.user._id }))
  );

  appEvents.emit('attendance.marked', {
    entries: docs.map((d) => ({ studentId: d.student.toString(), status: d.status })),
    payload: { course, section, date, session },
  });
  sendSuccess(res, { count: docs.length, date, session }, { status: 201, message: 'Attendance marked' });
});

// Correction rule: only the assigned faculty, only within ATTENDANCE_CORRECTION_WINDOW_DAYS of the
// class date, and every change is recorded (who, when, why, old and new status) in `history`.
exports.correct = asyncHandler(async (req, res) => {
  const record = await Attendance.findById(req.params.id).populate('section', 'faculty');
  if (!record) throw ApiError.notFound('Attendance record not found');
  if (!record.section.faculty || !record.section.faculty.equals(req.user._id)) {
    throw ApiError.forbidden('You are not assigned to this course/section');
  }
  if (Date.now() - record.date.getTime() > correctionWindowDays * DAY_MS) {
    throw ApiError.forbidden(`Attendance can only be corrected within ${correctionWindowDays} days of the class date`);
  }
  const { status, reason } = req.body;
  if (record.status === status) throw ApiError.badRequest(`Record is already marked ${status}`);

  record.history.push({ from: record.status, to: status, reason, changedBy: req.user._id });
  record.status = status;
  record.section = record.section._id;
  await record.save();

  appEvents.emit('attendance.corrected', {
    studentId: record.student.toString(),
    payload: { course: record.course, section: record.section, date: record.date.toISOString().slice(0, 10), session: record.session, status },
  });
  sendSuccess(res, record, { message: 'Attendance corrected' });
});

// Shared access check: returns the filter additions allowed for the caller.
async function scopeFilter(user, { student, section }) {
  const filter = {};
  if (user.role === 'student') {
    // A student can only ever see their own records
    if (student && student !== user._id.toString()) throw ApiError.forbidden("You cannot view another student's attendance");
    filter.student = user._id;
  } else if (student) {
    filter.student = new mongoose.Types.ObjectId(student);
  }
  const sectionIds = await facultySectionIds(user);
  if (sectionIds) {
    if (section && !sectionIds.some((id) => id.equals(section))) throw ApiError.forbidden('You are not assigned to this section');
    if (!section) filter.section = { $in: sectionIds };
  }
  return filter;
}

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.validatedQuery);
  const { course, section, student, from, to } = req.validatedQuery;
  const filter = await scopeFilter(req.user, { student, section });
  if (course) filter.course = course;
  if (section) filter.section = section;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = toUtcDate(from);
    if (to) filter.date.$lte = toUtcDate(to);
  }
  const [items, total] = await Promise.all([
    Attendance.find(filter).populate(populate).sort({ date: -1, session: -1 }).skip(skip).limit(limit),
    Attendance.countDocuments(filter),
  ]);
  sendSuccess(res, items, { meta: buildMeta(page, limit, total) });
});

// Subject-wise summary for one student: total classes, classes attended, percentage (aggregation).
exports.summary = asyncHandler(async (req, res) => {
  let { student } = req.validatedQuery;
  if (req.user.role === 'student') student = student || req.user._id.toString();
  if (!student) throw ApiError.badRequest('student query parameter is required');

  const scope = await scopeFilter(req.user, { student });
  const match = { student: new mongoose.Types.ObjectId(student) };
  if (scope.section) match.section = scope.section;

  const data = await Attendance.aggregate([
    { $match: match },
    ...percentageStages('$course'),
    { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
    { $unwind: '$course' },
    { $project: { _id: 0, courseId: '$course._id', courseCode: '$course.code', courseTitle: '$course.title', totalClasses: 1, classesAttended: 1, attendancePercentage: 1 } },
    { $sort: { courseCode: 1 } },
  ]);
  sendSuccess(res, { student, subjects: data });
});
