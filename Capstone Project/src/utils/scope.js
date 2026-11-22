const Section = require('../models/Section');

// Returns null for admins (no restriction) or the list of section ids a faculty member teaches.
exports.facultySectionIds = async (user) => {
  if (user.role !== 'faculty') return null;
  const sections = await Section.find({ faculty: user._id }).select('_id');
  return sections.map((s) => s._id);
};

exports.escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
