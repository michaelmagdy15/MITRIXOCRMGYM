export type PaymentCategory = 'Classes' | 'PT' | 'Memberships' | 'Physio' | 'Nutrition';

export const PAYMENT_CATEGORIES: PaymentCategory[] = ['Classes', 'PT', 'Memberships', 'Physio', 'Nutrition'];

export const resolvePaymentCategory = (packageName: string): PaymentCategory => {
  const lower = (packageName || '').toLowerCase();
  if (lower.includes('physio') || lower.includes('physical therapy')) return 'Physio';
  if (lower.includes('nutrition') || lower.includes('diet')) return 'Nutrition';
  if (lower.includes('pt') || lower.includes('private') || lower.includes('personal')) return 'PT';
  if (lower.includes('class') || lower.includes('group') || lower.includes('bootcamp') || lower.includes('drop') || /\bgt\b/i.test(lower)) return 'Classes';
  return 'Memberships';
};

export const normalizePaymentCategory = (value: string | null | undefined): PaymentCategory => {
  if (!value) return 'Memberships';
  const v = value.trim();
  if (v === 'Private Training' || v === 'PT' || v === 'Pt') return 'PT';
  if (v === 'Group Training' || v === 'Classes' || v === 'Drop In' || v === 'Drop Session') return 'Classes';
  if (v === 'Physio') return 'Physio';
  if (v === 'Nutrition') return 'Nutrition';
  return 'Memberships';
};
