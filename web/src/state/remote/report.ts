/** Errors of background calls (optimistic updates) are reported to the interface through one listener. */
import { messageOf } from "../../api/client";

let listener: ((message: string) => void) | null = null;

export function onRemoteError(fn: ((message: string) => void) | null): void {
  listener = fn;
}

export function report(err: unknown): void {
  const message = messageOf(err);
  console.warn("[back-end]", message);
  listener?.(message);
}
