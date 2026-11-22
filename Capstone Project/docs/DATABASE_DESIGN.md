# Database Design

Database: MongoDB, accessed through Mongoose. Seed data: `npm run seed`.

## Relationships
```
User (student) ──< Enrollment >── Course ──< Section >── User (faculty)
                       │              │          │
                       └──────────────┴──────────┘
Attendance  : student (User), course, section, markedBy (User)
Announcement: createdBy (User), optional course / section
RefreshToken: user (User)
```
* `Section.course` → Course, `Section.faculty` → User (role faculty)
* `Enrollment.student` → User (role student), `Enrollment.course` → Course, `Enrollment.section` → Section
* `Attendance` references student, course, section and the faculty who marked it (`markedBy`)

## Collections

### users
| Field | Type | Notes |
| --- | --- | --- |
| name | String | required, 2–100 chars |
| email | String | required, unique, lower-cased, regex validated |
| password | String | bcrypt hash, min 8 chars before hashing, `select: false` |
| role | String | `admin` \| `faculty` \| `student` |
| department | String | |
| rollNumber | String | required when role = student |
| employeeId | String | required when role = faculty |
| phone | String | validated pattern |
| isActive | Boolean | default true; inactive users cannot log in |

Indexes: `email` (unique) · `rollNumber` (unique, partial – only where it exists) · `employeeId` (unique, partial) · `{role, department}` (list/filter queries)

### courses
`code` (unique, upper-case), `title`, `description`, `department`, `credits` (1–10), `semester` (1–12), `isActive`.
Indexes: `code` (unique) · `{department, semester}`

### sections
`course` (ref), `name`, `term` (e.g. "2026-Fall"), `faculty` (ref, optional), `capacity`.
Indexes: `{course, name, term}` (unique – no duplicate section) · `faculty`

### enrollments
`student`, `course`, `section` (all refs).
Indexes: `{student, course}` (unique – blocks duplicate enrolment) · `section` (class lists, capacity counts)

### attendance
| Field | Notes |
| --- | --- |
| course, section, student | refs |
| date | class date stored at 00:00 UTC |
| session | number, default 1 (several classes in one day) |
| status | `present` \| `absent` |
| markedBy | faculty ref |
| history[] | audit trail: `from`, `to`, `reason`, `changedBy`, `changedAt` |

Indexes: `{student, course, section, date, session}` (unique – no duplicate record for a class session) · `{section, date:-1}` · `{student, course}` (percentage aggregations)

### announcements
`title`, `body`, `scope` (`university` \| `course` \| `section`), `course` (required if scope = course), `section` (required if scope = section), `createdBy`.
Indexes: `{scope, createdAt:-1}` · `{course, createdAt:-1}` · `{section, createdAt:-1}`

### refreshtokens
`user`, `tokenHash` (SHA-256 of the refresh token), `expiresAt`.
Indexes: `tokenHash` (unique) · `user` · `expiresAt` (TTL – MongoDB removes expired tokens automatically)

## Aggregation pipelines
| # | Endpoint | Pipeline |
| --- | --- | --- |
| 1 | `GET /api/attendance/summary` | `$match` student → `$group` by course (total, attended) → `$addFields` percentage → `$lookup` course → `$project` |
| 2 | `GET /api/reports/attendance/summary` | `$match` → `$group` by course+section (distinct sessions, present count, students) → `$project` → `$lookup` course & section |
| 3 | `GET /api/reports/attendance/low` | `$match` → `$group` by student+course → `$addFields` percentage → `$match` below threshold → `$facet` (count + paginated list with `$lookup`) |
| 4 | `GET /api/reports/enrollment/courses` | `$group` enrolments by course → `$lookup` course → `$sort` |
| 5 | `GET /api/reports/enrollment/sections` | `$group` by section → `$lookup` section, course, faculty → seats available |
