"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, Mail, UserRound } from "lucide-react";

import { signIn, signUp } from "@/lib/account-auth/client";

export default function SignUpPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleSubmitting(true);

    try {
      const result = await signIn.social({
        provider: "google",
        callbackURL: "/",
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

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      setError("Enter your name.");
      return;
    }

    if (!cleanEmail) {
      setError("Enter your email address.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const result = await signUp.email({
        name: cleanName,
        email: cleanEmail,
        password,
      });

      if (result.error) {
        setError(
          result.error.message ??
            "We could not create your PREMIFLOW account."
        );
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("We could not create your PREMIFLOW account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.7fr)] lg:items-center">
      <section className="px-1 py-4 sm:px-3 lg:py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">
          PREMIFLOW account
        </p>

        <h1 className="mt-4 max-w-xl text-4xl font-extrabold tracking-[-0.05em] text-ink sm:text-5xl">
          Work, hire and manage contracts from one account.
        </h1>

        <p className="mt-5 max-w-xl text-base leading-7 text-ink-soft">
          Create your PREMIFLOW account to build your profile, use the
          marketplace and manage your work. Your Solana wallet stays separate
          and is only required for blockchain actions.
        </p>

        <div className="mt-8 grid gap-3 text-sm text-ink-soft sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold text-ink">Your account</p>
            <p className="mt-1 leading-6">
              Profile, jobs, proposals, messages and marketplace activity.
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-card p-4">
            <p className="font-semibold text-ink">Your wallet</p>
            <p className="mt-1 leading-6">
              Used separately to approve and sign Solana transactions.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-card p-5 shadow-[var(--shadow)] sm:p-7">
        <div>
          <p className="text-sm font-semibold text-cyan">Get started</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.04em] text-ink">
            Create your account
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-soft">
            You can connect your payment wallet later.
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
              Name
            </span>
            <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-paper px-3 focus-within:border-cyan">
              <UserRound size={17} className="shrink-0 text-ink-faint" />
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                className="w-full bg-transparent py-3 text-sm text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          </label>

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
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                className="w-full bg-transparent py-3 text-sm text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-ink">
              Confirm password
            </span>
            <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-paper px-3 focus-within:border-cyan">
              <LockKeyhole size={17} className="shrink-0 text-ink-faint" />
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Enter your password again"
                className="w-full bg-transparent py-3 text-sm text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          </label>

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
            {submitting ? "Creating account…" : "Create account"}
            {!submitting ? <ArrowRight size={16} /> : null}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-soft">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-semibold text-ink underline decoration-cyan/60 underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </section>
    </div>
  );
}
