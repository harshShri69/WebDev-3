const mongoose = require('mongoose');

const SCOPES = ['university', 'course', 'section'];

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    scope: { type: String, enum: SCOPES, required: true },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: [function () { return this.scope === 'course'; }, 'course is required for course announcements'],
    },
    section: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: [function () { return this.scope === 'section'; }, 'section is required for section announcements'],
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

announcementSchema.index({ scope: 1, createdAt: -1 });
announcementSchema.index({ course: 1, createdAt: -1 });
announcementSchema.index({ section: 1, createdAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
module.exports.SCOPES = SCOPES;
