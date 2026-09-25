"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ContractAssistant } from "@/components/copilot/ContractAssistant";
import { FloatingCreateGuidance } from "@/components/copilot/FloatingCreateGuidance";
import {
  ASSISTANT_PRODUCT_NAME,
  roleLabelForAssistant,
} from "@/lib/app/copilot-live";
import { useContracts } from "@/lib/hooks/ContractsProvider";
import {
  presentStatus,
  presentType,
  roleForContract,
} from "@/lib/app/view-model";

const ASSISTANT_ICON = "/brand/premiflow-assistant.png";
const ASSISTANT_INTRINSIC = 256;
const WELCOME_MS = 7000;

const WELCOME_LINES = [
  "Hi! I’m PREMIFLOW Assistant.",
  "Need help? Ask me anything.",
] as const;

function contractAddressFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/contracts\/([1-9A-HJ-NP-Za-km-z]{32,44})$/);
  return match?.[1] ?? null;
}

function useDesktopLauncher() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return desktop;
}

export function FloatingAssistant() {
  const pathname = usePathname();
  const { publicKey } = useWallet();
  const { grouped } = useContracts();
  const desktop = useDesktopLauncher();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  const contractAddress = useMemo(
    () => contractAddressFromPath(pathname),
    [pathname]
  );

  const liveContext = useMemo(() => {
    if (!contractAddress) return null;
    const contract = grouped.all.find(
      (item) => item.address.toBase58() === contractAddress
    );
    if (contract && publicKey) {
      const role = roleForContract(publicKey, contract);
      return {
        contractAddress,
        role: roleLabelForAssistant(role),
        paymentMode: presentType(contract.paymentMode),
        statusLabel: presentStatus(contract.status),
      };
    }
    return {
      contractAddress,
      role: "Other" as const,
      paymentMode: "Contract",
      statusLabel: "On-chain",
    };
  }, [contractAddress, grouped.all, publicKey]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setShowWelcome(true);
    const timer = window.setTimeout(() => setShowWelcome(false), WELCOME_MS);
    return () => window.clearTimeout(timer);
  }, []);

  function dismissWelcome() {
    setShowWelcome(false);
  }

  function togglePanel() {
    dismissWelcome();
    setOpen((value) => !value);
  }

  const edge = desktop ? 28 : 12;
  const launcher = desktop ? 80 : 56;
  const panelWidth = desktop ? 400 : "min(100vw - 24px, 26rem)";

  if (!mounted) return null;

  return createPortal(
    <div
      data-floating-assistant
      style={{
        position: "fixed",
        right: edge,
        bottom: `max(${edge}px, env(safe-area-inset-bottom, 0px))`,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 10,
        pointerEvents: "none",
        maxWidth: "calc(100vw - 16px)",
      }}
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            key="panel"
            role="dialog"
            aria-label={ASSISTANT_PRODUCT_NAME}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{
              pointerEvents: "auto",
              width: panelWidth,
              maxWidth: "calc(100vw - 24px)",
              maxHeight: "min(640px, calc(100dvh - 112px))",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              borderRadius: "var(--radius)",
              border: "1px solid var(--line)",
              background: "var(--card)",
              boxShadow: "var(--shadow)",
              padding: desktop ? 16 : 14,
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                {ASSISTANT_PRODUCT_NAME}
              </p>
              <button
                type="button"
                aria-label="Close assistant"
                onClick={() => setOpen(false)}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-paper-2 hover:text-ink sm:size-9"
              >
                <X size={16} />
              </button>
            </div>
            {liveContext ? (
              <ContractAssistant
                compact
                contractAddress={liveContext.contractAddress}
                role={liveContext.role}
                paymentMode={liveContext.paymentMode}
                statusLabel={liveContext.statusLabel}
              />
            ) : (
              <FloatingCreateGuidance />
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "flex-end",
          gap: 12,
        }}
      >
        <AnimatePresence>
          {showWelcome && !open ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{
                pointerEvents: "auto",
                position: "relative",
                marginBottom: 4,
                maxWidth: desktop ? 232 : "min(200px, calc(100vw - 96px))",
                borderRadius: 16,
                border: "1px solid var(--line)",
                background: "var(--card)",
                boxShadow: "var(--shadow)",
                padding: "10px 14px",
                fontSize: 13,
                lineHeight: 1.4,
                color: "var(--ink)",
              }}
            >
              <button
                type="button"
                aria-label="Dismiss welcome"
                onClick={dismissWelcome}
                className="absolute right-1.5 top-1.5 rounded-full p-0.5 text-ink-faint hover:bg-paper-2 hover:text-ink"
              >
                <X size={12} />
              </button>
              <p className="pr-4 font-medium">{WELCOME_LINES[0]}</p>
              <p className="mt-1 text-ink-soft">{WELCOME_LINES[1]}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <button
          type="button"
          aria-label={open ? "Close PREMIFLOW Assistant" : "Open PREMIFLOW Assistant"}
          aria-expanded={open}
          onClick={togglePanel}
          style={{
            pointerEvents: "auto",
            position: "relative",
            width: launcher,
            height: launcher,
            flexShrink: 0,
            overflow: "hidden",
            borderRadius: "9999px",
            border: "2px solid #ffffff",
            padding: 0,
            cursor: "pointer",
            background: "#ffffff",
            boxShadow:
              "0 0 0 3px rgba(0, 194, 171, 0.2), 0 12px 28px -10px rgba(8, 31, 42, 0.48)",
          }}
        >
          <Image
            src={ASSISTANT_ICON}
            alt=""
            width={ASSISTANT_INTRINSIC}
            height={ASSISTANT_INTRINSIC}
            sizes={`${launcher}px`}
            quality={95}
            priority
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        </button>
      </div>
    </div>,
    document.body
  );
}
