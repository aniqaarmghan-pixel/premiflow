"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
            aria-label="Close dialog"
            className="absolute inset-0 bg-[rgba(18,24,38,.42)]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="relative z-10 w-full max-w-lg max-h-[86vh] overflow-auto rounded-[28px] border border-line bg-card p-5 shadow-[var(--shadow)]"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id="modal-title" className="font-display text-2xl text-ink">
                {title}
              </h2>
              <Button variant="ghost" onClick={onClose} aria-label="Close">
                <X size={18} />
              </Button>
            </div>
            <div className="text-sm text-ink-soft">{children}</div>
            {footer ? <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
