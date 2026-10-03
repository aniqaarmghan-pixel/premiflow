"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";

import { refreshAccountSession, signIn } from "@/lib/account-auth/client";
import { runAccountAuthCall } from "@/lib/account-auth/session-flow";
import { POST_SIGN_IN_HREF } from "@/lib/app/site-routes";

export default function SignInPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  // Drop any stale cached session (e.g. expired while the tab sat open).
  useEffect(() => {
    refreshAccountSession();
  }, []);

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleSubmitting(true);

    try {
      const result = await signIn.social({
        provider: "google",
        callbackURL: POST_SIGN_IN_HREF,
      });

      if (result?.error) {
        setError(
          result.error.message ??
            "We could not continue with Google. Please try again."
        );
      }
    } catch {
      setError("We could not continue with Google. Please try again.");
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("Enter your email address.");
      return;
    }

    if (!password) {
      setError("Enter your password.");
      return;
    }

    setSubmitting(true);

    try {
      const outcome = await runAccountAuthCall({
        context: "sign_in",
        // Transient Neon / network failures (e.g. after the tab sat idle)
        // retry with capped backoff; they are never shown as bad credentials.
        retries: 2,
        call: () => signIn.email({ email: cleanEmail, password }),
        refreshSession: refreshAccountSession,
      });

      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }

      setPassword("");
      router.push(POST_SIGN_IN_HREF);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.7fr)] lg:items-center">
      <section className="px-1 py-4 sm:px-3 lg:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">
          Welcome back
        </p>

        <h1 className="mt-4 max-w-xl text-4xl font-extrabold tracking-[-0.05em] text-ink sm:text-5xl">
          Sign in to your PREMIFLOW account.
        </h1>

        <p className="mt-5 max-w-xl text-base leading-7 text-ink-soft">
          Your PREMIFLOW account manages your profile and marketplace activity.
          Your Solana wallet remains separate and is used only when a
          blockchain action requires your signature.
        </p>

        <div className="mt-8 rounded-2xl border border-line bg-card p-5">
          <p className="font-semibold text-ink">
            Account login does not replace your wallet.
          </p>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            Funding escrow, accepting blockchain contracts, collecting funds,
            claiming refunds and other on-chain actions still require the
            appropriate Solana wallet.
          </p>
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-card p-5 shadow-[var(--shadow)] sm:p-7">
        <div>
          <p className="text-sm font-semibold text-cyan">PREMIFLOW</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.04em] text-ink">
            Sign in
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            Continue to your account and workspace.
          </p>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => void handleGoogleSignIn()}
            disabled={googleSubmitting || submitting}
            className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-line bg-white px-5 text-sm font-semibold text-ink transition hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span
              aria-hidden="true"
              className="inline-flex size-6 items-center justify-center rounded-full border border-line bg-white text-sm font-bold"
            >
              G
            </span>
            {googleSubmitting ? "Connecting to Google…" : "Continue with Google"}
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="text-xs font-medium uppercase tracking-[0.14em] text-ink-faint">
              or
            </span>
            <div className="h-px flex-1 bg-line" />
          </div>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              Email
            </span>
            <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-paper px-3 focus-within:border-cyan">
              <Mail size={17} className="shrink-0 text-ink-faint" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent py-3 text-sm text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              Password
            </span>
            <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-paper px-3 focus-within:border-cyan">
              <LockKeyhole size={17} className="shrink-0 text-ink-faint" />
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                className="w-full bg-transparent py-3 text-sm text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          </label>

            <div className="mt-2 flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm font-semibold text-cyan hover:underline"
              >
                Forgot password?
              </Link>
            </div>


          {error ? (
            <div
              role="alert"
              className="rounded-2xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger"
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting || googleSubmitting}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
            {!submitting ? <ArrowRight size={16} /> : null}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-soft">
          New to PREMIFLOW?{" "}
          <Link
            href="/sign-up"
            className="font-semibold text-ink underline decoration-cyan/60 underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      </section>
    </div>
  );
}
