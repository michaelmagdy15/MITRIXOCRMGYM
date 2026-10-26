import { Client, User } from '../types';
import { canReassignMemberSalesRep, isGeneralManagerOrCEO, isSalesManagerUser } from './permissions';

export const LOCKED_CORE_MEMBER_FIELDS: (keyof Client)[] = [
  'name',
  'phone',
  'nationalId',
  'dateOfBirth',
  'gender',
  'memberId',
  'legacyMemberId',
  'salesRep',
  'status',
  'createdAt',
  'cardId',
  'barcode',
];

export const EDITABLE_ADDITIONAL_MEMBER_FIELDS: (keyof Client | string)[] = [
  'backupPhone',
  'email',
  'jobTitle',
  'city',
  'address',
  'emergencyContactName',
  'medicalInfo',
  'weight',
  'height',
  'activityLevel',
  'fitnessTarget',
  'preferredTime',
  'colorLabel',
  'civilStatus',
  'nationality',
  'civilianOrMilitary',
  'advertisingSource',
  'typeOfClient',
  'guestSerial',
  'assignedTo',
  'assignedCoachId',
  'assignedCoachName',
  'trainerName',
  'coach',
  'staffAssignments',
];

/**
 * Determines whether a specific member profile field is locked from editing for the given user.
 *
 * Rules:
 * - Core member profile fields in `LOCKED_CORE_MEMBER_FIELDS` are locked (`true`) by default
 *   when editing a member profile to prevent unauthorized edits (keeping only the specified
 *   additional info fields editable).
 * - For `salesRep`, also checks `canReassignMemberSalesRep(currentUser)` when `unlockCoreFieldsOverride` is true.
 * - Only if `unlockCoreFieldsOverride === true` AND (`currentUser?.role === 'super_admin'` || `currentUser?.role === 'crm_admin'`)
 *   can core fields be unlocked (`false`).
 * - Fields in `EDITABLE_ADDITIONAL_MEMBER_FIELDS` (and any non-locked fields) return `false` (editable).
 */
export function isFieldLockedForUser(
  fieldKey: keyof Client,
  currentUser?: User | null,
  client?: Client | null,
  unlockCoreFieldsOverride: boolean = false
): boolean {
  if (EDITABLE_ADDITIONAL_MEMBER_FIELDS.includes(fieldKey)) {
    return false;
  }

  if (LOCKED_CORE_MEMBER_FIELDS.includes(fieldKey)) {
    if (!unlockCoreFieldsOverride) {
      return true;
    }

    if (fieldKey === 'salesRep' && !canReassignMemberSalesRep(currentUser)) {
      return true;
    }

    const canUnlockCore =
      currentUser?.role === 'super_admin' ||
      currentUser?.role === 'crm_admin' ||
      isGeneralManagerOrCEO(currentUser) ||
      (isSalesManagerUser(currentUser) && (fieldKey === 'name' || fieldKey === 'phone' || fieldKey === 'salesRep'));

    return !canUnlockCore;
  }

  return false;
}

/**
 * Sanitizes incoming member profile updates by preserving existing client values
 * (or stripping updates) for any field that is locked for the current user.
 * Guarantees data security even if client-side form state is manipulated.
 */
export function sanitizeMemberProfileUpdates(
  updates: Partial<Client>,
  existingClient: Client,
  currentUser?: User | null,
  unlockCoreFieldsOverride: boolean = false
): Partial<Client> {
  const sanitized: Partial<Client> = { ...updates };

  for (const rawKey of Object.keys(sanitized)) {
    const key = rawKey as keyof Client;
    if (isFieldLockedForUser(key, currentUser, existingClient, unlockCoreFieldsOverride)) {
      if (key in existingClient) {
        (sanitized as Record<string, unknown>)[key] = existingClient[key];
      } else {
        delete sanitized[key];
      }
    }
  }

  return sanitized;
}
