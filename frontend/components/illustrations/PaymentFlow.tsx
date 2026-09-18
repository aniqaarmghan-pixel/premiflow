import { HeroFlow } from "./HeroFlow";

/** Signature Employer → contract → Freelancer motif. */
export function PaymentFlow({ compact = false }: { compact?: boolean }) {
  return <HeroFlow compact={compact} />;
}
