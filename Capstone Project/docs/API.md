# API Documentation

Base URL: `http://localhost:5000` · All bodies are JSON · Protected routes need `Authorization: Bearer <accessToken>`.

**Response format**
```json
{ "success": true, "message": "OK", "data": {}, "meta": { "page": 1, "limit": 10, "total": 25, "totalPages": 3 } }
{ "success": false, "message": "Validation failed", "errors": [ { "field": "email", "message": "email must be a valid email" } ] }
```
**Common errors:** `400` validation / malformed id · `401` missing, invalid or expired token · `403` role or ownership not allowed · `404` not found · `409` duplicate / conflict.

Lists accept `page` (default 1) and `limit` (default 10, max 100).
Roles: **A** = admin, **F** = faculty, **S** = student. "Any" = any authenticated user.

## Authentication
| Method | Endpoint | Access | Body | Success | Errors |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/auth/register` | A | `name, email, password, role, department?, rollNumber?, employeeId?, phone?` | 201 user | 400, 401, 403, 409 |
| POST | `/api/auth/login` | public | `email, password` | 200 `{ user, accessToken, refreshToken }` | 400, 401 invalid credentials, 403 deactivated |
| POST | `/api/auth/refresh` | public | `refreshToken` | 200 `{ accessToken, refreshToken }` (rotated) | 400, 401 |
| POST | `/api/auth/logout` | public | `refreshToken` | 200 | 400 |

```jsonc
// POST /api/auth/login  -> 200
{ "success": true, "message": "Login successful",
  "data": { "user": { "_id": "…", "name": "Aarav Sharma", "role": "student" }, "accessToken": "eyJ…", "refreshToken": "eyJ…" } }
```

## Profile
| Method | Endpoint | Access | Body | Notes |
| --- | --- | --- | --- | --- |
| GET | `/api/users/me` | Any | – | own profile |
| PATCH | `/api/users/me` | Any | `name?, phone?` (at least one) | other fields (e.g. role) are ignored/rejected |

## Students (`rollNumber`) and Faculty (`employeeId`)
| Method | Endpoint | Access | Body / query |
| --- | --- | --- | --- |
| GET | `/api/students` | A, F (F: only students in own sections) | `department, isActive, q, page, limit` |
| GET | `/api/students/:id` | A, F (own sections) | – |
| POST | `/api/students` | A | `name, email, password, rollNumber, department, phone?` |
| PATCH | `/api/students/:id` | A | any of `name, email, rollNumber, department, phone, isActive` |
| DELETE | `/api/students/:id` | A | 409 if the student has enrolments/attendance |
| GET/POST/PATCH/DELETE | `/api/faculty`, `/api/faculty/:id` | A | same as students with `employeeId`; delete → 409 if assigned to sections |

## Courses and Sections
| Method | Endpoint | Access | Body / query |
| --- | --- | --- | --- |
| GET | `/api/courses` | Any | `department, semester, q, page, limit` |
| GET | `/api/courses/:id` | Any | – |
| POST | `/api/courses` | A | `code, title, department, credits, semester, description?` |
| PATCH | `/api/courses/:id` | A | any course field incl. `isActive` |
| DELETE | `/api/courses/:id` | A | 409 if the course has sections |
| GET | `/api/sections` | Any | `course, faculty, term, page, limit` |
| GET | `/api/sections/:id` | Any | – |
| POST | `/api/sections` | A | `course, name, term, faculty?, capacity?` (course/faculty validated) |
| PATCH | `/api/sections/:id` | A | `name, term, capacity` (capacity ≥ enrolled students) |
| PATCH | `/api/sections/:id/faculty` | A | `faculty` – assigns a faculty member |
| DELETE | `/api/sections/:id` | A | 409 if students are enrolled |

## Enrolments
| Method | Endpoint | Access | Body / query |
| --- | --- | --- | --- |
| POST | `/api/enrollments` | A | `student, course, section` |
| GET | `/api/enrollments` | A all · F own sections · S own only | `course, section, student, page, limit` |
| GET | `/api/enrollments/:id` | same visibility | – |
| DELETE | `/api/enrollments/:id` | A | 409 if attendance exists |

`POST` errors: 400 invalid student/course/section or section not in course · 409 already enrolled, or section full.

## Attendance
| Method | Endpoint | Access | Body / query |
| --- | --- | --- | --- |
| POST | `/api/attendance` | F (assigned section only) | `course, section, date (YYYY-MM-DD), session?, records: [{ student, status }]` |
| GET | `/api/attendance` | A all · F own sections · S own only | `course, section, student, from, to, page, limit` |
| GET | `/api/attendance/summary` | S own · F/A need `student` | – |
| PATCH | `/api/attendance/:id` | F (assigned, within correction window) | `status, reason` |

* `POST` errors: 400 future date / student not enrolled / duplicate student in records · 403 not your section · 409 attendance already marked for that session.
* `PATCH` errors: 400 status unchanged · 403 not assigned or outside `ATTENDANCE_CORRECTION_WINDOW_DAYS`.
* A student asking for another student's records gets 403.

```jsonc
// GET /api/attendance/summary -> 200
{ "success": true, "data": { "student": "…", "subjects": [
  { "courseId": "…", "courseCode": "CS101", "courseTitle": "Introduction to Programming",
    "totalClasses": 5, "classesAttended": 5, "attendancePercentage": 100 } ] } }
```

## Announcements
| Method | Endpoint | Access | Body / query |
| --- | --- | --- | --- |
| POST | `/api/announcements` | A (any scope) · F (own course/section) | `title, body, scope, course? (scope=course), section? (scope=section)` |
| GET | `/api/announcements` | Any – only announcements visible to the user | `scope, course, section, page, limit` (newest first) |
| GET | `/api/announcements/:id` | Any (if visible) | – |
| PATCH | `/api/announcements/:id` | A, or F who created it | `title?, body?` |
| DELETE | `/api/announcements/:id` | A, or F who created it | – |

## Reports (A, F – faculty limited to own sections)
| Endpoint | Query | Result |
| --- | --- | --- |
| `GET /api/reports/attendance/summary` | `course?, section?` | per course+section: classes held, students, average attendance % |
| `GET /api/reports/attendance/low` | `threshold?` (default 75), `course?, section?, page, limit` | students below threshold with totals and % |
| `GET /api/reports/enrollment/courses` | `course?` | enrolled students per course |
| `GET /api/reports/enrollment/sections` | `course?, term?` | enrolled, capacity, seats available per section |

## Real-time (Socket.IO)
Connect: `io("http://localhost:5000", { auth: { token: "<accessToken>" } })`. Connections without a valid token are rejected with `connect_error`.

| Direction | Event | Payload | Who receives it |
| --- | --- | --- | --- |
| server → client | `connected` | `{ userId, role, rooms }` | the connecting client |
| server → client | `announcement:new` | the announcement (`title, body, scope, createdBy, …`) | `university`: everyone · `course`: students/faculty of that course · `section`: that section |
| server → client | `attendance:updated` | `{ type: "marked" \| "corrected", course, section, date, session, status }` | only the affected student |

Rooms (joined automatically on connect): `user:<id>`, `university`, `course:<id>`, `section:<id>`. When a student is enrolled while connected they join the new course/section rooms immediately.
