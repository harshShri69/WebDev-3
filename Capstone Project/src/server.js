const http = require('http');
const mongoose = require('mongoose');
const { port } = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');
const { initSocket } = require('./sockets');
const { registerListeners } = require('./events/listeners');

async function start() {
  await connectDB();
  const server = http.createServer(app);
  initSocket(server);
  registerListeners();
  server.listen(port, () => console.log(`Server listening on http://localhost:${port}`));

  const shutdown = async () => {
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
