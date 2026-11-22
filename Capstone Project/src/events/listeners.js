const appEvents = require('./appEvents');
const { getIO, emitToRooms, emitToUsers, joinUserToRooms } = require('../sockets');

// Registers all listeners once at startup.
function registerListeners() {
  appEvents.on('announcement.created', ({ announcement, rooms }) => {
    console.log(`[event] announcement.created -> ${announcement.scope} (${announcement._id})`);
    emitToRooms(rooms, 'announcement:new', announcement);
  });

  appEvents.on('attendance.marked', ({ entries, payload }) => {
    console.log(`[event] attendance.marked -> ${entries.length} student(s)`);
    // each student is told only about their own status
    entries.forEach(({ studentId, status }) =>
      emitToUsers([studentId], 'attendance:updated', { type: 'marked', ...payload, status })
    );
  });

  appEvents.on('attendance.corrected', ({ studentId, payload }) => {
    console.log(`[event] attendance.corrected -> student ${studentId}`);
    emitToUsers([studentId], 'attendance:updated', { type: 'corrected', ...payload });
  });

  appEvents.on('enrollment.created', ({ studentId, courseId, sectionId }) => {
    console.log(`[event] enrollment.created -> student ${studentId}`);
    // A connected student starts receiving course/section announcements immediately.
    joinUserToRooms(studentId, [`course:${courseId}`, `section:${sectionId}`]);
  });
}

module.exports = { registerListeners, getIO };
