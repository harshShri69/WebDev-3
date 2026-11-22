const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
  },
  { timestamps: true }
);

// A student can be enrolled in a given course only once -> blocks duplicate enrolments.
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });
enrollmentSchema.index({ section: 1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
