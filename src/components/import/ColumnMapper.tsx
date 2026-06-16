import React from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Check, AlertCircle, Database, LayoutGrid, Terminal, Activity, ArrowRight } from 'lucide-react';

interface ColumnMapperProps {
  fields: { key: string; label: string; required?: boolean }[];
  headers: string[];
  mapping: Record<string, string>;
  onMappingChange: (key: string, value: string) => void;
  onStartImport: () => void;
  onBack: () => void;
  rowCount: number;
}

export function ColumnMapper({
  fields,
  headers,
  mapping,
  onMappingChange,
  onStartImport,
  onBack,
  rowCount
}: ColumnMapperProps) {
  const isMissingRequired = fields.some(f => f.required && !mapping[f.key]);

  return (
    <div className="space-y-8 py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
            <div className="h-4 w-4 rounded bg-primary/20 flex items-center justify-center">
                <LayoutGrid className="h-2.5 w-2.5 text-primary" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[4px] text-zinc-400 italic">Target Field Synch</p>
        </div>
        <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest text-primary border border-zinc-200 dark:border-zinc-700">
          {rowCount.toString().padStart(3, '0')} Packets Detected
        </div>
      </div>
      
      <div className="space-y-3 max-h-[450px] overflow-y-auto pr-4 custom-scrollbar">
        {fields.map(field => (
          <div 
            key={field.key} 
            className="flex flex-col space-y-4 p-6 rounded-[24px] border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/30 transition-all hover:bg-white dark:hover:bg-zinc-900 shadow-sm group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                    "h-2 w-2 rounded-full",
                    mapping[field.key] ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : field.required ? "bg-rose-500 animate-pulse" : "bg-zinc-300"
                )} />
                <Label className="font-black text-[11px] uppercase tracking-widest flex items-center italic">
                    {field.label}
                    {field.required && <span className="text-rose-500 ml-2 text-[8px] font-black tracking-tighter">[CRITICAL]</span>}
                </Label>
              </div>
              
              {mapping[field.key] ? (
                <div className="flex items-center gap-1.5 text-emerald-500">
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                    <span className="text-[8px] font-black uppercase tracking-widest">Matched</span>
                </div>
              ) : field.required ? (
                <div className="flex items-center gap-1.5 text-rose-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span className="text-[8px] font-black uppercase tracking-widest italic">Action Required</span>
                </div>
              ) : null}
            </div>

            <Select 
              value={mapping[field.key] || 'none'} 
              onValueChange={(val) => val && onMappingChange(field.key, val === 'none' ? '' : val)}
            >
              <SelectTrigger className="h-12 bg-white dark:bg-zinc-900 border-none rounded-xl font-black text-[10px] uppercase tracking-widest px-6 italic transition-all group-hover:shadow-md">
                <SelectValue placeholder="Identify Source Column..." />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-2xl">
                <SelectItem value="none" className="font-black text-[10px] uppercase p-4 italic opacity-40">Omit Field</SelectItem>
                {headers.map(h => (
                  <SelectItem key={h} value={h} className="font-black text-[10px] uppercase p-4 italic">{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="flex gap-4 pt-6">
        <Button 
            variant="ghost" 
            onClick={onBack} 
            className="h-16 px-10 rounded-2xl font-black text-[10px] uppercase tracking-widest text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all"
        >
            Abort
        </Button>
        <Button 
          className="h-16 flex-1 bg-emerald-500 hover:bg-emerald-600 text-white shadow-[0_20px_40px_rgba(16,185,129,0.2)] rounded-3xl font-black text-[10px] uppercase tracking-[4px] active:scale-95 transition-all group disabled:opacity-20 flex items-center justify-center gap-4 italic" 
          onClick={onStartImport}
          disabled={isMissingRequired}
        >
          {isMissingRequired ? (
              <>
                <AlertCircle className="h-5 w-5 opacity-40" />
                Awaiting Critical Fields
              </>
          ) : (
              <>
                Begin Sequence Injection
                <ArrowRight className="h-5 w-5 group-hover:translate-x-2 transition-transform" />
              </>
          )}
        </Button>
      </div>
    </div>
  );
}

// Helper since it wasn't imported
function cn(...inputs: any[]) {
    return inputs.filter(Boolean).join(' ');
}
