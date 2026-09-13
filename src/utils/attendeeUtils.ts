import { Client } from '../types';

export interface ResolvedAttendee {
  client?: Client;
  displayName: string;
  displayPhone: string;
  displayId: string;
  rawId: string;
  isOrphaned: boolean;
}

/**
 * Normalizes attendee lookup across doc IDs, member IDs, portal user IDs, and phones.
 * Returns resolved client data, formatted display strings, and orphaned status.
 */
export function resolveAttendee(attendee: any, clients: Client[]): ResolvedAttendee {
  if (!attendee) {
    return {
      client: undefined,
      displayName: 'Unknown Client',
      displayPhone: '',
      displayId: '',
      rawId: '',
      isOrphaned: true
    };
  }

  const rawId = typeof attendee === 'string' 
    ? attendee 
    : (attendee.memberId || attendee.clientId || attendee.id || attendee.userId || '');
  
  const attendeeObjName = typeof attendee === 'object' ? (attendee.name || attendee.clientName) : '';
  const attendeeObjPhone = typeof attendee === 'object' ? attendee.phone : '';

  // 1. Direct match by document id
  let client = clients.find(c => c.id === rawId);
  
  // 2. Match by memberId (e.g. "1403" or "#1403")
  if (!client && rawId) {
    const cleanId = String(rawId).replace(/^#/, '').trim().toLowerCase();
    client = clients.find(c => String(c.memberId || '').replace(/^#/, '').trim().toLowerCase() === cleanId);
  }

  // 3. Match by portalUserId
  if (!client && rawId) {
    client = clients.find(c => c.portalUserId === rawId);
  }

  // 4. Match by phone number if rawId looks like a phone number
  if (!client && rawId) {
    const rawDigits = String(rawId).replace(/\D/g, '').slice(-10);
    if (rawDigits.length >= 8) {
      client = clients.find(c => {
        const cDigits = (c.phone || '').replace(/\D/g, '').slice(-10);
        return cDigits && cDigits === rawDigits;
      });
    }
  }

  // 5. Match by object phone if available
  if (!client && attendeeObjPhone) {
    const objDigits = String(attendeeObjPhone).replace(/\D/g, '').slice(-10);
    if (objDigits.length >= 8) {
      client = clients.find(c => {
        const cDigits = (c.phone || '').replace(/\D/g, '').slice(-10);
        return cDigits && cDigits === objDigits;
      });
    }
  }

  const isOrphaned = !client;
  const displayName = client?.name || attendeeObjName || (isOrphaned ? 'Unknown Client' : 'Member');
  const displayPhone = client?.phone || attendeeObjPhone || '';
  const displayId = client?.memberId ? `#${client.memberId}` : (rawId ? `#${rawId}` : '');

  return {
    client,
    displayName,
    displayPhone,
    displayId,
    rawId,
    isOrphaned
  };
}
