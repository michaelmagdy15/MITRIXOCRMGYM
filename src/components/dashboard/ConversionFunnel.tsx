import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target, Activity, Zap, Terminal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ConversionFunnelProps {
  data: {
    stage: string;
    count: number;
  }[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-zinc-900/90 dark:bg-zinc-100/90 backdrop-blur-2xl border-none p-6 rounded-[32px] shadow-[0_30px_60px_rgba(0,0,0,0.4)] min-w-[220px] animate-in zoom-in-95">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400 dark:text-zinc-500 mb-4 italic">Stage: {label}</p>
                <div className="space-y-4">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary italic">Packet Volley</span>
                        <span className="text-3xl font-black tracking-tighter text-white dark:text-zinc-900 tabular-nums italic">
                            {payload[0].value.toLocaleString()} Units
                        </span>
                    </div>
                    <div className="h-[1px] w-full bg-white/10 dark:bg-black/10" />
                    <div className="flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-primary" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary italic leading-none">Operational Potential</span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

export function ConversionFunnel({ data }: ConversionFunnelProps) {
  return (
    <Card className="group relative border-none shadow-[0_30px_60px_rgba(0,0,0,0.1)] bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-[44px] overflow-hidden transition-all duration-700">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
      
      <CardHeader className="flex flex-row items-center justify-between p-12 pb-0">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
              <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Target className="h-3.5 w-3.5 text-primary" />
              </div>
              <Badge className="bg-primary/10 text-primary border-none font-black text-[9px] tracking-widest px-3 py-1 uppercase">Acquisition Intelligence</Badge>
          </div>
          <CardTitle className="text-4xl font-black tracking-tighter uppercase italic leading-none">
            Opportunity <span className="text-primary">Matrix</span>
          </CardTitle>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 italic">Lead to Member Pipeline Audit</p>
        </div>
        
        <div className="flex items-center gap-2 px-6 py-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-full border border-zinc-100 dark:border-zinc-800">
            <Activity className="h-3.5 w-3.5 text-primary animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-widest italic">Matrix Active</span>
        </div>
      </CardHeader>

      <CardContent className="p-10 pt-16">
        <div className="h-[400px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={data}
              margin={{ top: 10, right: 60, left: 40, bottom: 10 }}
              barGap={16}
            >
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="16 16" horizontal={true} vertical={false} stroke="currentColor" opacity={0.03} />
              <XAxis type="number" hide />
              <YAxis 
                type="category" 
                dataKey="stage" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 900, opacity: 0.3 }}
                width={100}
              />
              <Tooltip 
                content={<CustomTooltip />}
                cursor={{ fill: 'var(--primary)', opacity: 0.05 }}
              />
              <Bar 
                dataKey="count" 
                radius={[0, 20, 20, 0]}
                barSize={44}
                animationDuration={3000}
                animationEasing="cubic-bezier(0.16, 1, 0.3, 1)"
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill="url(#barGradient)"
                    fillOpacity={1 - (index * 0.15)} 
                    className="hover:filter hover:brightness-125 transition-all duration-300 cursor-pointer"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
