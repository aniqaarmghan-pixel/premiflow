"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  ChevronDown,
  Link2,
  LoaderCircle,
  LogIn,
  LogOut,
  UserRound,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  refreshAccountSession,
  signOut,
} from "@/lib/account-auth/client";
import { useAccountSession } from "@/lib/account-auth/useAccountSession";
import { runAccountSignOut } from "@/lib/account-auth/session-flow";
import {
  ensureMessagingSession,
  messagingSessionErrorMessage,
} from "@/lib/app/messaging-session";
import { logoutSession } from "@/lib/app/messages-client";

export function AccountControl() {
  const router = useRouter();
  const { data: session, isPending } = useAccountSession();
  const { publicKey, signMessage } = useWallet();

  const [menuOpen, setMenuOpen] = useState(false);
  const [linkingWallet, setLinkingWallet] = useState(false);
  const [walletLinkError, setWalletLinkError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const user = session?.user ?? null;

  // Close the account menu once the session is gone (adjusted during render).
  if (!user && menuOpen) setMenuOpen(false);

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

  async function handleLinkConnectedWallet() {
    setWalletLinkError(null);

    const walletAddress = publicKey?.toBase58();
    if (!walletAddress) {
      setWalletLinkError(
        "Connect the Solana wallet you want to use with this PREMIFLOW account first."
      );
      return;
    }

    setLinkingWallet(true);

    try {
      // Account ↔ wallet linking requires fresh proof of wallet ownership.
      // Clear any stale wallet-auth cookie so Phantom must sign a new challenge.
      await logoutSession().catch(() => undefined);

      await ensureMessagingSession({
        wallet: walletAddress,
        signMessage,
      });

      // The server obtains the wallet address from the verified wallet
      // session. We deliberately do not send an address in the request body.
      const response = await fetch("/api/account-wallets", {
        method: "POST",
        credentials: "same-origin",
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            message?: string;
            wallet?: { address?: string };
          }
        | null;

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error(
            payload?.message ??
              "This wallet is already linked to another PREMIFLOW account."
          );
        }

        throw new Error(
          payload?.message ?? "PREMIFLOW could not link this wallet."
        );
      }

      // Reload so ContractsProvider immediately rebuilds the account's
      // contract history from the newly linked wallet.
      window.location.reload();
    } catch (err) {
      setWalletLinkError(
        err instanceof Error
          ? err.message
          : messagingSessionErrorMessage(err)
      );
    } finally {
      setLinkingWallet(false);
    }
  }

  async function handleSignOut() {
    setMenuOpen(false);

    // Revokes the server session (cookie deleted), clears the wallet-auth
    // cookie and refreshes the cached session in every open tab.
    await runAccountSignOut({
      signOut: () => signOut(),
      clearWalletSession: () => logoutSession(),
      refreshSession: refreshAccountSession,
    });

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
              onClick={() => void handleLinkConnectedWallet()}
              disabled={linkingWallet}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-ink hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10"
            >
              {linkingWallet ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <Link2 size={16} className="text-cyan" />
              )}
              {linkingWallet ? "Linking wallet…" : "Link connected wallet"}
            </button>

            {publicKey ? (
              <p className="px-3 pb-2 text-[11px] text-ink-faint">
                Connected: {publicKey.toBase58().slice(0, 4)}…
                {publicKey.toBase58().slice(-4)}
              </p>
            ) : null}

            {walletLinkError ? (
              <p
                role="alert"
                className="mx-2 mb-2 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs leading-5 text-danger"
              >
                {walletLinkError}
              </p>
            ) : null}

            <div className="my-1 border-t border-line" />

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
