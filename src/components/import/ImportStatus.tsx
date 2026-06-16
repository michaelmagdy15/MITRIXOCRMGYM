import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, AlertCircle, Activity, Database, History, Terminal, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion } from 'motion/react';

export function ImportProgress({ progress }: { progress: number }) {
  return (
    <div className="py-24 flex flex-col items-center justify-center space-y-10">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full scale-150 animate-pulse" />
        <div className="relative h-24 w-24 rounded-[32px] bg-white dark:bg-zinc-900 shadow-2xl flex items-center justify-center border border-zinc-100 dark:border-zinc-800">
            <Activity className="h-10 w-10 text-primary animate-[spin_3s_linear_infinite]" />
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-16">{progress}%</span>
            </div>
        </div>
      </div>
      
      <div className="text-center w-full max-w-sm space-y-6">
        <div className="space-y-1">
            <p className="font-black text-3xl tracking-tighter uppercase italic">Synchronizing Records</p>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest animate-pulse italic">Establishing secure data handshake...</p>
        </div>
        <Progress value={progress} className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded-full shadow-inner" />
      </div>
    </div>
  );
}

interface ImportSummaryProps {
  stats: { success: number; failed: number; errors: { row: number; reason: string }[] };
  onClose: () => void;
}

export function ImportSummary({ stats, onClose }: ImportSummaryProps) {
  return (
    <div className="py-8 flex flex-col items-center justify-center space-y-10">
      <div className="relative">
        <div className="h-20 w-20 bg-emerald-500 rounded-[28px] flex items-center justify-center shadow-[0_20px_40px_rgba(16,185,129,0.3)] rotate-12 relative z-10">
            <CheckCircle2 className="h-10 w-10 text-white" />
        </div>
        <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full -z-10" />
      </div>

      <div className="text-center space-y-4">
        <p className="font-black text-4xl tracking-tighter uppercase italic">Archive Summary</p>
        <div className="flex items-center justify-center gap-12 pt-4">
            <div className="text-center space-y-1">
                <span className="block text-5xl font-black text-emerald-500 tracking-tighter italic">{stats.success}</span>
                <span className="text-[9px] text-zinc-400 uppercase font-black tracking-[4px]">Integrated</span>
            </div>
            <div className="h-12 w-[1px] bg-zinc-100 dark:bg-zinc-800" />
            <div className="text-center space-y-1">
                <span className="block text-5xl font-black text-rose-500 tracking-tighter italic">{stats.failed}</span>
                <span className="text-[9px] text-zinc-400 uppercase font-black tracking-[4px]">Interrupted</span>
            </div>
        </div>
      </div>
      
      {stats.errors.length > 0 && (
        <div className="w-full space-y-4">
          <div className="flex items-center gap-3 text-rose-500 px-2">
            <Terminal className="h-4 w-4" />
            <p className="font-black text-[10px] uppercase tracking-widest italic">Sequence Problem Log ({stats.errors.length.toString().padStart(2, '0')})</p>
          </div>
          <ScrollArea className="h-[200px] w-full rounded-[32px] border border-zinc-100 dark:border-zinc-800 p-8 bg-zinc-50/50 dark:bg-zinc-950/30">
            {stats.errors.map((err, i) => (
              <div key={i} className="flex gap-4 text-[10px] mb-4 pb-4 border-b border-zinc-100 dark:border-zinc-800 last:border-0 italic group">
                <span className="font-black text-rose-500 grayscale group-hover:grayscale-0 transition-all shrink-0 uppercase tracking-widest">Row_{err.row.toString().padStart(3, '0')}:</span> 
                <span className="font-bold text-zinc-500 uppercase tracking-tight">{err.reason}</span>
              </div>
            ))}
          </ScrollArea>
        </div>
      )}

      <Button 
        onClick={onClose} 
        className="w-full h-16 rounded-[24px] bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-black text-[11px] uppercase tracking-[6px] shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4 italic"
      >
        <ArrowLeft className="h-4 w-4" />
        Return to Command Center
      </Button>
    </div>
  );
}
