import type { ReceiptAssignSession } from './receiptTypes';

let session: ReceiptAssignSession | null = null;

export function setReceiptAssignSession(next: ReceiptAssignSession) {
  session = next;
}

export function getReceiptAssignSession(): ReceiptAssignSession | null {
  return session;
}

export function clearReceiptAssignSession() {
  session = null;
}
