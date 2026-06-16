import { addDoc, collection } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { AuditLog, UserId } from '../types';

/**
 * Adds an audit log entry to Firestore.
 */
export const addAuditLog = async (
  action: AuditLog['action'], 
  entityType: AuditLog['entityType'], 
  entityId: string, 
  details: string,
  userName?: string
): Promise<void> => {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const auditData: any = {
      userId: currentUser.uid,
      action,
      entityType,
      entityId,
      details,
      timestamp: new Date().toISOString()
    };

    const finalUserName = userName || currentUser.displayName;
    if (finalUserName) {
      auditData.userName = finalUserName;
    }

    await addDoc(collection(db, 'auditLogs'), auditData);
  } catch (error) {
    console.error('Audit Log Error:', error);
  }
};
