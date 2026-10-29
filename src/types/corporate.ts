export interface CorporateBenefit {
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  extraDurationDays?: number; // e.g. 30 days / 1 month
  extraFreezeDays?: number; // e.g. 15 days
  extraPtSessions?: number; // e.g. 2 sessions
  extraGuestPasses?: number; // e.g. 3 passes
  eligiblePackageIds?: string[];
}

export interface CorporateAccount {
  id: string;
  tenantId: string;
  companyName: string; // e.g. 'CIB', 'Vodafone', 'PwC'
  corporateCode: string; // e.g. 'CIB-CORP'
  domain?: string; // e.g. '@cibeg.com'
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  benefits: CorporateBenefit;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  notes?: string;
}

export interface CorporateBenefitCalculationResult {
  discountedPrice: number;
  extraDurationDays: number;
  extraFreezeDays: number;
  extraPtSessions: number;
  extraGuestPasses: number;
}
