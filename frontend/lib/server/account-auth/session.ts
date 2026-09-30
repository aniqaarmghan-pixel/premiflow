import { getAccountAuth } from "./auth";

export class AccountSessionRequiredError extends Error {
  constructor() {
    super("Sign in to your PREMIFLOW account.");
    this.name = "AccountSessionRequiredError";
  }
}

export async function readAccountSession(request: Request) {
  return getAccountAuth().api.getSession({
    headers: request.headers,
  });
}

export async function requireAccountSession(request: Request) {
  const session = await readAccountSession(request);

  if (!session?.user?.id) {
    throw new AccountSessionRequiredError();
  }

  return session;
}
