import { collection, doc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
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
  const docRef = await addDoc(collection(db, 'payments'), cleanData(payment));
  await addAuditLog('CREATE', 'PAYMENT', docRef.id as PaymentId, `Recorded payment of ${payment.amount} for client ${payment.clientId}`);
  return docRef.id as PaymentId;
};

export const deletePayment = async (id: PaymentId) => {
  await deleteDoc(doc(db, 'payments', id));
  await addAuditLog('DELETE', 'PAYMENT', id, `Deleted payment record: ${id}`);
};

// Task Service
export const addTask = async (task: Omit<Task, 'id'>) => {
  const docRef = await addDoc(collection(db, 'tasks'), cleanData(task));
  // await addAuditLog('CREATE', 'TASK', docRef.id as TaskId, `Created task: ${task.title}`);
  return docRef.id as TaskId;
};

export const updateTask = async (id: TaskId, updates: Partial<Task>) => {
  await updateDoc(doc(db, 'tasks', id), cleanData(updates));
};

export const deleteTask = async (id: TaskId) => {
  await deleteDoc(doc(db, 'tasks', id));
};

// Package Service
export const addPackage = async (pkg: Omit<Package, 'id'>) => {
  const docRef = await addDoc(collection(db, 'packages'), cleanData(pkg));
  return docRef.id as PackageId;
};

export const updatePackage = async (id: PackageId, updates: Partial<Package>) => {
  await updateDoc(doc(db, 'packages', id), cleanData(updates));
};

export const deletePackage = async (id: PackageId) => {
  await deleteDoc(doc(db, 'packages', id));
};

// Session Service
export const addPrivateSession = async (session: Omit<PrivateSession, 'id'>) => {
  const docRef = await addDoc(collection(db, 'sessions'), cleanData(session));
  await addAuditLog('CREATE', 'SESSION', docRef.id as SessionId, `Scheduled session for client ${session.clientId}`);
  return docRef.id as SessionId;
};

export const updatePrivateSession = async (id: SessionId, updates: Partial<PrivateSession>) => {
  await updateDoc(doc(db, 'sessions', id), cleanData(updates));
};
