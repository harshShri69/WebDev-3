const mongoose = require('mongoose');

const historySchema = new mongoose.Schema(
  {
    from: { type: String, enum: ['present', 'absent'], required: true },
    to: { type: String, enum: ['present', 'absent'], required: true },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// One document = one student's attendance for one class session (course + section + date + session number).
const attendanceSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true }, // stored at 00:00 UTC of the class date
    session: { type: Number, default: 1, min: 1 }, // allows more than one class per day
    status: { type: String, enum: ['present', 'absent'], required: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    history: [historySchema], // audit record of every correction
  },
  { timestamps: true }
);

// Prevents duplicate records for the same student, course, section and class session.
attendanceSchema.index({ student: 1, course: 1, section: 1, date: 1, session: 1 }, { unique: true });
attendanceSchema.index({ section: 1, date: -1 });
attendanceSchema.index({ student: 1, course: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
