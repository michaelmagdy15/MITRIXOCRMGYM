import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMemberInBackupClients,
  mergeBackupClients,
  searchBackupClients,
} from './backupFailover';
import {
  filterArchiveItems,
  mergeMemberAttendanceArchives,
} from '../services/historicalArchiveService';

test('findMemberInBackupClients resolves ID, case-insensitive prefix codes, barcodes, phones, and mergedInto targets', () => {
  const sampleClients = [
    {
      id: 'redgits-27137',
      name: 'Ahmed Kassem',
      memberId: 'P20',
      barcode: '27137',
      phone: '01000680580',
      secondaryBarcodes: ['P-20', 'K99'],
      packages: [{ id: 'pkg-1', packageName: 'Partners', barcode: 'PKG-777' }],
      status: 'Expired',
    },
    {
      id: 'redgits-legacy-alias',
      name: 'Alias Row',
      memberId: 'OLD-99',
      mergedInto: 'redgits-27137',
    },
    {
      id: 'redgits-10018',
      name: 'Mariam Hassan',
      memberId: '10018',
      phone: '+201112223334',
      status: 'Active',
    },
  ];

  // Exact and case-insensitive lookup
  assert.equal(findMemberInBackupClients(sampleClients, 'P20')?.id, 'redgits-27137');
  assert.equal(findMemberInBackupClients(sampleClients, 'p20')?.id, 'redgits-27137');
  assert.equal(findMemberInBackupClients(sampleClients, '#27137')?.id, 'redgits-27137');

  // Secondary barcode and package barcode lookup
  assert.equal(findMemberInBackupClients(sampleClients, 'K99')?.id, 'redgits-27137');
  assert.equal(findMemberInBackupClients(sampleClients, 'pkg-777')?.id, 'redgits-27137');

  // Phone normalization lookup
  assert.equal(findMemberInBackupClients(sampleClients, '01112223334')?.id, 'redgits-10018');

  // Merged target resolution
  assert.equal(findMemberInBackupClients(sampleClients, 'OLD-99')?.id, 'redgits-27137');

  // Unknown member cleanly returns null
  assert.equal(findMemberInBackupClients(sampleClients, 'DOES-NOT-EXIST'), null);
});

test('mergeBackupClients preserves live items and tags backup-only items, and searchBackupClients caps results', () => {
  const live = [{ id: 'c1', name: 'Live User', memberId: '101', status: 'Active' }];
  const backup = [
    { id: 'c1', name: 'Stale Snapshot Copy', memberId: '101', status: 'Expired' },
    { id: 'c2', name: 'Snapshot Only User', memberId: '102', phone: '01099988877', status: 'Active' },
    { id: 'c3', name: 'Snapshot Lead', leadId: 'L-5', status: 'Lead' },
  ];

  const merged = mergeBackupClients(live, backup);
  assert.equal(merged.length, 3);
  assert.equal(merged[0]?.name, 'Live User');
  assert.equal(merged[0]?._fromBackupSnapshot, undefined);
  assert.equal(merged[1]?.id, 'c2');
  assert.equal(merged[1]?._fromBackupSnapshot, true);

  const hits = searchBackupClients(backup, 'snapshot', 1);
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?._fromBackupSnapshot, true);
});

test('historicalArchiveService filters archive arrays and deduplicates merged member attendance history', () => {
  const leads = [
    { id: '1', name: 'Omar Mosad', phone: '01001112222', branch: 'Garden 8' },
    { id: '2', name: 'Youssef Adel', phone: '01113334444', branch: 'Arkan' },
  ];
  const res = filterArchiveItems(leads, 'omar', 10);
  assert.equal(res.total, 2);
  assert.equal(res.matched, 1);
  assert.equal(res.items[0]?.id, '1');

  const attHist = [
    { id: 'h1', date: '2026-10-13T16:28:27.000Z', packageName: 'Basic Membership', branch: 'Garden 8' },
    { id: 'h2', date: '2026-09-01T10:00:00.000Z', packageName: 'Group Class', branch: 'Garden 8' },
  ];
  const legacyAtt = [
    // Same second & package as h1 -> deduplicated
    { id: 'a1', date: '2026-10-13T16:28:27.450Z', packageName: 'Basic Membership', branch: 'Garden 8' },
    { id: 'a2', date: '2026-10-25T18:00:00.000Z', packageName: 'PT Session', branch: 'Garden 8' },
  ];

  const merged = mergeMemberAttendanceArchives(attHist, legacyAtt);
  assert.equal(merged.length, 3);
  assert.equal(merged[0]?.id, 'a2');
  assert.equal(merged[1]?.id, 'h1');
  assert.equal(merged[2]?.id, 'h2');
  assert.equal(merged.every((r) => r.isArchived === true), true);
});

test('findMemberInBackupClients strictly resolves P20 without false-matching +20 phone prefixes', () => {
  const appleReviewer = {
    id: 'app-rev-1',
    name: 'Apple Reviewer',
    memberId: 'MEM-APP-REV',
    phone: '+201000000001',
    normalizedPhone: '201000000001',
    status: 'Active',
  };
  const ahmedKassem = {
    id: 'inzan-p20',
    name: 'Ahmed Kassem',
    memberId: 'P20',
    phone: '01099887766',
    status: 'Expired',
  };

  const withP20 = findMemberInBackupClients([appleReviewer, ahmedKassem], 'P20');
  assert.equal(withP20?.id, 'inzan-p20');
  assert.equal(withP20?.name, 'Ahmed Kassem');

  // When P20 is absent, +20 phone numbers must not be falsely returned for "P20"
  const withoutP20 = findMemberInBackupClients([appleReviewer], 'P20');
  assert.equal(withoutP20, null);
});
