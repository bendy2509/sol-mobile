/**
 * Hand-off for a freshly generated recovery code between the screen that creates it
 * and the screen that shows it. Kept in memory only (never in route params, which end
 * up in the web URL / navigation state), and cleared as soon as it is read.
 */
let pendingRecoveryCode: string | null = null;

export function setPendingRecoveryCode(code: string | null): void {
  pendingRecoveryCode = code;
}

export function takePendingRecoveryCode(): string | null {
  const code = pendingRecoveryCode;
  pendingRecoveryCode = null;
  return code;
}
