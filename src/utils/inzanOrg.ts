import { InzanDepartment, InzanJobTitle, UserRole } from '../types';

export const INZAN_DEPARTMENTS: InzanDepartment[] = [
  'Executive',
  'Operations',
  'Marketing',
  'Experience',
  'Fitness',
  'Finance',
  'Sales'
];

export const INZAN_JOB_TITLES: Record<InzanDepartment, InzanJobTitle[]> = {
  Executive: ['General Manager'],
  Operations: [
    'Operations Manager',
    'Floor Manager I',
    'Floor Manager II',
    'Maintenance',
    'Male Housekeeping',
    'Female Housekeeping',
    'Housekeeping'
  ],
  Marketing: [
    'Marketing Manager',
    'Content Creator',
    'Graphic Designer'
  ],
  Experience: [
    'Experience Manager',
    'Front Desk'
  ],
  Fitness: [
    'Fitness Manager',
    'Nutritionist',
    'Zone Head',
    'Full-Time Trainer',
    'Part-Time Trainer'
  ],
  Finance: [
    'Financial Manager',
    'Accountant'
  ],
  Sales: [
    'Sales Manager',
    'Assistant Sales Manager',
    'Client Relationship Manager'
  ]
};

// Maps reporting chain based on the INZAN Organizational Structure
export const INZAN_SUPERVISOR_TITLES: Record<InzanJobTitle, InzanJobTitle | null> = {
  'General Manager': null,
  'Operations Manager': 'General Manager',
  'Floor Manager I': 'Operations Manager',
  'Floor Manager II': 'Operations Manager',
  'Maintenance': 'Operations Manager',
  'Male Housekeeping': 'Floor Manager I',
  'Female Housekeeping': 'Floor Manager II',
  'Housekeeping': 'Operations Manager',
  'Marketing Manager': 'General Manager',
  'Content Creator': 'Marketing Manager',
  'Graphic Designer': 'Marketing Manager',
  'Experience Manager': 'General Manager',
  'Front Desk': 'Experience Manager',
  'Fitness Manager': 'General Manager',
  'Nutritionist': 'Fitness Manager',
  'Zone Head': 'Fitness Manager',
  'Full-Time Trainer': 'Zone Head',
  'Part-Time Trainer': 'Zone Head',
  'Financial Manager': 'General Manager',
  'Accountant': 'Financial Manager',
  'Sales Manager': 'General Manager',
  'Assistant Sales Manager': 'Sales Manager',
  'Client Relationship Manager': 'Assistant Sales Manager'
};

// Maps INZAN Job Title to base system UserRole
export const getSystemRoleForJobTitle = (title: InzanJobTitle): UserRole => {
  switch (title) {
    case 'General Manager':
      return 'manager';
    case 'Operations Manager':
    case 'Floor Manager I':
    case 'Floor Manager II':
    case 'Marketing Manager':
    case 'Experience Manager':
    case 'Fitness Manager':
    case 'Financial Manager':
    case 'Sales Manager':
    case 'Assistant Sales Manager':
      return 'manager';
    case 'Full-Time Trainer':
    case 'Part-Time Trainer':
    case 'Zone Head':
      return 'coach';
    case 'Client Relationship Manager':
    case 'Front Desk':
    case 'Nutritionist':
    case 'Content Creator':
    case 'Graphic Designer':
    case 'Accountant':
    case 'Maintenance':
    case 'Male Housekeeping':
    case 'Female Housekeeping':
    case 'Housekeeping':
    default:
      return 'rep';
  }
};

export const getDepartmentForJobTitle = (title: InzanJobTitle): InzanDepartment => {
  for (const [dept, titles] of Object.entries(INZAN_JOB_TITLES)) {
    if ((titles as InzanJobTitle[]).includes(title)) {
      return dept as InzanDepartment;
    }
  }
  return 'Operations';
};

export const isTenantInzan = (companyName?: string): boolean => {
  try {
    // Check hostname, document dataset, or branding name
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname.toLowerCase();
      if (hostname.includes('inzan')) return true;
      if (document.documentElement.dataset.tenantTheme === 'inzanathletics') return true;
    }
    const comp = (companyName || '').toLowerCase();
    if (comp.includes('inzan')) return true;
    return false;
  } catch {
    return false;
  }
};

export const isValidNationalIdOrPassport = (val?: string): boolean => {
  if (!val) return false;
  const clean = val.trim();
  // Egyptian National ID (14 digits) or Passport (6-12 alphanumeric chars)
  if (/^\d{14}$/.test(clean)) return true;
  if (/^[A-Za-z0-9]{6,14}$/.test(clean)) return true;
  return false;
};


/** Validates an Egyptian mobile number (accepts 01XXXXXXXXX, 201XXXXXXXXX or +201XXXXXXXXX). */
export const isValidEgyptianMobile = (phone?: string | null): boolean => {
  const digits = (phone || '').replace(/[^\d]/g, '');
  return /^(20)?0?1[0125]\d{8}$/.test(digits);
};
