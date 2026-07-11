import { useState, useEffect, useMemo, useCallback } from 'react';
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
  query,
  where,
  orderBy,
  startAt,
  endAt,
  limit,
} from 'firebase/firestore';
import { db, createFirebaseUser, getMemberEmail } from '../firebase';
import { Client, CRMComment, InteractionLog, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';
const FEMALE_NAMES = new Set([
  'heba', 'karma', 'maria', 'martina', 'yassmin', 'yasmin', 'yasmeen', 'menna', 'riham', 'farah',
  'loujy', 'habiba', 'maha', 'aiat', 'raghda', 'hend', 'maisoon', 'maison', 'farida', 'nadine',
  'nancy', 'nouran', 'sherry', 'sherihan', 'shereen', 'sherine', 'salma', 'sarah', 'sara', 'mariam',
  'maryam', 'malak', 'laila', 'layla', 'hana', 'jannah', 'jana', 'hania', 'kenzy', 'talia', 'tulin',
  'judy', 'jory', 'lamar', 'logain', 'logayn', 'maya', 'yara', 'zeina', 'zaynab', 'zainab', 'fatma',
  'fatima', 'aisha', 'khadija', 'ruqaya', 'rokaya', 'alyaa', 'alia', 'asmaa', 'asma', 'doaa',
  'shaimaa', 'shymaa', 'mai', 'may', 'mona', 'noha', 'rania', 'rehab', 'dina', 'nermin', 'nermeen',
  'radwa', 'ghada', 'mayar', 'marwa', 'amira', 'nada', 'basma', 'maiar', 'jomana', 'gona', 'gana',
  'rawda', 'shahd', 'ganna', 'hoda', 'ola', 'omnia', 'esraa', 'israa', 'lobna', 'lubna', 'basant',
  'passant', 'nesma', 'nehal', 'nihal', 'engy', 'ingy', 'aya', 'ayat', 'donia', 'dunya', 'rawan',
  'rodaina', 'rudaina', 'ranim', 'reem', 'rim', 'safa', 'maram', 'hebatullah', 'hebat-allah',
  'fatma-alzahraa', 'shahdan', 'nourhan', 'nourine', 'norine', 'nermin', 'noury', 'marihan'
]);

const MALE_NAMES = new Set([
  'mohamed', 'mohammed', 'mouhamed', 'muhammad', 'muhamed', 'mahmoud', 'ahmed', 'ahmad', 'yassin',
  'yousef', 'youssef', 'yusef', 'yahia', 'yahya', 'omar', 'rayan', 'amr', 'khaled', 'selim', 'aser',
  'ali', 'aly', 'mostafa', 'mustafa', 'moustafa', 'hassan', 'hasan', 'tarek', 'tareq', 'sherif',
  'hany', 'hani', 'wael', 'karim', 'karem', 'hazem', 'hamza', 'adam', 'malik', 'ibrahim', 'ismail',
  'ismael', 'yehia', 'hussein', 'houssein', 'hosny', 'hosney', 'ezz', 'zeyad', 'ziad', 'mazen',
  'marwan', 'eyad', 'iyad', 'moaz', 'mosa', 'musa', 'haroun', 'haron', 'kareem', 'tamer', 'shady',
  'shadi', 'rami', 'ramy', 'fady', 'fadi', 'nader', 'sameh', 'samer', 'medhat', 'magdy', 'michael',
  'mina', 'bishoy', 'peshoy', 'george', 'peter', 'kirollos', 'kyrillos', 'mark', 'john', 'andrew',
  'yasser', 'adel', 'ashraf', 'emad', 'ehab', 'ihab', 'hisham', 'hesham', 'gamal', 'nasser',
  'mamdouh', 'sayed', 'said', 'saied', 'seif', 'saif', 'alaa', 'salah', 'samer', 'samy', 'samir',
  'wagih', 'wagdy', 'reda', 'maged', 'majdi', 'atef', 'ayman', 'amjad', 'akram',
  'anwar', 'ashour', 'bahaa', 'diaa', 'taha', 'maher', 'khadry', 'khedry', 'abdelrahman', 'abdurrahman',
  'abdulrahman', 'abdullah', 'abdelrahman', 'selim', 'soliman', 'suleiman', 'mohib', 'moris',
  'slem', 'aser', 'adnan', 'anas', 'arabi', 'badr', 'emile', 'fadel', 'fahd', 'farid', 'fouad',
  'gad', 'ghaleb', 'hady', 'hadid', 'haitham', 'hatem', 'helmy', 'kamal', 'kamel', 'lotfy', 'mamdouh',
  'monir', 'mounir', 'mourad', 'murad', 'nabil', 'nagib', 'naguib', 'nashat', 'raafat', 'rafeeq',
  'rafik', 'ragab', 'ramadan', 'rashad', 'rashaad', 'riad', 'riadh', 'saad', 'sabry', 'safwat',
  'sameer', 'samih', 'shabaan', 'shawky', 'sobhy', 'sobhey', 'soliman', 'talat', 'talaat', 'tawfik',
  'tawfeeq', 'zakaria', 'zaki'
]);

function mapOldToNewPackage(oldName: string, client: any): string {
  if (!oldName) return oldName;
  const name = oldName.trim().toUpperCase();

  // Exact match or simple case normalize
  if (name === "10 S GT (ADULT)" || name === "10 S GT (ADULTS)") return "10 S GT (Adult)";
  if (name === "20 S GT (ADULT)" || name === "20 S GT (ADULTS)") return "20 S GT (Adult)";
  if (name === "30 S GT (ADULT)" || name === "30 S GT (ADULTS)") return "30 S GT (Adult)";
  if (name === "5 S GT(ADULT)" || name === "5 S GT (ADULT)") return "5 S GT (Adult)";
  
  if (name === "6MONTHS UNLIMITED" || name === "6 MONTHS UNLIMITED") return "6 Month";
  
  // Kids/Juniors combined packages
  if (name.includes("KIDS/JUNIORS")) {
    const type = (client.typeOfClient || client.memberCategory || "").toUpperCase();
    const isJunior = type.includes("JUNIOR");
    if (name.includes("10 S")) return isJunior ? "10 S GT (Juniors)" : "10 S GT (Kids)";
    if (name.includes("20 S")) return isJunior ? "20 S GT (Juniors)" : "20 S GT (Kids)";
    if (name.includes("30 S")) return isJunior ? "30 S GT (Juniors)" : "30 S GT (Kids)";
  }

  // Raw session counts (Historically PT)
  if (name.includes("SESSIONS") || name.includes("SESSION PRIVATE")) {
    const numMatch = name.match(/\d+/);
    if (numMatch) {
      const num = parseInt(numMatch[0]);
      if (num <= 7) return "5 S PT";
      if (num <= 15) return "10 S PT";
      if (num <= 25) return "20 S PT";
      return "30 S PT";
    }
  }

  // Deposits or Complete Payments
  if (name.includes("DEPOSIT") || name.includes("DEPOSITE") || name.includes("COMPLETE PAYMENT")) {
    if (name.includes("10 S GT") || name.includes("10S GT")) return "10 S GT (Adult)";
    if (name.includes("10 S PT") || name.includes("10S PT")) return "10 S PT";
    if (name.includes("20 S PT") || name.includes("20S PT")) return "20 S PT";
  }

  // Fallbacks
  return oldName;
}

function predictGender(clientName: string): 'Male' | 'Female' | null {
  if (!clientName) return null;
  const firstName = (clientName.trim().split(/\s+/)[0] || '').toLowerCase();
  
  if (FEMALE_NAMES.has(firstName)) {
    return 'Female';
  }
  if (MALE_NAMES.has(firstName)) {
    return 'Male';
  }
  return null;
}

export const useClients = (currentUser: User | null, searchTerm: string = '') => {
  const { effectiveRole } = useAuth();
  const [membersList, setMembersList] = useState<Omit<Client, 'comments' | 'interactions'>[]>([]);
  const [expiredMembersList, setExpiredMembersList] = useState<Omit<Client, 'comments' | 'interactions'>[]>([]);
  const [leadsList, setLeadsList] = useState<Omit<Client, 'comments' | 'interactions'>[]>([]);
  const [searchResults, setSearchResults] = useState<Omit<Client, 'comments' | 'interactions'>[]>([]);
  const [loading, setLoading] = useState(true);

  const clients = useMemo(() => {
    const activeIds = new Set(membersList.map(c => c.id));
    const cleanExpired = expiredMembersList.filter(c => !activeIds.has(c.id));
    
    const combined = [...membersList, ...cleanExpired, ...leadsList];
    const existingIds = new Set(combined.map(c => c.id));
    
    searchResults.forEach(res => {
      if (!existingIds.has(res.id)) {
        combined.push(res);
      }
    });

    return combined.map(c => ({
      ...c,
      comments: [],
      interactions: [],
    })) as Client[];
  }, [membersList, expiredMembersList, leadsList, searchResults]);

  // 1. Active Members Snapshot Listener (Active, Hold, Nearly Expired)
  useEffect(() => {
    if (!currentUser) return;
    if (effectiveRole === 'client' || effectiveRole === 'coach') {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'clients'), 
      where('status', 'in', ['Active', 'Hold', 'Nearly Expired', 'nearly expired', 'hold', 'active'])
    );
    const unsubClients = onSnapshot(
      q,
      (snapshot) => {
        setMembersList(
          snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Omit<Client, 'comments' | 'interactions'>))
        );
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'clients-members');
        setLoading(false);
      }
    );

    return () => unsubClients();
  }, [currentUser, effectiveRole]);

  const [loadingExpired, setLoadingExpired] = useState(false);
  const [expiredLoaded, setExpiredLoaded] = useState(false);

  const fetchExpiredMembers = useCallback(async () => {
    if (expiredLoaded || loadingExpired) return;
    setLoadingExpired(true);
    try {
      const q = query(
        collection(db, 'clients'),
        where('status', 'in', ['Expired', 'expired'])
      );
      const snap = await getDocs(q);
      setExpiredMembersList(
        snap.docs.map(d => ({ ...d.data(), id: d.id } as Omit<Client, 'comments' | 'interactions'>))
      );
      setExpiredLoaded(true);
    } catch (error) {
      console.error('Error fetching expired members:', error);
    } finally {
      setLoadingExpired(false);
    }
  }, [expiredLoaded, loadingExpired]);

  // Trigger expired fetch if a search query is entered (so search results find expired members)
  useEffect(() => {
    if (searchTerm && searchTerm.trim().length >= 2 && !expiredLoaded && !loadingExpired) {
      fetchExpiredMembers();
    }
  }, [searchTerm, expiredLoaded, loadingExpired, fetchExpiredMembers]);

  // 2. Active Leads Snapshot Listener (New, Trial, Follow Up) - status == 'Lead' & stage in ['New', 'Trial', 'Follow Up']
  useEffect(() => {
    if (!currentUser) return;
    if (effectiveRole === 'client' || effectiveRole === 'coach') return;

    const q = query(
      collection(db, 'clients'),
      where('status', '==', 'Lead'),
      where('stage', 'in', ['New', 'Trial', 'Follow Up'])
    );
    const unsubLeads = onSnapshot(
      q,
      (snapshot) => {
        setLeadsList(
          snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Omit<Client, 'comments' | 'interactions'>))
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'clients-leads');
      }
    );

    return () => unsubLeads();
  }, [currentUser, effectiveRole]);

  // 3. On-demand search query for historical/lost leads
  useEffect(() => {
    if (!currentUser || !searchTerm || searchTerm.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    if (effectiveRole === 'client' || effectiveRole === 'coach') return;

    const term = searchTerm.trim();
    const delayDebounce = setTimeout(async () => {
      try {
        let resultsMap = new Map();

        // Query by phone exact match
        const qPhone = query(collection(db, 'clients'), where('phone', '==', term));
        const phoneSnap = await getDocs(qPhone);
        phoneSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));

        // Query by memberId exact match
        const qMemberId = query(collection(db, 'clients'), where('memberId', '==', term));
        const memberIdSnap = await getDocs(qMemberId);
        memberIdSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));

        // Query by name prefix match (capitalized prefix logic)
        const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1);
        const qName = query(
          collection(db, 'clients'),
          orderBy('name'),
          startAt(capitalizedTerm),
          endAt(capitalizedTerm + '\uf8ff'),
          limit(30)
        );
        const nameSnap = await getDocs(qName);
        nameSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));

        setSearchResults(
          Array.from(resultsMap.entries()).map(([id, data]) => ({
            ...data,
            id
          } as Omit<Client, 'comments' | 'interactions'>))
        );
      } catch (error) {
        console.error('Error running on-demand search:', error);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [currentUser, effectiveRole, searchTerm]);

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
      const { comments, ...clientData } = client;

      // Normalize package name and packageType
      if (clientData.packageType) {
        clientData.packageType = mapOldToNewPackage(clientData.packageType, clientData);
      }
      if (clientData.packages && Array.isArray(clientData.packages)) {
        clientData.packages = clientData.packages.map(p => {
          if (p.packageName) {
            p.packageName = mapOldToNewPackage(p.packageName, clientData);
          }
          return p;
        });
      }

      // Auto predict gender if not specified
      const currentGender = clientData.gender ? clientData.gender.trim() : '';
      if (!currentGender || currentGender.toLowerCase() === 'none') {
        const predicted = predictGender(clientData.name);
        if (predicted) {
          clientData.gender = predicted;
        }
      }
      
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
      const existing = baseClients.find(c => c.id === id);

      // Normalize package name and packageType
      if (updateData.packageType) {
        updateData.packageType = mapOldToNewPackage(updateData.packageType, updateData);
      }
      if (updateData.packages && Array.isArray(updateData.packages)) {
        updateData.packages = updateData.packages.map(p => {
          if (p.packageName) {
            p.packageName = mapOldToNewPackage(p.packageName, updateData);
          }
          return p;
        });
      }

      // Auto predict gender if not specified
      const currentGender = updateData.gender || existing?.gender;
      const cleanGender = currentGender ? currentGender.trim() : '';
      if (!cleanGender || cleanGender.toLowerCase() === 'none') {
        const predicted = predictGender(updateData.name || existing?.name || '');
        if (predicted) {
          updateData.gender = predicted;
        }
      }

      if (!updateData.memberId) {
        if (existing && !existing.memberId) {
          updateData.memberId = await generateMemberId();
        }
      }

      // Auto-create portal account if they don't have one yet
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
    loadingExpired,
    expiredLoaded,
    fetchExpiredMembers,
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
