import { db } from '../firebase';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { Expense, ExpenseCategory, ExpenseSummary } from '../types/expense';
import { addAuditLog } from './auditService';
import { cleanData } from '../utils';

const EXPENSES_COLLECTION = 'expenses';

export async function recordExpense(params: {
  date: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  branch: string;
  receiptUrl?: string;
  authorizedBy?: string;
  recordedBy: string;
  recordedByName: string;
}): Promise<string> {
  const expenseData = cleanData({
    date: params.date,
    amount: Math.abs(params.amount),
    category: params.category,
    description: params.description.trim(),
    branch: params.branch || 'all',
    receiptUrl: params.receiptUrl || '',
    authorizedBy: params.authorizedBy || '',
    recordedBy: params.recordedBy,
    recordedByName: params.recordedByName,
    createdAt: new Date().toISOString(),
  });

  const docRef = await addDoc(collection(db, EXPENSES_COLLECTION), expenseData);

  try {
    await addAuditLog(
      'CREATE',
      'PAYMENT',
      docRef.id,
      `Petty cash outflow: ${params.amount} LE for ${params.category} - ${params.description}`,
      params.recordedByName
    );
  } catch (err) {
    console.warn('[expenseService] Failed to record audit log:', err);
  }

  return docRef.id;
}

export async function fetchExpenses(params?: {
  branch?: string;
  startDate?: string;
  endDate?: string;
}): Promise<Expense[]> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const snap = await getDocs(expensesRef);

    let list: Expense[] = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Expense[];

    // In-memory filter for maximum flexibility without requiring compound indexes
    if (params?.branch && params.branch !== 'all' && params.branch !== 'ALL') {
      list = list.filter((e) => e.branch === params.branch || e.branch === 'all');
    }
    if (params?.startDate) {
      list = list.filter((e) => e.date >= params.startDate!);
    }
    if (params?.endDate) {
      list = list.filter((e) => e.date <= params.endDate!);
    }

    // Sort descending by date
    list.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
    return list;
  } catch (err) {
    console.error('[expenseService] Failed to fetch expenses:', err);
    return [];
  }
}

export async function removeExpense(expenseId: string, user: { id: string; name: string }): Promise<void> {
  await deleteDoc(doc(db, EXPENSES_COLLECTION, expenseId));
  try {
    await addAuditLog(
      'DELETE',
      'PAYMENT',
      expenseId,
      'Deleted petty cash record',
      user.name
    );
  } catch (err) {
    console.warn('[expenseService] Failed to record delete audit log:', err);
  }
}

export function computeExpenseSummary(expenses: Expense[]): ExpenseSummary {
  const initialCategoryMap: Record<ExpenseCategory, number> = {
    'Utilities': 0,
    'Cleaning & Hygiene': 0,
    'Equipment Maintenance': 0,
    'Office & Front Desk Supplies': 0,
    'Staff Refreshments': 0,
    'Towel Laundry': 0,
    'Facility Repairs': 0,
    'Marketing & Print': 0,
    'Other': 0,
  };

  let totalAmount = 0;
  for (const exp of expenses) {
    const amt = Number(exp.amount) || 0;
    totalAmount += amt;
    if (initialCategoryMap[exp.category] !== undefined) {
      initialCategoryMap[exp.category] += amt;
    } else {
      initialCategoryMap['Other'] += amt;
    }
  }

  return {
    totalAmount,
    count: expenses.length,
    byCategory: initialCategoryMap,
  };
}
