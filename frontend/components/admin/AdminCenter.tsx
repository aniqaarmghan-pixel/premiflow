"use client";

import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { useAccountSession } from "@/lib/account-auth/useAccountSession";
import { ADMIN_CENTER_COPY, ADMIN_DESKS } from "@/lib/app/admin-center";
import { useAppAdminStatus } from "@/lib/hooks/useAppAdmin";

export function AdminCenter() {
  const { data: session } = useAccountSession();
  // Display gate only: every admin API re-checks authorization on the server.
  const status = useAppAdminStatus(session?.user?.id ?? null);
  if (status === "loading") {
    return <p className="mx-auto w-full max-w-4xl text-sm text-ink-soft">{ADMIN_CENTER_COPY.checking}</p>;
  }
  if (status !== "admin") {
    return (
      <Card className="mx-auto w-full max-w-4xl p-4 sm:p-5">
        <h1 className="font-display text-2xl">{ADMIN_CENTER_COPY.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{ADMIN_CENTER_COPY.notAuthorized}</p>
      </Card>
    );
  }
  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">PREMIFLOW</p>
        <h1 className="mt-1 font-display text-2xl">{ADMIN_CENTER_COPY.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{ADMIN_CENTER_COPY.intro}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {ADMIN_DESKS.map((desk) => (
          <Card key={desk.id} className="flex flex-col p-4 sm:p-5">
            <h2 className="font-display text-xl">{desk.title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-soft">{desk.body}</p>
            <p className="mt-2 text-xs leading-5 text-ink-faint">{desk.authority}</p>
            <Link
              href={desk.href}
              className="mt-4 inline-flex min-h-11 w-fit items-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Open {desk.title}
            </Link>
          </Card>
        ))}
      </div>
      <p className="text-xs text-ink-faint">{ADMIN_CENTER_COPY.humanDecision}</p>
    </div>
  );
}
