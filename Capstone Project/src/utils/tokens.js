const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { jwt: cfg } = require('../config/env');

exports.signAccessToken = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, cfg.accessSecret, { expiresIn: cfg.accessExpiresIn });

exports.signRefreshToken = (user) =>
  // jti makes every refresh token unique, even when issued in the same second
  jwt.sign({ sub: user._id.toString(), jti: crypto.randomUUID() }, cfg.refreshSecret, { expiresIn: cfg.refreshExpiresIn });

exports.verifyAccessToken = (token) => jwt.verify(token, cfg.accessSecret);
exports.verifyRefreshToken = (token) => jwt.verify(token, cfg.refreshSecret);

// Only a SHA-256 hash of the refresh token is stored in the database.
exports.hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
