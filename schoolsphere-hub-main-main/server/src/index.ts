import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { config } from "./config.js";
import { closeDatabase, db, initializeDatabase } from "./db/client.js";
import { authRouter } from "./routes/auth.js";
import { studentsRouter } from "./routes/students.js";
import { schoolsRouter } from "./routes/schools.js";
import { plansRouter } from "./routes/plans.js";
import { teachersRouter } from "./routes/teachers.js";
import { parentsRouter } from "./routes/parents.js";
import { staffRouter } from "./routes/staff.js";
import { classesRouter } from "./routes/classes.js";
import { subjectsRouter } from "./routes/subjects.js";
import { attendanceRouter } from "./routes/attendance.js";
import { feesRouter } from "./routes/fees.js";
import { examsRouter } from "./routes/exams.js";
import { resultsRouter } from "./routes/results.js";
import { homeworkRouter } from "./routes/homework.js";
import { noticesRouter } from "./routes/notices.js";
import { libraryRouter } from "./routes/library.js";
import { transportRouter } from "./routes/transport.js";
import { admissionsRouter } from "./routes/admissions.js";
import { timetableRouter } from "./routes/timetable.js";
import { roomsRouter } from "./routes/rooms.js";
import { leaveRouter } from "./routes/leave.js";
import { leadsRouter } from "./routes/leads.js";
import { supportRouter } from "./routes/support.js";
import { announcementsRouter } from "./routes/announcements.js";
import { paymentsRouter } from "./routes/payments.js";
import { schoolAdminsRouter } from "./routes/school-admins.js";
import { auditRouter } from "./routes/audit.js";
import { teacherAttendanceRouter } from "./routes/teacher-attendance.js";
import { staffAttendanceRouter } from "./routes/staff-attendance.js";
import { feeStructuresRouter } from "./routes/fee-structures.js";
import { certificatesRouter } from "./routes/certificates.js";
import { schoolProfileRouter } from "./routes/school-profile.js";
import { homeworkSubmissionsRouter } from "./routes/homework-submissions.js";
import { holidaysRouter } from "./routes/holidays.js";
import { notificationsRouter } from "./routes/notifications.js";
import { usersRouter } from "./routes/users.js";
import { rolesRouter } from "./routes/roles.js";
import { academicYearsRouter } from "./routes/academic-years.js";
import { eventsRouter } from "./routes/events.js";
import { platformSettingsRouter } from "./routes/platform-settings.js";
import { schoolOptionsRouter } from "./routes/school-options.js";

try {
  await initializeDatabase();
  console.log("Database ready: Supabase PostgreSQL");
} catch (error) {
  console.error("Critical startup failure: database initialization failed", error);
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.nodeEnv !== "production" || config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS"));
    },
  }),
);
// Raised from Express's 100kb default so admission document uploads (base64-encoded in JSON) fit.
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await db.prepare("SELECT 1").get();
    res.json({ ok: true, database: "reachable" });
  } catch {
    res.status(503).json({ ok: false, database: "unreachable" });
  }
});

app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: "Too many login attempts. Please try again later." },
  }),
);

app.use("/api/auth", authRouter);
app.use("/api/students", studentsRouter);
app.use("/api/schools", schoolsRouter);
app.use("/api/plans", plansRouter);
app.use("/api/teachers", teachersRouter);
app.use("/api/parents", parentsRouter);
app.use("/api/staff", staffRouter);
app.use("/api/classes", classesRouter);
app.use("/api/subjects", subjectsRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/fees", feesRouter);
app.use("/api/exams", examsRouter);
app.use("/api/results", resultsRouter);
app.use("/api/homework", homeworkRouter);
app.use("/api/notices", noticesRouter);
app.use("/api/library", libraryRouter);
app.use("/api/transport", transportRouter);
app.use("/api/admissions", admissionsRouter);
app.use("/api/timetable", timetableRouter);
app.use("/api/rooms", roomsRouter);
app.use("/api/leave", leaveRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/support", supportRouter);
app.use("/api/announcements", announcementsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/school-admins", schoolAdminsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/teacher-attendance", teacherAttendanceRouter);
app.use("/api/staff-attendance", staffAttendanceRouter);
app.use("/api/fee-structures", feeStructuresRouter);
app.use("/api/certificates", certificatesRouter);
app.use("/api/school-profile", schoolProfileRouter);
app.use("/api/homework-submissions", homeworkSubmissionsRouter);
app.use("/api/holidays", holidaysRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/users", usersRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/academic-years", academicYearsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/platform-settings", platformSettingsRouter);
app.use("/api/school-options", schoolOptionsRouter);

app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const expected = error as { statusCode?: unknown; message?: unknown };
    if (
      typeof expected.statusCode === "number" &&
      expected.statusCode >= 400 &&
      expected.statusCode < 500
    ) {
      return res.status(expected.statusCode).json({
        error: typeof expected.message === "string" ? expected.message : "Request failed",
      });
    }
    console.error("Unhandled request error:", error);
    res.status(500).json({ error: "Internal server error" });
  },
);

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

server.on("error", (error) => {
  console.error("Server startup error:", error);
  closeDatabase();
  process.exitCode = 1;
});

function shutdown(signal: string) {
  console.log(`${signal} received; shutting down`);
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  closeDatabase();
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  closeDatabase();
  process.exit(1);
});
