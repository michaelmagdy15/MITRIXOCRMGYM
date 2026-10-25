import React, { useState, useRef } from 'react';
import { useAppContext } from './context';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Download, FileSpreadsheet, Link as LinkIcon, Loader2, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import Papa from 'papaparse';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Client, Package, Payment } from './types';
import { Input } from '@/components/ui/input';
import { addDays, isBefore, parseISO, parse, isValid, isAfter, format } from 'date-fns';
import { PACKAGES, SALES_NAME_MAPPING } from './constants';
import { resolvePaymentCategory } from './utils/paymentCategories';
import { isTenantInzan } from './utils/inzanOrg';

interface ImportDataProps {
  type: 'Lead' | 'Active';
}

export default function ImportData({ type }: ImportDataProps) {
  const { bulkAddPayments, currentUser, users, addClient, bulkAddClients, addImportBatch, branding, packages } = useAppContext();
  const isInzanTenant = isTenantInzan(branding?.companyName);

  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'upload' | 'map' | 'importing' | 'confirm'>('upload');
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [importStats, setImportStats] = useState({ success: 0, failed: 0, errors: [] as {row: number, reason: string}[] });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fields = [
    { key: 'name', label: 'Name (Required)', required: true },
    { key: 'phone', label: 'Phone / Number (Required)', required: true },
    { key: 'memberNumber', label: 'RedGITS Member ID / Barcode' },
    { key: 'startDate', label: 'Start Date' },
    { key: 'membershipExpiry', label: 'Expiry Date' },
    { key: 'packageType', label: 'Package Type' },
    { key: 'sessionsRemaining', label: 'Sessions Remaining' },
    { key: 'paid', label: 'Amount Paid (EGP)' },
    { key: 'remainingDebt', label: 'Remaining Debt / Unpaid Balance (EGP)' },
    { key: 'dueDate', label: 'Debt / Installment Due Date' },
    { key: 'gender', label: 'Gender (Male / Female)' },
    { key: 'invitationsTotal', label: 'Guest Invitations Balance' },
    { key: 'freezeCoins', label: 'Freeze Days Balance' },
    { key: 'frontDeskNote', label: 'Reception Sticky Note' },
    { key: 'typeOfClient', label: 'Type Of Client / Status' },
    { key: 'branch', label: 'Branch' },
    { key: 'salesName', label: 'Sales Name' },
    { key: 'source', label: 'Source' },
    { key: 'nationalId', label: 'National ID' },
    { key: 'email', label: 'Email' },
    { key: 'backupPhone', label: 'Backup Mobile' },
    { key: 'advertisingSource', label: 'Advertising Source / Come From' },
    { key: 'isBlacklisted', label: 'Is Blacklisted' },
  ];

  const downloadRedgitsTemplate = () => {
    const sampleRows = [
      [
        'Member ID',
        'Full Name',
        'Mobile',
        'Gender',
        'Branch',
        'Package',
        'Start Date',
        'End Date',
        'Sessions Left',
        'Amount Paid',
        'Remaining Debt',
        'Due Date',
        'Guest Invitations',
        'Freeze Days',
        'Sales Rep',
        'Come From',
        'Reception Note',
        'National ID'
      ].join(','),
      [
        '10452',
        'Ahmed Mahmoud Hassan',
        '01012345678',
        'Male',
        'Mivida Compound',
        'Annual Membership',
        '2026-01-01',
        '2027-01-01',
        '365',
        '8000',
        '2000',
        '2026-11-01',
        '5',
        '30',
        'Sama',
        'Walk-in',
        'VIP Member - prefers morning locker',
        '29501011234567'
      ].join(','),
      [
        '10453',
        'Nourhan Tarek Ali',
        '01123456789',
        'Female',
        'Maxim Compound',
        '3 Months Transformation',
        '2026-09-01',
        '2026-12-01',
        '36',
        '4500',
        '0',
        '',
        '2',
        '14',
        'Sama',
        'Instagram',
        '',
        '29805051234567'
      ].join(',')
    ].join('\n');

    const blob = new Blob([sampleRows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `RedGITS_to_Mitrixo_Migration_Template_${type}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          processParsedData(results);
        }
      });
    }
  };

  const handleFetchUrl = async () => {
    if (!url) return;
    setIsLoading(true);
    setError(null);
    try {
      let fetchUrl = url;
      if (url.includes('docs.google.com/spreadsheets')) {
        const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (idMatch) {
          // Force CSV export format
          fetchUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv`;
        }
      }

      // Note: This might fail due to CORS if the sheet isn't "Published to the web"
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch. If using Google Sheets, ensure it is "Published to the web" as CSV (File > Share > Publish to web).');
      }
      
      const csvText = await response.text();
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.data.length === 0) {
            throw new Error('No data found in the fetched file.');
          }
          processParsedData(results);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  const REDGITS_FIELD_ALIASES: Record<string, string[]> = {
    name: ['name', 'full name', 'member name', 'client', 'customer', 'member', 'lead', 'اسم', 'الاسم'],
    phone: ['phone', 'mobile', 'number', 'tel', 'contact', 'whatsapp', 'رقم', 'تليفون', 'موبايل'],
    memberNumber: ['member id', 'member_id', 'memberid', 'member number', 'membernumber', 'legacy id', 'redgits id', 'barcode', 'card id', 'code', 'id', 'رقم العضوية', 'كود'],
    sessionsRemaining: ['session', 'sessions left', 'remaining', 'left', 'balance', 'count', 'pt sessions', 'جلسات'],
    startDate: ['start date', 'start', 'begin', 'join date', 'بداية'],
    membershipExpiry: ['expiry', 'end date', 'valid until', 'expires', 'date', 'انتهاء'],
    packageType: ['package', 'plan', 'membership', 'type', 'subscription', 'offer', 'باقة', 'الاشتراك'],
    typeOfClient: ['type of client', 'client type', 'category', 'status', 'نوع', 'الحالة'],
    branch: ['branch', 'location', 'gym', 'club', 'فرع'],
    salesName: ['sales name', 'sales', ' sales rep', 'rep', 'assigned to', 'agent', 'created by', 'مبيعات'],
    paid: ['amount paid', 'payment', 'paid', 'is paid', 'status paid', 'collected', 'دفع', 'المدفوع'],
    remainingDebt: ['remaining debt', 'debt', 'remaining amount', 'unpaid', 'rest', 'balance due', 'amount due', 'متبقي', 'مديونية'],
    dueDate: ['due date', 'installment date', 'next due', 'next installment', 'تاريخ الاستحقاق'],
    gender: ['gender', 'sex', 'النوع'],
    invitationsTotal: ['guest invitations', 'invitations', 'guest passes', 'free passes', 'دعوات'],
    freezeCoins: ['freeze days', 'freeze balance', 'freeze quota', 'freeze', 'أيام التجميد'],
    frontDeskNote: ['reception note', 'front desk note', 'sticky note', 'note', 'notes', 'comment', 'ملاحظات'],
    source: ['source', 'how did you hear', 'referral', 'origin', 'مصدر'],
    nationalId: ['national id', 'national_id', 'nationalid', 'national', 'ssn', 'الرقم القومي'],
    email: ['email', 'e-mail', 'email address'],
    backupPhone: ['backup mobile', 'backup phone', 'secondary mobile', 'emergency phone'],
    advertisingSource: ['come from', 'source', 'advertising source', 'ad source', 'channel'],
    isBlacklisted: ['blacklist', 'black list', 'black-list'],
  };

  const processParsedData = (results: Papa.ParseResult<any>) => {
    const parsedHeaders = results.meta.fields || [];
    setHeaders(parsedHeaders);
    setData(results.data);
    
    // Auto-map based on common names and RedGITS v17.12 aliases
    const newMapping: Record<string, string> = {};

    fields.forEach(field => {
      const aliases = REDGITS_FIELD_ALIASES[field.key] || [field.key];
      // Try exact match first
      let match = parsedHeaders.find(h => aliases.some(alias => h.trim().toLowerCase() === alias));
      // Then try partial match
      if (!match) {
        match = parsedHeaders.find(h => aliases.some(alias => h.trim().toLowerCase().includes(alias)));
      }
      
      if (match) {
        newMapping[field.key] = match;
      }
    });

    setMapping(newMapping);
    setStep('map');
  };

  const handleSmartImport = async () => {
    if (!url && !file) return;
    setIsLoading(true);
    setError(null);
    try {
      let csvText = '';
      if (file) {
        csvText = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsText(file);
        });
      } else {
        let fetchUrl = url;
        if (url.includes('docs.google.com/spreadsheets')) {
          const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
          if (idMatch) fetchUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv`;
        }
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error('Failed to fetch sheet');
        csvText = await response.text();
      }

      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          if (results.data.length === 0) {
            setError('No data found');
            setIsLoading(false);
            return;
          }

          // 1. Auto-map using REDGITS_FIELD_ALIASES
          const parsedHeaders = results.meta.fields || [];
          const newMapping: Record<string, string> = {};

          fields.forEach(field => {
            const aliases = REDGITS_FIELD_ALIASES[field.key] || [field.key];
            let match = parsedHeaders.find(h => aliases.some(alias => h.trim().toLowerCase() === alias));
            if (!match) match = parsedHeaders.find(h => aliases.some(alias => h.trim().toLowerCase().includes(alias)));
            if (match) newMapping[field.key] = match;
          });

          // 2. Validate required mappings
          if (!newMapping['name'] || !newMapping['phone']) {
            // If smart mapping fails, fall back to manual mapping
            setHeaders(parsedHeaders);
            setData(results.data);
            setMapping(newMapping);
            setStep('map');
            setIsLoading(false);
            return;
          }

          // 3. Import with correlation (reuse logic)
          setData(results.data);
          setMapping(newMapping);
          await performImport(results.data, newMapping);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Smart import failed');
      setIsLoading(false);
    }
  };

  const performImport = async (importData: any[], importMapping: Record<string, string>) => {
    setStep('importing');
    setProgress(0);
    setImportStats({ success: 0, failed: 0, errors: [] });
    
    const now = new Date();
    const batchId = await addImportBatch({
      date: now.toISOString(),
      fileName: file ? file.name : 'URL Import',
      importedCount: 0,
      failedCount: 0,
      errors: [],
      status: 'Completed'
    });

    const clientsToImport: Client[] = [];
    const paymentsToImport: Payment[] = [];
    const errors: {row: number, reason: string}[] = [];
    let failedCount = 0;

    for (let i = 0; i < importData.length; i++) {
      const row = importData[i];
      try {
        let name = (row[importMapping['name'] || ''] || '').toString().trim();
        let phone = (row[importMapping['phone'] || ''] || '').toString().replace(/[^\d+]/g, '');
        let memberNumberRaw = importMapping['memberNumber'] ? (row[importMapping['memberNumber']] || '').toString().trim() : '';
        let branchRaw = (row[importMapping['branch'] || ''] || '').toString().trim().toUpperCase();
        let source = (row[importMapping['source'] || ''] || 'Other').toString().trim();
        let packageType = (row[importMapping['packageType'] || ''] || '').toString().trim();
        let sessionsRemainingRaw = row[importMapping['sessionsRemaining'] || ''];
        let startDateRaw = row[importMapping['startDate'] || ''];
        let membershipExpiryRaw = row[importMapping['membershipExpiry'] || ''];
        let paidRaw = row[importMapping['paid'] || ''];
        let remainingDebtRaw = importMapping['remainingDebt'] ? row[importMapping['remainingDebt']] : '';
        let dueDateRaw = importMapping['dueDate'] ? row[importMapping['dueDate']] : '';
        let genderRaw = importMapping['gender'] ? (row[importMapping['gender']] || '').toString().trim() : '';
        let invitationsRaw = importMapping['invitationsTotal'] ? row[importMapping['invitationsTotal']] : '';
        let freezeCoinsRaw = importMapping['freezeCoins'] ? row[importMapping['freezeCoins']] : '';
        let frontDeskNoteRaw = importMapping['frontDeskNote'] ? (row[importMapping['frontDeskNote']] || '').toString().trim() : '';
        let typeOfClient = (row[importMapping['typeOfClient'] || ''] || '').toString().trim();
        let salesName = (row[importMapping['salesName'] || ''] || '').toString().trim();

        let nationalId = importMapping['nationalId'] ? (row[importMapping['nationalId']] || '').toString().trim() : undefined;
        let email = importMapping['email'] ? (row[importMapping['email']] || '').toString().trim() : undefined;
        let backupPhone = importMapping['backupPhone'] ? (row[importMapping['backupPhone']] || '').toString().replace(/[^\d+]/g, '') : undefined;
        let advertisingSource = importMapping['advertisingSource'] ? (row[importMapping['advertisingSource']] || '').toString().trim() : undefined;
        let isBlacklistedRaw = importMapping['isBlacklisted'] ? (row[importMapping['isBlacklisted']] || '').toString().toLowerCase().trim() : '';
        let isBlacklisted = isBlacklistedRaw === 'yes' || isBlacklistedRaw === 'true' || isBlacklistedRaw === '1' || isBlacklistedRaw === 'black-list' || isBlacklistedRaw === 'blacklist';


        if (!name || !phone) {
          failedCount++;
          errors.push({ row: i + 1, reason: 'Missing required fields (Name or Phone)' });
          continue;
        }

        if (!packageType && sessionsRemainingRaw) {
          const s = Number(sessionsRemainingRaw);
          const pkg = packages.find(p => p.sessions === s);
          if (pkg) packageType = pkg.name;
        }

        if ((sessionsRemainingRaw === undefined || sessionsRemainingRaw === '') && packageType) {
          const pkg = packages.find(p => p.name.toLowerCase().includes(packageType.toLowerCase()));
          if (pkg) sessionsRemainingRaw = pkg.sessions;
        }

        let isHold = false;
        if (startDateRaw && startDateRaw.toString().toLowerCase().trim() === 'hold') isHold = true;
        if (membershipExpiryRaw && membershipExpiryRaw.toString().toLowerCase().trim() === 'hold') isHold = true;

        let startDate: string | undefined;
        let membershipExpiry: string | undefined;
        let parsedStartDate: Date | null = null;
        let parsedExpiryDate: Date | null = null;

        const robustParse = (raw: any) => {
          if (!raw) return null;
          const str = raw.toString().trim();
          if (!str || str.toLowerCase() === 'hold') return null;

          // Try ISO
          const iso = parseISO(str);
          if (isValid(iso) && iso.getFullYear() > 1990 && iso.getFullYear() < 2100) return iso;

          // Try DD/MM/YYYY
          const ddmmyyyy = parse(str, 'dd/MM/yyyy', new Date());
          if (isValid(ddmmyyyy) && ddmmyyyy.getFullYear() > 1990 && ddmmyyyy.getFullYear() < 2100) return ddmmyyyy;

          // Try MM/DD/YYYY
          const mmddyyyy = parse(str, 'MM/dd/yyyy', new Date());
          if (isValid(mmddyyyy) && mmddyyyy.getFullYear() > 1990 && mmddyyyy.getFullYear() < 2100) return mmddyyyy;

          // Try YYYY-MM-DD
          const yyyymmdd = parse(str, 'yyyy-MM-dd', new Date());
          if (isValid(yyyymmdd) && yyyymmdd.getFullYear() > 1990 && yyyymmdd.getFullYear() < 2100) return yyyymmdd;

          // Fallback to native
          const native = new Date(str);
          if (isValid(native) && !isNaN(native.getTime()) && native.getFullYear() > 1990) return native;

          return null;
        };

        if (startDateRaw && !isHold) {
          parsedStartDate = robustParse(startDateRaw);
          if (parsedStartDate) startDate = parsedStartDate.toISOString();
        }

        if (membershipExpiryRaw && !isHold) {
          parsedExpiryDate = robustParse(membershipExpiryRaw);
          if (parsedExpiryDate) membershipExpiry = parsedExpiryDate.toISOString();
        }

        if (!membershipExpiry && !isHold && packageType && parsedStartDate) {
          // Fuzzy match package
          const normalizedPkg = packageType.toLowerCase().replace(/[^a-z0-9]/g, '');
          const pkgMatch = PACKAGES.find(p => {
            const pName = p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return normalizedPkg.includes(pName) || pName.includes(normalizedPkg) ||
                   (normalizedPkg.includes(p.sessions.toString()) && p.sessions > 0);
          });

          const days = pkgMatch?.expiryDays || 30;
          parsedExpiryDate = addDays(parsedStartDate, days);
          membershipExpiry = parsedExpiryDate.toISOString();
        }

        let rawStatus = (typeOfClient || (type === 'Active' ? 'Active' : 'Lead')).toString().trim();
        rawStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
        let status: any = ["Lead", "Active", "Nearly Expired", "Expired", "Hold"].includes(rawStatus)
          ? rawStatus
          : (type === 'Active' ? 'Active' : 'Lead');
        
        if (isHold) {
          status = 'Hold';
        } else if (membershipExpiry) {
          if (status !== 'Expired' && status !== 'Hold' && status !== 'Lead') {
            status = 'Active';
          }
        }

        let sessionsRemaining: number | 'no attend' | undefined;
        if (sessionsRemainingRaw !== undefined && sessionsRemainingRaw !== '') {
          const s = Number(sessionsRemainingRaw);
          sessionsRemaining = isNaN(s) ? (sessionsRemainingRaw.toString().toLowerCase().includes('no') ? 'no attend' : undefined) : s;
        }

        let branch: string | undefined;
        if (branchRaw.includes('COMPLEX') || branchRaw.includes('MAXIM')) branch = 'Maxim Compound';
        else if (branchRaw.includes('MIVIDA') || branchRaw.includes('MVIDA')) branch = 'Mivida Compound';
        else if (branchRaw.includes('IMPACT') || branchRaw.includes('STRIKE')) branch = 'Impact by Strike';
        else if (branchRaw) branch = (row[importMapping['branch'] || ''] || '').toString().trim();

        let paid = false;
        let paidAmount = 0;
        if (paidRaw) {
          const p = paidRaw.toString().toLowerCase().trim();
          paid = p === 'yes' || p === 'paid' || p === 'true' || p === '1' || p === 'تم الدفع';
          
          // Try to parse as number
          const numericValue = parseFloat(p.replace(/[^\d.-]/g, ''));
          if (!isNaN(numericValue) && numericValue > 0) {
            paidAmount = numericValue;
            paid = true;
          }
        }

        let remainingDebt = 0;
        if (remainingDebtRaw !== undefined && remainingDebtRaw !== '') {
          const parsedDebt = parseFloat(remainingDebtRaw.toString().replace(/[^\d.-]/g, ''));
          if (!isNaN(parsedDebt) && parsedDebt > 0) {
            remainingDebt = parsedDebt;
          }
        }

        let parsedDueDate: Date | null = dueDateRaw ? robustParse(dueDateRaw) : null;
        const dueDateIso = parsedDueDate ? format(parsedDueDate, 'yyyy-MM-dd') : format(addDays(now, 14), 'yyyy-MM-dd');

        let gender: 'Male' | 'Female' | 'Other' | undefined;
        if (genderRaw) {
          const g = genderRaw.toLowerCase();
          if (g.startsWith('f') || g.includes('انثى') || g.includes('أنثى')) gender = 'Female';
          else if (g.startsWith('m') || g.includes('ذكر')) gender = 'Male';
        }

        const invitationsTotal = invitationsRaw !== undefined && invitationsRaw !== '' ? Math.max(0, parseInt(invitationsRaw.toString(), 10) || 0) : undefined;
        const freezeCoins = freezeCoinsRaw !== undefined && freezeCoinsRaw !== '' ? Math.max(0, parseInt(freezeCoinsRaw.toString(), 10) || 0) : undefined;

        const clientId = Math.random().toString(36).substr(2, 9);
        const trimmedSalesName = (salesName || '').trim();
        const lowerSalesName = trimmedSalesName.toLowerCase();
        let mappedName = trimmedSalesName;
        for (const [key, value] of Object.entries(SALES_NAME_MAPPING)) {
          if (key.toLowerCase() === lowerSalesName) {
            mappedName = value;
            break;
          }
        }
        
        const systemUser = users.find(u => 
          u.name?.toLowerCase().trim() === mappedName.toLowerCase().trim() ||
          u.name?.toLowerCase().trim() === lowerSalesName
        );
        
        const finalAssignedTo = systemUser ? systemUser.id : (mappedName || (currentUser?.role === 'rep' ? currentUser.id : undefined));
        const finalSalesName = systemUser?.name || mappedName;

        const importedClient: any = {
          id: clientId,
          name,
          phone,
          status: status as any,
          source,
          branch,
          packageType: packageType || 'Unknown',
          sessionsRemaining,
          membershipExpiry,
          startDate,
          typeOfClient,
          salesName: finalSalesName,
          comments: frontDeskNoteRaw
            ? [{ id: `note-${Date.now()}-${i}`, text: `[RedGITS Sticky Note] ${frontDeskNoteRaw}`, author: 'RedGITS Import', date: now.toISOString() }]
            : [],
          lastContactDate: now.toISOString(),
          assignedTo: finalAssignedTo,
          importBatchId: batchId,
          paid: paid && remainingDebt === 0,
          nationalId,
          email,
          backupPhone,
          advertisingSource,
          isBlacklisted,
        };

        if (memberNumberRaw) {
          importedClient.memberId = memberNumberRaw;
          importedClient.memberNumber = Number(memberNumberRaw.replace(/\D/g, '')) || undefined;
          importedClient.legacyRedgitsId = memberNumberRaw;
        }
        if (gender) importedClient.gender = gender;
        if (invitationsTotal !== undefined) {
          importedClient.invitationsTotal = invitationsTotal;
          importedClient.guestPassesRemaining = invitationsTotal;
        }
        if (freezeCoins !== undefined) {
          importedClient.freezeCoins = freezeCoins;
        }
        if (frontDeskNoteRaw) {
          importedClient.frontDeskNote = frontDeskNoteRaw;
        }
        if (packageType && packageType !== 'Unknown') {
          importedClient.packages = [{
            id: `pkg-${clientId}`,
            packageName: packageType,
            startDate: startDate || now.toISOString(),
            endDate: membershipExpiry || addDays(now, 30).toISOString(),
            sessionsTotal: typeof sessionsRemaining === 'number' ? sessionsRemaining : 30,
            sessionsRemaining: typeof sessionsRemaining === 'number' ? sessionsRemaining : 30,
            status: status === 'Hold' ? 'Hold' : status === 'Expired' ? 'Expired' : 'Active',
            invitationsTotal: invitationsTotal,
            invitationsUsed: 0,
          }];
        }

        clientsToImport.push(importedClient as Client);

        if (paidAmount > 0 || remainingDebt > 0) {
          const totalAmount = paidAmount + remainingDebt;
          const paymentDoc: any = {
            id: '', // Will be set by Firestore docRef in bulkAddPayments
            clientId: clientId,
            client_name: name,
            amount: totalAmount,
            amount_paid: paidAmount,
            date: startDate || now.toISOString(), // Use start date if available
            method: 'Other',
            packageType: packageType || 'Imported',
            package_category_type: resolvePaymentCategory(packageType || ''),
            recordedBy: currentUser?.id || 'system-import',
            sales_rep_id: systemUser?.id || (typeof finalAssignedTo === 'string' && finalAssignedTo.length > 15 ? finalAssignedTo : 'system-import'),
            salesName: finalSalesName,
            created_at: now.toISOString(),
            deleted_at: null,
          };
          if (remainingDebt > 0) {
            paymentDoc.due_date = dueDateIso;
            paymentDoc.installments = [
              {
                id: `inst-${clientId}-1`,
                amount: remainingDebt,
                dueDate: dueDateIso,
                status: 'pending',
                notes: 'Imported from RedGITS',
              }
            ];
          }
          paymentsToImport.push(paymentDoc as Payment);
        }
      } catch (err) {
        failedCount++;
        errors.push({ row: i + 1, reason: err instanceof Error ? err.message : 'Unknown error' });
      }
    }
    
    setProgress(50); // Parsing done, now uploading

    try {
      const result = await bulkAddClients(clientsToImport);
      
      if (result.success > 0 && paymentsToImport.length > 0) {
        // Only import payments for successfully imported clients (approximate check since we use pre-gen IDs)
        try {
          await bulkAddPayments(paymentsToImport);
        } catch (paymentErr) {
          console.error("Payment import failed:", paymentErr);
          errors.push({ row: 0, reason: `Payments failed to import: ${paymentErr instanceof Error ? paymentErr.message : String(paymentErr)}` });
        }
      }
      
      setProgress(100);
      setImportStats({ 
        success: result.success, 
        failed: failedCount + result.failed, 
        errors: [...errors, ...result.errors] 
      });
      setStep('confirm');
    } catch (uploadErr) {
      console.error("Upload failed:", uploadErr);
      setError(uploadErr instanceof Error ? uploadErr.message : "Failed to upload data to Firestore");
      setProgress(0); // Reset progress on failure
      setStep('upload'); // Back to upload step so user can see error
    }
  };

  const handleImport = () => performImport(data, mapping);

  const reset = () => {
    setFile(null);
    setHeaders([]);
    setData([]);
    setMapping({});
    setStep('upload');
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Import {type}s
          </Button>
        }
      />
      <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8">
        <DialogHeader>
          <DialogTitle className="text-xl md:text-2xl font-bold">
            {isInzanTenant ? `Import ${type}s (RedGITS / CSV / Google Sheets)` : `Import ${type}s from CSV / Google Sheets`}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-6 py-4">
            {isInzanTenant && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <div>
                  <p className="text-sm font-bold text-amber-600 dark:text-amber-400">RedGITS v17.12 One-Click Migration Ready</p>
                  <p className="text-xs text-muted-foreground">
                    Preserves RedGITS Member IDs / Barcodes, Remaining Sessions, Freeze Quotas, Guest Invitations, and Unpaid Debtor Installments.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={downloadRedgitsTemplate} className="shrink-0 border-amber-500/40 text-amber-600 dark:text-amber-400">
                  <Download className="h-4 w-4 mr-1.5" />
                  RedGITS CSV Template
                </Button>
              </div>
            )}
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 space-y-4">
              <Upload className="h-12 w-12 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Upload your RedGITS or Excel CSV export</p>
                <p className="text-sm text-muted-foreground">Select a local .csv file (English or Arabic column headers supported)</p>
              </div>
              <input 
                type="file" 
                accept=".csv" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileChange}
              />
              <div className="flex gap-2">
                <Button onClick={() => fileInputRef.current?.click()} variant="outline">Select File</Button>
                <Button 
                  onClick={handleSmartImport} 
                  disabled={!file || isLoading}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  <span className="ml-2">Smart Import</span>
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or import from URL</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="url">Google Sheets URL (Published as CSV)</Label>
                <div className="flex gap-2">
                  <Input 
                    id="url"
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit" 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <Button onClick={handleFetchUrl} disabled={!url || isLoading} variant="outline">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                    <span className="ml-2">Fetch & Map</span>
                  </Button>
                  <Button 
                    onClick={handleSmartImport} 
                    disabled={!url || isLoading}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    <span className="ml-2">Smart Import</span>
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  To use Google Sheets: File &gt; Share &gt; Publish to web &gt; Select "Comma-separated values (.csv)" &gt; Copy link.
                  <button 
                    className="ml-2 text-primary hover:underline" 
                    onClick={() => setUrl('https://docs.google.com/spreadsheets/d/1L54Z_H0DVAJTlOGio5DNGeYHkad4riS1m-2YkUcZYsc/edit?gid=0#gid=0')}
                  >
                    Use example sheet
                  </button>
                </p>
              </div>
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
                  <AlertCircle className="h-4 w-4" />
                  <p>{error}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Map your CSV columns to the system fields:</p>
            <div className="grid gap-4">
              {fields.map(field => (
                <div key={field.key} className="grid grid-cols-2 items-center gap-4">
                  <Label>{field.label}</Label>
                  <Select 
                    value={mapping[field.key] || 'none'} 
                    onValueChange={(val) => setMapping(prev => ({ ...prev, [field.key]: val === 'none' || !val ? '' : val }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Don't import</SelectItem>
                      {headers.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="pt-4">
              <p className="text-xs text-muted-foreground italic">
                Found {data.length} rows in the file.
              </p>
            </div>
            <Button 
              className="w-full" 
              onClick={handleImport}
              disabled={!mapping['name'] || !mapping['phone']}
            >
              Start Import
            </Button>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <div className="text-center w-full space-y-2">
              <p className="font-medium text-xl">Importing Data...</p>
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-muted-foreground">{progress}% Complete</p>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="py-4 flex flex-col items-center justify-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div className="text-center">
              <p className="font-medium text-xl">Import Complete!</p>
              <p className="text-sm text-muted-foreground">
                Successfully imported {importStats.success} records.
                {importStats.failed > 0 && ` Failed to import ${importStats.failed} records.`}
              </p>
            </div>
            
            {importStats.errors.length > 0 && (
              <div className="w-full mt-4">
                <p className="font-medium text-sm mb-2 text-destructive">Error Log:</p>
                <ScrollArea className="h-[150px] w-full rounded-md border p-4 bg-muted/50">
                  {importStats.errors.map((err, i) => (
                    <div key={i} className="text-xs mb-1">
                      <span className="font-semibold">Row {err.row}:</span> {err.reason}
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}
            <Button onClick={reset} className="mt-4">Close</Button>
          </div>
        )}

        <DialogFooter>
          {step === 'map' && (
            <Button variant="ghost" onClick={() => setStep('upload')}>Back</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
