const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const Course = require('../models/Course');
const Section = require('../models/Section');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const appEvents = require('../events/appEvents');
const { sendSuccess } = require('../utils/response');
const { getPagination, buildMeta } = require('../utils/pagination');
const { facultySectionIds } = require('../utils/scope');

const populate = [
  { path: 'student', select: 'name email rollNumber' },
  { path: 'course', select: 'code title credits' },
  { path: 'section', select: 'name term' },
];

// Admin enrols a student. All references are validated before saving.
exports.create = asyncHandler(async (req, res) => {
  const { student, course, section } = req.body;

  const [studentDoc, courseDoc, sectionDoc] = await Promise.all([
    User.findOne({ _id: student, role: 'student', isActive: true }),
    Course.findById(course),
    Section.findById(section),
  ]);
  if (!studentDoc) throw ApiError.badRequest('student must reference an active student');
  if (!courseDoc || !courseDoc.isActive) throw ApiError.badRequest('course does not exist or is inactive');
  if (!sectionDoc) throw ApiError.badRequest('section does not exist');
  if (!sectionDoc.course.equals(courseDoc._id)) throw ApiError.badRequest('section does not belong to the given course');

  if (await Enrollment.exists({ student, course })) throw ApiError.conflict('Student is already enrolled in this course');
  const enrolled = await Enrollment.countDocuments({ section });
  if (enrolled >= sectionDoc.capacity) throw ApiError.conflict('Section is full');

  const enrollment = await Enrollment.create({ student, course, section }); // unique index also guards races
  appEvents.emit('enrollment.created', { studentId: student, courseId: course, sectionId: section });
  sendSuccess(res, await enrollment.populate(populate), { status: 201, message: 'Student enrolled' });
});

// Admin: all. Faculty: own sections. Student: own enrolments only.
exports.list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.validatedQuery);
  const { course, section, student } = req.validatedQuery;
  const filter = {};
  if (course) filter.course = course;
  if (section) filter.section = section;

  if (req.user.role === 'student') {
    if (student && student !== req.user._id.toString()) throw ApiError.forbidden("You cannot view another student's enrolments");
    filter.student = req.user._id;
  } else {
    if (student) filter.student = student;
    const sectionIds = await facultySectionIds(req.user);
    if (sectionIds) {
      if (section && !sectionIds.some((id) => id.equals(section))) throw ApiError.forbidden('You are not assigned to this section');
      if (!section) filter.section = { $in: sectionIds };
    }
  }

  const [items, total] = await Promise.all([
    Enrollment.find(filter).populate(populate).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Enrollment.countDocuments(filter),
  ]);
  sendSuccess(res, items, { meta: buildMeta(page, limit, total) });
});

exports.get = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id).populate(populate);
  if (!enrollment) throw ApiError.notFound('Enrollment not found');
  if (req.user.role === 'student' && !enrollment.student._id.equals(req.user._id)) {
    throw ApiError.forbidden("You cannot view another student's enrolment");
  }
  if (req.user.role === 'faculty') {
    const sectionIds = await facultySectionIds(req.user);
    if (!sectionIds.some((id) => id.equals(enrollment.section._id))) throw ApiError.forbidden('You are not assigned to this section');
  }
  sendSuccess(res, enrollment);
});

exports.remove = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id);
  if (!enrollment) throw ApiError.notFound('Enrollment not found');
  if (await Attendance.exists({ student: enrollment.student, course: enrollment.course, section: enrollment.section })) {
    throw ApiError.conflict('Enrollment has attendance records and cannot be removed');
  }
  await enrollment.deleteOne();
  sendSuccess(res, null, { message: 'Enrollment removed' });
});
