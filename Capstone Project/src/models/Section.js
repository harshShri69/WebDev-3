const mongoose = require('mongoose');

// A section is one offering of a course (e.g. CS101 - Section A, 2026-Fall) taught by one faculty member.
const sectionSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    name: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    term: { type: String, required: true, trim: true }, // e.g. "2026-Fall"
    faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // assigned faculty (optional until assigned)
    capacity: { type: Number, required: true, min: 1, default: 60 },
  },
  { timestamps: true }
);

sectionSchema.index({ course: 1, name: 1, term: 1 }, { unique: true });
sectionSchema.index({ faculty: 1 });

module.exports = mongoose.model('Section', sectionSchema);
