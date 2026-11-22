const Course = require('../models/Course');
const Section = require('../models/Section');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { getPagination, buildMeta } = require('../utils/pagination');
const { escapeRegex } = require('../utils/scope');

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.validatedQuery);
  const { department, semester, q } = req.validatedQuery;
  const filter = {};
  if (department) filter.department = department;
  if (semester) filter.semester = semester;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ code: rx }, { title: rx }];
  }
  const [items, total] = await Promise.all([
    Course.find(filter).sort({ code: 1 }).skip(skip).limit(limit),
    Course.countDocuments(filter),
  ]);
  sendSuccess(res, items, { meta: buildMeta(page, limit, total) });
});

exports.get = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw ApiError.notFound('Course not found');
  sendSuccess(res, course);
});

exports.create = asyncHandler(async (req, res) => {
  const course = await Course.create(req.body);
  sendSuccess(res, course, { status: 201, message: 'Course created' });
});

exports.update = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw ApiError.notFound('Course not found');
  Object.assign(course, req.body);
  await course.save();
  sendSuccess(res, course, { message: 'Course updated' });
});

exports.remove = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw ApiError.notFound('Course not found');
  if (await Section.exists({ course: course._id })) {
    throw ApiError.conflict('Course has sections and cannot be deleted. Delete its sections first or set isActive to false.');
  }
  await course.deleteOne();
  sendSuccess(res, null, { message: 'Course deleted' });
});
