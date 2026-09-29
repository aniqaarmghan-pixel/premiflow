import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), ".env.local");

try {
  process.loadEnvFile(envFile);
} catch {
  // DATABASE_URL may already be set in the process environment.
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required for drizzle-kit. Add it to frontend/.env.local or the environment."
  );
}

export default defineConfig({
  schema: [
    "./lib/server/db/schema.ts",
    "./lib/server/account-auth/schema.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
