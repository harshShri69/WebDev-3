const Joi = require('joi');

const objectId = Joi.string().hex().length(24);
const dateOnly = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).message('must be in YYYY-MM-DD format');
const password = Joi.string().min(8).max(72);
const email = Joi.string().email({ tlds: { allow: false } }); // accept any domain, incl. .test/.local

const pageQuery = {
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
};

exports.auth = {
  register: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: email.required(),
    password: password.required(),
    role: Joi.string().valid('admin', 'faculty', 'student').required(),
    department: Joi.string().trim(),
    rollNumber: Joi.string().trim(),
    employeeId: Joi.string().trim(),
    phone: Joi.string().trim(),
  }),
  login: Joi.object({ email: email.required(), password: Joi.string().required() }),
  token: Joi.object({ refreshToken: Joi.string().required() }),
};

exports.user = {
  updateMe: Joi.object({ name: Joi.string().trim().min(2).max(100), phone: Joi.string().trim() }).min(1),
  // Admin-managed student / faculty records
  createStudent: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: email.required(),
    password: password.required(),
    rollNumber: Joi.string().trim().required(),
    department: Joi.string().trim().required(),
    phone: Joi.string().trim(),
  }),
  createFaculty: Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: email.required(),
    password: password.required(),
    employeeId: Joi.string().trim().required(),
    department: Joi.string().trim().required(),
    phone: Joi.string().trim(),
  }),
  updateStudent: Joi.object({
    name: Joi.string().trim().min(2).max(100),
    email: email,
    rollNumber: Joi.string().trim(),
    department: Joi.string().trim(),
    phone: Joi.string().trim(),
    isActive: Joi.boolean(),
  }).min(1),
  updateFaculty: Joi.object({
    name: Joi.string().trim().min(2).max(100),
    email: email,
    employeeId: Joi.string().trim(),
    department: Joi.string().trim(),
    phone: Joi.string().trim(),
    isActive: Joi.boolean(),
  }).min(1),
  listQuery: Joi.object({
    ...pageQuery,
    department: Joi.string().trim(),
    isActive: Joi.boolean(),
    q: Joi.string().trim(),
  }),
};

exports.course = {
  create: Joi.object({
    code: Joi.string().trim().required(),
    title: Joi.string().trim().max(150).required(),
    description: Joi.string().trim().max(1000),
    department: Joi.string().trim().required(),
    credits: Joi.number().integer().min(1).max(10).required(),
    semester: Joi.number().integer().min(1).max(12).required(),
  }),
  update: Joi.object({
    code: Joi.string().trim(),
    title: Joi.string().trim().max(150),
    description: Joi.string().trim().max(1000),
    department: Joi.string().trim(),
    credits: Joi.number().integer().min(1).max(10),
    semester: Joi.number().integer().min(1).max(12),
    isActive: Joi.boolean(),
  }).min(1),
  listQuery: Joi.object({
    ...pageQuery,
    department: Joi.string().trim(),
    semester: Joi.number().integer().min(1).max(12),
    q: Joi.string().trim(),
  }),
};

exports.section = {
  create: Joi.object({
    course: objectId.required(),
    name: Joi.string().trim().max(20).required(),
    term: Joi.string().trim().required(),
    faculty: objectId,
    capacity: Joi.number().integer().min(1),
  }),
  update: Joi.object({
    name: Joi.string().trim().max(20),
    term: Joi.string().trim(),
    capacity: Joi.number().integer().min(1),
  }).min(1),
  assignFaculty: Joi.object({ faculty: objectId.required() }),
  listQuery: Joi.object({ ...pageQuery, course: objectId, faculty: objectId, term: Joi.string().trim() }),
};

exports.enrollment = {
  create: Joi.object({ student: objectId.required(), course: objectId.required(), section: objectId.required() }),
  listQuery: Joi.object({ ...pageQuery, course: objectId, section: objectId, student: objectId }),
};

exports.attendance = {
  mark: Joi.object({
    course: objectId.required(),
    section: objectId.required(),
    date: dateOnly.required(),
    session: Joi.number().integer().min(1).default(1),
    records: Joi.array()
      .items(Joi.object({ student: objectId.required(), status: Joi.string().valid('present', 'absent').required() }))
      .min(1)
      .required(),
  }),
  correct: Joi.object({
    status: Joi.string().valid('present', 'absent').required(),
    reason: Joi.string().trim().min(3).max(300).required(),
  }),
  summaryQuery: Joi.object({ student: objectId }),
  listQuery: Joi.object({
    ...pageQuery,
    course: objectId,
    section: objectId,
    student: objectId,
    from: dateOnly,
    to: dateOnly,
  }),
};

exports.announcement = {
  create: Joi.object({
    title: Joi.string().trim().max(150).required(),
    body: Joi.string().trim().max(2000).required(),
    scope: Joi.string().valid('university', 'course', 'section').required(),
    course: objectId.when('scope', { is: 'course', then: Joi.required(), otherwise: Joi.forbidden() }),
    section: objectId.when('scope', { is: 'section', then: Joi.required(), otherwise: Joi.forbidden() }),
  }),
  update: Joi.object({ title: Joi.string().trim().max(150), body: Joi.string().trim().max(2000) }).min(1),
  listQuery: Joi.object({ ...pageQuery, scope: Joi.string().valid('university', 'course', 'section'), course: objectId, section: objectId }),
};

exports.report = {
  attendanceQuery: Joi.object({ course: objectId, section: objectId }),
  lowAttendanceQuery: Joi.object({
    ...pageQuery,
    threshold: Joi.number().min(0).max(100),
    course: objectId,
    section: objectId,
  }),
  enrollmentQuery: Joi.object({ course: objectId, term: Joi.string().trim() }),
};
