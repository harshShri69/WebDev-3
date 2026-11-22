const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const Enrollment = require('../models/Enrollment');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { getPagination, buildMeta } = require('../utils/pagination');
const { defaultThreshold } = require('../config/env');
const { facultySectionIds } = require('../utils/scope');
const { percentageStages } = require('../utils/attendanceStats');

const oid = (id) => new mongoose.Types.ObjectId(id);

// Builds the $match for a report, limiting faculty to their own sections.
async function reportMatch(user, { course, section }, sectionField = 'section') {
  const match = {};
  if (course) match.course = oid(course);
  const sectionIds = await facultySectionIds(user);
  if (sectionIds) {
    if (section && !sectionIds.some((id) => id.equals(section))) throw ApiError.forbidden('You are not assigned to this section');
    match[sectionField] = section ? oid(section) : { $in: sectionIds };
  } else if (section) {
    match[sectionField] = oid(section);
  }
  return match;
}

// Aggregation 1: subject-wise attendance summary (per course + section).
exports.attendanceSummary = asyncHandler(async (req, res) => {
  const match = await reportMatch(req.user, req.validatedQuery);
  const data = await Attendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: { course: '$course', section: '$section' },
        sessions: { $addToSet: { date: '$date', session: '$session' } },
        totalRecords: { $sum: 1 },
        presentRecords: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        students: { $addToSet: '$student' },
      },
    },
    {
      $project: {
        classesHeld: { $size: '$sessions' },
        studentCount: { $size: '$students' },
        totalRecords: 1,
        presentRecords: 1,
        averageAttendancePercentage: { $round: [{ $multiply: [{ $divide: ['$presentRecords', '$totalRecords'] }, 100] }, 2] },
      },
    },
    { $lookup: { from: 'courses', localField: '_id.course', foreignField: '_id', as: 'course' } },
    { $lookup: { from: 'sections', localField: '_id.section', foreignField: '_id', as: 'section' } },
    { $unwind: '$course' },
    { $unwind: '$section' },
    {
      $project: {
        _id: 0,
        courseId: '$course._id',
        courseCode: '$course.code',
        courseTitle: '$course.title',
        sectionId: '$section._id',
        section: '$section.name',
        term: '$section.term',
        classesHeld: 1,
        studentCount: 1,
        averageAttendancePercentage: 1,
      },
    },
    { $sort: { courseCode: 1, section: 1 } },
  ]);
  sendSuccess(res, data);
});

// Aggregation 2: students whose attendance in a course is below a (configurable) threshold.
exports.lowAttendance = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.validatedQuery);
  const threshold = req.validatedQuery.threshold ?? defaultThreshold;
  const match = await reportMatch(req.user, req.validatedQuery);

  const [result] = await Attendance.aggregate([
    { $match: match },
    ...percentageStages({ student: '$student', course: '$course' }),
    { $match: { attendancePercentage: { $lt: threshold } } },
    {
      $facet: {
        meta: [{ $count: 'total' }],
        items: [
          { $sort: { attendancePercentage: 1 } },
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'users', localField: '_id.student', foreignField: '_id', as: 'student' } },
          { $lookup: { from: 'courses', localField: '_id.course', foreignField: '_id', as: 'course' } },
          { $unwind: '$student' },
          { $unwind: '$course' },
          {
            $project: {
              _id: 0,
              studentId: '$student._id',
              name: '$student.name',
              rollNumber: '$student.rollNumber',
              courseCode: '$course.code',
              totalClasses: 1,
              classesAttended: 1,
              attendancePercentage: 1,
            },
          },
        ],
      },
    },
  ]);
  const total = result.meta[0] ? result.meta[0].total : 0;
  sendSuccess(res, { threshold, students: result.items }, { meta: buildMeta(page, limit, total) });
});

// Aggregation 3: enrolment count per course.
exports.courseEnrollment = asyncHandler(async (req, res) => {
  const match = await reportMatch(req.user, req.validatedQuery);
  const data = await Enrollment.aggregate([
    { $match: match },
    { $group: { _id: '$course', enrolledStudents: { $sum: 1 }, sections: { $addToSet: '$section' } } },
    { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
    { $unwind: '$course' },
    {
      $project: {
        _id: 0,
        courseId: '$course._id',
        courseCode: '$course.code',
        courseTitle: '$course.title',
        department: '$course.department',
        enrolledStudents: 1,
        sectionCount: { $size: '$sections' },
      },
    },
    { $sort: { enrolledStudents: -1, courseCode: 1 } },
  ]);
  sendSuccess(res, data);
});

// Aggregation 4: section-wise enrolment summary (enrolled vs capacity, faculty).
exports.sectionEnrollment = asyncHandler(async (req, res) => {
  const { term } = req.validatedQuery;
  const match = await reportMatch(req.user, req.validatedQuery);
  const data = await Enrollment.aggregate([
    { $match: match },
    { $group: { _id: '$section', enrolledStudents: { $sum: 1 } } },
    { $lookup: { from: 'sections', localField: '_id', foreignField: '_id', as: 'section' } },
    { $unwind: '$section' },
    ...(term ? [{ $match: { 'section.term': term } }] : []),
    { $lookup: { from: 'courses', localField: 'section.course', foreignField: '_id', as: 'course' } },
    { $lookup: { from: 'users', localField: 'section.faculty', foreignField: '_id', as: 'faculty' } },
    { $unwind: '$course' },
    { $unwind: { path: '$faculty', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        sectionId: '$section._id',
        courseCode: '$course.code',
        section: '$section.name',
        term: '$section.term',
        faculty: '$faculty.name',
        capacity: '$section.capacity',
        enrolledStudents: 1,
        seatsAvailable: { $subtract: ['$section.capacity', '$enrolledStudents'] },
      },
    },
    { $sort: { courseCode: 1, section: 1 } },
  ]);
  sendSuccess(res, data);
});
