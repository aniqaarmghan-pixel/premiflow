"use client";

import { AnimatePresence, motion } from "framer-motion";

import { PaymentFlow } from "@/components/illustrations/PaymentFlow";
import { Button } from "@/components/ui/Button";

export function SuccessMoment({
  open,
  title,
  body,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button className="absolute inset-0 bg-[rgba(18,24,38,.42)]" onClick={onClose} />
          <motion.div
            role="status"
            initial={{ scale: 0.96, y: 12, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className="relative w-full max-w-md rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,#07111f,#0c1b2e)] p-6 text-center text-white shadow-[var(--shadow)]"
          >
            <motion.div
              initial={{ scale: 0.72, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent"
            >
              <motion.svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <motion.path
                  d="M5 13 l4 4 L19 7"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                />
              </motion.svg>
            </motion.div>
            <h2 className="mt-4 font-display text-3xl">{title}</h2>
            <p className="mt-2 text-sm text-white/65">{body}</p>
            <div className="mt-4">
              <PaymentFlow compact />
            </div>
            <div className="mt-5">
              <Button onClick={onClose}>Continue</Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
