import { collection, doc, addDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db, auth, getTenantId } from '../firebase';
import { 
  Payment, 
  Task, 
  Package, 
  PrivateSession, 
  PaymentId, 
  TaskId, 
  PackageId, 
  SessionId 
} from '../types';
import { cleanData } from '../utils';
import { addAuditLog } from './auditService';

// Payment Service
export const addPayment = async (payment: Omit<Payment, 'id'>) => {
  const docId = doc(collection(db, 'payments')).id as PaymentId;
  if (getTenantId() === 'inzanathletics') {
    const token = await auth.currentUser?.getIdToken();
    await fetch('/api/payments/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ id: docId, payment: cleanData(payment) })
    });
  } else {
    await setDoc(doc(db, 'payments', docId), cleanData(payment));
  }
  await addAuditLog('CREATE', 'PAYMENT', docId, `Recorded payment of ${payment.amount} for client ${payment.clientId}`);
  return docId;
};

export const deletePayment = async (id: PaymentId) => {
  if (getTenantId() === 'inzanathletics') {
    const token = await auth.currentUser?.getIdToken();
    await fetch('/api/payments/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ id })
    });
  } else {
    await deleteDoc(doc(db, 'payments', id));
  }
  await addAuditLog('DELETE', 'PAYMENT', id, `Deleted payment record: ${id}`);
};

// Task Service
export const addTask = async (task: Omit<Task, 'id'>) => {
  const docId = doc(collection(db, 'tasks')).id as TaskId;
  if (getTenantId() === 'inzanathletics') {
    const token = await auth.currentUser?.getIdToken();
    await fetch('/api/tasks/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ id: docId, task: cleanData(task) })
    });
  } else {
    await setDoc(doc(db, 'tasks', docId), cleanData(task));
  }
  return docId;
};

export const updateTask = async (id: TaskId, updates: Partial<Task>) => {
  if (getTenantId() === 'inzanathletics') {
    const token = await auth.currentUser?.getIdToken();
    await fetch('/api/tasks/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ id, updates: cleanData(updates) })
    });
  } else {
    await updateDoc(doc(db, 'tasks', id), cleanData(updates));
  }
};

export const deleteTask = async (id: TaskId) => {
  if (getTenantId() === 'inzanathletics') {
    const token = await auth.currentUser?.getIdToken();
    await fetch('/api/tasks/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ id })
    });
  } else {
    await deleteDoc(doc(db, 'tasks', id));
  }
};

// Package Service
export const addPackage = async (pkg: Omit<Package, 'id'>) => {
  const docId = doc(collection(db, 'packages')).id as PackageId;
  if (getTenantId() === 'inzanathletics') {
    const token = await auth.currentUser?.getIdToken();
    await fetch('/api/packages/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ id: docId, pkg: cleanData(pkg) })
    });
  } else {
    await setDoc(doc(db, 'packages', docId), cleanData(pkg));
  }
  return docId;
};

export const updatePackage = async (id: PackageId, updates: Partial<Package>) => {
  if (getTenantId() === 'inzanathletics') {
    const token = await auth.currentUser?.getIdToken();
    await fetch('/api/packages/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ id, updates: cleanData(updates) })
    });
  } else {
    await updateDoc(doc(db, 'packages', id), cleanData(updates));
  }
};

export const deletePackage = async (id: PackageId) => {
  if (getTenantId() === 'inzanathletics') {
    const token = await auth.currentUser?.getIdToken();
    await fetch('/api/packages/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ id })
    });
  } else {
    await deleteDoc(doc(db, 'packages', id));
  }
};

// Session Service
export const addPrivateSession = async (session: Omit<PrivateSession, 'id'>) => {
  const docId = doc(collection(db, 'sessions')).id as SessionId;
  if (getTenantId() === 'inzanathletics') {
    const token = await auth.currentUser?.getIdToken();
    await fetch('/api/sessions/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ id: docId, session: cleanData(session) })
    });
  } else {
    await setDoc(doc(db, 'sessions', docId), cleanData(session));
  }
  await addAuditLog('CREATE', 'SESSION', docId, `Scheduled session for client ${session.clientId}`);
  return docId;
};

export const updatePrivateSession = async (id: SessionId, updates: Partial<PrivateSession>) => {
  if (getTenantId() === 'inzanathletics') {
    const token = await auth.currentUser?.getIdToken();
    await fetch('/api/sessions/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ id, updates: cleanData(updates) })
    });
  } else {
    await updateDoc(doc(db, 'sessions', id), cleanData(updates));
  }
};
