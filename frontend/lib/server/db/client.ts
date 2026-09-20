import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import { getServerEnv } from "../env";
import * as schema from "./schema";

export type MessagingDatabase = NeonHttpDatabase<typeof schema>;

let cached: MessagingDatabase | null = null;

/** Lazy. Do not call at module load so `next build` works without DATABASE_URL. */
export function getDb(): MessagingDatabase {
  if (!cached) {
    const env = getServerEnv();
    cached = drizzle(neon(env.databaseUrl), { schema });
  }
  return cached;
}

export function resetDbForTests(): void {
  cached = null;
}
