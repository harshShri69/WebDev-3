const Section = require('../models/Section');
const Course = require('../models/Course');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { getPagination, buildMeta } = require('../utils/pagination');

const populate = [
  { path: 'course', select: 'code title' },
  { path: 'faculty', select: 'name email employeeId' },
];

async function assertFaculty(id) {
  const faculty = await User.findOne({ _id: id, role: 'faculty', isActive: true });
  if (!faculty) throw ApiError.badRequest('faculty must reference an active faculty member');
}

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.validatedQuery);
  const { course, faculty, term } = req.validatedQuery;
  const filter = {};
  if (course) filter.course = course;
  if (faculty) filter.faculty = faculty;
  if (term) filter.term = term;
  const [items, total] = await Promise.all([
    Section.find(filter).populate(populate).sort({ term: -1, name: 1 }).skip(skip).limit(limit),
    Section.countDocuments(filter),
  ]);
  sendSuccess(res, items, { meta: buildMeta(page, limit, total) });
});

exports.get = asyncHandler(async (req, res) => {
  const section = await Section.findById(req.params.id).populate(populate);
  if (!section) throw ApiError.notFound('Section not found');
  sendSuccess(res, section);
});

exports.create = asyncHandler(async (req, res) => {
  if (!(await Course.exists({ _id: req.body.course }))) throw ApiError.badRequest('course does not exist');
  if (req.body.faculty) await assertFaculty(req.body.faculty);
  const section = await Section.create(req.body);
  sendSuccess(res, await section.populate(populate), { status: 201, message: 'Section created' });
});

exports.update = asyncHandler(async (req, res) => {
  const section = await Section.findById(req.params.id);
  if (!section) throw ApiError.notFound('Section not found');
  if (req.body.capacity !== undefined) {
    const enrolled = await Enrollment.countDocuments({ section: section._id });
    if (req.body.capacity < enrolled) throw ApiError.badRequest(`capacity cannot be lower than current enrolment (${enrolled})`);
  }
  Object.assign(section, req.body);
  await section.save();
  sendSuccess(res, await section.populate(populate), { message: 'Section updated' });
});

exports.assignFaculty = asyncHandler(async (req, res) => {
  const section = await Section.findById(req.params.id);
  if (!section) throw ApiError.notFound('Section not found');
  await assertFaculty(req.body.faculty);
  section.faculty = req.body.faculty;
  await section.save();
  sendSuccess(res, await section.populate(populate), { message: 'Faculty assigned to section' });
});

exports.remove = asyncHandler(async (req, res) => {
  const section = await Section.findById(req.params.id);
  if (!section) throw ApiError.notFound('Section not found');
  if (await Enrollment.exists({ section: section._id })) {
    throw ApiError.conflict('Section has enrolled students and cannot be deleted');
  }
  await section.deleteOne();
  sendSuccess(res, null, { message: 'Section deleted' });
});
