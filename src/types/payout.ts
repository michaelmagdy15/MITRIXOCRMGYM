export interface PayoutConfig {
  coachId: string; // "default" for global fallback
  ptFixedRate?: number;
  ptPercentage?: number;
  freeClassRate?: number;
  paidClassPercentage?: number;
  paidClassFixedRate?: number;
}

export interface PayoutRecord {
  id: string;
  coachId: string;
  coachName: string;
  period: string; // YYYY-MM
  
  ptSessions: number;
  ptRevenue: number;
  ptPayout: number;
  
  freeClasses: number;
  freeClassPayout: number;
  
  paidClasses: number;
  paidClassRevenue: number;
  paidClassPayout: number;
  
  totalPayout: number;
  status: 'draft' | 'approved' | 'paid';
  generatedAt: string; // ISO string
  approvedBy?: string;
  approvedAt?: string; // ISO string
}
