import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Terminal, TrendingUp, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface RevenueChartProps {
  data: {
    month: string;
    revenue: number;
    sessions: number;
  }[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-zinc-900/90 dark:bg-zinc-100/90 backdrop-blur-2xl border-none p-6 rounded-[32px] shadow-[0_30px_60px_rgba(0,0,0,0.4)] min-w-[200px] animate-in zoom-in-95">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400 dark:text-zinc-500 mb-4 italic">Period: {label}</p>
                <div className="space-y-4">
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary italic">Commercial Yield</span>
                        <span className="text-3xl font-black tracking-tighter text-white dark:text-zinc-900 tabular-nums italic">
                            {payload[0].value.toLocaleString()} LE
                        </span>
                    </div>
                    <div className="h-[1px] w-full bg-white/10 dark:bg-black/10" />
                    <div className="flex items-center gap-2">
                        <Activity className="h-3 w-3 text-emerald-500" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 italic leading-none">Status: Mission Success</span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

export function RevenueChart({ data }: RevenueChartProps) {
  return (
    <Card className="group relative border-none shadow-[0_30px_60px_rgba(0,0,0,0.1)] bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl rounded-[44px] overflow-hidden transition-all duration-700">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
      
      <CardHeader className="flex flex-row items-center justify-between p-12 pb-0">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
              <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="h-3.5 w-3.5 text-primary" />
              </div>
              <Badge className="bg-primary/10 text-primary border-none font-black text-[9px] tracking-widest px-3 py-1 uppercase">Fiscal Intelligence</Badge>
          </div>
          <CardTitle className="text-4xl font-black tracking-tighter uppercase italic leading-none">
            Commercial <span className="text-primary">Trajectory</span>
          </CardTitle>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 italic">High-Fidelity Performance Audit</p>
        </div>
        
        <div className="flex items-center gap-2 px-6 py-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-full border border-zinc-100 dark:border-zinc-800">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
            <span className="text-[9px] font-black uppercase tracking-widest italic">Live Feed</span>
        </div>
      </CardHeader>

      <CardContent className="p-8 pt-12">
        <div className="h-[420px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.6}/>
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="16 16" vertical={false} stroke="currentColor" opacity={0.03} />
              <XAxis 
                dataKey="month" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 900, opacity: 0.3 }}
                dy={15}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'currentColor', fontSize: 10, fontWeight: 900, opacity: 0.3 }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip 
                content={<CustomTooltip />}
                cursor={{ stroke: 'var(--primary)', strokeWidth: 2, strokeDasharray: '8 8' }}
              />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="var(--primary)" 
                strokeWidth={8}
                fillOpacity={1} 
                fill="url(#colorRevenue)" 
                animationDuration={3000}
                animationEasing="ease-out"
                activeDot={{ r: 12, strokeWidth: 4, stroke: 'white' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
