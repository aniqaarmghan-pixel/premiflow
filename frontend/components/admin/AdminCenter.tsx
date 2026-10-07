"use client";

import { Card } from "@/components/ui/Card";
import { useAccountSession } from "@/lib/account-auth/useAccountSession";
import { ADMIN_CENTER_COPY } from "@/lib/app/admin-center";
import { useAppAdminStatus } from "@/lib/hooks/useAppAdmin";

export function AdminCenter() {
  const { data: session } = useAccountSession();

  // Display gate only: every admin API re-checks authorization on the server.
  const status = useAppAdminStatus(session?.user?.id ?? null);

  if (status === "loading") {
    return (
      <p className="mx-auto w-full max-w-4xl text-sm text-ink-soft">
        {ADMIN_CENTER_COPY.checking}
      </p>
    );
  }

  if (status !== "admin") {
    return (
      <Card className="mx-auto w-full max-w-4xl p-4 sm:p-5">
        <h1 className="font-display text-2xl">{ADMIN_CENTER_COPY.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {ADMIN_CENTER_COPY.notAuthorized}
        </p>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
          PREMIFLOW
        </p>
        <h1 className="mt-1 font-display text-2xl">
          {ADMIN_CENTER_COPY.title}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          PREMIFLOW operations workspace
        </p>
      </header>

      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-xl">Operations overview</h2>

        <p className="mt-2 text-sm leading-6 text-ink-soft">
          Manage user support and formal contract disputes from the navigation
          on the left.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-ink">Help Desk</p>
            <p className="mt-1 text-sm leading-6 text-ink-soft">
              Handle account, wallet, marketplace, contract, payment and
              technical support tickets.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">Resolution Desk</p>
            <p className="mt-1 text-sm leading-6 text-ink-soft">
              Review assigned disputes, submitted evidence and settlement
              activity.
            </p>
          </div>
        </div>
      </Card>

      <p className="text-xs text-ink-faint">
        {ADMIN_CENTER_COPY.humanDecision}
      </p>
    </div>
  );
}
