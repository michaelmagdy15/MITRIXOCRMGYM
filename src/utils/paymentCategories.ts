export type PaymentCategory = 'Classes' | 'PT' | 'Memberships' | 'Physio' | 'Nutrition';

export const PAYMENT_CATEGORIES: PaymentCategory[] = ['Classes', 'PT', 'Memberships', 'Physio', 'Nutrition'];

export const resolvePaymentCategory = (packageName: string): PaymentCategory => {
  const lower = (packageName || '').toLowerCase();
  if (lower.includes('physio') || lower.includes('physical therapy')) return 'Physio';
  if (lower.includes('nutrition') || lower.includes('diet')) return 'Nutrition';
  if (lower.includes('pt') || lower.includes('private')) return 'PT';
  if (lower.includes('class') || lower.includes('group') || lower.includes('bootcamp')) return 'Classes';
  return 'Memberships';
};

export const normalizePaymentCategory = (value: string | null | undefined): PaymentCategory => {
  if (!value) return 'Memberships';
  if (value === 'Private Training' || value === 'PT' || value === 'Pt') return 'PT';
  if (value === 'Group Training' || value === 'Classes') return 'Classes';
  if (value === 'Physio') return 'Physio';
  if (value === 'Nutrition') return 'Nutrition';
  return 'Memberships';
};
