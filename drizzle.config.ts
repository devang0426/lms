import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", quiet: true });

/* Migrations use the DIRECT (non-pooled) connection. */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL (direct connection) is not set.");

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: { url },
  strict: true,
});
