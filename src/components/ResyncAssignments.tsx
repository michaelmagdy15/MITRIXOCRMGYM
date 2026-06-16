import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { UserCheck, Loader2, AlertCircle, CheckCircle2, Link as LinkIcon, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { Client, User } from '../types';
import { SALES_NAME_MAPPING } from '../constants';

interface ResyncAssignmentsProps {
  clients: Client[];
  users: User[];
  currentUser: User | null;
}

interface MatchResult {
  clientId: string;
  clientName: string;
  phone: string;
  oldAssignedTo: string;
  newAssignedTo: string;
  newSalesName: string;
  status: 'matched' | 'no-change' | 'unmatched';
}

export default function ResyncAssignments({ clients, users, currentUser }: ResyncAssignmentsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'syncing' | 'done'>('upload');
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Column mapping
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawData, setRawData] = useState<any[]>([]);
  const [phoneCol, setPhoneCol] = useState('');
  const [salesCol, setSalesCol] = useState('');

  // Preview results
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [syncStats, setSyncStats] = useState({ updated: 0, unchanged: 0, unmatched: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const normalizePhone = (raw: string) =>
    (raw || '').toString().replace(/[^\d]/g, '').replace(/^0/, '');

  const resolveAssignment = (salesNameRaw: string): { assignedTo: string; salesName: string } => {
    const trimmed = (salesNameRaw || '').trim();
    const lowerTrimmed = trimmed.toLowerCase();
    let canonical = trimmed;
    
    for (const [key, value] of Object.entries(SALES_NAME_MAPPING)) {
      if (key.toLowerCase() === lowerTrimmed) {
        canonical = value;
        break;
      }
    }

    const matched = users.find(u =>
      u.role === 'rep' &&
      (u.name?.toLowerCase().trim() === canonical.toLowerCase().trim() ||
       u.name?.toLowerCase().trim() === trimmed.toLowerCase().trim())
    );

    return {
      assignedTo: matched ? matched.id : trimmed,
      salesName: matched ? (matched.name || trimmed) : canonical,
    };
  };

  const buildPhoneIndex = () => {
    const index = new Map<string, Client>();
    clients.forEach(c => {
      // Index all phone variants (handle numbers with slashes like "01011111/01022222")
      const parts = (c.phone || '').split(/[/,;]/);
      parts.forEach(p => {
        const norm = normalizePhone(p);
        if (norm.length >= 8) index.set(norm, c);
      });
    });
    return index;
  };

  const parseCsv = (csvText: string) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedHeaders = results.meta.fields || [];
        setHeaders(parsedHeaders);
        setRawData(results.data as any[]);

        // Auto-detect phone and sales columns
        const phoneGuess = parsedHeaders.find(h =>
          /phone|mobile|number|tel|رقم|تليفون/i.test(h)
        ) || parsedHeaders[0] || '';
        const salesGuess = parsedHeaders.find(h =>
          /sales|rep|assign|agent|مبيعات/i.test(h)
        ) || '';

        setPhoneCol(phoneGuess);
        setSalesCol(salesGuess);
        setStep('preview');
        setIsLoading(false);
      },
      error: (err: { message: string }) => {
        setError(`CSV parse error: ${err.message}`);
        setIsLoading(false);
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setIsLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => parseCsv(ev.target?.result as string);
    reader.readAsText(selectedFile);
  };

  const handleFetchUrl = async () => {
    if (!url) return;
    setIsLoading(true);
    setError(null);
    try {
      let fetchUrl = url;
      const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (url.includes('docs.google.com/spreadsheets') && idMatch) {
        const gidMatch = url.match(/gid=(\d+)/);
        fetchUrl = `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv${gidMatch ? `&gid=${gidMatch[1]}` : ''}`;
      }
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error('Failed to fetch. Make sure the sheet is published as CSV (File → Share → Publish to web).');
      parseCsv(await response.text());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed');
      setIsLoading(false);
    }
  };

  const buildPreview = (): MatchResult[] => {
    if (!phoneCol || !salesCol) return [];
    const phoneIndex = buildPhoneIndex();
    const results: MatchResult[] = [];

    rawData.forEach(row => {
      const rawPhone = (row[phoneCol] || '').toString();
      const rawSales = (row[salesCol] || '').toString();
      if (!rawPhone && !rawSales) return;

      const normPhone = normalizePhone(rawPhone);
      const client = phoneIndex.get(normPhone);

      if (!client) {
        results.push({
          clientId: '',
          clientName: rawPhone || '—',
          phone: rawPhone,
          oldAssignedTo: '',
          newAssignedTo: '',
          newSalesName: rawSales,
          status: 'unmatched',
        });
        return;
      }

      const { assignedTo, salesName } = resolveAssignment(rawSales);
      const oldLabel = client.assignedTo
        ? (users.find(u => u.id === client.assignedTo)?.name || client.assignedTo)
        : (client.salesName || 'Unassigned');

      const hasChange = client.assignedTo !== assignedTo || client.salesName !== salesName;

      results.push({
        clientId: client.id,
        clientName: client.name,
        phone: rawPhone,
        oldAssignedTo: oldLabel,
        newAssignedTo: salesName,
        newSalesName: salesName,
        status: hasChange ? 'matched' : 'no-change',
      });
    });

    return results;
  };

  const handlePreview = () => {
    if (!phoneCol || !salesCol) {
      setError('Please map both the Phone and Sales Name columns.');
      return;
    }
    setError(null);
    setMatches(buildPreview());
  };

  const handleSync = async () => {
    // Use the live-computed previewMatches, not the stale `matches` state
    const toUpdate = previewMatches.filter(m => m.status === 'matched');
    if (toUpdate.length === 0) return;

    setStep('syncing');
    setProgress(0);

    let updated = 0;
    let batchOps = writeBatch(db);
    let count = 0;

    for (let i = 0; i < toUpdate.length; i++) {
      const m = toUpdate[i]!;
      const { assignedTo, salesName } = resolveAssignment(m.newSalesName);
      batchOps.update(doc(db, 'clients', m.clientId), { assignedTo, salesName });
      count++;
      updated++;

      if (count === 450) {
        await batchOps.commit();
        batchOps = writeBatch(db);
        count = 0;
      }

      setProgress(Math.round(((i + 1) / toUpdate.length) * 100));
    }

    if (count > 0) await batchOps.commit();

    setSyncStats({
      updated,
      unchanged: previewMatches.filter(m => m.status === 'no-change').length,
      unmatched: previewMatches.filter(m => m.status === 'unmatched').length,
    });
    setStep('done');
  };

  const reset = () => {
    setStep('upload');
    setUrl('');
    setHeaders([]);
    setRawData([]);
    setPhoneCol('');
    setSalesCol('');
    setMatches([]);
    setError(null);
    setProgress(0);
    setIsOpen(false);
  };

  const previewMatches = phoneCol && salesCol ? buildPreview() : [];
  const willUpdate = previewMatches.filter(m => m.status === 'matched').length;
  const willSkip = previewMatches.filter(m => m.status === 'no-change').length;
  const willMiss = previewMatches.filter(m => m.status === 'unmatched').length;

  return (
    <Dialog open={isOpen} onOpenChange={v => { if (!v) reset(); setIsOpen(v); }}>
      <DialogTrigger render={
        <Button variant="outline" size="sm">
          <UserCheck className="mr-2 h-4 w-4" />
          Resync Assignments
        </Button>
      } />
      <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resync Sales Assignments from Sheet</DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-6 py-4">
            <p className="text-sm text-muted-foreground">
              Match existing members by phone number and update their <strong>Assigned To</strong> field from your Google Sheet — no records will be deleted.
            </p>

            {/* File upload */}
            <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 space-y-3">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">Upload a CSV file</p>
              <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Select File
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or use Google Sheets URL</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button onClick={handleFetchUrl} disabled={!url || isLoading} variant="outline">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                <span className="ml-2">Fetch</span>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Sheet must be published: File → Share → Publish to web → CSV
            </p>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Map the columns from your sheet — then preview which clients will be updated.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone Number Column <span className="text-destructive">*</span></Label>
                <Select value={phoneCol} onValueChange={v => v && setPhoneCol(v)}>
                  <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                  <SelectContent>
                    {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sales Rep / Assigned To Column <span className="text-destructive">*</span></Label>
                <Select value={salesCol} onValueChange={v => v && setSalesCol(v)}>
                  <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
                  <SelectContent>
                    {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button variant="outline" className="w-full" onClick={handlePreview} disabled={!phoneCol || !salesCol}>
              Preview Changes
            </Button>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
                <AlertCircle className="h-4 w-4 shrink-0" /><p>{error}</p>
              </div>
            )}

            {previewMatches.length > 0 && (
              <div className="space-y-3">
                <div className="flex gap-3 text-sm">
                  <Badge className="bg-emerald-500">{willUpdate} to update</Badge>
                  <Badge variant="secondary">{willSkip} unchanged</Badge>
                  <Badge variant="destructive">{willMiss} not found</Badge>
                </div>

                <ScrollArea className="h-[280px] border rounded-md">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Name</th>
                        <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Phone</th>
                        <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Current</th>
                        <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">New</th>
                        <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewMatches.map((m, i) => (
                        <tr key={i} className={`border-t ${m.status === 'matched' ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : m.status === 'unmatched' ? 'bg-destructive/5' : ''}`}>
                          <td className="px-3 py-2 font-medium whitespace-nowrap max-w-[140px] truncate">{m.clientName}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap font-mono text-[11px]">{m.phone}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{m.oldAssignedTo || '—'}</td>
                          <td className="px-3 py-2 font-medium whitespace-nowrap">{m.newAssignedTo || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {m.status === 'matched' && <Badge className="bg-emerald-500 text-[10px] px-2">Update</Badge>}
                            {m.status === 'no-change' && <Badge variant="secondary" className="text-[10px] px-2">Same</Badge>}
                            {m.status === 'unmatched' && <Badge variant="destructive" className="text-[10px] px-2">Not Found</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" onClick={() => setStep('upload')} className="flex-1">Back</Button>
                  <Button
                    onClick={handleSync}
                    disabled={willUpdate === 0}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Apply {willUpdate} Update{willUpdate !== 1 ? 's' : ''}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'syncing' && (
          <div className="py-10 flex flex-col items-center space-y-4">
            <Loader2 className="h-12 w-12 text-primary animate-spin" />
            <p className="font-medium text-lg">Syncing assignments...</p>
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-muted-foreground">{progress}% complete</p>
          </div>
        )}

        {step === 'done' && (
          <div className="py-8 flex flex-col items-center space-y-4">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            <p className="font-bold text-xl">Sync Complete</p>
            <div className="flex gap-4 text-sm">
              <div className="text-center p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200">
                <div className="text-3xl font-black text-emerald-600">{syncStats.updated}</div>
                <div className="text-xs text-muted-foreground mt-1">Updated</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-muted border">
                <div className="text-3xl font-black">{syncStats.unchanged}</div>
                <div className="text-xs text-muted-foreground mt-1">Unchanged</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-destructive/5 border border-destructive/20">
                <div className="text-3xl font-black text-destructive">{syncStats.unmatched}</div>
                <div className="text-xs text-muted-foreground mt-1">Not Found</div>
              </div>
            </div>
            <Button onClick={reset} className="mt-2">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
