"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("Enter your email address.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        "/api/account-auth/request-password-reset",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: cleanEmail,
            redirectTo: `${window.location.origin}/reset-password`,
          }),
        }
      );

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          payload?.message ??
            "We could not start password recovery. Please try again."
        );
        return;
      }

      setSent(true);
    } catch {
      setError("We could not start password recovery. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center px-4 py-10">
      <section className="w-full rounded-[28px] border border-line bg-card p-6 shadow-[var(--shadow)] sm:p-8">
        <p className="text-sm font-semibold text-cyan">PREMIFLOW</p>

        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink">
          Reset your password
        </h1>

        <p className="mt-3 text-sm leading-6 text-ink-soft">
          Enter the email address used for your PREMIFLOW account.
        </p>

        {sent ? (
          <div className="mt-6">
            <div className="rounded-2xl border border-cyan/20 bg-cyan/5 p-4">
              <p className="font-semibold text-ink">
                Password reset requested
              </p>

              <p className="mt-2 text-sm leading-6 text-ink-soft">
                If that email belongs to a PREMIFLOW account, a secure reset
                link has been generated.
              </p>

              {process.env.NODE_ENV !== "production" ? (
                <p className="mt-2 text-sm leading-6 text-ink-soft">
                  For local development, look at the terminal running
                  PREMIFLOW and open the password-reset link printed there.
                </p>
              ) : null}
            </div>

            <Link
              href="/sign-in"
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-ink hover:underline"
            >
              <ArrowLeft size={16} />
              Back to sign in
            </Link>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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
              disabled={submitting}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Preparing reset…" : "Reset password"}
            </button>

            <Link
              href="/sign-in"
              className="flex items-center justify-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink"
            >
              <ArrowLeft size={16} />
              Back to sign in
            </Link>
          </form>
        )}
      </section>
    </div>
  );
}
