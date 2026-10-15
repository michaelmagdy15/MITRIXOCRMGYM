import { Client } from '../types';

export interface PhoneSimilarityMatch {
  clusterKey: string;
  shared7Digits: string;
  members: {
    id: string;
    memberId: string;
    name: string;
    phone: string;
    backupPhone?: string;
    status: string;
    branch?: string;
    salesRep?: string;
  }[];
}

/**
 * Strips non-digits and common Egyptian country/carrier prefixes (+20, 0020, leading 01x)
 * so we can extract 7-digit consecutive windows from local subscriber numbers.
 */
export function normalizePhoneForSimilarity(raw?: string | null): string {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('0020')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('20') && digits.length >= 11) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0') && digits.length >= 10) {
    digits = digits.slice(1);
  }
  return digits;
}

/**
 * Extracts all consecutive N-digit substrings (default 7 digits, matching RedGITS v17.12
 * `/admin/reports/similarity_mobile` "Check 7 numbers consecutive").
 */
export function extractConsecutiveDigitWindows(phone?: string | null, windowLength = 7): string[] {
  const clean = normalizePhoneForSimilarity(phone);
  if (clean.length < windowLength) return [];
  const windows = new Set<string>();
  for (let i = 0; i <= clean.length - windowLength; i++) {
    windows.add(clean.slice(i, i + windowLength));
  }
  return Array.from(windows);
}

/**
 * Finds all groups of distinct members who share any 7 consecutive phone digits
 * across either primary `phone` or `backupPhone`.
 * Catches duplicate guest passes, carrier-prefix swaps (010 vs 012), and debt evasion accounts.
 */
export function findSimilarPhoneClusters(clients: Client[], windowLength = 7): PhoneSimilarityMatch[] {
  const windowToClients = new Map<string, Map<string, Client>>();

  for (const client of clients) {
    if (client.isDeleted) continue;
    const windows = new Set<string>([
      ...extractConsecutiveDigitWindows(client.phone, windowLength),
      ...extractConsecutiveDigitWindows(client.backupPhone, windowLength),
    ]);

    for (const win of windows) {
      let bucket = windowToClients.get(win);
      if (!bucket) {
        bucket = new Map<string, Client>();
        windowToClients.set(win, bucket);
      }
      bucket.set(client.id, client);
    }
  }

  // Deduplicate identical member sets so two members sharing an 8-digit sequence appear once
  const seenPairs = new Map<string, PhoneSimilarityMatch>();

  for (const [win, bucket] of windowToClients.entries()) {
    if (bucket.size < 2) continue;
    const membersList = Array.from(bucket.values());
    const signature = membersList
      .map((m) => m.id)
      .sort()
      .join('|');

    if (!seenPairs.has(signature)) {
      seenPairs.set(signature, {
        clusterKey: signature,
        shared7Digits: win,
        members: membersList.map((m) => ({
          id: m.id,
          memberId: m.memberId || m.id.slice(0, 6),
          name: m.name || 'Unknown',
          phone: m.phone || '—',
          backupPhone: m.backupPhone,
          status: m.status || 'Lead',
          branch: m.branch,
          salesRep: m.salesName || m.salesRep,
        })),
      });
    }
  }

  return Array.from(seenPairs.values());
}

/**
 * Checks if a candidate phone number shares 7 consecutive digits with any existing client.
 */
export function checkPhoneSimilarityForCandidate(
  candidatePhone: string,
  clients: Client[],
  excludeClientId?: string,
  windowLength = 7
): { matchedClient: Client; sharedDigits: string }[] {
  const candidateWindows = new Set(extractConsecutiveDigitWindows(candidatePhone, windowLength));
  if (candidateWindows.size === 0) return [];

  const matches: { matchedClient: Client; sharedDigits: string }[] = [];

  for (const client of clients) {
    if (client.isDeleted || client.id === excludeClientId) continue;
    const clientWindows = [
      ...extractConsecutiveDigitWindows(client.phone, windowLength),
      ...extractConsecutiveDigitWindows(client.backupPhone, windowLength),
    ];
    const hit = clientWindows.find((w) => candidateWindows.has(w));
    if (hit) {
      matches.push({ matchedClient: client, sharedDigits: hit });
    }
  }

  return matches;
}

/**
 * Masks an Egyptian/international phone number as `20.xxx.xxx.xxx` (or `20.xxx...` with last 2 visible)
 * for anti-data-theft protection until a staff member explicitly clicks Show or Copy.
 */
export function maskEgyptianPhone(raw?: string | null, showLastDigits = false): string {
  if (!raw) return '—';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '—';
  if (showLastDigits && digits.length >= 4) {
    return `20.xxx.xxx.${digits.slice(-2)}`;
  }
  return '20.xxx.xxx.xxx';
}
