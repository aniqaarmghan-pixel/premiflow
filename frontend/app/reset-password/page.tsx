"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, LockKeyhole } from "lucide-react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [linkError, setLinkError] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("error")) {
      setLinkError(true);
      return;
    }

    const resetToken = params.get("token");

    if (!resetToken) {
      setLinkError(true);
      return;
    }

    setToken(resetToken);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("This password reset link is invalid or expired.");
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
      const response = await fetch("/api/account-auth/reset-password", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newPassword: password,
          token,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          payload?.message ??
            "This password reset link is invalid or expired."
        );
        return;
      }

      setComplete(true);
    } catch {
      setError("We could not reset your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center px-4 py-10">
      <section className="w-full rounded-[28px] border border-line bg-card p-6 shadow-[var(--shadow)] sm:p-8">
        <p className="text-sm font-semibold text-cyan">PREMIFLOW</p>

        {complete ? (
          <>
            <CheckCircle2 className="mt-5 text-cyan" size={36} />

            <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.04em] text-ink">
              Password updated
            </h1>

            <p className="mt-3 text-sm leading-6 text-ink-soft">
              Your PREMIFLOW password has been changed successfully.
            </p>

            <Link
              href="/sign-in"
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Sign in
            </Link>
          </>
        ) : linkError ? (
          <>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink">
              Reset link unavailable
            </h1>

            <p className="mt-3 text-sm leading-6 text-ink-soft">
              This password reset link is invalid or has expired.
            </p>

            <Link
              href="/forgot-password"
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white"
            >
              Request a new link
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-ink">
              Choose a new password
            </h1>

            <p className="mt-3 text-sm leading-6 text-ink-soft">
              Enter a new password for your PREMIFLOW account.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-ink">
                  New password
                </span>

                <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-paper px-3 focus-within:border-cyan">
                  <LockKeyhole
                    size={17}
                    className="shrink-0 text-ink-faint"
                  />

                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full bg-transparent py-3 text-sm text-ink outline-none"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-ink">
                  Confirm new password
                </span>

                <div className="flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-paper px-3 focus-within:border-cyan">
                  <LockKeyhole
                    size={17}
                    className="shrink-0 text-ink-faint"
                  />

                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    placeholder="Repeat your new password"
                    className="w-full bg-transparent py-3 text-sm text-ink outline-none"
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
                disabled={submitting || !token}
                className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Updating password…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
