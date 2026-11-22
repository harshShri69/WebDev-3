const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { saltRounds } = require('../config/env');

const ROLES = ['admin', 'faculty', 'student'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    password: { type: String, required: true, minlength: 8, select: false }, // always stored as a bcrypt hash
    role: { type: String, enum: ROLES, required: true },
    department: { type: String, trim: true },
    // Students are identified by rollNumber, faculty by employeeId
    rollNumber: {
      type: String,
      trim: true,
      required: [function () { return this.role === 'student'; }, 'rollNumber is required for students'],
    },
    employeeId: {
      type: String,
      trim: true,
      required: [function () { return this.role === 'faculty'; }, 'employeeId is required for faculty'],
    },
    phone: { type: String, trim: true, match: [/^[0-9+\-\s]{7,15}$/, 'Please provide a valid phone number'] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Indexes: unique ids only where the field exists; compound index for filtered list queries.
userSchema.index({ rollNumber: 1 }, { unique: true, partialFilterExpression: { rollNumber: { $type: 'string' } } });
userSchema.index({ employeeId: 1 }, { unique: true, partialFilterExpression: { employeeId: { $type: 'string' } } });
userSchema.index({ role: 1, department: 1 });

// Hash the password whenever it is new or changed. Plain-text passwords are never stored.
userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, saltRounds);
  }
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
