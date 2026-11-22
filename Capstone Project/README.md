# University Campus Management System – Backend

Backend capstone project (Project 1) built with **Node.js, Express.js, MongoDB, Mongoose, JWT, bcrypt and Socket.IO**.
It manages students, faculty, courses, sections, enrolments, attendance and announcements with role-based access
for **admin**, **faculty** and **student**.

## Features (mapped to the assignment)

| Requirement | Where |
| --- | --- |
| A. Auth & profiles – admin-controlled account creation, login, logout, bcrypt, JWT, profile view/update | `controllers/authController.js`, `userController.js` |
| B. Student / faculty / course / section CRUD, faculty assignment, enrolment with duplicate & invalid checks | `userAdminController.js`, `courseController.js`, `sectionController.js`, `enrollmentController.js` |
| C. Attendance – mark, correct (rule + audit history), view, percentage | `attendanceController.js` |
| D. Announcements (university / course / section), REST history, Socket.IO delivery | `announcementController.js`, `sockets/`, `events/` |
| E. Reports – 4 aggregation pipelines, configurable low-attendance threshold | `reportController.js` |
| Access / refresh tokens, protected routes, RBAC | `middleware/auth.js`, `utils/tokens.js` |
| Centralized error handling, validation, logging | `middleware/errorHandler.js`, `middleware/validate.js`, `morgan` |
| EventEmitter + Socket.IO | `events/appEvents.js`, `events/listeners.js`, `sockets/index.js` |
| Indexes on every collection, 5 aggregation pipelines | `models/*.js`, `reportController.js`, `attendanceController.js` |

## Prerequisites
* Node.js 18+ and npm
* MongoDB running locally (default `mongodb://127.0.0.1:27017`) or a MongoDB Atlas connection string

## Setup
```bash
npm install
cp .env.example .env        # then edit the secrets in .env (never commit .env)
npm run seed                # loads sample data (clears existing data in the target database!)
npm start                   # http://localhost:5000   (npm run dev for auto-restart)
```

### Environment variables (`.env`)
| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port | 5000 |
| `MONGO_URI` | MongoDB connection string | – (required) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Secrets for signing tokens | – (required) |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Token lifetimes | 15m / 7d |
| `BCRYPT_SALT_ROUNDS` | bcrypt cost | 10 |
| `ATTENDANCE_CORRECTION_WINDOW_DAYS` | Days after a class during which faculty may correct attendance | 7 |
| `DEFAULT_ATTENDANCE_THRESHOLD` | Default % for the low-attendance report | 75 |

## Seed accounts
| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@campus.test` | `Admin@123` |
| Faculty (CS101-A, CS101-B) | `asha.verma@campus.test` | `Faculty@123` |
| Faculty (MA101-A) | `rahul.mehta@campus.test` | `Faculty@123` |
| Students | `aarav@`, `diya@`, `kabir@`, `meera@`, `rohan@`, `sara@campus.test` | `Student@123` |

Seed data: 3 courses, 4 sections (CS101-A has capacity 3 and is full; CS201-A has no faculty yet), 10 enrolments,
attendance history (Kabir has low attendance on purpose) and 3 announcements.

## Architecture
```
Route -> Middleware (protect, authorize, validate) -> Controller -> Model (Mongoose) -> MongoDB -> JSON response
                                                          |
                                                          +-> appEvents (EventEmitter) -> listeners -> Socket.IO
src/
  config/        env + DB connection         models/       Mongoose schemas
  routes/        route table                 controllers/  business logic
  middleware/    auth, RBAC, validation, errors
  validators/    Joi schemas                 utils/        helpers (tokens, pagination, ApiError ...)
  events/        EventEmitter bus + listeners   sockets/    Socket.IO server
scripts/         seed.js, socket-demo.js     postman/      API test collection
docs/            DATABASE_DESIGN.md, API.md  tests/        automated integration tests
```

## Authentication flow
1. `POST /api/auth/login` returns `accessToken` (15 min) and `refreshToken` (7 days).
2. Send `Authorization: Bearer <accessToken>` on every protected request.
3. `POST /api/auth/refresh` exchanges the refresh token for a new pair (old refresh token is revoked – rotation).
4. `POST /api/auth/logout` deletes the refresh token. Refresh tokens are stored only as SHA-256 hashes.
5. Accounts are created by an administrator (`POST /api/auth/register`, `/api/students`, `/api/faculty`).

## Real-time (Socket.IO) and EventEmitter
* **EventEmitter** (`events/appEvents.js`): controllers emit domain events (`announcement.created`, `attendance.marked`,
  `attendance.corrected`, `enrollment.created`) without knowing who listens. `events/listeners.js` reacts to them by
  logging and pushing Socket.IO messages, so HTTP code stays decoupled from real-time delivery.
* **Socket.IO**: connect with `io(url, { auth: { token: <accessToken> } })`; unauthenticated sockets are rejected.
  Full event list is in `docs/API.md`. Try it:
  ```bash
  node scripts/socket-demo.js aarav@campus.test Student@123      # terminal 1 – listens
  # terminal 2: post an announcement / mark attendance from Postman and watch terminal 1
  ```

## Testing
* **Postman:** import `postman/Campus_Management_System.postman_collection.json` (set `baseUrl` if needed), run `npm run seed`,
  then run the whole collection in order with the Collection Runner. 129 requests cover success, validation failure,
  not found, missing/invalid token (401), insufficient role (403), duplicates (409) and business rules.
* **Automated:** `npm test` runs integration tests against a separate `campus_test` database.

## Documentation
* `docs/DATABASE_DESIGN.md` – collections, schemas, relationships, indexes
* `docs/API.md` – every endpoint with auth, request, response and errors, plus Socket.IO events

## Design decisions / assumptions
* A **section** is one offering of a course taught by one faculty member; assigning faculty to a section is how a
  faculty member is assigned to a course.
* Attendance status is `present` or `absent`; a class session is identified by course + section + date + session number.
* Attendance can be corrected only by the assigned faculty within `ATTENDANCE_CORRECTION_WINDOW_DAYS`; each change is
  stored in the record's `history` (who, when, why, old → new). Attendance records are intentionally not deletable.
* Students/faculty/courses/sections that have related records cannot be deleted (409); deactivate users with `isActive: false`.
