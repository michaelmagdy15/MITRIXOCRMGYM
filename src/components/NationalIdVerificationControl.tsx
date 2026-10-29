import React, { useState } from 'react';
import { Client, CorporateCompany } from '../types';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import {
  validateEgyptNationalId,
  getMemberNationalIdScanUrl,
} from '../utils/validationRules';
import { ShieldCheck, Upload, CheckCircle2, AlertTriangle, Building2, Loader2, Eye } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface NationalIdVerificationControlProps {
  client?: Partial<Client> | null;
  nationalId: string;
  onNationalIdChange: (val: string) => void;
  scanUrl: string;
  onScanUrlChange: (url: string) => void;
  idPrefix?: string;
}

export const NationalIdVerificationControl: React.FC<NationalIdVerificationControlProps> = ({
  client,
  nationalId,
  onNationalIdChange,
  scanUrl,
  onScanUrlChange,
  idPrefix = 'nat-id',
}) => {
  const [uploading, setUploading] = useState(false);
  const effectiveNatId = nationalId || client?.nationalId || '';
  const effectiveScanUrl = scanUrl || getMemberNationalIdScanUrl(client);
  const natCheck = validateEgyptNationalId(effectiveNatId);
  const isComplete = natCheck.valid && Boolean(effectiveScanUrl);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const targetId = client?.id || `new_${Date.now()}`;
      const fRef = storageRef(storage, `member_documents/${targetId}/national_id_${Date.now()}_${file.name}`);
      await uploadBytes(fRef, file);
      const url = await getDownloadURL(fRef);
      onScanUrlChange(url);
    } catch (err) {
      console.error('Failed to upload National ID scan:', err);
      alert('Failed to upload National ID scan image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 ${
        isComplete
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : 'border-amber-500/50 bg-amber-500/5'
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          )}
          <span className="text-xs font-bold uppercase tracking-wider">
            National ID + Scanned ID Verification (Mandatory)
          </span>
        </div>
        <Badge
          variant="outline"
          className={
            isComplete
              ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]'
              : 'border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]'
          }
        >
          {isComplete ? 'Verified & Complete' : 'Required Before Save'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-input`} className="text-xs font-semibold flex items-center justify-between">
            <span>14-Digit National ID Number *</span>
            {natCheck.valid && natCheck.birthDate && (
              <span className="text-[10px] font-mono text-emerald-400">DOB: {natCheck.birthDate}</span>
            )}
          </Label>
          <Input
            id={`${idPrefix}-input`}
            type="text"
            maxLength={14}
            placeholder="29901011234567 (14 digits)"
            value={effectiveNatId}
            onChange={(e) => onNationalIdChange(e.target.value.replace(/\D/g, '').slice(0, 14))}
            className={`h-10 rounded-xl font-mono text-xs bg-background ${
              effectiveNatId && !natCheck.valid ? 'border-rose-500/70' : ''
            }`}
          />
          {!natCheck.valid && (
            <p className="text-[10px] text-rose-500 font-medium">{natCheck.error}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold flex items-center justify-between">
            <span>Scanned National ID Image *</span>
            {effectiveScanUrl && (
              <a
                href={effectiveScanUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
              >
                <Eye className="w-3 h-3" /> View ID Scan
              </a>
            )}
          </Label>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="image/*,.pdf"
              id={`${idPrefix}-file`}
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <Label
              htmlFor={`${idPrefix}-file`}
              className="flex-1 h-10 rounded-xl border border-dashed border-border bg-background hover:bg-muted/50 px-3 flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer transition-colors"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span>Uploading Scan...</span>
                </>
              ) : effectiveScanUrl ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-500">ID Scan Uploaded (Click to Replace)</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 text-amber-500" />
                  <span>Upload Scanned National ID</span>
                </>
              )}
            </Label>
          </div>
          {!effectiveScanUrl && (
            <p className="text-[10px] text-rose-500 font-medium">
              * Please upload a photo or scan of the member&apos;s National ID card.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

interface CorporateDealSelectorProps {
  companies: CorporateCompany[];
  selectedCompanyId: string;
  onSelectCompany: (company: CorporateCompany | null) => void;
  onOpenManager?: () => void;
}

export const CorporateDealSelector: React.FC<CorporateDealSelectorProps> = ({
  companies,
  selectedCompanyId,
  onSelectCompany,
  onOpenManager,
}) => {
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || null;

  return (
    <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" />
          Corporate Account / Partnership Deal (e.g. CIB)
        </Label>
        {onOpenManager && (
          <button
            type="button"
            onClick={onOpenManager}
            className="text-[11px] font-semibold text-indigo-400 hover:underline"
          >
            + Manage Companies
          </button>
        )}
      </div>

      <select
        value={selectedCompanyId || 'none'}
        onChange={(e) => {
          const val = e.target.value;
          if (val === 'none') {
            onSelectCompany(null);
          } else {
            const found = companies.find((c) => c.id === val) || null;
            onSelectCompany(found);
          }
        }}
        className="w-full h-10 rounded-xl border border-indigo-500/30 bg-background px-3 text-xs font-semibold"
      >
        <option value="none">— Standard Individual Rate (No Corporate Deal) —</option>
        {companies
          .filter((c) => c.active !== false)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.name} ({c.discountType === 'percentage' ? `${c.discountValue}% OFF` : `${c.discountValue} LE OFF`}
              {c.extraMonths > 0 ? ` + ${c.extraMonths} Free Mo` : ''}
              {c.extraFreezeDays > 0 ? ` + ${c.extraFreezeDays}d Freeze` : ''}
              {c.extraFreePtSessions > 0 ? ` + ${c.extraFreePtSessions} Free PT` : ''})
            </option>
          ))}
      </select>

      {selectedCompany && (
        <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-2.5 text-[11px] space-y-1">
          <div className="font-bold text-indigo-300">
            Active Corporate Benefits Applied Automatically ({selectedCompany.code}):
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedCompany.discountValue > 0 && (
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                Rate Discount: {selectedCompany.discountType === 'percentage' ? `${selectedCompany.discountValue}%` : `${selectedCompany.discountValue} LE`}
              </Badge>
            )}
            {(selectedCompany.extraMonths > 0 || selectedCompany.extraDays > 0) && (
              <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px]">
                +{selectedCompany.extraMonths > 0 ? `${selectedCompany.extraMonths} Free Month(s) ` : ''}
                {selectedCompany.extraDays > 0 ? `${selectedCompany.extraDays} Free Days` : ''} Added to Expiry
              </Badge>
            )}
            {selectedCompany.extraFreezeDays > 0 && (
              <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-[10px]">
                +{selectedCompany.extraFreezeDays} Extra Freeze Days
              </Badge>
            )}
            {selectedCompany.extraFreePtSessions > 0 && (
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">
                +{selectedCompany.extraFreePtSessions} Extra Free PT Sessions
              </Badge>
            )}
            {selectedCompany.extraInvitations > 0 && (
              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]">
                +{selectedCompany.extraInvitations} Extra Guest Invites
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
