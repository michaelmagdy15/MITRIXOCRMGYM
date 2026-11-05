import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter, 
  getDocs, 
  QueryDocumentSnapshot,
  DocumentData,
  QueryConstraint
} from 'firebase/firestore';
import { db } from '../firebase';
import { Client, Payment } from '../types';

export const DEFAULT_PAGE_SIZE = 50;

export interface PaginatedResult<T> {
  data: T[];
  lastVisible: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * Fetch paginated active members from Firestore using cursor-based pagination.
 * Drastically reduces bandwidth and Firestore read charges on initial loads.
 */
export async function fetchActiveMembersPage(
  lastDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<PaginatedResult<Client>> {
  const clientsRef = collection(db, 'clients');
  
  const constraints: QueryConstraint[] = [
    where('status', 'in', ['Active', 'Hold', 'Nearly Expired', 'Frozen', 'active', 'hold', 'frozen']),
    orderBy('name'),
    limit(pageSize)
  ];

  if (lastDoc) {
    constraints.splice(2, 0, startAfter(lastDoc));
  }

  const q = query(clientsRef, ...constraints);
  const snapshot = await getDocs(q);
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
  const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;

  return {
    data,
    lastVisible,
    hasMore: snapshot.docs.length === pageSize,
  };
}

/**
 * Fetch paginated payments ordered by date descending.
 */
export async function fetchPaymentsPage(
  lastDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize: number = DEFAULT_PAGE_SIZE
): Promise<PaginatedResult<Payment>> {
  const paymentsRef = collection(db, 'payments');
  
  const constraints: QueryConstraint[] = [
    orderBy('date', 'desc'),
    limit(pageSize)
  ];

  if (lastDoc) {
    constraints.push(startAfter(lastDoc));
  }

  const q = query(paymentsRef, ...constraints);
  const snapshot = await getDocs(q);
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
  const lastVisible = snapshot.docs[snapshot.docs.length - 1] || null;

  return {
    data,
    lastVisible,
    hasMore: snapshot.docs.length === pageSize,
  };
}
