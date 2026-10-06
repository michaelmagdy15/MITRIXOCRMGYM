import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  runTransaction, 
  writeBatch 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Client, ClientId, SessionId } from '../types';
import { cleanData } from '../utils';
import { normalizeEgyptPhone } from '../utils/phoneUtils';
import { addAuditLog } from './auditService';
import { updatePTSessionStatus } from './ptSessionService';

export const generateMemberId = async (): Promise<string> => {
  const counterRef = doc(db, 'counters', 'clients');
  try {
    const newId = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let nextId = 112; 
      if (counterDoc.exists()) {
        const data = counterDoc.data();
        nextId = (data?.['lastId'] || 111) + 1;
      }
      transaction.set(counterRef, { lastId: nextId }, { merge: true });
      return nextId;
    });
    return newId.toString();
  } catch (error) {
    console.error("Error generating member ID:", error);
    return Math.floor(Math.random() * 10000).toString();
  }
};

export const addClient = async (client: Client): Promise<ClientId> => {
  const { id: _, comments: __, ...clientData } = client;
  
  if (clientData.status !== 'Lead' && !('memberId' in clientData)) {
    // This is a safety check for when we are converting a lead to a member
    (clientData as any).memberId = await generateMemberId();
  }

  if (clientData.phone) {
    (clientData as any).normalized_phone = normalizeEgyptPhone(clientData.phone);
  }

  const docRef = doc(collection(db, 'clients'));
  const clientId = docRef.id as ClientId;
  const finalData = { ...cleanData(clientData), id: clientId };
  
  await setDoc(docRef, finalData, { merge: true });

  await addAuditLog(
    'CREATE', 
    client.status === 'Lead' ? 'LEAD' : 'CLIENT', 
    clientId, 
    `Added new ${client.status === 'Lead' ? 'lead' : 'client'}: ${client.name}`
  );
  return clientId;
};

export const updateClient = async (id: ClientId, updates: Partial<Client>, currentName?: string): Promise<void> => {
  const { comments: _, ...updateData } = updates;

  if (updateData.phone) {
    (updateData as any).normalized_phone = normalizeEgyptPhone(updateData.phone);
  }
  
  await updateDoc(doc(db, 'clients', id), cleanData(updateData));

  await addAuditLog('UPDATE', 'CLIENT', id, `Updated client/lead: ${currentName || id}`);
};

export const deleteClient = async (id: ClientId, clientName?: string): Promise<void> => {
  await updateDoc(doc(db, 'clients', id), {
    isDeleted: true,
    deletedAt: new Date().toISOString()
  });
  await addAuditLog('DELETE', 'CLIENT', id, `Soft-deleted client/lead: ${clientName || id}`);
};

export const addComment = async (clientId: ClientId, text: string, author: string): Promise<void> => {
  const commentData = {
    text,
    date: new Date().toISOString(),
    author
  };

  await addDoc(collection(db, 'clients', clientId, 'comments'), commentData);
  await updateDoc(doc(db, 'clients', clientId), {
    lastContactDate: new Date().toISOString()
  });
};

export const bulkAddClients = async (newClients: Client[]) => {
  const activeClientsCount = newClients.filter(c => c.status !== 'Lead').length;
  let nextMemberId = 112;
  
  if (activeClientsCount > 0) {
    const counterRef = doc(db, 'counters', 'clients');
    try {
      nextMemberId = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let currentId = 112;
        if (counterDoc.exists()) {
          const data = counterDoc.data();
          currentId = (data?.['lastId'] || 111) + 1;
        }
        transaction.set(counterRef, { lastId: currentId + activeClientsCount }, { merge: true });
        return currentId;
      });
    } catch (error) {
      console.error("Error generating bulk member IDs:", error);
      nextMemberId = Math.floor(Math.random() * 10000);
    }
  }

  let batch = writeBatch(db);
  let operationCount = 0;
  let successCount = 0;
  let failedCount = 0;
  const errors: {row: number, reason: string}[] = [];

  for (let i = 0; i < newClients.length; i++) {
    try {
      const client = newClients[i]!;
      const { id: _, comments: __, ...clientData } = client;
      
      if (clientData.status !== 'Lead' && !('memberId' in clientData)) {
        (clientData as any).memberId = (nextMemberId++).toString();
      }

      if (clientData.phone) {
        (clientData as any).normalized_phone = normalizeEgyptPhone(clientData.phone);
      }
      
      const docRef = doc(collection(db, 'clients'));
      const clientId = docRef.id as ClientId;
      
      batch.set(docRef, { ...cleanData(clientData), id: clientId }, { merge: true });
      operationCount++;
      
      if (operationCount === 450) {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
      }
      successCount++;
    } catch (err) {
      failedCount++;
      errors.push({ row: i + 1, reason: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  if (operationCount > 0) {
    await batch.commit();
  }

  await addAuditLog('CREATE', 'CLIENT', 'bulk', `Bulk imported ${successCount} clients/leads`);
  return { success: successCount, failed: failedCount, errors };
};

/**
 * Centrally handles recording session attendance, deducting sessions, and logging activity.
 */
export const recordSessionAttendance = async (
  clientId: ClientId,
  sessionId: SessionId,
  status: 'Attended' | 'No Show' | 'Cancelled' | 'Scheduled',
  client: Client,
  authorName: string
): Promise<void> => {
  await updatePTSessionStatus(sessionId, status, { authorName });
};

export const deleteMultipleClients = async (ids: ClientId[]): Promise<void> => {
  const batch = writeBatch(db);
  ids.forEach(id => {
    batch.delete(doc(db, 'clients', id));
  });
  await batch.commit();
  await addAuditLog('DELETE', 'CLIENT', 'multiple', `Bulk deleted ${ids.length} clients/leads`);
};
