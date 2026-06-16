import { addDays, subDays, addMonths, subMonths, formatISO } from 'date-fns';
import { Client, SalesTarget, User } from './types';

const now = new Date();

export const mockUsers: User[] = [
  { id: 'u1', name: 'Admin Manager', role: 'manager', email: 'admin@mitrixogymcrm.com' },
  { id: 'u2', name: 'John (Sales Rep)', role: 'rep', email: 'john@mitrixogymcrm.com' },
  { id: 'u3', name: 'Sarah (Sales Rep)', role: 'rep', email: 'sarah@mitrixogymcrm.com' },
  { id: 'u4', name: 'Admin Assistant', role: 'admin', email: 'assistant@mitrixogymcrm.com' },
];

export const mockPTPackages: import('./types').PTPackageRecord[] = [];

export const mockSalesTarget: SalesTarget = {
  targetAmount: 50000,
  currentAmount: 32500,
  privatePackagesSold: 45,
  groupPackagesSold: 120,
};

export const mockClients: Client[] = [
  {
    id: '1',
    name: 'Ahmed Hassan',
    phone: '+20 100 123 4567',
    status: 'Lead',
    assignedTo: 'u2',
    interest: 'Interested',
    category: 'None',
    source: 'Instagram',
    stage: 'Trial',
    expectedVisitDate: formatISO(addDays(now, 1)),
    trialDate: formatISO(addDays(now, 2)),
    lastContactDate: formatISO(subDays(now, 2)),
    nextReminderDate: formatISO(addDays(now, 1)),
    comments: [
      {
        id: 'c1',
        text: 'Called and explained packages. Very interested in private sessions.',
        date: formatISO(subDays(now, 2)),
        author: 'Sales Rep 1'
      }
    ]
  },
  {
    id: '2',
    name: 'Sara Mahmoud',
    phone: '+20 111 987 6543',
    status: 'Lead',
    assignedTo: 'u3',
    interest: 'Pending',
    category: 'No answer',
    source: 'WhatsApp',
    stage: 'Follow Up',
    lastContactDate: formatISO(subDays(now, 1)),
    nextReminderDate: formatISO(addDays(now, 2)),
    comments: [
      {
        id: 'c2',
        text: 'Tried calling, no answer. Will try again tomorrow.',
        date: formatISO(subDays(now, 1)),
        author: 'Sales Rep 2'
      }
    ]
  },
  {
    id: '3',
    name: 'Omar Farouk',
    phone: '+20 122 345 6789',
    status: 'Lead',
    interest: 'Not Interested',
    category: 'Price',
    source: 'Walk-in',
    stage: 'Lost',
    lastContactDate: formatISO(subDays(now, 5)),
    comments: [
      {
        id: 'c3',
        text: 'Found it too expensive. Offered discount but still declined.',
        date: formatISO(subDays(now, 5)),
        author: 'Sales Rep 1'
      }
    ]
  },
  {
    id: '4',
    name: 'Heba abdo',
    phone: '+20 109 559 0905',
    status: 'Active',
    packageType: '30 session adult',
    startDate: formatISO(subMonths(now, 1)),
    membershipExpiry: formatISO(addMonths(now, 2)),
    sessionsRemaining: 6,
    dateOfBirth: formatISO(addDays(subMonths(now, 300), 2)), // Birthday in 2 days
    points: 450,
    lastContactDate: formatISO(subMonths(now, 1)),
    comments: []
  },
  {
    id: '5',
    name: 'salma dawaod',
    phone: '+20 106 666 8500',
    status: 'Expired',
    packageType: '10 S GT',
    startDate: formatISO(subMonths(now, 2)),
    membershipExpiry: formatISO(subDays(now, 5)),
    sessionsRemaining: -3,
    dateOfBirth: formatISO(subDays(subMonths(now, 280), 10)),
    points: 1200,
    lastContactDate: formatISO(subMonths(now, 2)),
    nextReminderDate: formatISO(addDays(now, 1)),
    comments: [
      {
        id: 'c4',
        text: 'Client has negative sessions (-3). Needs to renew immediately.',
        date: formatISO(now),
        author: 'System'
      }
    ]
  },
  {
    id: '6',
    name: 'Mourad w Omar',
    phone: '+20 111 191 1489',
    status: 'Active',
    packageType: '20 S GT kids (separate)',
    sessionsRemaining: 'no attend',
    dateOfBirth: formatISO(addDays(subMonths(now, 350), 20)),
    points: 800,
    lastContactDate: formatISO(subDays(now, 10)),
    nextReminderDate: formatISO(now),
    comments: [
      {
        id: 'c5',
        text: 'Bought package but has not attended yet. Follow up to schedule first session.',
        date: formatISO(subDays(now, 5)),
        author: 'System'
      }
    ]
  }
];
