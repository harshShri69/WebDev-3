const { Server } = require('socket.io');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const Section = require('../models/Section');
const { verifyAccessToken } = require('../utils/tokens');

let io = null;

// Rooms:
//   user:<userId>      private updates (e.g. attendance changes)
//   university         announcements for everyone
//   course:<courseId>  course announcements
//   section:<sectionId> section announcements
async function roomsForUser(user) {
  const rooms = [`user:${user._id}`, 'university'];
  if (user.role === 'student') {
    const enrollments = await Enrollment.find({ student: user._id }).select('course section');
    enrollments.forEach((e) => rooms.push(`course:${e.course}`, `section:${e.section}`));
  } else if (user.role === 'faculty') {
    const sections = await Section.find({ faculty: user._id }).select('course');
    sections.forEach((s) => rooms.push(`course:${s.course}`, `section:${s._id}`));
  }
  return rooms;
}

function initSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } });

  // Only authenticated users may connect: client passes { auth: { token: <accessToken> } }.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub);
      if (!user || !user.isActive) return next(new Error('Authentication failed'));
      socket.user = user;
      next();
    } catch (_err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    const rooms = await roomsForUser(socket.user);
    socket.join(rooms);
    socket.emit('connected', { userId: socket.user._id, role: socket.user.role, rooms });
  });

  return io;
}

const getIO = () => io;

function emitToRooms(rooms, event, payload) {
  if (!io || !rooms.length) return; // never broadcast to everyone by accident
  // A socket in several of the target rooms still receives the event only once.
  let target = io;
  rooms.forEach((r) => { target = target.to(r); });
  target.emit(event, payload);
}

function emitToUsers(userIds, event, payload) {
  emitToRooms(userIds.map((id) => `user:${id}`), event, payload);
}

function joinUserToRooms(userId, rooms) {
  if (!io) return;
  io.in(`user:${userId}`).socketsJoin(rooms);
}

module.exports = { initSocket, getIO, emitToRooms, emitToUsers, joinUserToRooms };
