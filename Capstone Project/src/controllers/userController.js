const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

exports.getMe = asyncHandler(async (req, res) => sendSuccess(res, req.user));

// Only name and phone may be changed by the user themself.
exports.updateMe = asyncHandler(async (req, res) => {
  Object.assign(req.user, req.body);
  await req.user.save();
  sendSuccess(res, req.user, { message: 'Profile updated' });
});
