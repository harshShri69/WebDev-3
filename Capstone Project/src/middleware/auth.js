const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyAccessToken } = require('../utils/tokens');

// Verifies the JWT access token and attaches the (active) user to req.user.
exports.protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized('Missing or malformed Authorization header');

  const payload = verifyAccessToken(token); // JWT errors are mapped to 401 in the error handler
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('User no longer exists or is deactivated');

  req.user = user;
  next();
});

// Role-based access control: allow only the listed roles.
exports.authorize = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
  next();
};
