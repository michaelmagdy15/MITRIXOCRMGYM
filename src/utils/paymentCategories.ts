export type PaymentCategory = 'Classes' | 'PT' | 'Memberships' | 'Physio' | 'Nutrition';

export const PAYMENT_CATEGORIES: PaymentCategory[] = ['Classes', 'PT', 'Memberships', 'Physio', 'Nutrition'];

export const resolvePaymentCategory = (packageName: string, pkgCategory?: string | null): PaymentCategory => {
  const combined = `${pkgCategory || ''} ${packageName || ''}`.toLowerCase();
  if (combined.includes('physio') || combined.includes('physical therapy')) return 'Physio';
  if (combined.includes('nutrition') || combined.includes('diet')) return 'Nutrition';
  if (
    combined.includes('personal training') ||
    combined.includes('pt') ||
    combined.includes('private') ||
    combined.includes('personal')
  ) {
    return 'PT';
  }
  if (
    combined.includes('classes') ||
    combined.includes('class') ||
    combined.includes('sgf') ||
    combined.includes('small group') ||
    combined.includes('gymnastics') ||
    combined.includes('gymnastic') ||
    combined.includes('group') ||
    combined.includes('bootcamp') ||
    combined.includes('drop') ||
    /\bgt\b/i.test(combined)
  ) {
    return 'Classes';
  }
  if (combined.includes('membership')) return 'Memberships';
  return 'Memberships';
};

export const normalizePaymentCategory = (value: string | null | undefined): PaymentCategory => {
  if (!value) return 'Memberships';
  const v = value.trim();
  const lower = v.toLowerCase();
  if (v === 'Private Training' || v === 'Personal Training' || v === 'PT' || v === 'Pt' || lower === 'personal training') return 'PT';
  if (
    v === 'Group Training' ||
    v === 'Classes' ||
    v === 'SGF' ||
    v === 'Gymnastics' ||
    v === 'Drop In' ||
    v === 'Drop Session' ||
    lower === 'classes' ||
    lower === 'sgf' ||
    lower === 'gymnastics'
  ) {
    return 'Classes';
  }
  if (v === 'Physio' || lower === 'physio') return 'Physio';
  if (v === 'Nutrition' || lower === 'nutrition') return 'Nutrition';
  if (v === 'Membership' || v === 'Memberships' || lower === 'membership' || lower === 'memberships') return 'Memberships';
  return 'Memberships';
};
