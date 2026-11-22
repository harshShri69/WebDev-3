const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const tokens = require('../utils/tokens');

async function issueTokens(user) {
  const accessToken = tokens.signAccessToken(user);
  const refreshToken = tokens.signRefreshToken(user);
  const { exp } = tokens.verifyRefreshToken(refreshToken);
  await RefreshToken.create({ user: user._id, tokenHash: tokens.hashToken(refreshToken), expiresAt: new Date(exp * 1000) });
  return { accessToken, refreshToken };
}

// Admin-controlled account creation (route is protected + admin only).
exports.register = asyncHandler(async (req, res) => {
  const user = await User.create(req.body);
  sendSuccess(res, user, { status: 201, message: 'User account created' });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  // same message for unknown email and wrong password, so accounts cannot be enumerated
  if (!user || !(await user.comparePassword(password))) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('Account is deactivated');

  const { accessToken, refreshToken } = await issueTokens(user);
  sendSuccess(res, { user, accessToken, refreshToken }, { message: 'Login successful' });
});

// Refresh-token rotation: the old refresh token is deleted and a new pair is issued.
exports.refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const payload = tokens.verifyRefreshToken(refreshToken); // throws -> 401 if invalid/expired
  const stored = await RefreshToken.findOneAndDelete({ tokenHash: tokens.hashToken(refreshToken) });
  if (!stored) throw ApiError.unauthorized('Refresh token is not valid anymore');

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('User no longer exists or is deactivated');

  sendSuccess(res, await issueTokens(user), { message: 'Token refreshed' });
});

// Logout = invalidate the refresh token so no new access tokens can be issued.
exports.logout = asyncHandler(async (req, res) => {
  await RefreshToken.deleteOne({ tokenHash: tokens.hashToken(req.body.refreshToken) });
  sendSuccess(res, null, { message: 'Logged out' });
});
