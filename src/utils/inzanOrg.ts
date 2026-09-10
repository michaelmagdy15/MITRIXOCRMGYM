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
