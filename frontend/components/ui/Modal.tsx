"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useId, useRef } from "react";
import { useDialogFocus } from "@/lib/hooks/useDialogFocus";

import { Button } from "./Button";

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  // Focus moves inside, Tab is trapped, Escape closes, page scroll is locked
  // and focus returns to the opener on close.
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  useDialogFocus(open, panelRef, onClose);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            tabIndex={-1}
            data-focus-skip
            aria-label="Close dialog"
            className="absolute inset-0 bg-[rgba(18,24,38,.42)]"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={reduceMotion ? false : { y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="relative z-10 w-full max-w-lg max-h-[86dvh] min-w-0 overflow-auto overscroll-contain rounded-[24px] border border-line bg-card p-4 shadow-[var(--shadow)] sm:p-5"
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <h2 id={titleId} className="min-w-0 break-words font-display text-xl text-ink [overflow-wrap:anywhere]">
                {title}
              </h2>
              <Button variant="ghost" onClick={onClose} aria-label="Close">
                <X size={18} />
              </Button>
            </div>
            <div className="text-sm text-ink-soft">{children}</div>
            {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2 max-sm:flex-col-reverse max-sm:items-stretch">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
