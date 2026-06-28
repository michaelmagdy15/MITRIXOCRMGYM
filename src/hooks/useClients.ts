import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  runTransaction,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { db, createFirebaseUser, getMemberEmail } from '../firebase';
import { Client, CRMComment, InteractionLog, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';

export const useClients = (currentUser: User | null) => {
  const { effectiveRole } = useAuth();
  const [baseClients, setBaseClients] = useState<Omit<Client, 'comments' | 'interactions'>[]>([]);
  const [loading, setLoading] = useState(true);

  const clients = useMemo(() => {
    return baseClients.map(c => ({
      ...c,
      comments: [],
      interactions: [],
    })) as Client[];
  }, [baseClients]);

  useEffect(() => {
    if (!currentUser) return;
    // Members can only read their own client record — skip the global listener
    if (effectiveRole === 'client' || effectiveRole === 'coach') {
      setLoading(false);
      return;
    }

    const unsubClients = onSnapshot(
      collection(db, 'clients'),
      (snapshot) => {
        setBaseClients(
          snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Omit<Client, 'comments' | 'interactions'>))
        );
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'clients');
        setLoading(false);
      }
    );

    return () => unsubClients();
  }, [currentUser, effectiveRole]);

  const fetchClientDetails = async (clientId: string) => {
    try {
      const commentsSnap = await getDocs(collection(db, 'clients', clientId, 'comments'));
      const interactionsSnap = await getDocs(collection(db, 'clients', clientId, 'interactions'));
      
      const comments = commentsSnap.docs.map(d => ({ ...d.data(), id: d.id } as CRMComment));
      const interactions = interactionsSnap.docs.map(d => ({ ...d.data(), id: d.id } as InteractionLog));
      
      return { comments, interactions };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `clients/${clientId}/details`);
      return { comments: [], interactions: [] };
    }
  };

  const generateMemberId = async (): Promise<string> => {
    const counterRef = doc(db, 'counters', 'clients');
    try {
      const newId = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let nextId = 112;
        if (counterDoc.exists()) {
          nextId = (counterDoc.data().lastId || 111) + 1;
        }
        transaction.set(counterRef, { lastId: nextId }, { merge: true });
        return nextId;
      });
      return newId.toString();
    } catch (error) {
      console.error('Error generating member ID:', error);
      return Math.floor(Math.random() * 10000).toString();
    }
  };

  /**
   * Private helper — creates a Firebase Auth user + Firestore /users document
   * for a gym member's portal account.
   * Returns the new uid on success, or undefined if creation failed.
   */
  const createPortalAccount = async (
    memberId: string,
    name: string,
    phone?: string
  ): Promise<string | undefined> => {
    try {
      const email = getMemberEmail(memberId);
      const uid = await createFirebaseUser(email, '12345678');
      const newUser: User = {
        id: uid,
        name,
        email,
        role: 'client',
        clientRecordId: memberId,
        phone: phone || '',
        mustChangePassword: true,
      };
      await setDoc(doc(db, 'users', uid), newUser);
      return uid;
    } catch (authErr) {
      console.error('Auto portal account creation failed:', authErr);
      return undefined;
    }
  };

  const addClient = async (client: Omit<Client, 'id' | 'createdAt'>): Promise<void> => {
    try {
      const { id, comments, ...clientData } = client;
      
      // Normalize phone suffix (last 10 digits)
      const newPhoneNorm = clientData.phone ? clientData.phone.replace(/\D/g, '').slice(-10) : '';

      // Find siblings sharing the same normalized phone suffix
      const siblings = (newPhoneNorm && newPhoneNorm.length >= 10)
        ? baseClients.filter(c => c.phone && c.phone.replace(/\D/g, '').slice(-10) === newPhoneNorm)
        : [];

      // Auto-set linkedAccount if siblings exist
      if (siblings.length > 0) {
        clientData.linkedAccount = true;
      } else {
        const isDuplicate = !clientData.linkedAccount && baseClients.some(c => c.phone === clientData.phone);
        if (isDuplicate) {
          throw new Error(`A client with phone number ${clientData.phone} already exists.`);
        }
      }

      if (clientData.paid === undefined) clientData.paid = false;

      if (!clientData.memberId) {
        clientData.memberId = await generateMemberId();
      }

      // Inherit sales rep from sibling if unassigned
      let canonicalRep = clientData.salesRep;
      if (!canonicalRep || canonicalRep.trim() === '' || canonicalRep.toLowerCase() === 'unassigned') {
        const siblingWithRep = siblings.find(s => s.salesRep && s.salesRep.trim() !== '' && s.salesRep.toLowerCase() !== 'unassigned');
        if (siblingWithRep) {
          canonicalRep = siblingWithRep.salesRep;
        }
      }
      clientData.salesRep = canonicalRep || 'Unassigned';

      const docRef = doc(collection(db, 'clients'));
      const siblingIds = siblings.map(s => s.id);
      const linkedClientIds = Array.from(new Set([...(clientData.linkedClientIds || []), ...siblingIds]));

      const finalData = {
        ...cleanData(clientData),
        id: docRef.id,
        createdAt: new Date().toISOString(),
        linkedClientIds,
      };

      // Auto-create portal account
      if (finalData.memberId) {
        const uid = await createPortalAccount(finalData.memberId, finalData.name, finalData.phone);
        if (uid) finalData.portalUserId = uid;
      }

      const batch = writeBatch(db);
      batch.set(docRef, finalData);

      // Link siblings bidirectionally and sync sales rep
      for (const sibling of siblings) {
        const sibRef = doc(db, 'clients', sibling.id);
        const sibLinks = Array.from(new Set([...(sibling.linkedClientIds || []), docRef.id]));
        const sibUpdates: any = { linkedClientIds: sibLinks, linkedAccount: true };
        
        if (canonicalRep && canonicalRep.toLowerCase() !== 'unassigned' && (!sibling.salesRep || sibling.salesRep.toLowerCase() === 'unassigned')) {
          sibUpdates.salesRep = canonicalRep;
        }
        batch.update(sibRef, sibUpdates);
      }

      await batch.commit();

      await addAuditLog(
        'CREATE',
        client.status === 'Lead' ? 'LEAD' : 'CLIENT',
        docRef.id,
        `Added new ${client.status === 'Lead' ? 'lead' : 'client'}: ${client.name}`,
        currentUser?.name
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'clients');
    }
  };

  const bulkAddClients = async (
    newClients: Client[]
  ): Promise<{ success: number; failed: number; errors: { row: number; reason: string }[] }> => {
    let successCount = 0;
    let failedCount = 0;
    const errors: { row: number; reason: string }[] = [];

    // Pre-filter duplicates to avoid ID generation for them
    const existingPhones = new Set(baseClients.map(c => c.phone));
    const uniquePhonesInBatch = new Set<string>();
    
    const validNewClients = newClients.filter((c, index) => {
      if (!c.phone) return true; // Let validation handle missing phone later if needed
      if (existingPhones.has(c.phone) || uniquePhonesInBatch.has(c.phone)) {
        failedCount++;
        errors.push({ row: index + 1, reason: `Duplicate phone number: ${c.phone}` });
        return false;
      }
      uniquePhonesInBatch.add(c.phone);
      return true;
    });

    const clientsNeedingId = validNewClients.filter(c => !c.memberId).length;
    let nextMemberId = 112;

    if (clientsNeedingId > 0) {
      const counterRef = doc(db, 'counters', 'clients');
      try {
        nextMemberId = await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          let currentId = 112;
          if (counterDoc.exists()) {
            currentId = (counterDoc.data().lastId || 111) + 1;
          }
          transaction.set(counterRef, { lastId: currentId + clientsNeedingId }, { merge: true });
          return currentId;
        });
      } catch (error) {
        console.error('Error generating bulk member IDs:', error);
        nextMemberId = Math.floor(Math.random() * 10000);
      }
    }

    let batch = writeBatch(db);
    let operationCount = 0;

    for (let i = 0; i < validNewClients.length; i++) {
      try {
        const client = validNewClients[i];

        if (!client) continue;
        const { id, comments, ...clientData } = client;

        if (!clientData.memberId) {
          clientData.memberId = (nextMemberId++).toString();
        }
        if (clientData.paid === undefined) clientData.paid = false;

        const docRef = id ? doc(db, 'clients', id) : doc(collection(db, 'clients'));
        const finalClient = {
          ...cleanData(clientData),
          id: docRef.id,
          createdAt: new Date().toISOString(),
          portalUserId: ''
        };

        // Auto-create portal account in bulk
        if (finalClient.memberId) {
          const uid = await createPortalAccount(finalClient.memberId, finalClient.name, finalClient.phone);
          if (uid) finalClient.portalUserId = uid;
        }

        batch.set(docRef, finalClient);
        operationCount++;

        if (operationCount === 500) {
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

    await addAuditLog('CREATE', 'CLIENT', 'bulk', `Bulk imported ${successCount} clients/leads`, currentUser?.name);
    return { success: successCount, failed: failedCount, errors };
  };

  const updateClient = async (id: string, updates: Partial<Client>) => {
    try {
      const updateData = { ...updates };
      if (!updateData.memberId) {
        const existing = baseClients.find(c => c.id === id);
        if (existing && !existing.memberId) {
          updateData.memberId = await generateMemberId();
        }
      }

      // Auto-create portal account if they don't have one yet
      const existing = baseClients.find(c => c.id === id);
      const hasNoPortal = !existing?.portalUserId && !updateData.portalUserId;
      const memberId = updateData.memberId || existing?.memberId;

      if (hasNoPortal && memberId) {
        const uid = await createPortalAccount(
          memberId,
          updateData.name || existing?.name || '',
          updateData.phone || existing?.phone || ''
        );
        if (uid) updateData.portalUserId = uid;
      }

      if (existing) {
        if (updateData.sessionsRemaining !== undefined && updateData.packages === undefined) {
          const packagesCopy = [...(existing.packages || [])];
          const activePkgIdx = packagesCopy.findIndex(p => p.status === 'Active');
          if (activePkgIdx !== -1) {
            packagesCopy[activePkgIdx] = {
              ...packagesCopy[activePkgIdx],
              sessionsRemaining: updateData.sessionsRemaining as any
            } as any;
            updateData.packages = packagesCopy;
          }
        } else if (updateData.packages !== undefined && updateData.sessionsRemaining === undefined) {
          const activePkg = updateData.packages.find((p: any) => p.status === 'Active');
          if (activePkg) {
            updateData.sessionsRemaining = activePkg.sessionsRemaining !== undefined ? activePkg.sessionsRemaining : 0;
            updateData.packageType = activePkg.packageName || '';
            if (activePkg.startDate) updateData.startDate = activePkg.startDate;
            if (activePkg.endDate) updateData.membershipExpiry = activePkg.endDate;
          } else {
            updateData.sessionsRemaining = 0;
          }
        }
      }

      // Link siblings and update their sales rep if phone number or salesRep is changed
      const phoneToUse = updateData.phone || existing?.phone || '';
      const phoneNorm = phoneToUse ? phoneToUse.replace(/\D/g, '').slice(-10) : '';
      
      const siblings = (phoneNorm && phoneNorm.length >= 10)
        ? baseClients.filter(c => c.id !== id && c.phone && c.phone.replace(/\D/g, '').slice(-10) === phoneNorm)
        : [];

      if (siblings.length > 0) {
        updateData.linkedAccount = true;
        const siblingIds = siblings.map(s => s.id);
        updateData.linkedClientIds = Array.from(new Set([...(updateData.linkedClientIds || existing?.linkedClientIds || []), ...siblingIds]));
      }

      // Inherit sales rep if missing
      let canonicalRep = updateData.salesRep || existing?.salesRep;
      if (!canonicalRep || canonicalRep.trim() === '' || canonicalRep.toLowerCase() === 'unassigned') {
        const siblingWithRep = siblings.find(s => s.salesRep && s.salesRep.trim() !== '' && s.salesRep.toLowerCase() !== 'unassigned');
        if (siblingWithRep) {
          canonicalRep = siblingWithRep.salesRep;
          updateData.salesRep = canonicalRep;
        }
      }

      const batch = writeBatch(db);
      batch.update(doc(db, 'clients', id), cleanData(updateData));

      // Link back and sync sales rep to siblings
      for (const sibling of siblings) {
        const sibRef = doc(db, 'clients', sibling.id);
        const sibLinks = Array.from(new Set([...(sibling.linkedClientIds || []), id]));
        const sibUpdates: any = { linkedClientIds: sibLinks, linkedAccount: true };
        
        if (canonicalRep && canonicalRep.toLowerCase() !== 'unassigned' && (!sibling.salesRep || sibling.salesRep.toLowerCase() === 'unassigned')) {
          sibUpdates.salesRep = canonicalRep;
        }
        batch.update(sibRef, sibUpdates);
      }

      await batch.commit();

      const clientName = baseClients.find(c => c.id === id)?.name || id;
      addAuditLog('UPDATE', 'CLIENT', id, `Updated client/lead: ${clientName}`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${id}`);
    }
  };

  const deleteClient = async (id: string) => {
    try {
      const clientName = clients.find(c => c.id === id)?.name || id;
      await deleteDoc(doc(db, 'clients', id));
      await addAuditLog('DELETE', 'CLIENT', id, `Deleted client/lead: ${clientName}`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `clients/${id}`);
    }
  };

  const deleteMultipleClients = async (ids: string[]) => {
    try {
      let batch = writeBatch(db);
      let count = 0;
      for (const id of ids) {
        batch.delete(doc(db, 'clients', id));
        count++;
        if (count === 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
      await addAuditLog('DELETE', 'CLIENT', 'bulk', `Deleted ${ids.length} clients/leads`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'clients/bulk');
    }
  };

  const addComment = async (clientId: string, text: string, author?: string) => {
    try {
      const commentAuthor = author || currentUser?.name || 'Admin';
      await addDoc(collection(db, 'clients', clientId, 'comments'), {
        text,
        date: new Date().toISOString(),
        author: commentAuthor,
      });
      await updateDoc(doc(db, 'clients', clientId), {
        lastContactDate: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `clients/${clientId}/comments`);
    }
  };

  const addInteraction = async (
    clientId: string,
    interaction: Omit<InteractionLog, 'id' | 'author'>
  ) => {
    if (!currentUser) {
      console.warn('addInteraction called without currentUser');
      return;
    }
    try {
      await addDoc(collection(db, 'clients', clientId, 'interactions'), {
        ...interaction,
        author: currentUser.name,
        date: interaction.date || new Date().toISOString(),
      });
      await updateDoc(doc(db, 'clients', clientId), {
        lastContactDate: interaction.date || new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `clients/${clientId}/interactions`);
    }
  };

  return {
    clients,
    loading,
    addClient,
    bulkAddClients,
    updateClient,
    deleteClient,
    deleteMultipleClients,
    addComment,
    addInteraction,
    fetchClientDetails,
  };
};
