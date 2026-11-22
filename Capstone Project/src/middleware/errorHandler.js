const ApiError = require('../utils/ApiError');
const { nodeEnv } = require('../config/env');

exports.notFound = (req, _res, next) => next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));

// Centralized error handler: every error in the app ends up here and is returned in one JSON format.
// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, _req, res, _next) => {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors;

  if (err.name === 'ValidationError' && err.errors && !err.isOperational) {
    status = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    message = `Duplicate value for: ${fields.join(', ') || 'unique field'}`;
  } else if (err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Token has expired';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
    status = 401;
    message = 'Invalid token';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON in request body';
  }

  if (status >= 500) console.error(err);

  const body = { success: false, message: status >= 500 && nodeEnv === 'production' ? 'Internal server error' : message };
  if (errors) body.errors = errors;
  if (nodeEnv !== 'production' && status >= 500) body.stack = err.stack;
  res.status(status).json(body);
};
