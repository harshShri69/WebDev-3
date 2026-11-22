const express = require('express');
const morgan = require('morgan');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { nodeEnv } = require('./config/env');

const app = express();

if (nodeEnv !== 'test') app.use(morgan('dev')); // request logging middleware
app.use(express.json({ limit: '100kb' }));

app.get('/health', (_req, res) => res.json({ success: true, message: 'Campus Management API is running' }));
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
