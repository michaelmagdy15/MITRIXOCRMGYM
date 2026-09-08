import React, { useState } from 'react';
import { useNutrition } from './hooks/useNutrition';
import { useAuth } from './contexts/AuthContext';
import { Calendar, Clock, User, CheckCircle, XCircle, Search, Activity, FileText } from 'lucide-react';
import NutritionAnalytics from './components/NutritionAnalytics';

export default function NutritionModule() {
  const { appointments, profiles, loading, updateAppointment } = useNutrition();
  const { currentUser, isSuperUser } = useAuth();
  const isManagerOrSama = isSuperUser || currentUser?.role === 'manager' || currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || currentUser?.role === 'crm_admin' || currentUser?.name?.toLowerCase().includes('sama');
  const [activeTab, setActiveTab] = useState<'appointments' | 'nutritionists' | 'analytics'>('appointments');
  const [searchTerm, setSearchTerm] = useState('');

  if (loading) {
    return <div className="p-8 flex justify-center items-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  const filteredAppointments = appointments.filter(app => 
    app.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.nutritionistName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStatusChange = async (id: string, newStatus: any) => {
    try {
      await updateAppointment(id, { status: newStatus });
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold font-logo text-primary tracking-wide">NUTRITION</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage consultations and nutritionist schedules</p>
        </div>

        <div className="flex bg-card p-1 rounded-lg border border-border">
          <button
            onClick={() => setActiveTab('appointments')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'appointments' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            Appointments
          </button>
          {isManagerOrSama && (
            <button
              onClick={() => setActiveTab('nutritionists')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'nutritionists' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              Nutritionists
            </button>
          )}
          {isManagerOrSama && (
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'analytics' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
              }`}
            >
              Analytics
            </button>
          )}
        </div>
      </div>

      {activeTab === 'appointments' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between gap-4 bg-card p-4 rounded-xl border border-border">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search appointments by client or nutritionist..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-background border border-input rounded-lg focus:ring-2 focus:ring-primary/50 outline-none transition-all text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAppointments.length === 0 ? (
              <div className="col-span-full p-8 text-center bg-card border border-border rounded-xl">
                <p className="text-muted-foreground">No appointments found.</p>
              </div>
            ) : (
              filteredAppointments.map(app => (
                <div key={app.id} className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-colors shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                      app.status === 'Completed' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                      app.status === 'Scheduled' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                      app.status === 'Cancelled' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                      app.status === 'No-show' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                      'bg-gray-500/10 text-gray-500 border-gray-500/20'
                    }`}>
                      {app.status}
                    </span>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground font-medium">{app.date}</div>
                      <div className="text-sm font-bold">{app.startTime}</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{app.clientName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Dr. {app.nutritionistName}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border flex gap-2 justify-end">
                    {app.status === 'Scheduled' && (
                      <>
                        <button 
                          onClick={() => handleStatusChange(app.id, 'Completed')}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-md text-xs font-medium transition-colors"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          Complete
                        </button>
                        <button 
                          onClick={() => handleStatusChange(app.id, 'No-show')}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 rounded-md text-xs font-medium transition-colors"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          No-show
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'nutritionists' && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4">Nutritionist Roster</h2>
          {profiles.length === 0 ? (
            <p className="text-muted-foreground text-sm">No nutritionists registered yet.</p>
          ) : (
            <div className="space-y-4">
              {profiles.map(p => (
                <div key={p.id} className="flex justify-between items-center p-4 bg-background border border-border rounded-lg">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {p.name}
                      <span className={`h-2 w-2 rounded-full ${p.active ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {p.specialties?.join(', ')}
                    </div>
                  </div>
                  <button className="px-3 py-1.5 border border-input hover:bg-muted rounded-md text-xs font-medium transition-colors">
                    Edit Schedule
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'analytics' && (
        <NutritionAnalytics appointments={appointments} />
      )}
    </div>
  );
}
