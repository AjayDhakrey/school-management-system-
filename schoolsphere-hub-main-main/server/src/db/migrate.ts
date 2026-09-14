import { closeDatabase, initializeDatabase } from "./client.js";
import { config } from "../config.js";

try {
  await initializeDatabase();
  console.log(`Database connectivity verified (${config.dbDriver}).`);
  await closeDatabase();
} catch (error) {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
  await closeDatabase().catch(() => undefined);
}
