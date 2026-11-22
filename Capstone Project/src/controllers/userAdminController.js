const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const Section = require('../models/Section');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { getPagination, buildMeta } = require('../utils/pagination');
const { facultySectionIds, escapeRegex } = require('../utils/scope');

// Builds CRUD handlers for one role ('student' or 'faculty'). Both share the User collection.
module.exports = (role) => {
  const label = role === 'student' ? 'Student' : 'Faculty member';

  const findOne = async (id) => {
    const user = await User.findOne({ _id: id, role });
    if (!user) throw ApiError.notFound(`${label} not found`);
    return user;
  };

  const list = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.validatedQuery);
    const { department, isActive, q } = req.validatedQuery;
    const filter = { role };
    if (department) filter.department = department;
    if (isActive !== undefined) filter.isActive = isActive;
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { rollNumber: rx }, { employeeId: rx }];
    }

    // Faculty may only see students enrolled in their own sections
    const sectionIds = await facultySectionIds(req.user);
    if (sectionIds) {
      const ids = await Enrollment.distinct('student', { section: { $in: sectionIds } });
      filter._id = { $in: ids };
    }

    const [items, total] = await Promise.all([
      User.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    sendSuccess(res, items, { meta: buildMeta(page, limit, total) });
  });

  const get = asyncHandler(async (req, res) => {
    const user = await findOne(req.params.id);
    const sectionIds = await facultySectionIds(req.user);
    if (sectionIds) {
      const allowed = await Enrollment.exists({ student: user._id, section: { $in: sectionIds } });
      if (!allowed) throw ApiError.forbidden('This student is not enrolled in any of your sections');
    }
    sendSuccess(res, user);
  });

  const create = asyncHandler(async (req, res) => {
    const user = await User.create({ ...req.body, role });
    sendSuccess(res, user, { status: 201, message: `${label} created` });
  });

  const update = asyncHandler(async (req, res) => {
    const user = await findOne(req.params.id);
    Object.assign(user, req.body);
    await user.save();
    if (req.body.isActive === false) await RefreshToken.deleteMany({ user: user._id }); // force logout
    sendSuccess(res, user, { message: `${label} updated` });
  });

  const remove = asyncHandler(async (req, res) => {
    const user = await findOne(req.params.id);
    const inUse =
      role === 'student'
        ? (await Enrollment.exists({ student: user._id })) || (await Attendance.exists({ student: user._id }))
        : (await Section.exists({ faculty: user._id })) || (await Attendance.exists({ markedBy: user._id }));
    if (inUse) {
      throw ApiError.conflict(`${label} has related records and cannot be deleted. Set isActive to false instead.`);
    }
    await user.deleteOne();
    await RefreshToken.deleteMany({ user: user._id });
    sendSuccess(res, null, { message: `${label} deleted` });
  });

  return { list, get, create, update, remove };
};
