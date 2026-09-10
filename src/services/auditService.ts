import { addDoc, collection } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { AuditLog, AuditDiff, Branch } from '../types';
import { cleanData } from '../utils';

/**
 * Adds an audit log entry to Firestore with optional before/after diffs and justification reasons.
 */
export const addAuditLog = async (
  action: AuditLog['action'], 
  entityType: AuditLog['entityType'], 
  entityId: string, 
  details: string,
  userName?: string,
  options?: {
    diff?: AuditDiff[];
    reason?: string;
    branch?: Branch;
  }
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

    if (options?.diff && options.diff.length > 0) {
      auditData.diff = options.diff;
    }

    if (options?.reason) {
      auditData.reason = options.reason;
    }

    if (options?.branch) {
      auditData.branch = options.branch;
    }

    await addDoc(collection(db, 'auditLogs'), cleanData(auditData));
  } catch (error) {
    console.error('Audit Log Error:', error);
  }
};
