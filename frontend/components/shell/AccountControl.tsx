"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  LogIn,
  LogOut,
  UserRound,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  signOut,
  useSession,
} from "@/lib/account-auth/client";

export function AccountControl() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const user = session?.user ?? null;

  useEffect(() => {
    if (!user) setMenuOpen(false);
  }, [user]);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function handleSignOut() {
    setMenuOpen(false);

    await signOut();

    router.push("/");
    router.refresh();
  }

  if (isPending) {
    return (
      <div
        aria-label="Loading account"
        className="h-10 w-24 shrink-0 rounded-full border border-line bg-card"
      />
    );
  }

  if (!user) {
    return (
      <Link
        href="/sign-in"
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-line bg-card px-3 text-xs font-semibold text-ink transition hover:bg-paper-2 sm:min-h-10 sm:px-4 sm:text-[13px]"
      >
        <LogIn size={14} aria-hidden />
        <span>Sign in</span>
      </Link>
    );
  }

  const displayName =
    user.name?.trim() ||
    user.email?.split("@")[0] ||
    "Account";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setMenuOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        aria-label="Account menu"
        className="inline-flex min-h-11 max-w-[min(150px,38vw)] items-center justify-center gap-1.5 rounded-full border border-line bg-card px-3 text-xs font-semibold text-ink transition hover:bg-paper-2 sm:min-h-10 sm:max-w-[180px] sm:px-4 sm:text-[13px]"
      >
        <UserRound size={14} className="shrink-0 text-cyan" aria-hidden />
        <span className="truncate">{displayName}</span>
        <ChevronDown size={14} className="shrink-0 text-ink-faint" aria-hidden />
      </button>

      {menuOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-50 mt-2 w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow)]"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              PREMIFLOW account
            </p>

            <p className="mt-1 truncate text-sm font-semibold text-ink">
              {displayName}
            </p>

            <p className="mt-0.5 truncate text-xs text-ink-soft">
              {user.email}
            </p>
          </div>

          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleSignOut()}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-danger hover:bg-paper-2 sm:min-h-10"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
