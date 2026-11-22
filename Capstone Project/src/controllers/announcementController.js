const Announcement = require('../models/Announcement');
const Course = require('../models/Course');
const Section = require('../models/Section');
const Enrollment = require('../models/Enrollment');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const appEvents = require('../events/appEvents');
const { sendSuccess } = require('../utils/response');
const { getPagination, buildMeta } = require('../utils/pagination');

const populate = [
  { path: 'createdBy', select: 'name role' },
  { path: 'course', select: 'code title' },
  { path: 'section', select: 'name term' },
];

// Which course/section ids can this user see announcements for?
async function visibility(user) {
  if (user.role === 'admin') return null;
  let courseIds;
  let sectionIds;
  if (user.role === 'student') {
    const enr = await Enrollment.find({ student: user._id }).select('course section');
    courseIds = enr.map((e) => e.course);
    sectionIds = enr.map((e) => e.section);
  } else {
    const secs = await Section.find({ faculty: user._id }).select('course');
    courseIds = secs.map((s) => s.course);
    sectionIds = secs.map((s) => s._id);
  }
  return { courseIds, sectionIds };
}

const visibleFilter = (v) =>
  v && {
    $or: [
      { scope: 'university' },
      { scope: 'course', course: { $in: v.courseIds } },
      { scope: 'section', section: { $in: v.sectionIds } },
    ],
  };

exports.create = asyncHandler(async (req, res) => {
  const { scope, title, body } = req.body;
  const data = { scope, title, body, createdBy: req.user._id };
  let rooms;

  if (scope === 'university') {
    if (req.user.role !== 'admin') throw ApiError.forbidden('Only administrators can post university-wide announcements');
    rooms = ['university'];
  } else if (scope === 'course') {
    if (!(await Course.exists({ _id: req.body.course }))) throw ApiError.badRequest('course does not exist');
    if (req.user.role === 'faculty' && !(await Section.exists({ course: req.body.course, faculty: req.user._id }))) {
      throw ApiError.forbidden('You are not assigned to this course');
    }
    data.course = req.body.course;
    rooms = [`course:${data.course}`];
  } else {
    const section = await Section.findById(req.body.section);
    if (!section) throw ApiError.badRequest('section does not exist');
    if (req.user.role === 'faculty' && !(section.faculty && section.faculty.equals(req.user._id))) {
      throw ApiError.forbidden('You are not assigned to this section');
    }
    data.section = section._id;
    data.course = section.course;
    rooms = [`section:${section._id}`];
  }

  const announcement = await Announcement.create(data);
  await announcement.populate(populate);
  appEvents.emit('announcement.created', { announcement: announcement.toJSON(), rooms });
  sendSuccess(res, announcement, { status: 201, message: 'Announcement created' });
});

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.validatedQuery);
  const { scope, course, section } = req.validatedQuery;
  const filter = { ...visibleFilter(await visibility(req.user)) };
  const extra = {};
  if (scope) extra.scope = scope;
  if (course) extra.course = course;
  if (section) extra.section = section;
  const finalFilter = Object.keys(filter).length ? { $and: [filter, extra] } : extra;

  const [items, total] = await Promise.all([
    Announcement.find(finalFilter).populate(populate).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Announcement.countDocuments(finalFilter),
  ]);
  sendSuccess(res, items, { meta: buildMeta(page, limit, total) });
});

exports.get = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id, ...visibleFilter(await visibility(req.user)) };
  const announcement = await Announcement.findOne(filter).populate(populate);
  if (!announcement) throw ApiError.notFound('Announcement not found');
  sendSuccess(res, announcement);
});

async function loadOwned(req) {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) throw ApiError.notFound('Announcement not found');
  if (req.user.role !== 'admin' && !announcement.createdBy.equals(req.user._id)) {
    throw ApiError.forbidden('You can only modify your own announcements');
  }
  return announcement;
}

exports.update = asyncHandler(async (req, res) => {
  const announcement = await loadOwned(req);
  Object.assign(announcement, req.body);
  await announcement.save();
  sendSuccess(res, await announcement.populate(populate), { message: 'Announcement updated' });
});

exports.remove = asyncHandler(async (req, res) => {
  const announcement = await loadOwned(req);
  await announcement.deleteOne();
  sendSuccess(res, null, { message: 'Announcement deleted' });
});
