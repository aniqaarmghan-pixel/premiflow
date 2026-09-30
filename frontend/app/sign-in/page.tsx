"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";

import { signIn } from "@/lib/account-auth/client";

export default function SignInPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      const result = await signIn.email({
        email: cleanEmail,
        password,
      });

      if (result.error) {
        setError(
          result.error.message ??
            "We could not sign you in. Check your email and password."
        );
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("We could not sign you in. Please try again.");
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
