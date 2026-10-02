import type { AppUpdatePhase } from "./AppUpdateContext";

export type BellAction = "open_card" | "check" | "wait" | "unsupported";

/**
 * What the update bell does when clicked: show the pending update, or run a
 * real check (the app only checks on startup, so a release published while it
 * is open is invisible until someone asks).
 */
export function decideBellAction(args: {
  hasUpdateBellAlert: boolean;
  phase: AppUpdatePhase;
  canCheck: boolean;
}): BellAction {
  if (args.hasUpdateBellAlert) return "open_card";
  if (args.phase === "checking") return "wait";
  if (!args.canCheck) return "unsupported";
  return "check";
}
