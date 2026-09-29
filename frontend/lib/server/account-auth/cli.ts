import { getAccountAuth } from "./auth";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Environment variables may already be supplied by the shell/CI.
}

export const auth = getAccountAuth();
