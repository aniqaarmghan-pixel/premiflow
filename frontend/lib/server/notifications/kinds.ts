/**
 * Persistent in-app notification kinds (wallet inbox).
 * Separate from transient toast NoticeKind in lib/app/notices.ts.
 */
export const NOTIFICATION_KINDS = [
  "message_received",
  "contract_offer_received",
  "offer_accepted",
  "offer_declined",
  "awaiting_activation",
  "contract_activated",
  "work_submitted",
  "revision_requested",
  "revised_work_submitted",
  "work_approved",
  "payment_released",
  "payment_withdrawn",
  "contract_cancelled",
  "dispute_opened",
  "dispute_resolved",
  "deadline_warning",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const KIND_SET = new Set<string>(NOTIFICATION_KINDS);

export function isNotificationKind(value: string): value is NotificationKind {
  return KIND_SET.has(value);
}
