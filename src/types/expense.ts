export type ExpenseCategory =
  | 'Utilities'
  | 'Cleaning & Hygiene'
  | 'Equipment Maintenance'
  | 'Office & Front Desk Supplies'
  | 'Staff Refreshments'
  | 'Towel Laundry'
  | 'Facility Repairs'
  | 'Marketing & Print'
  | 'Other';

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  category: ExpenseCategory;
  description: string;
  branch: string;
  receiptUrl?: string;
  authorizedBy?: string;
  recordedBy: string;
  recordedByName: string;
  createdAt: string;
}

export interface ExpenseSummary {
  totalAmount: number;
  count: number;
  byCategory: Record<ExpenseCategory, number>;
}
