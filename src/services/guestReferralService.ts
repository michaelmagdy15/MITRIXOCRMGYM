import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  addDoc,
  increment,
} from 'firebase/firestore';
import { db, auth, getTenantId } from '../firebase';
import { Client } from '../types';
import { getEgyptPhoneVariants, normalizeEgyptPhone, convertArabicNumerals } from '../utils/phoneUtils';

export interface CreateGuestInviteInput {
  hostClient: Client;
  guestName: string;
  guestPhone: string;
  guestNationalId: string;
  status?: 'Pending' | 'Attended';
  visitDate?: string;
  createdBy?: string;
}

export interface CreateGuestInviteResult {
  inviteId: string;
  inviteCode: string;
  guestClientId: string;
  newRemaining: number;
}

export interface CreateReferralInput {
  hostClient: Client;
  referralName: string;
  referralPhone: string;
  referralNationalId?: string;
  referralNotes?: string;
  createdBy?: string;
}

export function normalizeNationalId(raw?: string | null): string {
  if (!raw) return '';
  return convertArabicNumerals(raw).replace(/[^a-zA-Z0-9]/g, '').trim().toUpperCase();
}

export function generateInviteCode(prefix = 'INV'): string {
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += digits.charAt(Math.floor(Math.random() * digits.length));
  }
  return `${prefix}-${code}`;
}

/**
 * Checks Firestore `clients` and `guestInvites` collections by Phone Variants AND National ID
 * to guarantee:
 * 1. An existing Gym Member (`status !== 'Lead'`) can never be invited as a guest.
 * 2. A guest can never be invited twice (whether by the same member or a different member,
 *    or using the same phone or same National ID).
 * 3. Returns any existing un-invited `Lead` profile so we update it rather than duplicating.
 */
export async function checkGuestEligibilityAndDuplicates(
  guestPhone: string,
  guestNationalId: string
): Promise<{ existingUninvitedLeadDoc: { id: string; data: Record<string, any> } | null }> {
  const phoneVariants = getEgyptPhoneVariants(guestPhone).slice(0, 10);
  const cleanNatId = normalizeNationalId(guestNationalId);

  // 1. Check `guestInvites` by phone variants & National ID
  if (phoneVariants.length > 0) {
    const invByPhoneSnap = await getDocs(
      query(collection(db, 'guestInvites'), where('guestPhone', 'in', phoneVariants))
    ).catch(() => null);
    if (invByPhoneSnap && !invByPhoneSnap.empty) {
      const prev = invByPhoneSnap.docs[0]!.data();
      throw new Error(
        `"${prev.guestName || 'This visitor'}" (${guestPhone}) has already been invited before by ${prev.hostName || 'a member'} (Code: ${prev.inviteCode || 'N/A'}, Status: ${prev.status || 'Invited'}). A guest cannot be invited twice — their Lead profile is already in the system!`
      );
    }
  }

  if (cleanNatId.length >= 5) {
    const invByNatSnap = await getDocs(
      query(collection(db, 'guestInvites'), where('guestNationalId', '==', cleanNatId))
    ).catch(() => null);
    if (invByNatSnap && !invByNatSnap.empty) {
      const prev = invByNatSnap.docs[0]!.data();
      throw new Error(
        `National ID ${cleanNatId} ("${prev.guestName || 'Visitor'}") has already been invited before by ${prev.hostName || 'a member'} (Code: ${prev.inviteCode || 'N/A'}). A guest cannot be invited twice!`
      );
    }
  }

  // 2. Check `clients` by phone variants & National ID
  const matchedClientDocs = new Map<string, Record<string, any>>();

  if (phoneVariants.length > 0) {
    const [byPhoneSnap, byNormSnap] = await Promise.all([
      getDocs(query(collection(db, 'clients'), where('phone', 'in', phoneVariants))).catch(() => null),
      getDocs(query(collection(db, 'clients'), where('normalized_phone', 'in', phoneVariants))).catch(() => null),
    ]);
    byPhoneSnap?.forEach((d) => matchedClientDocs.set(d.id, d.data()));
    byNormSnap?.forEach((d) => matchedClientDocs.set(d.id, d.data()));
  }

  if (cleanNatId.length >= 5) {
    const byNatSnap = await getDocs(
      query(collection(db, 'clients'), where('nationalId', '==', cleanNatId))
    ).catch(() => null);
    byNatSnap?.forEach((d) => matchedClientDocs.set(d.id, d.data()));
  }

  let existingUninvitedLeadDoc: { id: string; data: Record<string, any> } | null = null;

  for (const [docId, data] of matchedClientDocs.entries()) {
    if (data.isDeleted) continue;
    const statusLower = String(data.status || '').trim().toLowerCase();

    // Already a gym member (Active, Expired, Hold, etc.)
    if (statusLower && statusLower !== 'lead') {
      throw new Error(
        `Cannot invite "${data.name || 'Member'}" (#${data.memberId || docId}) as a guest — this Phone Number or National ID already belongs to an existing gym member (${data.status})!`
      );
    }

    // Already a Lead who was previously invited as a guest
    if (
      data.invitedAsGuest === true ||
      Boolean(data.guestSerial) ||
      String(data.advertisingSource || '').toLowerCase().includes('guest') ||
      String(data.typeOfClient || '').toLowerCase().includes('guest')
    ) {
      throw new Error(
        `"${data.name || 'This guest'}" already has a Guest Lead profile in the system (Invited by ${data.referredByName || 'a member'}, Code: ${data.guestSerial || 'N/A'}). They cannot be invited twice — view their profile in Leads!`
      );
    }

    if (!existingUninvitedLeadDoc) {
      existingUninvitedLeadDoc = { id: docId, data };
    }
  }

  return { existingUninvitedLeadDoc };
}

