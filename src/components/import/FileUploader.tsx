import React from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Upload, Loader2, CheckCircle2, LinkIcon, AlertCircle, Database, LayoutGrid, Terminal, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploaderProps {
  file: File | null;
  url: string;
  isLoading: boolean;
  error: string | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUrlChange: (url: string) => void;
  onFetchUrl: () => void;
  onSmartImport: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export function FileUploader({
  file,
  url,
  isLoading,
  error,
  onFileChange,
  onUrlChange,
  onFetchUrl,
  onSmartImport,
  fileInputRef
}: FileUploaderProps) {
  return (
    <div className="space-y-10 py-4">
      <div 
        className={cn(
            "group relative flex flex-col items-center justify-center border-4 border-dashed rounded-[32px] p-12 space-y-6 transition-all duration-500 overflow-hidden",
            file ? "border-emerald-500/50 bg-emerald-500/5" : "border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 hover:border-primary/50"
        )}
      >
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
        
        <div className={cn(
            "h-20 w-20 rounded-[28px] flex items-center justify-center shadow-2xl transition-all duration-700 group-hover:scale-110 group-hover:rotate-12",
            file ? "bg-emerald-500 text-white shadow-emerald-500/20" : "bg-white dark:bg-zinc-800 text-zinc-400"
        )}>
            {file ? <CheckCircle2 className="h-10 w-10" /> : <Upload className="h-10 w-10" />}
        </div>

        <div className="text-center space-y-1">
          <p className="font-black text-2xl tracking-tighter uppercase italic">Local Archive Ingest</p>
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-relaxed">Select specialized CSV matrix to begin sequence</p>
        </div>

        <input 
          type="file" 
          accept=".csv" 
          className="hidden" 
          ref={fileInputRef}
          onChange={onFileChange}
        />

        <div className="flex gap-4">
          <Button 
            onClick={() => fileInputRef.current?.click()} 
            variant="outline" 
            className="h-14 px-8 rounded-2xl font-black text-[10px] uppercase tracking-widest border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:bg-zinc-50 transition-all active:scale-95"
          >
            {file ? 'Replace Archive' : 'Identify File'}
          </Button>
          <Button 
            onClick={onSmartImport} 
            disabled={!file || isLoading}
            className="h-14 px-8 rounded-2xl bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-emerald-500/30 hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-20"
          >
            {isLoading ? <Activity className="h-4 w-4 animate-spin mr-3" /> : <Database className="h-4 w-4 mr-3" />}
            Smart Ingest
          </Button>
        </div>
        
        {file && (
            <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-500 py-2 px-4 rounded-full border border-emerald-500/20">
                <Terminal className="h-3 w-3" />
                <span className="text-[9px] font-black uppercase tracking-widest">{file.name} (READY)</span>
            </div>
        )}
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-zinc-100 dark:border-zinc-800" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white dark:bg-zinc-900 px-6 font-black text-[9px] uppercase tracking-[6px] text-zinc-400 italic">External Link Injection</span>
        </div>
      </div>

      <div className="space-y-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <Label htmlFor="url" className="text-[10px] font-black uppercase tracking-widest text-zinc-400 italic">Cloud Vector Location (Spreadsheets)</Label>
            <div className="h-1 w-12 bg-primary/20 rounded-full" />
          </div>
          
          <div className="flex gap-3">
            <Input 
              id="url"
              placeholder="https://docs.google.com/spreadsheets/d/.../edit" 
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              className="h-16 flex-1 bg-zinc-50 dark:bg-zinc-950 border-none rounded-2xl px-6 font-black text-xs text-zinc-500 focus:text-zinc-900 dark:focus:text-emerald-400 transition-all"
            />
            <Button 
                onClick={onFetchUrl} 
                disabled={!url || isLoading} 
                variant="outline"
                className="h-16 w-32 rounded-2xl font-black text-[10px] uppercase tracking-widest border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm active:scale-95 transition-all"
            >
              {isLoading ? <Activity className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
              <span className="ml-3">Scan</span>
            </Button>
            <Button 
              onClick={onSmartImport} 
              disabled={!url || isLoading}
              className="h-16 px-8 rounded-2xl bg-emerald-500 text-white font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-emerald-500/30 hover:bg-emerald-600 transition-all active:scale-95"
            >
              {isLoading ? <Activity className="h-4 w-4 animate-spin" /> : <LayoutGrid className="h-4 w-4" />}
              <span className="ml-3">Ingest</span>
            </Button>
          </div>
          <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800 flex gap-4">
            <div className="h-5 w-5 rounded bg-primary/10 flex items-center justify-center shrink-0">
                <Terminal className="h-3 w-3 text-primary" />
            </div>
            <p className="text-[9px] font-bold text-zinc-500 leading-relaxed uppercase tracking-widest italic">
                Protocol: Go to <span className="text-zinc-900 dark:text-zinc-100">File &gt; Share &gt; Publish to web</span>, configure <span className="text-zinc-900 dark:text-zinc-100">CSV Export</span>, and provide the resulting link vector.
            </p>
          </div>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-4 text-rose-600 bg-rose-500/5 dark:bg-rose-500/10 p-6 rounded-2xl border border-rose-500/20"
          >
            <AlertCircle className="h-6 w-6 shrink-0" />
            <p className="text-[10px] font-black uppercase tracking-widest italic">{error}</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
