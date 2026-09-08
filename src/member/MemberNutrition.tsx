import React, { useState } from 'react';
import { useNutrition } from '../hooks/useNutrition';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Clock, User, CheckCircle, Search, FileText } from 'lucide-react';

export default function MemberNutrition() {
  const { appointments, profiles, loading, addAppointment, updateAppointment } = useNutrition();
  const { currentUser } = useAuth();
  
  const [activeTab, setActiveTab] = useState<'upcoming' | 'book' | 'history'>('upcoming');
  const [selectedNutritionist, setSelectedNutritionist] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');

  if (loading) {
    return <div className="p-8 flex justify-center items-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  // Filter to only show the current user's appointments
  const myAppointments = appointments.filter(app => app.clientId === currentUser?.clientDocId || app.clientId === currentUser?.id);
  
  const upcomingAppointments = myAppointments.filter(app => app.status === 'Scheduled');
  const pastAppointments = myAppointments.filter(app => ['Completed', 'No-show', 'Cancelled'].includes(app.status));

  const handleBook = async () => {
    if (!selectedNutritionist || !selectedDate || !currentUser) return;
    
    const profile = profiles.find(p => p.id === selectedNutritionist);
    if (!profile) return;

    try {
      await addAppointment({
        clientId: currentUser.clientDocId || currentUser.id,
        clientName: currentUser.name,
        nutritionistId: profile.userId,
        nutritionistName: profile.name,
        date: selectedDate,
        startTime: "10:00", // Hardcoded for MVP, in a real app this would be selected from available slots
        endTime: "10:45",
        status: 'Scheduled',
        paymentStatus: 'pending' // Defaulting to pending for MVP
      });
      alert('Appointment booked successfully!');
      setActiveTab('upcoming');
      setSelectedNutritionist('');
      setSelectedDate('');
    } catch (error) {
      console.error("Failed to book appointment", error);
      alert('Failed to book appointment. Please try again.');
    }
  };

  const handleCancel = async (id: string) => {
    if (window.confirm('Are you sure you want to cancel this appointment?')) {
      try {
        await updateAppointment(id, { status: 'Cancelled' });
      } catch (error) {
        console.error("Failed to cancel appointment", error);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex bg-card p-1 rounded-lg border border-border w-max">
        <button
          onClick={() => setActiveTab('upcoming')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'upcoming' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          Upcoming
        </button>
        <button
          onClick={() => setActiveTab('book')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'book' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          Book Appointment
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'history' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          History
        </button>
      </div>

      {activeTab === 'upcoming' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {upcomingAppointments.length === 0 ? (
            <div className="col-span-full p-8 text-center bg-card border border-border rounded-xl">
              <p className="text-muted-foreground">You have no upcoming nutrition appointments.</p>
              <button 
                onClick={() => setActiveTab('book')}
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium"
              >
                Book Now
              </button>
            </div>
          ) : (
            upcomingAppointments.map(app => (
              <div key={app.id} className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-blue-500/10 text-blue-500 border-blue-500/20">
                    {app.status}
                  </span>
                </div>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{app.date}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{app.startTime} - {app.endTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Dr. {app.nutritionistName}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-border flex justify-end">
                  <button 
                    onClick={() => handleCancel(app.id)}
                    className="text-red-500 hover:text-red-600 text-sm font-medium transition-colors"
                  >
                    Cancel Appointment
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'book' && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-xl">
          <h2 className="text-xl font-bold mb-6">Book Nutrition Consultation</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Select Nutritionist</label>
              <select 
                value={selectedNutritionist}
                onChange={(e) => setSelectedNutritionist(e.target.value)}
                className="w-full p-2.5 bg-background border border-input rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
              >
                <option value="">-- Choose a specialist --</option>
                {profiles.filter(p => p.active).map(p => (
                  <option key={p.id} value={p.id}>Dr. {p.name}</option>
                ))}
              </select>
            </div>

            {selectedNutritionist && (
              <div>
                <label className="block text-sm font-medium mb-1">Select Date</label>
                <input 
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full p-2.5 bg-background border border-input rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                />
              </div>
            )}

            <button
              onClick={handleBook}
              disabled={!selectedNutritionist || !selectedDate}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-bold disabled:opacity-50 transition-opacity mt-4"
            >
              Confirm Booking
            </button>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {pastAppointments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No consultation history found.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pastAppointments.map(app => (
                <div key={app.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-muted/50 transition-colors">
                  <div>
                    <div className="font-semibold">{app.date} at {app.startTime}</div>
                    <div className="text-sm text-muted-foreground">Dr. {app.nutritionistName}</div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                    app.status === 'Completed' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                    app.status === 'Cancelled' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                    'bg-orange-500/10 text-orange-500 border-orange-500/20'
                  }`}>
                    {app.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
