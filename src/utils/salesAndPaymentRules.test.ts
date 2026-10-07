import { describe, it } from 'node:test';
import assert from 'node:assert';
import { canReassignMemberSalesRep, isPaymentEditableByStaff } from './permissions';
import { User } from '../types';

describe('Sales Rep Lock & Reassignment Rules', () => {
  const superAdminUser: User = {
    id: 'u-super',
    name: 'Super Admin',
    email: 'admin@gym.com',
    role: 'super_admin'
  };

  const salesManagerUser: User = {
    id: 'u-sales-mgr',
    name: 'Atef Sales Manager',
    email: 'atef@gym.com',
    role: 'manager',
    jobTitle: 'Sales Manager',
    department: 'Sales'
  };

  const receptionistUser: User = {
    id: 'u-receptionist',
    name: 'Nour Front Desk',
    email: 'nour@gym.com',
    role: 'rep',
    jobTitle: 'Front Desk'
  };

  const salesRepUser: User = {
    id: 'u-rep',
    name: 'Simary Sales Rep',
    email: 'simary@gym.com',
    role: 'rep',
    jobTitle: 'Sales Representative'
  };

  const coachUser: User = {
    id: 'u-coach',
    name: 'Captain Tarek',
    email: 'tarek@gym.com',
    role: 'coach'
  };

  it('allows Super Admin and CRM Admin to reassign member sales rep', () => {
    assert.strictEqual(canReassignMemberSalesRep(superAdminUser), true);
    assert.strictEqual(canReassignMemberSalesRep({ ...superAdminUser, role: 'crm_admin' }), true);
  });

  it('allows Sales Manager to reassign member sales rep', () => {
    assert.strictEqual(canReassignMemberSalesRep(salesManagerUser), true);
    assert.strictEqual(canReassignMemberSalesRep({ ...receptionistUser, role: 'sales_manager' as any }), true);
  });

  it('allows user with explicit members.reassign_sales_rep custom permission', () => {
    const userWithPerm: User = {
      ...receptionistUser,
      customPermissions: { 'members.reassign_sales_rep': true }
    };
    assert.strictEqual(canReassignMemberSalesRep(userWithPerm), true);
  });

  it('denies Front Desk Receptionist from reassigning member sales rep', () => {
    assert.strictEqual(canReassignMemberSalesRep(receptionistUser), false);
  });

  it('denies Sales Rep from reassigning member sales rep', () => {
    assert.strictEqual(canReassignMemberSalesRep(salesRepUser), false);
  });

  it('denies Coach from reassigning member sales rep', () => {
    assert.strictEqual(canReassignMemberSalesRep(coachUser), false);
  });

  it('ALLOWS non-Inzan tenants (like Strike Boxing) to reassign sales reps without Inzan locking', () => {
    assert.strictEqual(canReassignMemberSalesRep(salesRepUser, undefined, 'strike'), true);
    assert.strictEqual(canReassignMemberSalesRep(receptionistUser, undefined, 'strike'), true);
  });
});

describe('Receptionist 1-Day Payment Edit Window Rules', () => {
  const staffRecorder: User = {
    id: 'u-staff-1',
    name: 'Front Desk Sara',
    email: 'sara@gym.com',
    role: 'rep'
  };

  const otherStaff: User = {
    id: 'u-staff-2',
    name: 'Front Desk Mona',
    email: 'mona@gym.com',
    role: 'rep'
  };

  const manager: User = {
    id: 'u-manager',
    name: 'General Manager',
    email: 'gm@gym.com',
    role: 'manager'
  };

  it('allows manager to edit payment anytime, even if 30 days old', () => {
    const oldPayment = {
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      recordedBy: staffRecorder.id
    };
    const res = isPaymentEditableByStaff(oldPayment, manager);
    assert.strictEqual(res.canEdit, true);
  });

  it('allows recording receptionist to edit payment within 1 hour of recording', () => {
    const recentPayment = {
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      recordedBy: staffRecorder.id
    };
    const res = isPaymentEditableByStaff(recentPayment, staffRecorder);
    assert.strictEqual(res.canEdit, true);
  });

  it('allows recording receptionist to edit payment within 23 hours', () => {
    const recentPayment = {
      created_at: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
      recordedBy: staffRecorder.id
    };
    const res = isPaymentEditableByStaff(recentPayment, staffRecorder);
    assert.strictEqual(res.canEdit, true);
  });

  it('BLOCKS recording receptionist after 25 hours (window expired)', () => {
    const expiredPayment = {
      created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      recordedBy: staffRecorder.id
    };
    const res = isPaymentEditableByStaff(expiredPayment, staffRecorder);
    assert.strictEqual(res.canEdit, false);
    assert.match(res.reason || '', /1-day window/i);
  });

  it('BLOCKS other staff members from editing even within 1 hour', () => {
    const recentPayment = {
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      recordedBy: staffRecorder.id
    };
    const res = isPaymentEditableByStaff(recentPayment, otherStaff);
    assert.strictEqual(res.canEdit, false);
    assert.match(res.reason || '', /did not record/i);
  });

  it('ALLOWS staff on non-Inzan tenants (like Strike) to edit payments based on standard permissions without 24-hr lock', () => {
    const expiredPayment = {
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      recordedBy: staffRecorder.id
    };
    const resStaff = isPaymentEditableByStaff(expiredPayment, staffRecorder, true, 'strike');
    assert.strictEqual(resStaff.canEdit, true);
  });
});
