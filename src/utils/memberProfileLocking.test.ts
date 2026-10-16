import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  LOCKED_CORE_MEMBER_FIELDS,
  EDITABLE_ADDITIONAL_MEMBER_FIELDS,
  isFieldLockedForUser,
  sanitizeMemberProfileUpdates,
} from './memberProfileLocking';
import { Client, User } from '../types';

describe('memberProfileLocking', () => {
  const existingClient: Client = {
    id: 'client-001',
    name: 'Ahmed Hassan',
    phone: '+201001234567',
    nationalId: '29501011234567',
    dateOfBirth: '1995-01-01',
    gender: 'Male',
    memberId: 'MEM-1001',
    legacyMemberId: 'LEG-500',
    salesRep: 'rep-001',
    status: 'Active',
    createdAt: '2026-01-10T10:00:00.000Z',
    cardId: 'CARD-99',
    barcode: 'BAR-99',
    email: 'ahmed@example.com',
    backupPhone: '+201112223334',
    jobTitle: 'Engineer',
    city: 'Cairo',
    address: 'New Cairo, 5th Settlement',
    emergencyContactName: 'Mona Hassan',
    medicalInfo: 'None',
    weight: 80,
    height: 180,
    activityLevel: 'Moderately Active',
    fitnessTarget: 'Gain Muscle',
    preferredTime: 'Evening',
    colorLabel: 'blue',
  };

  const salesRepUser: User = {
    id: 'user-rep',
    name: 'Sara Sales',
    email: 'sara@gym.com',
    role: 'rep',
  };

  const managerUser: User = {
    id: 'user-mgr',
    name: 'Omar Manager',
    email: 'omar@gym.com',
    role: 'manager',
  };

  const superAdminUser: User = {
    id: 'user-super',
    name: 'Super Admin',
    email: 'super@gym.com',
    role: 'super_admin',
  };

  const crmAdminUser: User = {
    id: 'user-crm-admin',
    name: 'CRM Admin',
    email: 'crmadmin@gym.com',
    role: 'crm_admin',
  };

  describe('field lists definition', () => {
    it('includes required core fields in LOCKED_CORE_MEMBER_FIELDS', () => {
      const expectedCoreFields: (keyof Client)[] = [
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
      assert.deepStrictEqual(LOCKED_CORE_MEMBER_FIELDS, expectedCoreFields);
    });

    it('includes required additional fields in EDITABLE_ADDITIONAL_MEMBER_FIELDS', () => {
      const expectedEditableFields: (keyof Client)[] = [
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
      ];
      assert.deepStrictEqual(EDITABLE_ADDITIONAL_MEMBER_FIELDS, expectedEditableFields);
    });
  });

  describe('isFieldLockedForUser', () => {
    it('locks core fields by default for all users including super_admin when override is false', () => {
      const coreFieldsToCheck: (keyof Client)[] = [
        'name',
        'phone',
        'nationalId',
        'dateOfBirth',
        'gender',
        'memberId',
        'salesRep',
      ];

      for (const field of coreFieldsToCheck) {
        assert.strictEqual(isFieldLockedForUser(field, null, existingClient), true);
        assert.strictEqual(isFieldLockedForUser(field, salesRepUser, existingClient, false), true);
        assert.strictEqual(isFieldLockedForUser(field, managerUser, existingClient, false), true);
        assert.strictEqual(isFieldLockedForUser(field, superAdminUser, existingClient, false), true);
        assert.strictEqual(isFieldLockedForUser(field, crmAdminUser, existingClient, false), true);
      }
    });

    it('keeps additional info fields editable for all users', () => {
      const editableFieldsToCheck: (keyof Client)[] = [
        'email',
        'backupPhone',
        'jobTitle',
        'address',
        'emergencyContactName',
        'medicalInfo',
        'weight',
        'height',
        'fitnessTarget',
        'preferredTime',
        'colorLabel',
      ];

      for (const field of editableFieldsToCheck) {
        assert.strictEqual(isFieldLockedForUser(field, null, existingClient), false);
        assert.strictEqual(isFieldLockedForUser(field, salesRepUser, existingClient, false), false);
        assert.strictEqual(isFieldLockedForUser(field, managerUser, existingClient, false), false);
        assert.strictEqual(isFieldLockedForUser(field, superAdminUser, existingClient, true), false);
      }
    });

    it('keeps core fields locked for standard roles even when unlockCoreFieldsOverride is true', () => {
      for (const field of LOCKED_CORE_MEMBER_FIELDS) {
        assert.strictEqual(isFieldLockedForUser(field, salesRepUser, existingClient, true), true);
        assert.strictEqual(isFieldLockedForUser(field, managerUser, existingClient, true), true);
        assert.strictEqual(isFieldLockedForUser(field, null, existingClient, true), true);
      }
    });

    it('unlocks core fields only when unlockCoreFieldsOverride is true AND user is super_admin or crm_admin', () => {
      for (const field of LOCKED_CORE_MEMBER_FIELDS) {
        assert.strictEqual(isFieldLockedForUser(field, superAdminUser, existingClient, true), false);
        assert.strictEqual(isFieldLockedForUser(field, crmAdminUser, existingClient, true), false);
      }
    });
  });

  describe('sanitizeMemberProfileUpdates', () => {
    it('reverts attempts to modify locked core fields while allowing editable additional fields', () => {
      const attemptedUpdates: Partial<Client> = {
        name: 'Hacked Name',
        phone: '+201999999999',
        nationalId: '00000000000000',
        dateOfBirth: '2000-12-12',
        gender: 'Female',
        memberId: 'MEM-9999',
        salesRep: 'rep-hacked',
        email: 'new.ahmed@example.com',
        backupPhone: '+201555555555',
        jobTitle: 'Senior Architect',
        address: 'Maadi, Cairo',
        emergencyContactName: 'Khaled Hassan',
        medicalInfo: 'Asthma',
        weight: 78,
        height: 181,
        fitnessTarget: 'Weight Loss',
        preferredTime: 'Morning',
        colorLabel: 'green',
      };

      const sanitized = sanitizeMemberProfileUpdates(
        attemptedUpdates,
        existingClient,
        salesRepUser,
        false
      );

      // Core fields must retain their existingClient values
      assert.strictEqual(sanitized.name, existingClient.name);
      assert.strictEqual(sanitized.phone, existingClient.phone);
      assert.strictEqual(sanitized.nationalId, existingClient.nationalId);
      assert.strictEqual(sanitized.dateOfBirth, existingClient.dateOfBirth);
      assert.strictEqual(sanitized.gender, existingClient.gender);
      assert.strictEqual(sanitized.memberId, existingClient.memberId);
      assert.strictEqual(sanitized.salesRep, existingClient.salesRep);

      // Editable additional fields must reflect the new updates
      assert.strictEqual(sanitized.email, 'new.ahmed@example.com');
      assert.strictEqual(sanitized.backupPhone, '+201555555555');
      assert.strictEqual(sanitized.jobTitle, 'Senior Architect');
      assert.strictEqual(sanitized.address, 'Maadi, Cairo');
      assert.strictEqual(sanitized.emergencyContactName, 'Khaled Hassan');
      assert.strictEqual(sanitized.medicalInfo, 'Asthma');
      assert.strictEqual(sanitized.weight, 78);
      assert.strictEqual(sanitized.height, 181);
      assert.strictEqual(sanitized.fitnessTarget, 'Weight Loss');
      assert.strictEqual(sanitized.preferredTime, 'Morning');
      assert.strictEqual(sanitized.colorLabel, 'green');
    });

    it('strips locked fields that were not present on existingClient', () => {
      const clientWithoutBarcode: Client = {
        id: 'client-002',
        name: 'Nour Ali',
        phone: '+201009998887',
        status: 'Active',
      };

      const updates: Partial<Client> = {
        barcode: 'UNAUTHORIZED-BARCODE',
        nationalId: '29901010000000',
        email: 'nour@example.com',
      };

      const sanitized = sanitizeMemberProfileUpdates(
        updates,
        clientWithoutBarcode,
        salesRepUser,
        false
      );

      assert.strictEqual('barcode' in sanitized, false);
      assert.strictEqual('nationalId' in sanitized, false);
      assert.strictEqual(sanitized.email, 'nour@example.com');
    });

    it('allows core field updates when super_admin or crm_admin passes unlockCoreFieldsOverride = true', () => {
      const updates: Partial<Client> = {
        name: 'Ahmed M. Hassan',
        phone: '+201007654321',
        salesRep: 'rep-002',
        email: 'updated@example.com',
      };

      const sanitizedSuper = sanitizeMemberProfileUpdates(
        updates,
        existingClient,
        superAdminUser,
        true
      );

      assert.strictEqual(sanitizedSuper.name, 'Ahmed M. Hassan');
      assert.strictEqual(sanitizedSuper.phone, '+201007654321');
      assert.strictEqual(sanitizedSuper.salesRep, 'rep-002');
      assert.strictEqual(sanitizedSuper.email, 'updated@example.com');

      const sanitizedCrmAdmin = sanitizeMemberProfileUpdates(
        updates,
        existingClient,
        crmAdminUser,
        true
      );

      assert.strictEqual(sanitizedCrmAdmin.name, 'Ahmed M. Hassan');
      assert.strictEqual(sanitizedCrmAdmin.phone, '+201007654321');
      assert.strictEqual(sanitizedCrmAdmin.salesRep, 'rep-002');
    });
  });
});
