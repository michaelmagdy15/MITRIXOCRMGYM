import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from '../firebase';
import { useAppContext } from '../context';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Client } from '../types';
import {
  InzanHardwareLocker,
  InzanLockerGroup,
  InzanLockerController,
  InzanLockerReader,
  InzanLockerOverviewResponse,
  fetchInzanLockerOverview,
  sendInzanLockerCommand,
  assignInzanLockerToMember,
  assignInzanLockerCardless,
  scanInzanRfid,
  unassignInzanLocker,
  reissueInzanLockerPin,
  extendInzanLockerUserExpiry,
  fetchInzanLockerUserLogs,
  bulkUnlockInzanLockers,
  runInzanGroupBulkOperation,
  saveInzanLockerGroup,
  deleteInzanLockerGroup,
  sendInzanControllerRelayCommand,
  updateInzanController,
  syncInzanControllerGroup,
  renameInzanControllerChannels,
  saveInzanReader,
  deleteInzanReader,
  saveInzanLockerSettings,
  convertRfidUid,
  isHardwareLockerOnline,
  formatLockerTimeRemaining,
} from '../utils/inzanLockerClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import {
  Lock,
  Unlock,
  Key,
  RefreshCw,
  Search,
  Wifi,
  WifiOff,
  Cpu,
  Radio,
  Layers,
  Activity,
  Settings,
  UserCheck,
  UserPlus,
  QrCode,
  Wrench,
  Clock,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  X,
  Zap,
  Printer,
} from 'lucide-react';

type SubTab = 'lockers' | 'quick-register' | 'controllers' | 'readers' | 'groups' | 'settings';
type GenderRoomTab = 'split' | 'male' | 'female';

function isLockerFemale(locker: InzanHardwareLocker): boolean {
  const name = String(locker.name || locker.locker_id || '').trim();
  if (/^F\d/i.test(name)) return true;
  if (String(locker.gender || '').toLowerCase() === 'women') return true;
  if (String(locker.group?.slug || '').toLowerCase() === 'women') return true;
  if (String(locker.group?.name || '').toLowerCase() === 'women') return true;
  return false;
}

function isLockerMale(locker: InzanHardwareLocker): boolean {
  if (isLockerFemale(locker)) return false;
  const name = String(locker.name || locker.locker_id || '').trim();
  if (/^M\d/i.test(name)) return true;
  if (String(locker.gender || '').toLowerCase() === 'men') return true;
  if (String(locker.group?.slug || '').toLowerCase() === 'men') return true;
  if (String(locker.group?.name || '').toLowerCase() === 'men') return true;
  return true;
}

function naturalCompareLocker(a: InzanHardwareLocker, b: InzanHardwareLocker): number {
  const nameA = String(a.name || a.locker_id || '').trim();
  const nameB = String(b.name || b.locker_id || '').trim();
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}

