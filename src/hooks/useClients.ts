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
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  startAt,
  endAt,
  limit,
} from 'firebase/firestore';
import { db, auth, createFirebaseUser, getMemberEmail, getTenantId } from '../firebase';
import { Client, CRMComment, InteractionLog, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { cleanData } from '../utils';
import { normalizeEgyptPhone, getEgyptPhoneVariants } from '../utils/phoneUtils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';
import {
  getLocalDb,
  saveMembers,
  searchMembersLocal,
  getMemberById,
} from '../services/localDb';
import { enqueueOperation } from '../services/outbox';

function isNetworkOrOfflineError(error: any): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!error) return false;
  const msg = String(error?.message || error?.code || '').toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('offline') ||
    msg.includes('unavailable') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch') ||
    msg.includes('deadline-exceeded') ||
    msg.includes('client is offline') ||
    msg.includes('transport errored') ||
    msg.includes('aborted')
  );
}
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

    return combined
      .filter(c => !c.isDeleted)
      .map(c => ({
        ...c,
        name: c.name != null ? String(c.name) : '',
        phone: c.phone != null ? String(c.phone) : '',
        memberId: c.memberId != null && c.memberId !== '' ? String(c.memberId) : undefined,
        leadId: c.leadId != null && c.leadId !== '' ? String(c.leadId) : undefined,
        comments: Array.isArray((c as any).comments) ? (c as any).comments : [],
        interactions: Array.isArray((c as any).interactions) ? (c as any).interactions : [],
      })) as Client[];
  }, [membersList, expiredMembersList, leadsList, searchResults]);

  const baseClients = clients;



  // 0. Load cached members immediately from IndexedDB so search & list works instantly (< 10ms)
  useEffect(() => {
    let isMounted = true;
    const tenantId = getTenantId();
    if (!tenantId || effectiveRole === 'client') return;

    getLocalDb(tenantId)
      .then((ldb) => ldb.getAll('members'))
      .then((cachedMembers) => {
        if (!isMounted) return;
        if (cachedMembers && cachedMembers.length > 0) {
          setMembersList((prev) => (prev.length === 0 ? (cachedMembers as any) : prev));
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('[useClients] Error loading members from local IndexedDB:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [effectiveRole]);

  // 1. Active Members Snapshot Listener (Active, Hold, Nearly Expired)
  useEffect(() => {
    if (!currentUser) return;
    if (effectiveRole === 'client') {
      setLoading(false);
      return;
    }


    const q = query(
      collection(db, 'clients'), 
      where('status', 'in', ['Active', 'Hold', 'Nearly Expired', 'nearly expired', 'hold', 'active', 'HOLD', 'ACTIVE', 'Frozen', 'frozen'])
    );
    const unsubClients = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map(
          (d) => ({ ...d.data(), id: d.id } as Omit<Client, 'comments' | 'interactions'>)
        );
        setMembersList(fetched);
        setLoading(false);

        // Sync fetched snapshot members into gymLocalDb in background so local DB stays fresh
        const tenantId = getTenantId();
        if (tenantId && fetched.length > 0) {
          saveMembers(tenantId, fetched).catch((err) => {
            console.warn('[useClients] Background saveMembers failed:', err);
          });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'clients-members');
        setLoading(false);
      }
    );

    return () => unsubClients();
  }, [currentUser?.id, currentUser?.role, effectiveRole]);

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
      const fetchedExpired = snap.docs.map(
        (d) => ({ ...d.data(), id: d.id } as Omit<Client, 'comments' | 'interactions'>)
      );
      setExpiredMembersList(fetchedExpired);
      setExpiredLoaded(true);

      const tenantId = getTenantId();
      if (tenantId && fetchedExpired.length > 0) {
        saveMembers(tenantId, fetchedExpired).catch((err) => {
          console.warn('[useClients] Background saveMembers (expired) failed:', err);
        });
      }
    } catch (error) {
      console.error('Error fetching expired members:', error);
    } finally {
      setLoadingExpired(false);
    }
  }, [expiredLoaded, loadingExpired]);

  // Defer background fetch of expired members slightly after initial render so initial page load is instant
  useEffect(() => {
    if (!currentUser?.id || effectiveRole === 'client') return undefined;
    if (!loading && !expiredLoaded && !loadingExpired) {
      const timer = setTimeout(() => {
        fetchExpiredMembers();
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [currentUser?.id, effectiveRole, loading, expiredLoaded, loadingExpired, fetchExpiredMembers]);

  // Trigger expired fetch immediately if a search query is entered (so search results find expired members)
  useEffect(() => {
    if (searchTerm && searchTerm.trim().length >= 1 && !expiredLoaded && !loadingExpired) {
      fetchExpiredMembers();
    }
  }, [searchTerm, expiredLoaded, loadingExpired, fetchExpiredMembers]);

  // 2. Active Leads Snapshot Listener (New, Trial, Follow Up) - status == 'Lead' & stage in ['New', 'Trial', 'Follow Up']
  useEffect(() => {
    if (!currentUser?.id) return;
    if (effectiveRole === 'client' || effectiveRole === 'coach') return;


    const q = query(
      collection(db, 'clients'),
      where('status', '==', 'Lead')
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
  }, [currentUser?.id, currentUser?.role, effectiveRole]);

  // 3. On-demand search query for historical/lost leads & ID lookups
  useEffect(() => {
    if (!currentUser || !searchTerm || searchTerm.trim().length < 1) {
      setSearchResults([]);
      return;
    }
    if (effectiveRole === 'client' || effectiveRole === 'coach') return;

    const term = searchTerm.trim();
    const cleanIdTerm = term.replace(/^#/, '').trim();
    const isSinglePrefixLetter = /^[qcpo]$/i.test(cleanIdTerm);
    if (term.length < 2 && !/^\d+$/.test(cleanIdTerm) && !isSinglePrefixLetter) {
      setSearchResults([]);
      return;
    }
    let active = true;

    const delayDebounce = setTimeout(async () => {
      try {
        let resultsMap = new Map();

        // 1. Immediately search local IndexedDB first for instant results (< 5ms)
        const tenantId = getTenantId();
        if (tenantId) {
          try {
            const localMatches = await searchMembersLocal(tenantId, term);
            if (active && localMatches.length > 0) {
              localMatches.forEach((m) => resultsMap.set(m.id, m));
              setSearchResults(
                Array.from(resultsMap.entries()).map(([id, data]) => ({
                  ...data,
                  id,
                } as Omit<Client, 'comments' | 'interactions'>))
              );
            }
          } catch (locSearchErr) {
            console.warn('[useClients] Local search failed:', locSearchErr);
          }
        }

        // If offline, stop here! We already have local results.
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return;
        }

        // Query by phone exact match & phone variants (handles numbers with or without leading zero)
        const phoneVariants = getEgyptPhoneVariants(term);
        const normSearchPhone = normalizeEgyptPhone(term);

        if (phoneVariants.length > 0 && term.length >= 4) {
          try {
            const qPhone = query(
              collection(db, 'clients'),
              where('phone', 'in', phoneVariants.slice(0, 10))
            );
            const phoneSnap = await getDocs(qPhone);
            if (active) phoneSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));
          } catch {}
        }

        if (normSearchPhone && term.length >= 4) {
          try {
            const qNormPhone = query(
              collection(db, 'clients'),
              where('normalized_phone', '==', normSearchPhone)
            );
            const normSnap = await getDocs(qNormPhone);
            if (active) normSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));
          } catch {}
        }

        // Query by memberId, leadId, or secondaryBarcodes (supports exact + case-insensitive Q/C/P/O prefix variants + numeric IDs)
        const compactIdTerm = cleanIdTerm.replace(/\s|-/g, '');
        const idStringVariants = Array.from(
          new Set([
            cleanIdTerm,
            cleanIdTerm.toUpperCase(),
            cleanIdTerm.toLowerCase(),
            compactIdTerm,
            compactIdTerm.toUpperCase(),
            compactIdTerm.toLowerCase(),
          ].filter(Boolean))
        ).slice(0, 10);

        if (idStringVariants.length > 0) {
          try {
            const qMemberId = query(collection(db, 'clients'), where('memberId', 'in', idStringVariants));
            const memberIdSnap = await getDocs(qMemberId);
            if (active) memberIdSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));
          } catch {}
          try {
            const qBarcode = query(collection(db, 'clients'), where('barcode', 'in', idStringVariants));
            const barcodeSnap = await getDocs(qBarcode);
            if (active) barcodeSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));
          } catch {}
        }

        if (/^\d+$/.test(cleanIdTerm)) {
          try {
            const qMemberIdNum = query(collection(db, 'clients'), where('memberId', '==', Number(cleanIdTerm)));
            const memberIdNumSnap = await getDocs(qMemberIdNum);
            if (active) memberIdNumSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));
          } catch {}
        }

        if (idStringVariants.length > 0) {
          try {
            const qSecondary = query(
              collection(db, 'clients'),
              where('secondaryBarcodes', 'array-contains-any', idStringVariants)
            );
            const secondarySnap = await getDocs(qSecondary);
            if (active) secondarySnap.docs.forEach(d => resultsMap.set(d.id, d.data()));
          } catch {}
        }

        try {
          if (idStringVariants.length > 0) {
            const qLeadId = query(collection(db, 'clients'), where('leadId', 'in', idStringVariants));
            const leadIdSnap = await getDocs(qLeadId);
            if (active) leadIdSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));
          }
          if (/^\d+$/.test(cleanIdTerm)) {
            const qLeadIdNum = query(collection(db, 'clients'), where('leadId', '==', Number(cleanIdTerm)));
            const leadIdNumSnap = await getDocs(qLeadIdNum);
            if (active) leadIdNumSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));
          }
        } catch {}

        // Support prefix searches for Q, C, P, O member code groups (including expired members not yet in memory)
        if (/^[qcpo](?:\d*)?$/i.test(compactIdTerm)) {
          const upperPrefix = compactIdTerm.toUpperCase();
          const lowerPrefix = compactIdTerm.toLowerCase();
          if (isSinglePrefixLetter) {
            try {
              const qCodePrefix = query(
                collection(db, 'clients'),
                where('memberCodePrefix', '==', upperPrefix),
                limit(500)
              );
              const codePrefixSnap = await getDocs(qCodePrefix);
              if (active) codePrefixSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));
            } catch {}
          }
          for (const prefixVariant of Array.from(new Set([upperPrefix, lowerPrefix]))) {
            try {
              const qPrefix = query(
                collection(db, 'clients'),
                orderBy('memberId'),
                startAt(prefixVariant),
                endAt(prefixVariant + '\uf8ff'),
                limit(250)
              );
              const prefixSnap = await getDocs(qPrefix);
              if (active) prefixSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));
            } catch {}
          }
        }

        // If any matched record was merged into another unified client record, also ensure the target unified client is loaded
        const mergedTargetIds = new Set<string>();
        resultsMap.forEach((val: any) => {
          if (val?.mergedInto && typeof val.mergedInto === 'string' && !resultsMap.has(val.mergedInto)) {
            mergedTargetIds.add(val.mergedInto);
          }
        });
        for (const targetId of mergedTargetIds) {
          try {
            const targetSnap = await getDoc(doc(db, 'clients', targetId));
            if (active && targetSnap.exists()) {
              resultsMap.set(targetSnap.id, targetSnap.data());
            }
          } catch {}
        }

        // Query by name prefix match (capitalized prefix logic)
        if (term.length >= 2 && !/^\d+$/.test(cleanIdTerm)) {
          const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1);
          const qName = query(
            collection(db, 'clients'),
            orderBy('name'),
            startAt(capitalizedTerm),
            endAt(capitalizedTerm + '\uf8ff'),
            limit(30)
          );
          const nameSnap = await getDocs(qName);
          if (active) nameSnap.docs.forEach(d => resultsMap.set(d.id, d.data()));
        }

        if (active) {
          setSearchResults(
            Array.from(resultsMap.entries()).map(([id, data]) => ({
              ...data,
              id
            } as Omit<Client, 'comments' | 'interactions'>))
          );
        }
      } catch (error) {
        console.error('Error running on-demand search:', error);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(delayDebounce);
    };
  }, [currentUser?.id, currentUser?.role, effectiveRole, searchTerm]);

  const fetchClientDetails = async (clientId: string) => {
    try {
      const commentsSnap = await getDocs(collection(db, 'clients', clientId, 'comments'));
      const interactionsSnap = await getDocs(collection(db, 'clients', clientId, 'interactions'));
      
      const comments = commentsSnap.docs.map(d => ({ ...d.data(), id: d.id } as CRMComment));
      const interactions = interactionsSnap.docs.map(d => ({ ...d.data(), id: d.id } as InteractionLog));

      const existing = baseClients.find(c => c.id === clientId);
      if (existing?.lastCall?.text && interactions.length === 0) {
        interactions.push({
          id: `redgits-lastcall-${clientId}`,
          date: existing.lastCall.date || existing.lastContactDate || existing.createdAt || new Date().toISOString(),
          type: (existing.lastCall.type as any) || 'Call',
          outcome: (existing.lastCall.outcome as any) || 'Other',
          notes: existing.lastCall.text,
          author: existing.lastCall.author || existing.salesName || 'RedGITS Sync',
        });
      }
      if (existing?.lastComment?.text && comments.length === 0) {
        comments.push({
          id: `redgits-lastcomment-${clientId}`,
          date: existing.lastComment.date || existing.lastContactDate || existing.createdAt || new Date().toISOString(),
          text: existing.lastComment.text,
          author: existing.lastComment.author || existing.salesName || 'Staff',
        });
      }
      
      return { comments, interactions };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `clients/${clientId}/details`);
      return { comments: [], interactions: [] };
    }
  };

  const generateMemberId = async (): Promise<string> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return `TEMP-${Date.now().toString(36).toUpperCase()}`;
    }
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
      if (isNetworkOrOfflineError(error)) {
        return `TEMP-${Date.now().toString(36).toUpperCase()}`;
      }
      return Math.floor(Math.random() * 10000).toString();
    }
  };

  const generateLeadId = async (): Promise<string> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return `TEMP-LEAD-${Date.now().toString(36).toUpperCase()}`;
    }
    const counterRef = doc(db, 'counters', 'leads');
    try {
      const newId = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let nextId = 1001;
        if (counterDoc.exists()) {
          nextId = (counterDoc.data().lastId || 1000) + 1;
        }
        transaction.set(counterRef, { lastId: nextId }, { merge: true });
        return nextId;
      });
      return newId.toString();
    } catch (error) {
      console.error('Error generating lead ID:', error);
      if (isNetworkOrOfflineError(error)) {
        return `TEMP-LEAD-${Date.now().toString(36).toUpperCase()}`;
      }
      return Math.floor(10000 + Math.random() * 90000).toString();
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

  const handleOfflineClientCreate = async (
    clientData: any,
    tenantId: string
  ): Promise<string> => {
    const tempClientId = `TEMP-${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    if (clientData.status === 'Lead') {
      clientData.leadId = clientData.leadId || `TEMP-LEAD-${Date.now().toString(36).toUpperCase()}`;
      delete clientData.memberId;
    } else {
      clientData.memberId = clientData.memberId || `TEMP-${Date.now().toString(36).toUpperCase()}`;
    }

    const finalData = {
      ...cleanData(clientData),
      id: tempClientId,
      createdAt: nowIso,
      updatedAt: nowIso,
      isOfflineCreated: true,
    };

    // 1. Save member to local IndexedDB
    try {
      await saveMembers(tenantId, [finalData]);
    } catch (dbErr) {
      console.warn('[useClients] Failed to save member to local IndexedDB:', dbErr);
    }

    // 2. Optimistically update in-memory state
    if (finalData.status === 'Lead') {
      setLeadsList((prev) => [finalData as any, ...prev]);
    } else {
      setMembersList((prev) => [finalData as any, ...prev]);
    }

    // 3. Enqueue client.create to outbox
    try {
      await enqueueOperation(tenantId, 'client.create', tempClientId, finalData);
    } catch (outboxErr) {
      console.warn('[useClients] Failed to enqueue client.create to outbox:', outboxErr);
    }

    // Audit log (fire and forget)
    addAuditLog(
      'CREATE',
      finalData.status === 'Lead' ? 'LEAD' : 'CLIENT',
      tempClientId,
      `[Offline] Added new ${finalData.status === 'Lead' ? 'lead' : 'client'}: ${finalData.name}`,
      currentUser?.name
    ).catch(() => {});

    return tempClientId;
  };

  const addClient = async (client: Omit<Client, 'id' | 'createdAt'>): Promise<string> => {
    const tenantId = getTenantId();
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
      
      // Normalize Egyptian phone number
      const normPhone = clientData.phone ? normalizeEgyptPhone(clientData.phone) : '';
      if (normPhone) {
        (clientData as any).normalized_phone = normPhone;
      }

      // Find siblings sharing the same normalized phone
      const siblings = normPhone
        ? baseClients.filter(c => {
            if (!c.phone) return false;
            return (c as any).normalized_phone === normPhone || normalizeEgyptPhone(c.phone) === normPhone;
          })
        : [];

      // Auto-set linkedAccount if siblings exist
      if (siblings.length > 0) {
        clientData.linkedAccount = true;
      } else {
        const isExactDuplicate = !clientData.linkedAccount && baseClients.some(c => 
          c.name?.trim().toLowerCase() === clientData.name?.trim().toLowerCase() && 
          normPhone && 
          ((c as any).normalized_phone === normPhone || normalizeEgyptPhone(c.phone) === normPhone)
        );
        if (isExactDuplicate) {
          throw new Error(`A client with the name ${clientData.name} and phone number ${clientData.phone} already exists.`);
        }
      }

      if (clientData.paid === undefined) clientData.paid = false;

      // Offline check: if offline or network unavailable, handle offline creation immediately
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return await handleOfflineClientCreate(clientData, tenantId);
      }

      try {
        if (clientData.status === 'Lead') {
          // Leads never reserve a memberId; they get a separate sequential leadId
          delete (clientData as any).memberId;
          if (!clientData.leadId) {
            clientData.leadId = await generateLeadId();
          }
        } else if (!clientData.memberId) {
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

        const nowIso = new Date().toISOString();
        if (clientData.assignedTo && clientData.assignedTo !== 'unassigned') {
          clientData.assignedAt = clientData.assignedAt || nowIso;
          clientData.transferredAt = clientData.transferredAt || nowIso;
          clientData.assignedBy = clientData.assignedBy || currentUser?.name || currentUser?.id || 'System';
        }

        const finalData = {
          ...cleanData(clientData),
          id: docRef.id,
          createdAt: nowIso,
          linkedClientIds,
        };

        const batch = writeBatch(db);
        batch.set(docRef, finalData, { merge: true });

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

        // Sync to local IndexedDB to keep it fresh
        saveMembers(tenantId, [finalData]).catch(() => {});

        // Auto-create portal account after Firestore write to prevent orphaned accounts
        if (finalData.memberId) {
          const uid = await createPortalAccount(finalData.memberId, finalData.name, finalData.phone);
          if (uid) {
             await updateDoc(docRef, { portalUserId: uid });
          }
        }

        await addAuditLog(
          'CREATE',
          client.status === 'Lead' ? 'LEAD' : 'CLIENT',
          docRef.id,
          `Added new ${client.status === 'Lead' ? 'lead' : 'client'}: ${client.name}`,
          currentUser?.name
        );
        return docRef.id;
      } catch (firestoreError) {
        if (isNetworkOrOfflineError(firestoreError)) {
          console.warn('[useClients] Network error during client commit, saving locally and queuing outbox:', firestoreError);
          return await handleOfflineClientCreate(clientData, tenantId);
        }
        throw firestoreError;
      }
    } catch (error) {
      if (isNetworkOrOfflineError(error)) {
        console.warn('[useClients] Network error adding client, falling back to local DB and outbox:', error);
        return await handleOfflineClientCreate(client, tenantId);
      }
      handleFirestoreError(error, OperationType.CREATE, 'clients', true);
      throw error;
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

    const membersNeedingId = validNewClients.filter(c => c.status !== 'Lead' && !c.memberId).length;
    const leadsNeedingId = validNewClients.filter(c => c.status === 'Lead' && !c.leadId).length;
    let nextMemberId = 112;
    let nextLeadId = 1001;

    if (membersNeedingId > 0) {
      const counterRef = doc(db, 'counters', 'clients');
      try {
        nextMemberId = await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          let currentId = 112;
          if (counterDoc.exists()) {
            currentId = (counterDoc.data().lastId || 111) + 1;
          }
          transaction.set(counterRef, { lastId: currentId + membersNeedingId - 1 }, { merge: true });
          return currentId;
        });
      } catch (error) {
        console.error('Error generating bulk member IDs:', error);
        nextMemberId = Math.floor(Math.random() * 10000);
      }
    }

    if (leadsNeedingId > 0) {
      const leadCounterRef = doc(db, 'counters', 'leads');
      try {
        nextLeadId = await runTransaction(db, async (transaction) => {
          const counterDoc = await transaction.get(leadCounterRef);
          let currentId = 1001;
          if (counterDoc.exists()) {
            currentId = (counterDoc.data().lastId || 1000) + 1;
          }
          transaction.set(leadCounterRef, { lastId: currentId + leadsNeedingId - 1 }, { merge: true });
          return currentId;
        });
      } catch (error) {
        console.error('Error generating bulk lead IDs:', error);
        nextLeadId = Math.floor(10000 + Math.random() * 90000);
      }
    }

      let batch = writeBatch(db);
      let operationCount = 0;

      for (let i = 0; i < validNewClients.length; i++) {
        try {
          const client = validNewClients[i];

          if (!client) continue;
          const { id, comments, ...clientData } = client;

          if (clientData.status === 'Lead') {
            delete (clientData as any).memberId;
            if (!clientData.leadId) {
              clientData.leadId = (nextLeadId++).toString();
            }
          } else if (!clientData.memberId) {
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

          batch.set(docRef, finalClient, { merge: true });
          operationCount++;

          if (operationCount === 500) {
            await batch.commit();
            batch = writeBatch(db);
            operationCount = 0;
          }

          successCount++;

          // Auto-create portal account after Firestore write
          if (finalClient.memberId) {
            const uid = await createPortalAccount(finalClient.memberId, finalClient.name, finalClient.phone);
            if (uid) {
              await updateDoc(docRef, { portalUserId: uid });
            }
          }
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

      // Keep references to previous state for rollback
      const prevMembers = [...membersList];
      const prevExpired = [...expiredMembersList];
      const prevLeads = [...leadsList];
      const prevSearch = [...searchResults];

      const applyOptimisticUpdate = () => {
        let updated: Omit<Client, 'comments' | 'interactions'>;
        const merged = baseClients.find(c => c.id === id);
        if (merged) {
          updated = { ...merged, ...updateData };
        } else {
          updated = { id, ...updateData } as Omit<Client, 'comments' | 'interactions'>;
        }

        const norm = (updated.status || '').toString().trim().toLowerCase();
        const isActiveBucket = ['active', 'hold', 'nearly expired'].includes(norm);
        const isExpiredBucket = norm === 'expired';
        const isLeadBucket = norm === 'lead';

        setMembersList(prev => prev.map(c => c.id === id ? { ...c, ...updateData } : c));
        setExpiredMembersList(prev => prev.map(c => c.id === id ? { ...c, ...updateData } : c));
        setLeadsList(prev => prev.map(c => c.id === id ? { ...c, ...updateData } : c));
        setSearchResults(prev => prev.map(c => c.id === id ? { ...c, ...updateData } : c));

        // Move the client between buckets immediately when status transitions.
        if (isActiveBucket) {
          setExpiredMembersList(prev => prev.filter(c => c.id !== id));
          setLeadsList(prev => prev.filter(c => c.id !== id));
          setMembersList(prev => prev.some(c => c.id === id) ? prev : [...prev, updated]);
        } else if (isExpiredBucket) {
          setMembersList(prev => prev.filter(c => c.id !== id));
          setLeadsList(prev => prev.filter(c => c.id !== id));
          setExpiredMembersList(prev => prev.some(c => c.id === id) ? prev : [...prev, updated]);
        } else if (isLeadBucket) {
          setMembersList(prev => prev.filter(c => c.id !== id));
          setExpiredMembersList(prev => prev.filter(c => c.id !== id));
          setLeadsList(prev => prev.some(c => c.id === id) ? prev : [...prev, updated]);
        }
      };

      const rollbackOptimisticUpdate = () => {
        setMembersList(prevMembers);
        setExpiredMembersList(prevExpired);
        setLeadsList(prevLeads);
        setSearchResults(prevSearch);
      };

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

      const nextEffectiveStatus = updateData.status || existing?.status || 'Active';
      if (nextEffectiveStatus === 'Lead') {
        // Still a Lead — never assign a memberId; ensure leadId is present
        if (!existing?.leadId && !updateData.leadId) {
          updateData.leadId = existing?.redgitsId || (await generateLeadId());
        }
      } else if (!updateData.memberId) {
        const existingMemberId = String(existing?.memberId || '').trim();
        const existingLeadId = String(existing?.leadId || existing?.redgitsId || '').trim();
        const isConvertingFromLead = existing?.status === 'Lead';
        const hasDistinctMemberId = Boolean(existingMemberId) && (!existingLeadId || existingMemberId !== existingLeadId);
        if (isConvertingFromLead || !hasDistinctMemberId) {
          updateData.memberId = await generateMemberId();
          if (existingLeadId && !existing?.leadId && !updateData.leadId) {
            updateData.leadId = existingLeadId;
          }
        }
      }

      // Check if we need to auto-create portal account later
      const hasNoPortal = !existing?.portalUserId && !updateData.portalUserId;
      const memberId = updateData.memberId || existing?.memberId;

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
      const normPhone = phoneToUse ? normalizeEgyptPhone(phoneToUse) : '';
      if (normPhone) {
        (updateData as any).normalized_phone = normPhone;
      }
      
      const siblings = normPhone
        ? baseClients.filter(c => c.id !== id && c.phone && ((c as any).normalized_phone === normPhone || normalizeEgyptPhone(c.phone) === normPhone))
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

      // Track lead assignment / transfer timestamp & audit history when assignedTo changes
      if (updateData.assignedTo !== undefined) {
        const nextRep = String(updateData.assignedTo || '').trim();
        const prevRep = String(existing?.assignedTo || '').trim();
        if (nextRep && nextRep !== 'unassigned' && nextRep !== prevRep) {
          const transferTs = updateData.transferredAt || updateData.assignedAt || new Date().toISOString();
          updateData.assignedAt = transferTs;
          updateData.transferredAt = transferTs;
          updateData.assignedBy = updateData.assignedBy || currentUser?.name || currentUser?.id || 'System';
          if (prevRep || existing?.salesName) {
            updateData.previousAssignedTo = prevRep || existing?.salesName;
          }
          updateData.transferCount = (Number(existing?.transferCount) || 0) + 1;
          const prevHistory = Array.isArray(existing?.assignmentHistory) ? existing.assignmentHistory : [];
          updateData.assignmentHistory = [
            ...prevHistory,
            {
              fromRep: prevRep || undefined,
              fromRepName: existing?.salesName || existing?.salesRep || undefined,
              toRep: nextRep,
              toRepName: updateData.salesName || updateData.salesRep || nextRep,
              assignedBy: currentUser?.id,
              assignedByName: currentUser?.name || currentUser?.email || 'System',
              timestamp: transferTs,
            },
          ];
        }
      }

      applyOptimisticUpdate();

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

      // Auto-create portal account after Firestore write
      if (hasNoPortal && memberId) {
        const uid = await createPortalAccount(
          memberId,
          updateData.name || existing?.name || '',
          updateData.phone || existing?.phone || ''
        );
        if (uid) {
           await updateDoc(doc(db, 'clients', id), { portalUserId: uid });
        }
      }

      const clientName = baseClients.find(c => c.id === id)?.name || id;
      addAuditLog('UPDATE', 'CLIENT', id, `Updated client/lead: ${clientName}`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `clients/${id}`, true);
    }
  };

  const deleteClient = async (id: string) => {
    try {
      const client = baseClients.find(c => c.id === id);
      const clientName = client?.name || id;
      
      const batch = writeBatch(db);
      batch.delete(doc(db, 'clients', id));
      
      // Clean up dangling linkedClientIds from siblings
      if (client?.linkedClientIds && client.linkedClientIds.length > 0) {
        for (const siblingId of client.linkedClientIds) {
          if (siblingId === id) continue;
          const sibling = baseClients.find(c => c.id === siblingId);
          if (sibling) {
            const sibLinks = (sibling.linkedClientIds || []).filter(lid => lid !== id);
            batch.update(doc(db, 'clients', siblingId), { 
              linkedClientIds: sibLinks,
              linkedAccount: sibLinks.length > 0
            });
          }
        }
      }

      await batch.commit();

      await addAuditLog('DELETE', 'CLIENT', id, `Deleted client/lead: ${clientName}`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `clients/${id}`, true);
    }
  };

  const deleteMultipleClients = async (ids: string[]) => {
    try {
      let batch = writeBatch(db);
      let count = 0;
      for (const id of ids) {
        batch.delete(doc(db, 'clients', id));
        count++;

        const client = baseClients.find(c => c.id === id);
        if (client?.linkedClientIds && client.linkedClientIds.length > 0) {
          for (const siblingId of client.linkedClientIds) {
            if (ids.includes(siblingId) || siblingId === id) continue; // Will be deleted anyway
            const sibling = baseClients.find(c => c.id === siblingId);
            if (sibling) {
              const sibLinks = (sibling.linkedClientIds || []).filter(lid => !ids.includes(lid) && lid !== id);
              batch.update(doc(db, 'clients', siblingId), { 
                linkedClientIds: sibLinks,
                linkedAccount: sibLinks.length > 0
              });
              count++;
            }
          }
        }

        if (count >= 490) { // Keep safe buffer from 500 limit
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
      await addAuditLog('DELETE', 'CLIENT', 'bulk', `Deleted ${ids.length} clients/leads`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'clients/bulk', true);
    }
  };

  const addComment = async (clientId: string, text: string, author?: string) => {
    try {
      const commentAuthor = author || currentUser?.name || 'Admin';
      const nowIso = new Date().toISOString();
      const commentData = {
        text,
        date: nowIso,
        author: commentAuthor,
      };

      const docUpdates = {
        lastContactDate: nowIso,
        lastComment: commentData,
      };
      setLeadsList(prev => prev.map(c => c.id === clientId ? { ...c, ...docUpdates } : c));
      setMembersList(prev => prev.map(c => c.id === clientId ? { ...c, ...docUpdates } : c));
      setExpiredMembersList(prev => prev.map(c => c.id === clientId ? { ...c, ...docUpdates } : c));
      setSearchResults(prev => prev.map(c => c.id === clientId ? { ...c, ...docUpdates } : c));

      await addDoc(collection(db, 'clients', clientId, 'comments'), commentData);
      await updateDoc(doc(db, 'clients', clientId), docUpdates);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `clients/${clientId}/comments`, true);
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
      const nowIso = interaction.date || new Date().toISOString();
      const summaryText = interaction.notes?.trim()
        ? interaction.notes.trim()
        : interaction.outcome || 'Call logged';
      const lastCallObj = {
        text: summaryText,
        date: nowIso,
        author: currentUser.name,
        outcome: interaction.outcome,
        type: interaction.type,
      };
      const docUpdates: Record<string, any> = {
        lastContactDate: nowIso,
        lastCall: lastCallObj,
        lastCallText: summaryText,
        lastCallDate: nowIso,
        lastCallBy: currentUser.name,
      };
      if (interaction.nextFollowUp) {
        docUpdates.nextReminderDate = interaction.nextFollowUp;
      }

      setLeadsList(prev => prev.map(c => c.id === clientId ? { ...c, ...docUpdates } : c));
      setMembersList(prev => prev.map(c => c.id === clientId ? { ...c, ...docUpdates } : c));
      setExpiredMembersList(prev => prev.map(c => c.id === clientId ? { ...c, ...docUpdates } : c));
      setSearchResults(prev => prev.map(c => c.id === clientId ? { ...c, ...docUpdates } : c));

      await addDoc(collection(db, 'clients', clientId, 'interactions'), {
        ...interaction,
        author: currentUser.name,
        date: nowIso,
      });
      await updateDoc(doc(db, 'clients', clientId), docUpdates);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `clients/${clientId}/interactions`, true);
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
