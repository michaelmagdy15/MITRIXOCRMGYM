import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon, TrendingUp, TrendingDown, Activity, Terminal } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  description?: string;
  color?: string;
}

export function KPICard({ title, value, icon: Icon, trend, description, color = 'primary' }: KPICardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="h-full"
    >
      <Card className="group relative h-full overflow-hidden border-none shadow-[0_30px_60px_rgba(0,0,0,0.1)] bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-[40px] transition-all duration-700">
        {/* Advanced Background Details */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
        <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full blur-[80px] opacity-10 group-hover:opacity-30 transition-opacity duration-1000 bg-primary" />
        
        <CardContent className="p-10 relative z-10 flex flex-col h-full justify-between space-y-8">
          <div className="flex items-start justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Terminal className="h-3 w-3 text-primary" />
                </div>
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.4em] italic leading-none">{title}</p>
              </div>
              
              <div className="space-y-1">
                <h3 className="text-6xl font-black tracking-tighter tabular-nums leading-none group-hover:scale-105 transition-transform duration-700 origin-left italic">
                    {typeof value === 'number' ? value.toLocaleString() : value}
                </h3>
              </div>
            </div>

            <div className="p-5 rounded-[24px] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xl shadow-primary/20 group-hover:rotate-[15deg] group-hover:scale-110 transition-all duration-700 ease-[0.16, 1, 0.3, 1]">
              <Icon className="w-6 h-6 stroke-[2.5]" />
            </div>
          </div>
          
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {trend && (
                        <div className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest italic",
                            trend.isPositive ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                        )}>
                            {trend.isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                            {trend.value}%
                        </div>
                    )}
                    {description && (
                        <div className="flex items-center gap-2">
                            <Activity className="h-3 w-3 text-zinc-300 animate-pulse" />
                            <p className="text-[9px] text-zinc-400 font-black uppercase tracking-widest italic opacity-60">
                                {description}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Tactical Progress Indicator */}
            <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden p-0.5">
                <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: trend?.isPositive ? '85%' : '40%' }}
                    transition={{ delay: 0.3, duration: 2, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full bg-primary rounded-full shadow-[0_0_15px_rgba(var(--primary),0.5)]" 
                />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
