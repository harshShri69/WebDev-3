const EventEmitter = require('events');

// A single application-wide event bus. Controllers emit domain events (e.g. "announcement.created")
// and do not know who listens. Listeners (events/listeners.js) react by logging and pushing Socket.IO
// updates. This keeps HTTP handling decoupled from real-time delivery.
class AppEvents extends EventEmitter {}

module.exports = new AppEvents();
