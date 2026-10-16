import React, { useState, useRef } from 'react';
import { Client, ClientDocument } from '../../types';
import { storage, getTenantId } from '../../firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { safeFormatDate } from '../../utils/dateUtils';
import { addAuditLog } from '../../services/auditService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '../ConfirmDialog';
import {
  Upload,
  FileCheck,
  FileText,
  ExternalLink,
  Trash2,
  Loader2,
  Link as LinkIcon,
  HardDrive,
  X,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

export interface MemberDocumentUploaderProps {
  client: Client;
  onUpdateClient: (id: string, updates: Partial<Client>) => Promise<void>;
}

const PRESET_DOC_NAMES = [
  'National ID Copy',
  'Signed Contract',
  'Medical Report',
  'Corporate ID / Proof',
];

export function MemberDocumentUploader({
  client,
  onUpdateClient,
}: {
  client: Client;
  onUpdateClient: (id: string, updates: Partial<Client>) => Promise<void>;
}) {
  const [uploadMode, setUploadMode] = useState<'device' | 'url'>('device');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docName, setDocName] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteTargetDoc, setDeleteTargetDoc] = useState<ClientDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const stripExtension = (filename: string): string => {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot <= 0) return filename;
    return filename.substring(0, lastDot).replace(/[_-]+/g, ' ').trim();
  };

  const handleFileSelection = (file: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    if (!docName.trim()) {
      setDocName(stripExtension(file.name) || file.name);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    handleFileSelection(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0] || null;
    if (file) {
      setUploadMode('device');
      handleFileSelection(file);
    }
  };

  const handleClearSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (uploadMode === 'device') {
      if (!selectedFile) {
        toast.error('Please select a file from your device to upload.');
        return;
      }
    } else {
      if (!externalUrl.trim()) {
        toast.error('Please enter a valid external document URL.');
        return;
      }
    }

    const finalDocName =
      docName.trim() ||
      (selectedFile ? stripExtension(selectedFile.name) || selectedFile.name : 'Attached Document');

    setIsUploading(true);
    try {
      let resolvedUrl = externalUrl.trim();

      if (uploadMode === 'device' && selectedFile) {
        const file = selectedFile;
        const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
        const fileRef = storageRef(
          storage,
          `tenants/${getTenantId()}/member_documents/${client.id}/${crypto.randomUUID()}_${safeName}`
        );
        await uploadBytes(fileRef, file, {
          contentType: file.type || 'application/octet-stream',
        });
        resolvedUrl = await getDownloadURL(fileRef);
      }

      const newDoc: ClientDocument = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: finalDocName,
        url: resolvedUrl,
        uploadDate: new Date().toISOString(),
      };

      const existingDocs = Array.isArray(client.documents) ? client.documents : [];
      const updatedDocs = [...existingDocs, newDoc];

      await onUpdateClient(client.id, { documents: updatedDocs });

      await addAuditLog(
        'UPDATE',
        'CLIENT',
        client.id,
        `Uploaded member document "${finalDocName}" (${uploadMode === 'device' ? 'Local Device Upload' : 'External URL'}) for ${client.name}`,
        undefined,
        {
          diff: [
            {
              field: 'documents',
              oldValue: existingDocs.map((d) => d.name),
              newValue: updatedDocs.map((d) => d.name),
            },
          ],
          branch: client.branch,
        }
      );

      toast.success(`Document "${finalDocName}" uploaded successfully.`);
      setSelectedFile(null);
      setDocName('');
      setExternalUrl('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('Error uploading member document:', error);
      toast.error(error?.message || 'Failed to upload document. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetDoc) return;
    setIsDeleting(true);
    try {
      const existingDocs = Array.isArray(client.documents) ? client.documents : [];
      const updatedDocs = existingDocs.filter((d) => d.id !== deleteTargetDoc.id);

      await onUpdateClient(client.id, { documents: updatedDocs });

      await addAuditLog(
        'UPDATE',
        'CLIENT',
        client.id,
        `Deleted member document "${deleteTargetDoc.name}" from ${client.name}`,
        undefined,
        {
          diff: [
            {
              field: 'documents',
              oldValue: existingDocs.map((d) => d.name),
              newValue: updatedDocs.map((d) => d.name),
            },
          ],
          branch: client.branch,
        }
      );

      toast.success(`Document "${deleteTargetDoc.name}" deleted.`);
      setDeleteTargetDoc(null);
    } catch (error: any) {
      console.error('Error deleting member document:', error);
      toast.error(error?.message || 'Failed to delete document.');
    } finally {
      setIsDeleting(false);
    }
  };

  const documents = Array.isArray(client.documents) ? client.documents : [];

  return (
    <div className="space-y-6 text-left">
      {/* Upload Card */}
      <form
        onSubmit={handleUploadSubmit}
        className="bg-muted/10 border border-border rounded-xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-primary" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              {uploadMode === 'device' ? 'Upload File from Device' : 'Attach External Document URL'}
            </h4>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setUploadMode((prev) => (prev === 'device' ? 'url' : 'device'))}
            className="h-7 text-xs text-muted-foreground hover:text-primary"
          >
            {uploadMode === 'device' ? (
              <>
                <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                Or attach external URL
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Upload File from Device
              </>
            )}
          </Button>
        </div>

        {/* Document Name Input & Quick Presets */}
        <div className="space-y-2">
          <Label htmlFor={`doc-name-${client.id}`} className="text-xs font-semibold">
            Document Name <span className="text-muted-foreground font-normal">(auto-fills from file if left blank)</span>
          </Label>
          <Input
            id={`doc-name-${client.id}`}
            type="text"
            placeholder="e.g., National ID Copy, Signed Contract, Medical Report"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            disabled={isUploading}
            className="h-9 text-xs"
          />
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[10px] text-muted-foreground mr-1">Quick presets:</span>
            {PRESET_DOC_NAMES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDocName(preset)}
                className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Device File Picker / Dropzone vs External URL */}
        {uploadMode === 'device' ? (
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
              onChange={handleFileInputChange}
              className="hidden"
            />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                isDragging
                  ? 'border-primary bg-primary/10'
                  : selectedFile
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/20'
              }`}
            >
              {selectedFile ? (
                <div className="flex items-center justify-between gap-3 max-w-md mx-auto text-left">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <FileCheck className="h-6 w-6 text-emerald-500 shrink-0" />
                    <div className="overflow-hidden">
                      <p className="text-xs font-bold text-foreground truncate">
                        {selectedFile.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearSelection();
                    }}
                    disabled={isUploading}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    title="Clear selected file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1.5">
                  <Upload className="h-7 w-7 text-primary/80" />
                  <p className="text-xs font-semibold text-foreground">
                    Upload File from Device
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Drag and drop a file here, or click to browse local storage
                  </p>
                  <p className="text-[10px] text-muted-foreground/80">
                    Supported: PDF, DOC, DOCX, JPG, PNG, WEBP
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={`doc-url-${client.id}`} className="text-xs font-semibold">
              External Document URL
            </Label>
            <Input
              id={`doc-url-${client.id}`}
              type="url"
              placeholder="https://..."
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              disabled={isUploading}
              className="h-9 text-xs"
            />
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            size="sm"
            disabled={
              isUploading ||
              (uploadMode === 'device' ? !selectedFile : !externalUrl.trim())
            }
            className="text-xs font-bold"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                {uploadMode === 'device' ? 'Upload Document' : 'Attach Link'}
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Uploaded Documents Grid / List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Uploaded Documents
            </h4>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {documents.length} {documents.length === 1 ? 'file' : 'files'}
          </Badge>
        </div>

        {documents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="bg-muted/10 p-3.5 rounded-xl border border-border flex items-center justify-between gap-3 hover:border-border/80 transition-colors"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <FileCheck className="h-5 w-5 text-primary shrink-0" />
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-foreground truncate" title={doc.name}>
                      {doc.name}
                    </p>
                    <span className="text-[10px] text-muted-foreground block">
                      {safeFormatDate(doc.uploadDate, 'dd MMM yyyy')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => window.open(doc.url, '_blank')}
                    className="h-7 px-2 text-xs text-primary hover:text-primary/80"
                    title="View / Download Document"
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    View
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTargetDoc(doc)}
                    disabled={isDeleting}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    title="Delete Document"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-muted/5 p-8 rounded-xl border border-dashed border-border text-center text-muted-foreground text-xs">
            No files or contracts uploaded for this member yet.
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteTargetDoc)}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetDoc(null);
        }}
        title="Delete Member Document"
        description={
          deleteTargetDoc
            ? `Are you sure you want to remove "${deleteTargetDoc.name}" from ${client.name}'s profile?`
            : 'Are you sure you want to delete this document?'
        }
        confirmText="Delete Document"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

export default MemberDocumentUploader;