export default function InzanLockerConsole() {
  // All useState hooks declared at top before any useEffect (AGENTS.md rule)
  const [subTab, setSubTab] = useState<SubTab>('lockers');
  const [genderRoomTab, setGenderRoomTab] = useState<GenderRoomTab>('split');
  const [overview, setOverview] = useState<InzanLockerOverviewResponse | null>(null);
  const [firestoreLockers, setFirestoreLockers] = useState<InzanHardwareLocker[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const { clients } = useAppContext();

  // Lockers tab filters & drawer
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'maintenance'>('all');
  const [onlineFilter, setOnlineFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [selectedLockerId, setSelectedLockerId] = useState<number | null>(null);
  const [drawerPin, setDrawerPin] = useState<string | null>(null);
  const [drawerMemberSearch, setDrawerMemberSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [assignExpiryHours, setAssignExpiryHours] = useState<number>(3);
  const [userLogs, setUserLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  // Quick Register tab state
  const [qrGroupId, setQrGroupId] = useState<number>(40);
  const [qrClientId, setQrClientId] = useState<string>('');
  const [qrClientSearch, setQrClientSearch] = useState<string>('');
  const [rfidInput, setRfidInput] = useState<string>('');
  const [lastAllocation, setLastAllocation] = useState<{
    mode: 'rfid' | 'pin';
    lockerName: string;
    groupName: string;
    memberName: string;
    pin?: string | null;
    rfidTag?: string | null;
    expiresAt?: string | null;
    decision?: string;
  } | null>(null);
  const [showRoomQrModal, setShowRoomQrModal] = useState<boolean>(false);
  const rfidInputRef = useRef<HTMLInputElement | null>(null);

  // Controllers tab state
  const [editingController, setEditingController] = useState<InzanLockerController | null>(null);
  const [ctrlName, setCtrlName] = useState('');
  const [ctrlHostname, setCtrlHostname] = useState('');
  const [ctrlGroupId, setCtrlGroupId] = useState<string>('auto');
  const [renamingController, setRenamingController] = useState<InzanLockerController | null>(null);
  const [renamePrefix, setRenamePrefix] = useState('M');
  const [renameStartNum, setRenameStartNum] = useState(1);
  const [renameStartChan, setRenameStartChan] = useState(1);

  // Readers tab state
  const [editingReader, setEditingReader] = useState<Partial<InzanLockerReader> | null>(null);
  const [readerForm, setReaderForm] = useState({
    id: 0,
    reader_id: '',
    name: '',
    source: 'usb',
    controller_id: '' as string | number,
    group_id: '' as string | number,
    is_active: true,
    auto_assign: true,
    allow_global: true,
  });

  // Groups tab state
  const [editingGroup, setEditingGroup] = useState<InzanLockerGroup | null>(null);
  const [groupForm, setGroupForm] = useState({
    id: 0,
    name: '',
    description: '',
    color: '#3B82F6',
    locker_ids: [] as number[],
  });

  // Settings tab state
  const [mqttBrokerUrl, setMqttBrokerUrl] = useState('');
  const [mqttUsername, setMqttUsername] = useState('');
  const [mqttPassword, setMqttPassword] = useState('');
  const [expiryHoursSetting, setExpiryHoursSetting] = useState(3);
  const [timezoneSetting, setTimezoneSetting] = useState('Africa/Cairo');
  const [serverBaseUrl, setServerBaseUrl] = useState('https://inzan.tailaf3d90.ts.net');
  const [serverAdminUser, setServerAdminUser] = useState('admin');
  const [serverAdminPass, setServerAdminPass] = useState('');
  const [tick, setTick] = useState(0);

  // 1. Real-time Firestore listener on `lockers` collection so UI renders immediately
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'lockers'),
      (snap) => {
        const list: InzanHardwareLocker[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          const name = String(data.number || data.name || data.locker_id || d.id).trim();
          if (/reader/i.test(name)) return;
          const hwId = Number(data.hardwareId || d.id);
          if (isNaN(hwId)) return;
          const isAssigned = data.status === 'Assigned' || data.hardwareStatus === 'occupied' || data.hardwareStatus === 'in-use';
          const isMaint = data.status === 'Maintenance' || data.hardwareStatus === 'maintenance';
          list.push({
            id: hwId,
            locker_id: String(data.locker_id || d.id),
            name,
            location: String(data.location || ''),
            status: isMaint ? 'maintenance' : isAssigned ? 'occupied' : 'available',
            ip_address: data.ipAddress || null,
            topic: null,
            num_locks: 1,
            controller_type: null,
            last_heartbeat: data.lastHeartbeat || null,
            uptime: null,
            is_online: data.isOnline ? 1 : 0,
            user_id: data.hardwareUserId ?? (isAssigned ? 1 : null),
            last_used: data.updatedAt || null,
            controller_id: data.controllerId ?? null,
            channel: data.channel ?? null,
            protocol: data.protocol || 'aywana',
            unique_id: null,
            state_topic: null,
            command_topic: null,
            relay_state: data.relayState || 'OFF',
            gender: data.gender || (/^F\d/i.test(name) ? 'women' : 'men'),
            gender_locked: 1,
            crmClientId: data.assignedTo || null,
            crmClientName: data.assignedToName || null,
            crmPin: data.code || null,
            occupant: data.expiresAt
              ? {
                  id: Number(data.hardwareUserId || 0),
                  username: data.assignedToName || '',
                  email: null,
                  role: 'guest',
                  first_name: data.assignedToName || '',
                  last_name: '',
                  phone: null,
                  is_active: 1,
                  gym_id: data.assignedTo || null,
                  rfid_tag: null,
                  locker_id: hwId,
                  valid_until: data.expiresAt || null,
                }
              : null,
            group: data.groupName
              ? {
                  id: Number(data.groupId || (/^F\d/i.test(name) ? 41 : 40)),
                  name: String(data.groupName),
                  description: '',
                  color: String(data.groupColor || (/^F\d/i.test(name) ? '#EC4899' : '#3B82F6')),
                  locker_ids: [],
                }
              : /^F\d/i.test(name)
              ? { id: 41, name: 'Women', description: "Women's Locker Room", color: '#EC4899', locker_ids: [] }
              : { id: 40, name: 'Men', description: "Men's Locker Room", color: '#3B82F6', locker_ids: [] },
          });
        });
        setFirestoreLockers(list.sort(naturalCompareLocker));
        setLoading(false);
      },
      (err) => {
        console.warn('[InzanLockerConsole] Firestore lockers listener error:', err);
      }
    );
    return () => unsub();
  }, []);

  // 2. Live Hardware Server Overview Polling
  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await fetchInzanLockerOverview();
      // Filter out any reader entries and sort naturally
      data.lockers = (data.lockers || [])
        .filter((l) => !/reader/i.test(String(l.name || l.locker_id || '')))
        .sort(naturalCompareLocker);
      setOverview(data);
      if (data.groups.length > 0 && !data.groups.some((g) => g.id === qrGroupId)) {
        setQrGroupId(data.groups[0]!.id);
      }
      setExpiryHoursSetting(Number(data.lockerExpiryHours || 3));
      if (data.serverUrl) setServerBaseUrl(data.serverUrl);
      if (data.status?.config?.brokerUrl) setMqttBrokerUrl(String(data.status.config.brokerUrl));
      if (data.settings?.timezone) setTimezoneSetting(String(data.settings.timezone));
    } catch (err: any) {
      if (!silent) {
        console.warn('[InzanLockerConsole] Live overview fallback to Firestore:', err?.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [qrGroupId]);

  useEffect(() => {
    loadOverview(false);
    const interval = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        loadOverview(true);
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [loadOverview]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setTick((t) => t + 1);
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  // Map CRM clients by id, memberId, and normalized name for instant lookup
  const clientByIdMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach((c) => {
      map.set(c.id, c);
      if (c.memberId) map.set(String(c.memberId), c);
    });
    return map;
  }, [clients]);

  // Merge live hardware lockers with Firestore CRM member assignments
  const activeLockers = useMemo(() => {
    const fsById = new Map<number, InzanHardwareLocker>();
    firestoreLockers.forEach((fl) => fsById.set(fl.id, fl));

    const baseList = overview?.lockers && overview.lockers.length > 0 ? overview.lockers : firestoreLockers;
    return baseList
      .filter((l) => !/reader/i.test(String(l.name || l.locker_id || '')))
      .map((l) => {
        const fsDoc = fsById.get(l.id);
        return {
          ...l,
          crmClientId: l.crmClientId || fsDoc?.crmClientId || null,
          crmClientName: l.crmClientName || fsDoc?.crmClientName || null,
          crmPin: l.crmPin || fsDoc?.crmPin || null,
        };
      })
      .sort(naturalCompareLocker);
  }, [overview?.lockers, firestoreLockers]);

  const selectedLocker = useMemo(() => {
    if (!selectedLockerId) return null;
    return activeLockers.find((l) => l.id === selectedLockerId) || null;
  }, [selectedLockerId, activeLockers]);

  useEffect(() => {
    if (!selectedLocker?.occupant?.id) {
      setUserLogs([]);
      return;
    }
    setLoadingLogs(true);
    fetchInzanLockerUserLogs(selectedLocker.occupant.id)
      .then((res) => setUserLogs(res.logs || []))
      .catch(() => setUserLogs([]))
      .finally(() => setLoadingLogs(false));
  }, [selectedLocker?.occupant?.id]);

  const stats = useMemo(() => {
    const total = activeLockers.length;
    const maleLockers = activeLockers.filter(isLockerMale);
    const femaleLockers = activeLockers.filter(isLockerFemale);
    const online = activeLockers.filter((l) => isHardwareLockerOnline(l)).length;
    const occupied = activeLockers.filter(
      (l) => l.status === 'occupied' || l.status === 'in-use' || Boolean(l.user_id) || Boolean(l.crmClientName)
    ).length;
    const maintenance = activeLockers.filter((l) => l.status === 'maintenance').length;
    const available = Math.max(0, total - occupied - maintenance);
    return {
      total,
      maleTotal: maleLockers.length,
      femaleTotal: femaleLockers.length,
      online,
      occupied,
      available,
      maintenance,
    };
  }, [activeLockers]);

  const filteredLockers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeLockers.filter((l) => {
      const online = isHardwareLockerOnline(l);
      const isOccupied =
        l.status === 'occupied' || l.status === 'in-use' || Boolean(l.user_id) || Boolean(l.crmClientName);
      const isMaint = l.status === 'maintenance';
      if (genderRoomTab === 'male' && !isLockerMale(l)) return false;
      if (genderRoomTab === 'female' && !isLockerFemale(l)) return false;
      if (statusFilter === 'available' && (isOccupied || isMaint)) return false;
      if (statusFilter === 'occupied' && !isOccupied) return false;
      if (statusFilter === 'maintenance' && !isMaint) return false;
      if (onlineFilter === 'online' && !online) return false;
      if (onlineFilter === 'offline' && online) return false;
      if (q) {
        const occName = l.occupant
          ? `${l.occupant.first_name || ''} ${l.occupant.last_name || ''} ${l.occupant.username || ''}`.toLowerCase()
          : '';
        const crmName = (l.crmClientName || '').toLowerCase();
        const rfid = (l.occupant?.rfid_tag || '').toLowerCase();
        const match =
          l.name.toLowerCase().includes(q) ||
          (l.locker_id || '').toLowerCase().includes(q) ||
          (l.location || '').toLowerCase().includes(q) ||
          occName.includes(q) ||
          crmName.includes(q) ||
          rfid.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [activeLockers, genderRoomTab, searchQuery, statusFilter, onlineFilter]);

  const maleFilteredLockers = useMemo(() => filteredLockers.filter(isLockerMale), [filteredLockers]);
  const femaleFilteredLockers = useMemo(() => filteredLockers.filter(isLockerFemale), [filteredLockers]);

  const filteredDrawerClients = useMemo(() => {
    const q = drawerMemberSearch.trim().toLowerCase();
    if (!q) return clients.slice(0, 30);
    return clients
      .filter(
        (c) =>
          String(c.name || '').toLowerCase().includes(q) ||
          String(c.memberId || '').toLowerCase().includes(q) ||
          String(c.phone || '').includes(q)
      )
      .slice(0, 30);
  }, [clients, drawerMemberSearch]);

  const filteredQrClients = useMemo(() => {
    const q = qrClientSearch.trim().toLowerCase();
    if (!q) return clients.slice(0, 25);
    return clients
      .filter(
        (c) =>
          String(c.name || '').toLowerCase().includes(q) ||
          String(c.memberId || '').toLowerCase().includes(q) ||
          String(c.phone || '').includes(q)
      )
      .slice(0, 25);
  }, [clients, qrClientSearch]);

  // --- Handlers ---
  const handleLockerCommand = async (locker: InzanHardwareLocker, command: 'openlock' | 'maintenance' | 'normal') => {
    setActionBusy(`cmd-${locker.id}-${command}`);
    try {
      await sendInzanLockerCommand(locker.id, command);
      toast.success(
        command === 'openlock'
          ? `🔓 Locker ${locker.name} relay pulsed OPEN!`
          : command === 'maintenance'
          ? `Locker ${locker.name} placed in maintenance`
          : `Locker ${locker.name} returned to normal service`
      );
      await loadOverview(true);
    } catch (err: any) {
      // Fallback: update Firestore status if maintenance/normal
      if (command === 'maintenance' || command === 'normal') {
        try {
          await updateDoc(doc(db, 'lockers', String(locker.id)), {
            status: command === 'maintenance' ? 'Maintenance' : 'Available',
            hardwareStatus: command === 'maintenance' ? 'maintenance' : 'available',
            updatedAt: new Date().toISOString(),
          });
          toast.success(`Updated Locker ${locker.name} status`);
          return;
        } catch {
          // ignore
        }
      }
      toast.error(err?.message || `Failed to send ${command} to ${locker.name}`);
    } finally {
      setActionBusy(null);
    }
  };

  const handleAssignToMember = async () => {
    if (!selectedLocker) return;
    const chosenClient = clients.find((c) => c.id === selectedClientId);
    const memberDisplayName = chosenClient?.name || drawerMemberSearch.trim();
    if (!memberDisplayName) {
      toast.error('Please select a CRM member from the list or type a member name');
      return;
    }
    setActionBusy(`assign-${selectedLocker.id}`);
    try {
      const nameParts = memberDisplayName.split(' ');
      const res = await assignInzanLockerToMember(selectedLocker.id, {
        clientId: chosenClient?.id,
        clientName: memberDisplayName,
        firstName: nameParts[0] || 'Member',
        lastName: nameParts.slice(1).join(' ') || '',
        email: chosenClient?.email,
        phone: chosenClient?.phone,
        expiryHours: assignExpiryHours,
      });
      if (res.pin) setDrawerPin(res.pin);
      toast.success(
        `Assigned Locker ${selectedLocker.name} to ${memberDisplayName}${res.pin ? ` (PIN: ${res.pin})` : ''}`
      );
      await loadOverview(true);
    } catch (err: any) {
      // Also persist assignment in Firestore `lockers` collection so CRM always reflects who holds the locker
      try {
        const generatedPin = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + assignExpiryHours * 3600 * 1000).toISOString();
        await updateDoc(doc(db, 'lockers', String(selectedLocker.id)), {
          status: 'Assigned',
          hardwareStatus: 'occupied',
          assignedTo: chosenClient?.id || memberDisplayName,
          assignedToName: memberDisplayName,
          code: generatedPin,
          expiresAt,
          updatedAt: new Date().toISOString(),
        });
        setDrawerPin(generatedPin);
        toast.success(`Assigned Locker ${selectedLocker.name} to ${memberDisplayName} (PIN: ${generatedPin})`);
      } catch {
        toast.error(err?.message || 'Failed to assign locker');
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleReissuePin = async (locker: InzanHardwareLocker) => {
    setActionBusy(`pin-${locker.id}`);
    try {
      const res = await reissueInzanLockerPin(locker.id);
      setDrawerPin(res.pin);
      toast.success(`New 6-digit PIN generated for ${locker.name}: ${res.pin}`);
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to re-issue PIN');
    } finally {
      setActionBusy(null);
    }
  };

  const handleExtendExpiry = async (locker: InzanHardwareLocker, hours = 3) => {
    if (!locker.occupant?.id) return;
    setActionBusy(`ext-${locker.id}`);
    try {
      const baseMs = locker.occupant.valid_until
        ? Math.max(Date.now(), new Date(locker.occupant.valid_until).getTime())
        : Date.now();
      const newExpiryDate = new Date(baseMs + hours * 3600 * 1000).toISOString();
      await extendInzanLockerUserExpiry(locker.occupant.id, newExpiryDate, locker.id);
      toast.success(`Extended ${locker.name} session by +${hours}h`);
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to extend session');
    } finally {
      setActionBusy(null);
    }
  };

  const handleUnassign = async (locker: InzanHardwareLocker) => {
    setActionBusy(`unassign-${locker.id}`);
    try {
      await unassignInzanLocker(locker.id);
      setDrawerPin(null);
      toast.success(`Locker ${locker.name} released and returned to available pool`);
      await loadOverview(true);
    } catch {
      try {
        await updateDoc(doc(db, 'lockers', String(locker.id)), {
          status: 'Available',
          hardwareStatus: 'available',
          assignedTo: '',
          assignedToName: '',
          code: '',
          expiresAt: null,
          updatedAt: new Date().toISOString(),
        });
        setDrawerPin(null);
        toast.success(`Locker ${locker.name} released`);
      } catch (err: any) {
        toast.error(err?.message || 'Failed to release locker');
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleBulkUnlockAll = async () => {
    if (!window.confirm('Unlock all online lockers right now?')) return;
    setActionBusy('bulk-unlock-all');
    try {
      const res = await bulkUnlockInzanLockers(true);
      toast.success(`Bulk unlock triggered (${res.results?.length || 0} lockers pulsed)`);
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || 'Bulk unlock failed');
    } finally {
      setActionBusy(null);
    }
  };

  const handleQuickRfidSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const converted = convertRfidUid(rfidInput);
    if (!converted) {
      toast.error('Scan or enter a valid RFID wristband UID');
      return;
    }
    const chosenClient = clients.find((c) => c.id === qrClientId);
    const groupObj = overview?.groups.find((g) => g.id === qrGroupId);
    setActionBusy('qr-rfid');
    try {
      const res = await scanInzanRfid({
        uid: converted,
        groupId: qrGroupId,
        readerId: 'kiosk-frontdesk',
        source: 'usb',
        clientId: chosenClient?.id,
        clientName: chosenClient?.name,
      });
      setLastAllocation({
        mode: 'rfid',
        lockerName: res.locker?.name || 'Assigned Locker',
        groupName: groupObj?.name || (qrGroupId === 41 ? 'Women' : 'Men'),
        memberName: chosenClient?.name || res.user?.first_name || `RFID ${converted}`,
        pin: res.pin || null,
        rfidTag: converted,
        expiresAt: res.valid_until || null,
        decision: res.decision,
      });
      setRfidInput('');
      toast.success(`RFID ${converted}: ${res.decision || 'Processed'} → ${res.locker?.name || 'Locker'}`);
      await loadOverview(true);
      rfidInputRef.current?.focus();
    } catch (err: any) {
      toast.error(err?.message || 'RFID scan allocation failed');
    } finally {
      setActionBusy(null);
    }
  };

  const handleQuickCardlessAssign = async () => {
    const chosenClient = clients.find((c) => c.id === qrClientId);
    const groupObj = overview?.groups.find((g) => g.id === qrGroupId);
    setActionBusy('qr-cardless');
    try {
      const res = await assignInzanLockerCardless({
        groupId: qrGroupId,
        clientId: chosenClient?.id,
        clientName: chosenClient?.name,
        phone: chosenClient?.phone,
        email: chosenClient?.email,
      });
      setLastAllocation({
        mode: 'pin',
        lockerName: res.locker?.name || 'Assigned Locker',
        groupName: groupObj?.name || (qrGroupId === 41 ? 'Women' : 'Men'),
        memberName: chosenClient?.name || `${res.user?.first_name || 'Guest'} ${res.user?.last_name || ''}`.trim(),
        pin: res.pin,
        expiresAt: res.expires_at,
      });
      toast.success(`Assigned Locker ${res.locker?.name} with PIN ${res.pin}`);
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || 'Cardless PIN assignment failed');
    } finally {
      setActionBusy(null);
    }
  };

  const handleRelayAction = async (controllerId: number, channel: number, action: 'open' | 'on' | 'off') => {
    setActionBusy(`relay-${controllerId}-${channel}-${action}`);
    try {
      await sendInzanControllerRelayCommand(controllerId, channel, action);
      toast.success(`Controller #${controllerId} Ch ${channel}: ${action.toUpperCase()} sent`);
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || 'Relay command failed');
    } finally {
      setActionBusy(null);
    }
  };

  const handleSaveController = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingController) return;
    setActionBusy(`save-ctrl-${editingController.id}`);
    try {
      await updateInzanController(editingController.id, {
        name: ctrlName,
        hostname: ctrlHostname,
        group_id: ctrlGroupId === 'auto' ? 'auto' : ctrlGroupId ? Number(ctrlGroupId) : null,
      });
      toast.success(`Updated controller ${ctrlName}`);
      setEditingController(null);
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update controller');
    } finally {
      setActionBusy(null);
    }
  };

  const handleSyncControllerGroup = async (ctrl: InzanLockerController) => {
    setActionBusy(`sync-ctrl-${ctrl.id}`);
    try {
      const res = await syncInzanControllerGroup(ctrl.id);
      toast.success(
        res.detected ? `Synced ${ctrl.name} to group ${res.detected.name}` : `Re-detected group for ${ctrl.name}`
      );
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || 'Group sync failed');
    } finally {
      setActionBusy(null);
    }
  };

  const handleRenameChannels = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingController) return;
    setActionBusy(`rename-ctrl-${renamingController.id}`);
    try {
      await renameInzanControllerChannels(renamingController.id, {
        prefix: renamePrefix.trim(),
        startNumber: Number(renameStartNum),
        startChannel: Number(renameStartChan),
      });
      toast.success(`Renamed channels on ${renamingController.name}`);
      setRenamingController(null);
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || 'Channel rename failed');
    } finally {
      setActionBusy(null);
    }
  };

  const handleSaveReaderForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy('save-reader');
    try {
      await saveInzanReader({
        id: readerForm.id || undefined,
        reader_id: readerForm.reader_id.trim(),
        name: readerForm.name.trim() || null,
        source: readerForm.source,
        controller_id: readerForm.controller_id ? Number(readerForm.controller_id) : null,
        group_id: readerForm.group_id ? Number(readerForm.group_id) : null,
        is_active: readerForm.is_active,
        metadata: {
          auto_assign: readerForm.auto_assign,
          allow_global: readerForm.allow_global,
        },
      });
      toast.success(readerForm.id ? 'RFID Reader updated' : 'RFID Reader registered');
      setEditingReader(null);
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save reader');
    } finally {
      setActionBusy(null);
    }
  };

  const handleDeleteReader = async (reader: InzanLockerReader) => {
    if (!window.confirm(`Delete RFID reader "${reader.name || reader.reader_id}"?`)) return;
    setActionBusy(`del-reader-${reader.id}`);
    try {
      await deleteInzanReader(reader.id);
      toast.success('RFID reader deleted');
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete reader');
    } finally {
      setActionBusy(null);
    }
  };

  const handleGroupBulkOp = async (groupId: number, groupName: string, op: 'unlock' | 'maintenance' | 'normal') => {
    setActionBusy(`group-${groupId}-${op}`);
    try {
      await runInzanGroupBulkOperation(groupId, op);
      toast.success(`${groupName} Lockers: ${op.toUpperCase()} completed`);
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || `Group ${op} failed`);
    } finally {
      setActionBusy(null);
    }
  };

  const handleSaveGroupForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy('save-group');
    try {
      await saveInzanLockerGroup({
        id: groupForm.id || undefined,
        name: groupForm.name.trim(),
        description: groupForm.description.trim(),
        color: groupForm.color,
        locker_ids: groupForm.locker_ids,
      });
      toast.success(groupForm.id ? 'Locker group updated' : 'Locker group created');
      setEditingGroup(null);
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save group');
    } finally {
      setActionBusy(null);
    }
  };

  const handleDeleteGroup = async (group: InzanLockerGroup) => {
    if (group.is_system) {
      toast.error('System groups (Men / Women) cannot be deleted');
      return;
    }
    if (!window.confirm(`Delete group "${group.name}"?`)) return;
    setActionBusy(`del-group-${group.id}`);
    try {
      await deleteInzanLockerGroup(group.id);
      toast.success('Group deleted');
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete group');
    } finally {
      setActionBusy(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy('save-settings');
    try {
      await saveInzanLockerSettings({
        mqttConfig: mqttBrokerUrl
          ? {
              brokerUrl: mqttBrokerUrl.trim(),
              username: mqttUsername.trim() || undefined,
              password: mqttPassword || undefined,
            }
          : undefined,
        systemSettings: {
          locker_expiry_hours: Number(expiryHoursSetting) || 3,
          timezone: timezoneSetting,
        },
        serverConfig: {
          baseUrl: serverBaseUrl.trim(),
          username: serverAdminUser.trim() || 'admin',
          ...(serverAdminPass ? { password: serverAdminPass } : {}),
        },
      });
      toast.success('Smart Locker settings saved and synced');
      setServerAdminPass('');
      await loadOverview(true);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save settings');
    } finally {
      setActionBusy(null);
    }
  };

  const renderLockerCard = (locker: InzanHardwareLocker) => {
    const online = isHardwareLockerOnline(locker);
    const isFemale = isLockerFemale(locker);
    const isMaint = locker.status === 'maintenance';
    const isOccupied =
      !isMaint &&
      (locker.status === 'occupied' ||
        locker.status === 'in-use' ||
        Boolean(locker.user_id) ||
        Boolean(locker.crmClientName));
    const timeRem = formatLockerTimeRemaining(locker.occupant?.valid_until);

    const matchedCrmClient = locker.crmClientId ? clientByIdMap.get(String(locker.crmClientId)) : undefined;
    const occupantDisplayName =
      matchedCrmClient?.name ||
      locker.crmClientName ||
      (locker.occupant
        ? `${locker.occupant.first_name || ''} ${locker.occupant.last_name || ''}`.trim() || locker.occupant.username
        : null);
    const occupantMemberId = matchedCrmClient?.memberId ? `#${matchedCrmClient.memberId}` : null;
    const isOpeningThis = actionBusy === `cmd-${locker.id}-openlock`;

    return (
      <div
        key={locker.id}
        onClick={() => {
          setSelectedLockerId(locker.id);
          setDrawerPin(locker.crmPin || null);
          setSelectedClientId(matchedCrmClient?.id || '');
          setDrawerMemberSearch(occupantDisplayName || '');
        }}
        className={`cursor-pointer rounded-xl border p-3 transition-all hover:scale-[1.01] flex flex-col justify-between gap-2.5 ${
          selectedLockerId === locker.id ? 'ring-2 ring-primary ' : ''
        }${
          isMaint
            ? 'border-rose-500/40 bg-rose-950/20'
            : isOccupied
            ? 'border-amber-500/50 bg-amber-950/25'
            : isFemale
            ? 'border-pink-500/25 bg-zinc-950/70 hover:border-pink-500/50'
            : 'border-sky-500/25 bg-zinc-950/70 hover:border-sky-500/50'
        }`}
      >
        {/* Top Row: Locker Code (M1 / F1) + M/F Gender Badge + Online Dot */}
        <div>
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-base font-black text-foreground">{locker.name}</span>
              <span
                className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                  isFemale
                    ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                    : 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                }`}
              >
                {isFemale ? '♀ Female (F)' : '♂ Male (M)'}
              </span>
            </div>
            <span
              className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                online ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-zinc-600'
              }`}
              title={online ? 'Online via MQTT' : 'Offline'}
            />
          </div>

          <div className="flex items-center justify-between mt-1.5">
            <Badge
              variant="outline"
              className={`text-[9px] px-1.5 py-0 font-bold ${
                isMaint
                  ? 'border-rose-500/40 text-rose-400 bg-rose-500/10'
                  : isOccupied
                  ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                  : 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
              }`}
            >
              {isMaint ? 'Maintenance' : isOccupied ? 'Assigned' : 'Available'}
            </Badge>
            {locker.crmPin && (
              <span className="text-[10px] font-mono font-bold text-amber-400 flex items-center gap-0.5">
                <Key className="h-2.5 w-2.5" /> {locker.crmPin}
              </span>
            )}
          </div>
        </div>

        {/* Middle Row: Assigned Member Name & Countdown */}
        {isOccupied || occupantDisplayName ? (
          <div className="rounded-lg bg-zinc-900/90 border border-amber-500/30 px-2.5 py-1.5 space-y-0.5">
            <p className="text-[9px] uppercase font-bold tracking-wider text-amber-400/90">Assigned Member</p>
            <p className="text-xs font-extrabold text-foreground truncate" title={occupantDisplayName || 'Occupied'}>
              👤 {occupantDisplayName || 'Assigned Member'}{' '}
              {occupantMemberId && <span className="font-mono text-primary">{occupantMemberId}</span>}
            </p>
            {timeRem && (
              <p
                className={`text-[10px] font-mono font-semibold ${
                  timeRem.expired ? 'text-rose-400' : timeRem.approaching ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {timeRem.expired ? 'Session Expired' : `⏱ ${timeRem.text} left`}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/80 px-2.5 py-1.5">
            <p className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground">Assigned Member</p>
            <p className="text-[11px] text-zinc-500 italic">Unassigned — Free</p>
          </div>
        )}

        {/* Bottom Row: Direct Open Locker + Assign/Manage Member Buttons */}
        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-white/5">
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={isOpeningThis}
            onClick={(e) => {
              e.stopPropagation();
              handleLockerCommand(locker, 'openlock');
            }}
            className="h-7 px-2 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <Unlock className="h-3 w-3 mr-1" />
            {isOpeningThis ? 'Opening...' : 'Open'}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedLockerId(locker.id);
              setDrawerPin(locker.crmPin || null);
              setSelectedClientId(matchedCrmClient?.id || '');
              setDrawerMemberSearch(occupantDisplayName || '');
            }}
            className="h-7 px-2 text-[10px] font-bold border-zinc-700 hover:bg-zinc-800"
          >
            {isOccupied ? (
              <>
                <UserCheck className="h-3 w-3 mr-1 text-amber-400" /> Member
              </>
            ) : (
              <>
                <UserPlus className="h-3 w-3 mr-1 text-primary" /> Assign
              </>
            )}
          </Button>
        </div>
      </div>
    );
  };

  const unlockGuestUrl = `${(overview?.serverUrl || serverBaseUrl).replace(/\/+$/, '')}/unlock`;

  if (loading && activeLockers.length === 0) {
    return (
      <Card className="border bg-card/50">
        <CardContent className="py-16 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="h-7 w-7 text-primary animate-spin" />
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Connecting to Inzan Smart Locker Hardware Server...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5" data-tick={tick}>
      {/* Live Hardware Telemetry Header */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border border-sky-500/30 bg-sky-950/15">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">♂ Male Lockers (M)</span>
              <Lock className="h-4 w-4 text-sky-400" />
            </div>
            <p className="text-lg font-black mt-1 text-foreground">{stats.maleTotal}</p>
            <p className="text-[10px] text-muted-foreground">Lockers M1 – M34</p>
          </CardContent>
        </Card>

        <Card className="border border-pink-500/30 bg-pink-950/15">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-pink-400">♀ Female Lockers (F)</span>
              <Lock className="h-4 w-4 text-pink-400" />
            </div>
            <p className="text-lg font-black mt-1 text-foreground">{stats.femaleTotal}</p>
            <p className="text-[10px] text-muted-foreground">Lockers F1 – F34</p>
          </CardContent>
        </Card>

        <Card className="border bg-zinc-950/50">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Available</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-lg font-black mt-1 text-emerald-400">{stats.available}</p>
            <p className="text-[10px] text-muted-foreground">Ready for assignment</p>
          </CardContent>
        </Card>

        <Card className="border bg-zinc-950/50">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Assigned to Members
              </span>
              <UserCheck className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-lg font-black mt-1 text-amber-400">{stats.occupied}</p>
            <p className="text-[10px] text-muted-foreground">Active member sessions</p>
          </CardContent>
        </Card>

        <Card className="border bg-zinc-950/50">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">MQTT Online</span>
              {overview?.status?.connected !== false ? (
                <Wifi className="h-4 w-4 text-emerald-400" />
              ) : (
                <WifiOff className="h-4 w-4 text-rose-400" />
              )}
            </div>
            <p className="text-lg font-black mt-1 text-emerald-400">
              {stats.online} / {stats.total}
            </p>
            <p className="text-[10px] text-muted-foreground">ESP32 Relays Ready</p>
          </CardContent>
        </Card>

        <Card className="border bg-zinc-950/50">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Live Sync</span>
              <Clock className="h-4 w-4 text-sky-400" />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-sm font-black text-foreground">{overview?.lockerExpiryHours || 3}h Expiry</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => loadOverview(false)}
                disabled={refreshing}
                className="h-7 px-2 text-[10px] font-bold"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                Sync
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'lockers', label: `Lockers (${stats.total})`, icon: <Lock className="h-3.5 w-3.5" /> },
            { id: 'quick-register', label: 'Quick Register (RFID & PIN)', icon: <Zap className="h-3.5 w-3.5" /> },
            {
              id: 'controllers',
              label: `Controllers (${overview?.controllers?.length || 6})`,
              icon: <Cpu className="h-3.5 w-3.5" />,
            },
            {
              id: 'readers',
              label: `RFID Readers (${overview?.readers?.length || 0})`,
              icon: <Radio className="h-3.5 w-3.5" />,
            },
            {
              id: 'groups',
              label: `Groups (Men & Women)`,
              icon: <Layers className="h-3.5 w-3.5" />,
            },
            { id: 'settings', label: 'Heartbeat & Settings', icon: <Activity className="h-3.5 w-3.5" /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id as SubTab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                subTab === t.id
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-zinc-900/60 text-muted-foreground hover:text-foreground border border-zinc-800'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs font-bold border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
            onClick={() => setShowRoomQrModal(true)}
          >
            <QrCode className="h-3.5 w-3.5 mr-1.5" /> Room Unlock QR
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs font-bold border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
            onClick={handleBulkUnlockAll}
            disabled={actionBusy === 'bulk-unlock-all'}
          >
            <Unlock className="h-3.5 w-3.5 mr-1.5" /> Unlock All Online
          </Button>
        </div>
      </div>

      {/* =====================================================================
          SUB-TAB 1: LOCKERS GRID (SEPARATED MALE "M" vs FEMALE "F") + DRAWER
      ===================================================================== */}
      {subTab === 'lockers' && (
        <div className="space-y-5">
          {/* Room Gender Selector (M = Male vs F = Female) & Filter Bar */}
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between bg-zinc-950/60 p-3 rounded-xl border border-zinc-800">
            {/* M vs F Room Switcher */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setGenderRoomTab('split')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all border ${
                  genderRoomTab === 'split'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-zinc-900 text-muted-foreground border-zinc-800 hover:text-foreground'
                }`}
              >
                All Rooms (M & F Split View)
              </button>
              <button
                type="button"
                onClick={() => setGenderRoomTab('male')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all border flex items-center gap-1.5 ${
                  genderRoomTab === 'male'
                    ? 'bg-sky-500 text-white border-sky-400'
                    : 'bg-sky-950/30 text-sky-400 border-sky-500/30 hover:bg-sky-950/50'
                }`}
              >
                ♂ Male Lockers — M ({stats.maleTotal})
              </button>
              <button
                type="button"
                onClick={() => setGenderRoomTab('female')}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all border flex items-center gap-1.5 ${
                  genderRoomTab === 'female'
                    ? 'bg-pink-500 text-white border-pink-400'
                    : 'bg-pink-950/30 text-pink-400 border-pink-500/30 hover:bg-pink-950/50'
                }`}
              >
                ♀ Female Lockers — F ({stats.femaleTotal})
              </button>
            </div>

            {/* Search & Status Filter */}
            <div className="flex flex-wrap items-center gap-2 flex-1 lg:max-w-xl justify-end">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-2.5" />
                <Input
                  placeholder="Search locker (M1, F14) or member name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs bg-zinc-900"
                />
              </div>
              {(['all', 'available', 'occupied', 'maintenance'] as const).map((st) => (
                <Button
                  key={st}
                  size="sm"
                  variant={statusFilter === st ? 'default' : 'outline'}
                  onClick={() => setStatusFilter(st)}
                  className="h-8 text-[11px] font-bold capitalize"
                >
                  {st === 'occupied' ? 'Assigned' : st}
                </Button>
              ))}
              <select
                value={onlineFilter}
                onChange={(e) => setOnlineFilter(e.target.value as any)}
                className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-semibold text-foreground"
              >
                <option value="all">All Status</option>
                <option value="online">Online Only</option>
                <option value="offline">Offline Only</option>
              </select>
            </div>
          </div>

          {/* SECTION 1: MALE LOCKERS (M = Male / Men's Locker Room) */}
          {(genderRoomTab === 'split' || genderRoomTab === 'male') && (
            <div className="space-y-3 rounded-2xl border border-sky-500/30 bg-sky-950/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-500/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-400 flex items-center justify-center font-black text-sm">
                    M
                  </div>
                  <div>
                    <h2 className="text-base font-black text-foreground flex items-center gap-2">
                      ♂ Male Lockers — Men&apos;s Locker Room (M1 – M34)
                      <Badge className="bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[10px]">
                        {maleFilteredLockers.length} Lockers
                      </Badge>
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      Click <strong>Open</strong> on any card to unlock its door immediately, or click{' '}
                      <strong>Assign / Member</strong> to link a CRM member.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGroupBulkOp(40, "Men's", 'unlock')}
                  disabled={actionBusy === 'group-40-unlock'}
                  className="h-8 text-xs font-bold border-sky-500/40 text-sky-400 hover:bg-sky-500/15"
                >
                  <Unlock className="h-3.5 w-3.5 mr-1.5" /> Unlock All Male Lockers (M)
                </Button>
              </div>

              {maleFilteredLockers.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                  {maleFilteredLockers.map(renderLockerCard)}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic py-6 text-center">
                  No Male (M) lockers match the current filter.
                </p>
              )}
            </div>
          )}

          {/* SECTION 2: FEMALE LOCKERS (F = Female / Women's Locker Room) */}
          {(genderRoomTab === 'split' || genderRoomTab === 'female') && (
            <div className="space-y-3 rounded-2xl border border-pink-500/30 bg-pink-950/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-pink-500/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl bg-pink-500/20 border border-pink-500/40 text-pink-400 flex items-center justify-center font-black text-sm">
                    F
                  </div>
                  <div>
                    <h2 className="text-base font-black text-foreground flex items-center gap-2">
                      ♀ Female Lockers — Women&apos;s Locker Room (F1 – F34)
                      <Badge className="bg-pink-500/20 text-pink-400 border border-pink-500/30 text-[10px]">
                        {femaleFilteredLockers.length} Lockers
                      </Badge>
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      Click <strong>Open</strong> on any card to unlock its door immediately, or click{' '}
                      <strong>Assign / Member</strong> to link a CRM member.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGroupBulkOp(41, "Women's", 'unlock')}
                  disabled={actionBusy === 'group-41-unlock'}
                  className="h-8 text-xs font-bold border-pink-500/40 text-pink-400 hover:bg-pink-500/15"
                >
                  <Unlock className="h-3.5 w-3.5 mr-1.5" /> Unlock All Female Lockers (F)
                </Button>
              </div>

              {femaleFilteredLockers.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                  {femaleFilteredLockers.map(renderLockerCard)}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic py-6 text-center">
                  No Female (F) lockers match the current filter.
                </p>
              )}
            </div>
          )}

          {/* Slide-Over Locker Detail & Member Assignment Drawer */}
          {selectedLocker && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
              <div className="w-full max-w-md bg-zinc-950 border-l border-zinc-800 h-full overflow-y-auto p-5 space-y-5 animate-in slide-in-from-right duration-200">
                <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-black font-mono text-foreground">{selectedLocker.name}</h2>
                      <Badge
                        variant="outline"
                        className={
                          isLockerFemale(selectedLocker)
                            ? 'border-pink-500/40 text-pink-400'
                            : 'border-sky-500/40 text-sky-400'
                        }
                      >
                        {isLockerFemale(selectedLocker) ? '♀ Female Locker (F)' : '♂ Male Locker (M)'}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          isHardwareLockerOnline(selectedLocker)
                            ? 'border-emerald-500/40 text-emerald-400'
                            : 'border-zinc-700 text-zinc-400'
                        }
                      >
                        {isHardwareLockerOnline(selectedLocker) ? 'Online' : 'Offline'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Hardware ID: {selectedLocker.locker_id} • Channel {selectedLocker.channel ?? 'N/A'} • Protocol:{' '}
                      {selectedLocker.protocol || 'aywana'}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setSelectedLockerId(null);
                      setDrawerPin(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {/* Direct Hardware Controls */}
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    1-Click Door Control
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => handleLockerCommand(selectedLocker, 'openlock')}
                      disabled={actionBusy === `cmd-${selectedLocker.id}-openlock`}
                      className="font-bold text-xs h-10 bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      <Unlock className="h-4 w-4 mr-1.5" /> Open Locker Now
                    </Button>
                    {selectedLocker.status === 'maintenance' ? (
                      <Button
                        variant="outline"
                        onClick={() => handleLockerCommand(selectedLocker, 'normal')}
                        className="font-bold text-xs h-10 border-emerald-500/30 text-emerald-400"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" /> Return to Service
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => handleLockerCommand(selectedLocker, 'maintenance')}
                        className="font-bold text-xs h-10 border-rose-500/30 text-rose-400"
                      >
                        <Wrench className="h-4 w-4 mr-1.5" /> Set Maintenance
                      </Button>
                    )}
                  </div>
                </div>

                {/* Active Occupant Summary */}
                {(selectedLocker.occupant || selectedLocker.user_id || selectedLocker.crmClientName) && (
                  <Card className="border-amber-500/30 bg-amber-950/15">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-400">
                        Currently Assigned Member
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-xs">
                      <div className="space-y-1">
                        <p className="font-black text-base text-foreground">
                          👤{' '}
                          {selectedLocker.crmClientName ||
                            `${selectedLocker.occupant?.first_name || ''} ${
                              selectedLocker.occupant?.last_name || ''
                            }`.trim() ||
                            selectedLocker.occupant?.username}
                        </p>
                        {selectedLocker.occupant?.rfid_tag && (
                          <p className="font-mono text-[11px] text-muted-foreground">
                            RFID UID: <strong className="text-foreground">{selectedLocker.occupant.rfid_tag}</strong>
                          </p>
                        )}
                        {selectedLocker.occupant?.valid_until && (
                          <p className="text-[11px] text-muted-foreground">
                            Expires:{' '}
                            <strong className="text-foreground">
                              {new Date(selectedLocker.occupant.valid_until).toLocaleString()}
                            </strong>
                          </p>
                        )}
                      </div>

                      {(drawerPin || selectedLocker.crmPin) && (
                        <div className="p-3 rounded-xl bg-zinc-900 border border-amber-500/40 text-center">
                          <span className="text-[10px] uppercase font-bold text-amber-400 block">
                            Active 6-Digit Unlock PIN
                          </span>
                          <span className="font-mono text-2xl font-black tracking-widest text-foreground">
                            {drawerPin || selectedLocker.crmPin}
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReissuePin(selectedLocker)}
                          disabled={actionBusy === `pin-${selectedLocker.id}`}
                          className="text-xs font-bold"
                        >
                          <Key className="h-3.5 w-3.5 mr-1" /> Re-issue PIN
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExtendExpiry(selectedLocker, 3)}
                          disabled={actionBusy === `ext-${selectedLocker.id}`}
                          className="text-xs font-bold"
                        >
                          <Clock className="h-3.5 w-3.5 mr-1" /> Extend +3h
                        </Button>
                      </div>

                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleUnassign(selectedLocker)}
                        disabled={actionBusy === `unassign-${selectedLocker.id}`}
                        className="w-full text-xs font-bold"
                      >
                        Release / Unassign Locker
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Assign or Reassign Locker to CRM Member */}
                <Card className="border-zinc-800 bg-zinc-900/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider">
                      {selectedLocker.occupant || selectedLocker.crmClientName
                        ? 'Change / Link to CRM Member'
                        : 'Assign Locker to CRM Member'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">1. Search Member Name, Phone, or #ID</Label>
                      <Input
                        placeholder="Type member name, phone, or #ID..."
                        value={drawerMemberSearch}
                        onChange={(e) => setDrawerMemberSearch(e.target.value)}
                        className="h-8 text-xs bg-zinc-950"
                      />
                      <Label className="text-xs pt-1 block">2. Select CRM Member</Label>
                      <select
                        value={selectedClientId}
                        onChange={(e) => {
                          setSelectedClientId(e.target.value);
                          const c = clients.find((cl) => cl.id === e.target.value);
                          if (c) setDrawerMemberSearch(c.name);
                        }}
                        className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-xs text-foreground"
                      >
                        <option value="">-- Choose from {filteredDrawerClients.length} matching members --</option>
                        {filteredDrawerClients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.memberId ? `(#${c.memberId})` : ''} {c.phone ? `• ${c.phone}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Session Duration (Hours)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={720}
                        value={assignExpiryHours}
                        onChange={(e) => setAssignExpiryHours(Number(e.target.value) || 3)}
                        className="h-8 text-xs bg-zinc-950"
                      />
                    </div>

                    <Button
                      onClick={handleAssignToMember}
                      disabled={actionBusy === `assign-${selectedLocker.id}`}
                      className="w-full text-xs font-bold h-9"
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-1.5" /> Assign Member & Generate 6-Digit PIN
                    </Button>
                  </CardContent>
                </Card>

                {/* Access Audit Logs */}
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Recent Hardware Access Logs
                  </Label>
                  {loadingLogs ? (
                    <p className="text-xs text-muted-foreground">Loading logs...</p>
                  ) : userLogs.length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {userLogs.slice(0, 12).map((log, i) => (
                        <div
                          key={i}
                          className="text-[11px] bg-zinc-900/70 border border-zinc-800 rounded-lg px-2.5 py-1.5 flex justify-between"
                        >
                          <span className="font-semibold text-foreground">{log.action || log.event || 'Access'}</span>
                          <span className="text-muted-foreground font-mono text-[10px]">
                            {log.timestamp || log.created_at || ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No recent user access logs for this locker.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 2: QUICK REGISTER (FRONT DESK KIOSK — RFID & CARDLESS PIN)
      ===================================================================== */}
      {subTab === 'quick-register' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="border bg-zinc-950/60">
            <CardHeader>
              <CardTitle className="text-base font-black flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" /> Front Desk Quick Register (RFID & Cardless PIN)
              </CardTitle>
              <CardDescription className="text-xs">
                Scan a member&apos;s RFID wristband or issue an instant 6-digit PIN in the Male (M) or Female (F)
                locker room.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Step 1: Select Group */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider">1. Select Locker Room (M or F)</Label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { id: 40, name: '♂ Male Lockers (M)', desc: 'M1 – M34', color: '#3B82F6' },
                    { id: 41, name: '♀ Female Lockers (F)', desc: 'F1 – F34', color: '#EC4899' },
                  ].map((g) => {
                    const isSelected = qrGroupId === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setQrGroupId(g.id)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/15 ring-2 ring-primary/40'
                            : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-sm text-foreground">{g.name}</span>
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{g.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Optional CRM Member Link */}
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider">2. Select CRM Member</Label>
                <Input
                  placeholder="Filter CRM member by name, phone, or #ID..."
                  value={qrClientSearch}
                  onChange={(e) => setQrClientSearch(e.target.value)}
                  className="h-8 text-xs bg-zinc-900"
                />
                <select
                  value={qrClientId}
                  onChange={(e) => setQrClientId(e.target.value)}
                  className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-foreground"
                >
                  <option value="">-- Walk-in Guest / Auto-Create Locker User --</option>
                  {filteredQrClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.memberId ? `(#${c.memberId})` : ''} {c.phone ? `• ${c.phone}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 3A: USB RFID Wristband Scan */}
              <form onSubmit={handleQuickRfidSubmit} className="space-y-2 pt-2 border-t border-zinc-800">
                <Label className="text-xs font-bold uppercase tracking-wider">
                  Option A: Scan USB RFID Wristband / Card
                </Label>
                <div className="flex gap-2">
                  <Input
                    ref={rfidInputRef}
                    placeholder="Focus here & tap wristband on USB reader..."
                    value={rfidInput}
                    onChange={(e) => setRfidInput(e.target.value)}
                    className="font-mono text-xs bg-zinc-900"
                  />
                  <Button type="submit" disabled={actionBusy === 'qr-rfid'} className="font-bold text-xs shrink-0">
                    <Radio className="h-3.5 w-3.5 mr-1.5" /> Assign via RFID
                  </Button>
                </div>
                {rfidInput.trim() && (
                  <p className="text-[11px] font-mono text-emerald-400">
                    Converted ESP Hex UID: <strong>{convertRfidUid(rfidInput)}</strong>
                  </p>
                )}
              </form>

              {/* Step 3B: Cardless PIN Allocation */}
              <div className="space-y-2 pt-3 border-t border-zinc-800">
                <Label className="text-xs font-bold uppercase tracking-wider">
                  Option B: Cardless Assignment (6-Digit PIN + Phone Unlock)
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleQuickCardlessAssign}
                  disabled={actionBusy === 'qr-cardless'}
                  className="w-full h-10 font-black text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                >
                  <Key className="h-4 w-4 mr-2" /> Assign Next Free Locker & Generate 6-Digit PIN
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Allocation Result / Ticket Card */}
          <Card className="border bg-zinc-950/60">
            <CardHeader>
              <CardTitle className="text-base font-black flex items-center gap-2">
                <QrCode className="h-4 w-4 text-amber-400" /> Latest Locker Pass & Room QR
              </CardTitle>
              <CardDescription className="text-xs">
                Share the 6-digit PIN with the member or let them scan the Room QR code to unlock from their phone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {lastAllocation ? (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-center space-y-3">
                  <Badge className="bg-amber-500 text-black font-black uppercase text-[10px]">
                    {lastAllocation.groupName} Locker Assigned
                  </Badge>
                  <p className="text-4xl font-black font-mono text-foreground">{lastAllocation.lockerName}</p>
                  <p className="text-xs font-bold text-muted-foreground">👤 {lastAllocation.memberName}</p>

                  {lastAllocation.pin && (
                    <div className="p-3 rounded-xl bg-zinc-950 border border-amber-500/40">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                        6-Digit Unlock PIN
                      </span>
                      <span className="font-mono text-3xl font-black tracking-widest text-white">
                        {lastAllocation.pin}
                      </span>
                    </div>
                  )}

                  {lastAllocation.rfidTag && (
                    <p className="text-xs font-mono text-emerald-400">RFID Tag: {lastAllocation.rfidTag}</p>
                  )}
                  {lastAllocation.expiresAt && (
                    <p className="text-[11px] text-muted-foreground">
                      Valid Until: {new Date(lastAllocation.expiresAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-xs text-muted-foreground">
                  Scan an RFID wristband or click &ldquo;Assign Next Free Locker&rdquo; to display the assigned locker
                  number and 6-digit PIN here.
                </div>
              )}

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-foreground">Self-Service Phone Unlock QR</p>
                  <p className="text-[11px] text-muted-foreground">
                    Members can also open the <strong>Inzan Athletics Mobile App → Locker tab</strong> or scan this QR
                    to unlock with their 6-digit PIN.
                  </p>
                  <p className="text-[10px] font-mono text-primary break-all">{unlockGuestUrl}</p>
                </div>
                <div className="bg-white p-2 rounded-xl shrink-0">
                  <QRCodeSVG value={unlockGuestUrl} size={84} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 3: CONTROLLERS (ESP32 / AYWANA 16-CH RELAY BOARDS)
      ===================================================================== */}
      {subTab === 'controllers' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(overview?.controllers || []).map((ctrl) => {
              const ctrlLockers = activeLockers.filter((l) => l.controller_id === ctrl.id);
              return (
                <Card key={ctrl.id} className="border bg-zinc-950/60">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-sm font-black">{ctrl.name || ctrl.hostname}</CardTitle>
                          <Badge
                            variant="outline"
                            className={
                              ctrl.is_online
                                ? 'border-emerald-500/40 text-emerald-400 text-[10px]'
                                : 'border-rose-500/40 text-rose-400 text-[10px]'
                            }
                          >
                            {ctrl.is_online ? 'Online' : 'Offline'}
                          </Badge>
                          {ctrl.group && (
                            <Badge variant="outline" className="text-[10px]">
                              {ctrl.group.name}
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-[11px] font-mono mt-0.5">
                          Host: {ctrl.hostname} • IP: {ctrl.ip_address || 'MQTT'} • {ctrl.channel_count} Channels •{' '}
                          {ctrl.protocol}
                        </CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[10px]"
                          onClick={() => {
                            setEditingController(ctrl);
                            setCtrlName(ctrl.name || '');
                            setCtrlHostname(ctrl.hostname || '');
                            setCtrlGroupId(ctrl.group?.id ? String(ctrl.group.id) : 'auto');
                          }}
                        >
                          <Edit3 className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[10px]"
                          onClick={() => handleSyncControllerGroup(ctrl)}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Sync Group
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[10px]"
                          onClick={() => {
                            setRenamingController(ctrl);
                            setRenamePrefix(ctrl.gender === 'women' ? 'F' : 'M');
                            setRenameStartNum(1);
                            setRenameStartChan(1);
                          }}
                        >
                          Rename Ch
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Per-Channel Relay Test ({ctrlLockers.length || ctrl.channel_count} channels)
                    </p>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                      {Array.from({ length: ctrl.channel_count || 16 }, (_, i) => i + 1).map((ch) => {
                        const mappedLocker = ctrlLockers.find((l) => l.channel === ch);
                        return (
                          <div
                            key={ch}
                            className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-1.5 text-center space-y-1"
                          >
                            <div className="text-[10px] font-mono font-bold text-foreground truncate">
                              {mappedLocker ? mappedLocker.name : `CH${ch}`}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRelayAction(ctrl.id, ch, 'open')}
                              className="w-full py-0.5 rounded bg-primary/20 text-primary hover:bg-primary hover:text-primary-foreground text-[9px] font-bold transition-colors"
                            >
                              Pulse
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {editingController && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <Card className="w-full max-w-md border-zinc-800 bg-zinc-950">
                <CardHeader>
                  <CardTitle className="text-sm font-bold">Edit Controller #{editingController.id}</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveController} className="space-y-3">
                    <div>
                      <Label className="text-xs">Display Name</Label>
                      <Input value={ctrlName} onChange={(e) => setCtrlName(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <Label className="text-xs">MQTT Hostname</Label>
                      <Input
                        value={ctrlHostname}
                        onChange={(e) => setCtrlHostname(e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Assigned Group</Label>
                      <select
                        value={ctrlGroupId}
                        onChange={(e) => setCtrlGroupId(e.target.value)}
                        className="w-full h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs"
                      >
                        <option value="auto">Auto-detect from locker names (M / F)</option>
                        {(overview?.groups || []).map((g) => (
                          <option key={g.id} value={String(g.id)}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingController(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" size="sm">
                        Save Controller
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}

          {renamingController && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <Card className="w-full max-w-md border-zinc-800 bg-zinc-950">
                <CardHeader>
                  <CardTitle className="text-sm font-bold">
                    Bulk Rename Channels — {renamingController.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleRenameChannels} className="space-y-3">
                    <div>
                      <Label className="text-xs">Prefix (M for Male, F for Female)</Label>
                      <Input
                        value={renamePrefix}
                        onChange={(e) => setRenamePrefix(e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Start Locker Number</Label>
                        <Input
                          type="number"
                          value={renameStartNum}
                          onChange={(e) => setRenameStartNum(Number(e.target.value))}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Start Relay Channel</Label>
                        <Input
                          type="number"
                          value={renameStartChan}
                          onChange={(e) => setRenameStartChan(Number(e.target.value))}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setRenamingController(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" size="sm">
                        Rename Channels
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 4: RFID READERS
      ===================================================================== */}
      {subTab === 'readers' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Configure USB Kiosk & MQTT ESP32 Wiegand RFID readers and bind them to Male (M) or Female (F) rooms.
            </p>
            <Button
              size="sm"
              onClick={() => {
                setReaderForm({
                  id: 0,
                  reader_id: '',
                  name: '',
                  source: 'usb',
                  controller_id: '',
                  group_id: overview?.groups?.[0]?.id || 40,
                  is_active: true,
                  auto_assign: true,
                  allow_global: true,
                });
                setEditingReader({});
              }}
              className="h-8 text-xs font-bold"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Add RFID Reader
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(overview?.readers || []).map((r) => {
              const boundGroup = overview?.groups.find((g) => g.id === r.group_id);
              const boundCtrl = overview?.controllers.find((c) => c.id === r.controller_id);
              return (
                <Card key={r.id} className="border bg-zinc-950/60">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-bold text-sm text-foreground">{r.name || r.reader_id}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">ID: {r.reader_id}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {r.source}
                      </Badge>
                    </div>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <p>
                        Group: <strong className="text-foreground">{boundGroup?.name || 'Unbound'}</strong>
                      </p>
                      <p>
                        Controller: <strong className="text-foreground">{boundCtrl?.name || 'None'}</strong>
                      </p>
                    </div>
                    <div className="flex gap-2 pt-2 border-t border-zinc-800">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] flex-1"
                        onClick={() => {
                          setReaderForm({
                            id: r.id,
                            reader_id: r.reader_id,
                            name: r.name || '',
                            source: r.source || 'usb',
                            controller_id: r.controller_id || '',
                            group_id: r.group_id || '',
                            is_active: Boolean(r.is_active),
                            auto_assign: r.metadata?.auto_assign !== false,
                            allow_global: r.metadata?.allow_global !== false,
                          });
                          setEditingReader(r);
                        }}
                      >
                        <Edit3 className="h-3 w-3 mr-1" /> Configure
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] text-rose-400 border-rose-500/30"
                        onClick={() => handleDeleteReader(r)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {editingReader && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <Card className="w-full max-w-md border-zinc-800 bg-zinc-950">
                <CardHeader>
                  <CardTitle className="text-sm font-bold">
                    {readerForm.id ? 'Edit RFID Reader' : 'Register RFID Reader'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveReaderForm} className="space-y-3">
                    <div>
                      <Label className="text-xs">Reader Hardware ID</Label>
                      <Input
                        required
                        value={readerForm.reader_id}
                        onChange={(e) => setReaderForm({ ...readerForm, reader_id: e.target.value })}
                        placeholder="e.g. kiosk-frontdesk or men1-reader"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Friendly Name</Label>
                      <Input
                        value={readerForm.name}
                        onChange={(e) => setReaderForm({ ...readerForm, name: e.target.value })}
                        placeholder="Reception USB Reader"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Target Group</Label>
                        <select
                          value={readerForm.group_id}
                          onChange={(e) => setReaderForm({ ...readerForm, group_id: e.target.value })}
                          className="w-full h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs"
                        >
                          <option value="">-- Any Group --</option>
                          {(overview?.groups || []).map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Bound Controller</Label>
                        <select
                          value={readerForm.controller_id}
                          onChange={(e) => setReaderForm({ ...readerForm, controller_id: e.target.value })}
                          className="w-full h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs"
                        >
                          <option value="">-- None (USB/HTTP) --</option>
                          {(overview?.controllers || []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingReader(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" size="sm">
                        Save Reader
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 5: LOCKER GROUPS (MEN / WOMEN & CUSTOM GROUPS)
      ===================================================================== */}
      {subTab === 'groups' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Manage Male (M) and Female (F) locker room groups and trigger room-wide bulk actions.
            </p>
            <Button
              size="sm"
              onClick={() => {
                setGroupForm({ id: 0, name: '', description: '', color: '#10B981', locker_ids: [] });
                setEditingGroup({ id: 0, name: '', description: '', color: '#10B981', locker_ids: [] });
              }}
              className="h-8 text-xs font-bold"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> New Group
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(overview?.groups || [
              { id: 40, name: 'Men', description: "Men's Locker Room (M)", color: '#3B82F6', is_system: 1, locker_ids: [] },
              { id: 41, name: 'Women', description: "Women's Locker Room (F)", color: '#EC4899', is_system: 1, locker_ids: [] },
            ]).map((g) => {
              const groupLockers = activeLockers.filter((l) =>
                g.name.toLowerCase() === 'women'
                  ? isLockerFemale(l)
                  : g.name.toLowerCase() === 'men'
                  ? isLockerMale(l)
                  : g.locker_ids?.includes(l.id) || l.group?.id === g.id
              );
              const onlineCount = groupLockers.filter((l) => isHardwareLockerOnline(l)).length;
              const occupiedCount = groupLockers.filter(
                (l) => l.status === 'occupied' || l.status === 'in-use' || Boolean(l.user_id) || Boolean(l.crmClientName)
              ).length;

              return (
                <Card key={g.id} className="border bg-zinc-950/60">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: g.color || '#3B82F6' }} />
                        <CardTitle className="text-base font-black">{g.name}</CardTitle>
                        {g.is_system ? (
                          <Badge variant="outline" className="text-[9px] uppercase">
                            System Group
                          </Badge>
                        ) : null}
                      </div>
                      <span className="text-xs font-mono font-bold text-muted-foreground">
                        {groupLockers.length} Lockers ({onlineCount} Online • {occupiedCount} Assigned)
                      </span>
                    </div>
                    <CardDescription className="text-xs">{g.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGroupBulkOp(g.id, g.name, 'unlock')}
                        disabled={actionBusy === `group-${g.id}-unlock`}
                        className="h-8 text-xs font-bold"
                      >
                        <Unlock className="h-3.5 w-3.5 mr-1" /> Unlock All {g.name}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGroupBulkOp(g.id, g.name, 'maintenance')}
                        className="h-8 text-xs font-bold border-amber-500/30 text-amber-400"
                      >
                        <Wrench className="h-3.5 w-3.5 mr-1" /> Set All Maintenance
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGroupBulkOp(g.id, g.name, 'normal')}
                        className="h-8 text-xs font-bold border-emerald-500/30 text-emerald-400"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Return All to Service
                      </Button>
                      {!g.is_system && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteGroup(g)}
                          className="h-8 text-xs text-rose-400 border-rose-500/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {editingGroup && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <Card className="w-full max-w-md border-zinc-800 bg-zinc-950">
                <CardHeader>
                  <CardTitle className="text-sm font-bold">
                    {groupForm.id ? 'Edit Locker Group' : 'Create Locker Group'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveGroupForm} className="space-y-3">
                    <div>
                      <Label className="text-xs">Group Name</Label>
                      <Input
                        required
                        value={groupForm.name}
                        onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Description</Label>
                      <Input
                        value={groupForm.description}
                        onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditingGroup(null)}>
                        Cancel
                      </Button>
                      <Button type="submit" size="sm">
                        Save Group
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 6: HEARTBEAT MONITOR & HARDWARE SERVER SETTINGS
      ===================================================================== */}
      {subTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="border bg-zinc-950/60">
            <CardHeader>
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" /> ESP32 Heartbeat Telemetry
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time health of all physical locker channels across 6 ESP32 relay controllers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <p className="text-xl font-black text-emerald-400">{overview?.heartbeat?.online ?? stats.online}</p>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Online</p>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <p className="text-xl font-black text-amber-400">{overview?.heartbeat?.offline ?? 0}</p>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Offline</p>
                </div>
                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                  <p className="text-xl font-black text-zinc-400">{overview?.heartbeat?.noHeartbeat ?? 0}</p>
                  <p className="text-[10px] uppercase font-bold text-muted-foreground">No Heartbeat</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Last Synced with Firestore <code className="text-foreground">db-inzanathletics/lockers</code>:{' '}
                <strong>{overview?.syncedAt ? new Date(overview.syncedAt).toLocaleTimeString() : 'Live'}</strong>
              </p>

              {/* macOS Local Bridge & Self-Healing Tunnel Card */}
              <div className="mt-3 p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-xs text-foreground flex items-center gap-1.5">
                    <Cpu className="h-3.5 w-3.5 text-primary" />
                    macOS Reception Bridge (192.168.10.31:3701)
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      overview?.bridge?.online
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 text-[10px]'
                        : 'border-amber-500/40 bg-amber-500/15 text-amber-400 text-[10px]'
                    }
                  >
                    {overview?.bridge?.online ? 'BRIDGE ONLINE' : 'READY TO INSTALL'}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Eliminates tunnel drops by running a persistent macOS background daemon on the reception iMac that connects directly to{' '}
                  <code className="text-foreground font-mono">http://192.168.10.31:3701</code> and syncs via outbound HTTPS + self-healing Cloudflare Tunnel.
                </p>
                {overview?.bridge?.lastSeen && (
                  <p className="text-[10px] text-emerald-400 font-mono">
                    Last Bridge Heartbeat: {new Date(overview.bridge.lastSeen).toLocaleTimeString()}
                    {overview.bridge.hostname ? ` • Host: ${overview.bridge.hostname}` : ''}
                  </p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    readOnly
                    value={
                      overview?.bridge?.installCommand ||
                      'curl -fsSL https://admin.inzanathletics.com/api/inzan/lockers/macos-bridge.sh | bash'
                    }
                    className="h-8 text-[11px] font-mono bg-zinc-950 border-zinc-800"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const cmd =
                        overview?.bridge?.installCommand ||
                        'curl -fsSL https://admin.inzanathletics.com/api/inzan/lockers/macos-bridge.sh | bash';
                      navigator.clipboard.writeText(cmd);
                      toast.success('Copied macOS Terminal setup command!');
                    }}
                    className="h-8 text-xs font-bold shrink-0"
                  >
                    Copy Setup Command
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border bg-zinc-950/60">
            <CardHeader>
              <CardTitle className="text-sm font-black flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" /> Locker Server & Auto-Release Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveSettings} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Default Auto-Expiry (Hours)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={72}
                      value={expiryHoursSetting}
                      onChange={(e) => setExpiryHoursSetting(Number(e.target.value))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Gym Timezone</Label>
                    <Input
                      value={timezoneSetting}
                      onChange={(e) => setTimezoneSetting(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Inzan Locker Server URL (Tailscale Funnel)</Label>
                  <Input
                    value={serverBaseUrl}
                    onChange={(e) => setServerBaseUrl(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Admin Username</Label>
                    <Input
                      value={serverAdminUser}
                      onChange={(e) => setServerAdminUser(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Update Admin Password (Optional)</Label>
                    <Input
                      type="password"
                      placeholder="Leave blank to keep existing"
                      value={serverAdminPass}
                      onChange={(e) => setServerAdminPass(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <Button type="submit" disabled={actionBusy === 'save-settings'} className="w-full h-9 text-xs font-bold">
                  Save Configuration
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Printable Room Unlock QR Modal */}
      {showRoomQrModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm border-zinc-800 bg-zinc-950 text-center">
            <CardHeader>
              <CardTitle className="text-base font-black">Inzan Smart Locker Room QR</CardTitle>
              <CardDescription className="text-xs">
                Print and post inside the Male (M) and Female (F) locker rooms for instant phone PIN unlock.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col items-center">
              <div className="bg-white p-4 rounded-2xl shadow-md">
                <QRCodeSVG value={unlockGuestUrl} size={200} />
              </div>
              <p className="text-xs font-mono text-primary break-all">{unlockGuestUrl}</p>
              <div className="flex gap-2 w-full">
                <Button variant="outline" className="flex-1 text-xs" onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5 mr-1.5" /> Print Poster
                </Button>
                <Button className="flex-1 text-xs" onClick={() => setShowRoomQrModal(false)}>
                  Done
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
