import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';

/**
 * Home donut + net balance. Collection: `payment_intents`.
 *
 * Composite indexes (create when the SDK prompts):
 * - payer == uid, status == "pending"
 * - recipient == uid, status == "pending"
 * - recipient == uid, status == "paid"
 * - recipient == uid, status == "pending", due_date < (timestamp)
 *
 * Document fields (flexible):
 * - payer, recipient (uid strings)
 * - status: "pending" | "paid" (etc.)
 * - amount: dollars (number), or amountCents
 * - due_date: Timestamp (start-of-day comparisons use local midnight)
 * - paidAt | paid_at: Timestamp for "paid this month"
 */
export type HomeFinancialPosition = {
  youOwe: number;
  owedToYou: number;
  overdue: number;
  loading: boolean;
};

const COLLECTION = 'payment_intents';

function docAmountDollars(data: Record<string, unknown>): number {
  const a = data.amount;
  if (typeof a === 'number' && Number.isFinite(a)) return Math.max(0, a);
  const c = data.amountCents;
  if (typeof c === 'number' && Number.isFinite(c)) return Math.max(0, c / 100);
  return 0;
}

function paidTimestamp(data: Record<string, unknown>): Timestamp | null {
  const a = data.paidAt;
  const b = data.paid_at;
  if (a instanceof Timestamp) return a;
  if (b instanceof Timestamp) return b;
  return null;
}

function isTimestampThisMonth(ts: Timestamp): boolean {
  const d = ts.toDate();
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function startOfLocalToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function emptyState(loading: boolean): HomeFinancialPosition {
  return { youOwe: 0, owedToYou: 0, overdue: 0, loading };
}

export function subscribeHomeFinancialPosition(
  uid: string,
  onUpdate: (v: HomeFinancialPosition) => void
): () => void {
  const db = getFirebaseFirestore();
  if (!db) {
    onUpdate(emptyState(false));
    return () => {};
  }

  const state = {
    youOwe: 0,
    recvPending: 0,
    recvPaidMonth: 0,
    overdue: 0,
    loadingYouOwe: true,
    loadingRecvP: true,
    loadingRecvPaid: true,
    loadingOverdue: true,
  };

  let alive = true;

  const emit = () => {
    if (!alive) return;
    const loading =
      state.loadingYouOwe || state.loadingRecvP || state.loadingRecvPaid || state.loadingOverdue;
    const owedToYou = state.recvPending + state.recvPaidMonth;
    onUpdate({
      youOwe: state.youOwe,
      owedToYou,
      overdue: state.overdue,
      loading,
    });
  };

  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      query(
        collection(db, COLLECTION),
        where('payer', '==', uid),
        where('status', '==', 'pending')
      ),
      (snap) => {
        let s = 0;
        for (const doc of snap.docs) {
          s += docAmountDollars(doc.data() as Record<string, unknown>);
        }
        state.youOwe = s;
        state.loadingYouOwe = false;
        emit();
      },
      () => {
        state.youOwe = 0;
        state.loadingYouOwe = false;
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(
        collection(db, COLLECTION),
        where('recipient', '==', uid),
        where('status', '==', 'pending')
      ),
      (snap) => {
        let pending = 0;
        for (const doc of snap.docs) {
          pending += docAmountDollars(doc.data() as Record<string, unknown>);
        }
        state.recvPending = pending;
        state.loadingRecvP = false;
        emit();
      },
      () => {
        state.recvPending = 0;
        state.loadingRecvP = false;
        emit();
      }
    )
  );

  unsubs.push(
    onSnapshot(
      query(
        collection(db, COLLECTION),
        where('recipient', '==', uid),
        where('status', '==', 'paid')
      ),
      (snap) => {
        let s = 0;
        for (const doc of snap.docs) {
          const data = doc.data() as Record<string, unknown>;
          const pts = paidTimestamp(data);
          if (pts && isTimestampThisMonth(pts)) {
            s += docAmountDollars(data);
          }
        }
        state.recvPaidMonth = s;
        state.loadingRecvPaid = false;
        emit();
      },
      () => {
        state.recvPaidMonth = 0;
        state.loadingRecvPaid = false;
        emit();
      }
    )
  );

  const todayStart = startOfLocalToday();
  unsubs.push(
    onSnapshot(
      query(
        collection(db, COLLECTION),
        where('recipient', '==', uid),
        where('status', '==', 'pending'),
        where('due_date', '<', Timestamp.fromDate(todayStart))
      ),
      (snap) => {
        let s = 0;
        for (const doc of snap.docs) {
          s += docAmountDollars(doc.data() as Record<string, unknown>);
        }
        state.overdue = s;
        state.loadingOverdue = false;
        emit();
      },
      () => {
        state.overdue = 0;
        state.loadingOverdue = false;
        emit();
      }
    )
  );

  emit();

  return () => {
    alive = false;
    unsubs.forEach((u) => u());
  };
}
