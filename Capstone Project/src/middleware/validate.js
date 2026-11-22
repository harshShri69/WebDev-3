const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');

// validate(schema, 'body' | 'query' | 'params') -> validates and replaces the data with the cleaned value.
exports.validate = (schema, source = 'body') => (req, _res, next) => {
  const { value, error } = schema.validate(req[source], { abortEarly: false, stripUnknown: true, convert: true });
  if (error) {
    const errors = error.details.map((d) => ({ field: d.path.join('.'), message: d.message.replace(/"/g, '') }));
    return next(ApiError.badRequest('Validation failed', errors));
  }
  if (source === 'query') {
    // req.query is read-only in Express 5, so keep the cleaned values on a separate property
    req.validatedQuery = value;
  } else {
    req[source] = value;
  }
  next();
};

// Rejects malformed ObjectIds in route params (e.g. /courses/abc) with a 400.
exports.validateObjectId = (...names) => (req, _res, next) => {
  for (const name of names) {
    if (!mongoose.isValidObjectId(req.params[name])) {
      return next(ApiError.badRequest(`Invalid ${name}`));
    }
  }
  next();
};
