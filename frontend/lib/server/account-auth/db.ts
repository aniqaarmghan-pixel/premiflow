import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import { getAccountAuthEnv } from "./env";
import * as schema from "./schema";

export type AccountAuthDatabase = NeonHttpDatabase<typeof schema>;

let cached: AccountAuthDatabase | null = null;

/**
 * Lazy Better Auth database connection.
 *
 * Uses the same Neon database as PREMIFLOW, but Better Auth tables live
 * inside the isolated PostgreSQL `account_auth` schema.
 */
export function getAccountAuthDb(): AccountAuthDatabase {
  if (!cached) {
    const env = getAccountAuthEnv();
    cached = drizzle(neon(env.databaseUrl), { schema });
  }

  return cached;
}

export function resetAccountAuthDbForTests(): void {
  cached = null;
}
