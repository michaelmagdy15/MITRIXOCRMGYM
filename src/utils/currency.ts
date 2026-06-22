import { BrandingSettings } from '../types';

export function getCurrencySymbol(branding: BrandingSettings | undefined, isRtl: boolean = false): string {
  if (branding?.currencySymbol) {
    return branding.currencySymbol;
  }
  return isRtl ? 'ج.م' : 'LE';
}

export function getCurrencyCode(branding: BrandingSettings | undefined): string {
  return branding?.currencyCode || 'EGP';
}

export function formatCurrency(amount: number, branding: BrandingSettings | undefined, isRtl: boolean = false): string {
  const symbol = getCurrencySymbol(branding, isRtl);
  // Position symbol before the amount for standard currencies like $, €, £
  if (symbol === '$' || symbol === '£' || symbol === '€' || symbol === '¥') {
    return `${symbol}${amount.toLocaleString()}`;
  }
  return `${amount.toLocaleString()} ${symbol}`;
}
