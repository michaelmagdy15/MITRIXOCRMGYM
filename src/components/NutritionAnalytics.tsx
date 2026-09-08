import React, { useMemo } from 'react';
import { NutritionAppointment } from '../types/nutrition';
import { Users, CheckCircle, Clock, XCircle, TrendingUp } from 'lucide-react';

interface NutritionAnalyticsProps {
  appointments: NutritionAppointment[];
}

export default function NutritionAnalytics({ appointments }: NutritionAnalyticsProps) {
  const stats = useMemo(() => {
    const total = appointments.length;
    const completed = appointments.filter(a => a.status === 'Completed').length;
    const scheduled = appointments.filter(a => a.status === 'Scheduled').length;
    const noShow = appointments.filter(a => a.status === 'No-show').length;
    const cancelled = appointments.filter(a => a.status === 'Cancelled').length;
    
    // Very basic attendance rate (completed / (completed + noShow))
    const attendanceRate = completed + noShow > 0 
      ? Math.round((completed / (completed + noShow)) * 100) 
      : 0;

    // Follow up rate - proportion of completed appointments that had a consultation notes added
    // (This requires fetching consultations, but for MVP we approximate or show placeholder)
    
    return {
      total,
      completed,
      scheduled,
      noShow,
      cancelled,
      attendanceRate
    };
  }, [appointments]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Appointments</p>
              <h3 className="text-3xl font-bold mt-1">{stats.total}</h3>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-lg text-blue-500">
              <Users className="h-6 w-6" />
            </div>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <span className="text-blue-500 font-medium">{stats.scheduled}</span> upcoming
          </div>
        </div>

        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Completed</p>
              <h3 className="text-3xl font-bold mt-1">{stats.completed}</h3>
            </div>
            <div className="p-3 bg-green-500/10 rounded-lg text-green-500">
              <CheckCircle className="h-6 w-6" />
            </div>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <span className="text-green-500 font-medium">{stats.attendanceRate}%</span> attendance rate
          </div>
        </div>

        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">No Shows</p>
              <h3 className="text-3xl font-bold mt-1">{stats.noShow}</h3>
            </div>
            <div className="p-3 bg-orange-500/10 rounded-lg text-orange-500">
              <XCircle className="h-6 w-6" />
            </div>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <span className="text-orange-500 font-medium">Missed</span> sessions
          </div>
        </div>

        <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Follow-up Rate</p>
              <h3 className="text-3xl font-bold mt-1">--%</h3>
            </div>
            <div className="p-3 bg-purple-500/10 rounded-lg text-purple-500">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            Consultations recorded
          </div>
        </div>

      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold mb-4">Recent Activity</h2>
        {appointments.slice(0, 5).map(app => (
          <div key={app.id} className="flex justify-between items-center py-3 border-b border-border last:border-0">
            <div>
              <p className="font-medium">{app.clientName}</p>
              <p className="text-xs text-muted-foreground">with Dr. {app.nutritionistName} on {app.date}</p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
              app.status === 'Completed' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
              app.status === 'Scheduled' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
              app.status === 'Cancelled' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
              app.status === 'No-show' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
              'bg-gray-500/10 text-gray-500 border-gray-500/20'
            }`}>
              {app.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
