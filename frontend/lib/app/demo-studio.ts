/**
 * Internal recording studios for the product demo and the pitch deck. Never
 * linked from public navigation, footer, landing page or /demo; noindex.
 *
 * Gate: available when NODE_ENV !== "production" (local dev), or in any build
 * when the server env PREMIFLOW_DEMO_STUDIO=1 is set (so a production build can
 * still be recorded on purpose). Otherwise the routes return 404.
 */
export const DEMO_STUDIO_ROUTE = "/demo/studio";
export const PITCH_STUDIO_ROUTE = "/demo/pitch/studio";

export function demoStudioEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.PREMIFLOW_DEMO_STUDIO === "1";
}
