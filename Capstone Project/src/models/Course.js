const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 1000 },
    department: { type: String, required: true, trim: true },
    credits: { type: Number, required: true, min: 1, max: 10 },
    semester: { type: Number, required: true, min: 1, max: 12 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

courseSchema.index({ department: 1, semester: 1 });

module.exports = mongoose.model('Course', courseSchema);