/**
 * Creates a Guest Invitation + automatically creates/links a single deduplicated Lead Profile in `clients`.
 * Tries the authoritative backend `/api/member/guest-invite` endpoint first (for Member Portal & Staff),
 * with a direct Firestore implementation fallback for Staff.
 */
export async function createGuestInvitationWithProfile(
  input: CreateGuestInviteInput
): Promise<CreateGuestInviteResult> {
  const trimmedName = input.guestName.trim();
  const trimmedPhone = input.guestPhone.trim();
  const cleanNatId = normalizeNationalId(input.guestNationalId);
  const status = input.status || 'Pending';

  if (!trimmedName || trimmedName.length < 2) {
    throw new Error('Please enter the guest’s full name.');
  }
  if (!trimmedPhone || trimmedPhone.replace(/\D/g, '').length < 8) {
    throw new Error('Please enter a valid guest phone number.');
  }
  if (!cleanNatId || cleanNatId.length < 5) {
    throw new Error('Please enter the guest’s National ID (or Passport number).');
  }

  const hostClient = input.hostClient;
  const tenantId = getTenantId();

  // 1. Try server-side endpoint first (works for both Member Portal clients and Staff)
  try {
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch('/api/member/guest-invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-tenant-id': tenantId,
      },
      body: JSON.stringify({
        clientId: hostClient.id,
        guestName: trimmedName,
        guestPhone: trimmedPhone,
        guestNationalId: cleanNatId,
        status,
        visitDate: input.visitDate,
        createdBy: input.createdBy,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.inviteCode) {
      return {
        inviteId: data.inviteId || '',
        inviteCode: data.inviteCode,
        guestClientId: data.guestClientId || '',
        newRemaining: typeof data.remaining === 'number' ? data.remaining : 0,
      };
    }
    if (res.status === 400 || res.status === 409) {
      throw new Error(data.error || 'Could not create guest invitation.');
    }
  } catch (err: any) {
    // Re-throw validation / conflict errors from server
    if (
      err?.message &&
      (err.message.includes('already') ||
        err.message.includes('Cannot invite') ||
        err.message.includes('remaining') ||
        err.message.includes('National ID'))
    ) {
      throw err;
    }
  }

  // 2. Staff direct Firestore execution (with full duplicate + eligibility check)
  const curRemaining =
    typeof hostClient.guestInvitesRemaining === 'number'
      ? hostClient.guestInvitesRemaining
      : typeof (hostClient as any).invitationsRemaining === 'number'
      ? (hostClient as any).invitationsRemaining
      : Math.max(
          0,
          Number((hostClient as any).invitationsTotal ?? (hostClient as any).guestInvitations ?? 3) -
            Number((hostClient as any).invitationsUsed ?? 0)
        );

  if (curRemaining <= 0) {
    throw new Error(`${hostClient.name} has used all guest invitations included in their package.`);
  }

  const { existingUninvitedLeadDoc } = await checkGuestEligibilityAndDuplicates(trimmedPhone, cleanNatId);

  const nowIso = new Date().toISOString();
  const isInzan = tenantId.toLowerCase().includes('inzan');
  const inviteCode = generateInviteCode(isInzan ? 'INV' : 'ST');
  const normPhone = normalizeEgyptPhone(trimmedPhone);
  const chosenAttendanceIso = input.visitDate
    ? new Date(`${input.visitDate}T12:00:00`).toISOString()
    : nowIso;

  // Create or update single Lead profile in `clients`
  const leadDocRef = existingUninvitedLeadDoc
    ? doc(db, 'clients', existingUninvitedLeadDoc.id)
    : doc(collection(db, 'clients'));

  const noteText = `Guest Invitation (${inviteCode}) by Member ${hostClient.name} (#${hostClient.memberId || hostClient.id}) • National ID: ${cleanNatId}`;
  const leadPayload: Record<string, any> = {
    id: leadDocRef.id,
    leadId: existingUninvitedLeadDoc?.data?.leadId || inviteCode,
    name: trimmedName,
    phone: trimmedPhone,
    normalized_phone: normPhone,
    nationalId: cleanNatId,
    status: 'Lead',
    stage: status === 'Attended' ? 'Trial' : 'New',
    source: 'Referral',
    advertisingSource: 'Guest Invitation',
    typeOfClient: 'Guest Invitation',
    interest: 'Interested',
    category: 'None',
    invitedByType: 'Member',
    invitedById: hostClient.id,
    referredBy: hostClient.id,
    referredByMemberId: hostClient.memberId || hostClient.legacyMemberId || hostClient.id,
    referredByName: hostClient.name,
    salesRep: hostClient.salesRep || hostClient.assignedTo || '',
    assignedTo: hostClient.assignedTo || hostClient.salesRep || '',
    salesName: (hostClient as any).salesName || '',
    invitedAsGuest: true,
    invitedAt: nowIso,
    guestSerial: inviteCode,
    trialDate: status === 'Attended' ? chosenAttendanceIso.slice(0, 10) : undefined,
    frontDeskNote: noteText,
    notes: noteText,
    branch: hostClient.branch || hostClient.homeBranch || 'Garden 8',
    createdAt: existingUninvitedLeadDoc?.data?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  // Strip undefined keys
  Object.keys(leadPayload).forEach((k) => leadPayload[k] === undefined && delete leadPayload[k]);
  await setDoc(leadDocRef, leadPayload, { merge: true });

  // Create `guestInvites` record linked to `guestClientId`
  const invitePayload: Record<string, any> = {
    hostClientId: hostClient.id,
    hostId: hostClient.id,
    hostMemberId: hostClient.memberId || hostClient.legacyMemberId || '',
    hostName: hostClient.name || '',
    guestName: trimmedName,
    guestPhone: trimmedPhone,
    normalizedPhone: normPhone,
    guestNationalId: cleanNatId,
    guestClientId: leadDocRef.id,
    inviteCode,
    status,
    createdAt: nowIso,
    branch: hostClient.branch || hostClient.homeBranch || 'Garden 8',
  };

  if (status === 'Attended') {
    invitePayload.attendedAt = chosenAttendanceIso;
    invitePayload.attendanceDate = chosenAttendanceIso;
    invitePayload.confirmedBy = input.createdBy || 'Reception';
  } else if (input.visitDate) {
    invitePayload.attendanceDate = chosenAttendanceIso;
  }

  const inviteDocRef = await addDoc(collection(db, 'guestInvites'), invitePayload);

  // Deduct 1 pass from host member
  const newRemaining = Math.max(0, curRemaining - 1);
  await updateDoc(doc(db, 'clients', hostClient.id), {
    guestInvitesRemaining: newRemaining,
    invitationsRemaining: newRemaining,
    invitationsUsed: increment(1),
    updatedAt: nowIso,
  });

  await addDoc(collection(db, 'auditLogs'), {
    action: 'CREATE',
    entityType: 'CLIENT',
    entityId: hostClient.id,
    details: `Generated guest invitation (${inviteCode}) & Lead profile for "${trimmedName}" (${trimmedPhone}, National ID: ${cleanNatId}) under member ${hostClient.name} [${status}]`,
    timestamp: nowIso,
    userId: hostClient.portalUserId || hostClient.id,
    userName: input.createdBy || hostClient.name,
  });

  return {
    inviteId: inviteDocRef.id,
    inviteCode,
    guestClientId: leadDocRef.id,
    newRemaining,
  };
}

/**
 * Reception activation / confirmation of a Pending Guest Invite (`INV-XXXXXX`).
 * Marks the `guestInvites` doc as `Attended`, updates (or creates if missing) the single Lead profile
 * in `clients` with `stage: 'Trial'`, and logs an attendance entry.
 */
export async function activatePendingGuestInvite(params: {
  inviteId: string;
  sourceCollection?: 'guestInvites' | 'guests';
  inviteData: {
    inviteCode: string;
    guestName: string;
    guestPhone: string;
    guestNationalId?: string;
    guestClientId?: string;
    hostClientId: string;
    hostMemberId?: string;
    hostName: string;
    branch?: string;
  };
  confirmedBy?: string;
}): Promise<{ guestClientId: string }> {
  const { inviteId, sourceCollection = 'guestInvites', inviteData, confirmedBy = 'Reception' } = params;
  const nowIso = new Date().toISOString();

  // 1. Update the invite document to Attended
  await updateDoc(doc(db, sourceCollection, inviteId), {
    status: 'Attended',
    attendedAt: nowIso,
    attendanceDate: nowIso,
    confirmedBy,
    updatedAt: nowIso,
  });

  // 2. Find or create the Guest's Lead Profile in `clients` (never duplicate!)
  let targetLeadId = inviteData.guestClientId || '';
  const phoneVariants = getEgyptPhoneVariants(inviteData.guestPhone).slice(0, 10);
  const cleanNatId = normalizeNationalId(inviteData.guestNationalId);

  if (!targetLeadId && phoneVariants.length > 0) {
    const snap = await getDocs(query(collection(db, 'clients'), where('phone', 'in', phoneVariants))).catch(() => null);
    if (snap && !snap.empty) {
      targetLeadId = snap.docs[0]!.id;
    }
  }
  if (!targetLeadId && cleanNatId.length >= 5) {
    const snap = await getDocs(query(collection(db, 'clients'), where('nationalId', '==', cleanNatId))).catch(() => null);
    if (snap && !snap.empty) {
      targetLeadId = snap.docs[0]!.id;
    }
  }

  const leadRef = targetLeadId ? doc(db, 'clients', targetLeadId) : doc(collection(db, 'clients'));
  const normPhone = normalizeEgyptPhone(inviteData.guestPhone);
  const noteText = `Guest Invite ${inviteData.inviteCode} confirmed at reception by ${confirmedBy} (Invited by ${inviteData.hostName})`;

  const leadUpdate: Record<string, any> = {
    id: leadRef.id,
    name: inviteData.guestName,
    phone: inviteData.guestPhone,
    normalized_phone: normPhone,
    ...(cleanNatId ? { nationalId: cleanNatId } : {}),
    status: 'Lead',
    stage: 'Trial',
    source: 'Referral',
    advertisingSource: 'Guest Invitation',
    typeOfClient: 'Guest Invitation',
    invitedByType: 'Member',
    invitedById: inviteData.hostClientId,
    referredBy: inviteData.hostClientId,
    referredByMemberId: inviteData.hostMemberId || inviteData.hostClientId,
    referredByName: inviteData.hostName,
    invitedAsGuest: true,
    guestSerial: inviteData.inviteCode,
    trialDate: nowIso.slice(0, 10),
    frontDeskNote: noteText,
    branch: inviteData.branch || 'Garden 8',
    updatedAt: nowIso,
  };
  if (!targetLeadId) {
    leadUpdate.leadId = inviteData.inviteCode;
    leadUpdate.createdAt = nowIso;
  }

  await setDoc(leadRef, leadUpdate, { merge: true });

  // Link guestClientId back onto the invite doc if it wasn't linked yet
  if (!inviteData.guestClientId) {
    await updateDoc(doc(db, sourceCollection, inviteId), {
      guestClientId: leadRef.id,
    }).catch(() => {});
  }

  await addDoc(collection(db, 'auditLogs'), {
    action: 'UPDATE',
    entityType: 'CLIENT',
    entityId: inviteData.hostClientId,
    details: `Confirmed & activated Guest Invite ${inviteData.inviteCode} for "${inviteData.guestName}" (${inviteData.guestPhone}) — Lead profile #${leadRef.id} moved to Trial stage`,
    timestamp: nowIso,
    userId: inviteData.hostClientId,
    userName: confirmedBy,
  });

  return { guestClientId: leadRef.id };
}

/**
 * Creates an Unlimited Member Referral + deduplicated Lead profile in `clients`.
 */
export async function createMemberReferralWithProfile(
  input: CreateReferralInput
): Promise<{ referralEntry: Record<string, any>; leadClientId: string }> {
  const trimmedName = input.referralName.trim();
  const trimmedPhone = input.referralPhone.trim();
  const cleanNatId = normalizeNationalId(input.referralNationalId);
  const trimmedNotes = (input.referralNotes || '').trim();

  if (!trimmedName || !trimmedPhone) {
    throw new Error('Please enter both Referral Name and Phone Number.');
  }

  const phoneVariants = getEgyptPhoneVariants(trimmedPhone).slice(0, 10);
  const matchedDocs = new Map<string, Record<string, any>>();

  if (phoneVariants.length > 0) {
    const [byPhone, byNorm] = await Promise.all([
      getDocs(query(collection(db, 'clients'), where('phone', 'in', phoneVariants))).catch(() => null),
      getDocs(query(collection(db, 'clients'), where('normalized_phone', 'in', phoneVariants))).catch(() => null),
    ]);
    byPhone?.forEach((d) => matchedDocs.set(d.id, d.data()));
    byNorm?.forEach((d) => matchedDocs.set(d.id, d.data()));
  }
  if (cleanNatId.length >= 5) {
    const byNat = await getDocs(query(collection(db, 'clients'), where('nationalId', '==', cleanNatId))).catch(() => null);
    byNat?.forEach((d) => matchedDocs.set(d.id, d.data()));
  }

  for (const [docId, data] of matchedDocs.entries()) {
    if (data.isDeleted) continue;
    const statusLower = String(data.status || '').trim().toLowerCase();
    if (statusLower && statusLower !== 'lead') {
      throw new Error(
        `Cannot refer "${data.name || trimmedName}" (#${data.memberId || docId}) — this person is already registered as a gym member (${data.status})!`
      );
    }
    throw new Error(
      `"${data.name || trimmedName}" (${trimmedPhone}) already has a Lead profile in the system (Referred by: ${data.referredByName || 'Direct'}). No duplicate profile created!`
    );
  }

  const nowIso = new Date().toISOString();
  const hostClient = input.hostClient;
  const normPhone = normalizeEgyptPhone(trimmedPhone);
  const leadRef = doc(collection(db, 'clients'));
  const refCode = `REF-${Date.now().toString().slice(-6)}`;
  const noteText = trimmedNotes
    ? `Member Referral from ${hostClient.name} (#${hostClient.memberId || hostClient.id}): ${trimmedNotes}`
    : `Referred by member ${hostClient.name} (#${hostClient.memberId || hostClient.id})`;

  await setDoc(leadRef, {
    id: leadRef.id,
    leadId: refCode,
    name: trimmedName,
    phone: trimmedPhone,
    normalized_phone: normPhone,
    ...(cleanNatId ? { nationalId: cleanNatId } : {}),
    notes: noteText,
    frontDeskNote: noteText,
    status: 'Lead',
    stage: 'New',
    source: 'Referral',
    advertisingSource: 'Member Referral',
    typeOfClient: 'Referral',
    interest: 'Interested',
    referredBy: hostClient.id,
    referredByMemberId: hostClient.memberId || hostClient.legacyMemberId || hostClient.id,
    referredByName: hostClient.name,
    salesRep: hostClient.salesRep || hostClient.assignedTo || '',
    assignedTo: hostClient.assignedTo || hostClient.salesRep || '',
    salesName: (hostClient as any).salesName || '',
    branch: hostClient.branch || hostClient.homeBranch || 'Garden 8',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const referralEntry = {
    id: `ref_${Date.now()}`,
    leadClientId: leadRef.id,
    leadCode: refCode,
    name: trimmedName,
    phone: trimmedPhone,
    ...(cleanNatId ? { nationalId: cleanNatId } : {}),
    notes: trimmedNotes,
    referredByClientId: hostClient.id,
    referredByMemberId: hostClient.memberId || hostClient.id,
    referredByName: hostClient.name,
    createdAt: nowIso,
    createdBy: input.createdBy || 'Staff',
  };

  return { referralEntry, leadClientId: leadRef.id };
}
