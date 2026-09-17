import React, { useState, useEffect, useMemo } from 'react';
import { useNutrition } from '../hooks/useNutrition';
import { useAuth } from '../contexts/AuthContext';
import {
  Calendar,
  Clock,
  User,
  CheckCircle,
  XCircle,
  FileText,
  Plus,
  Scale,
  Flame,
  Dumbbell,
  HeartPulse,
  ArrowRight,
  Check,
  AlertCircle,
  Sparkles,
  Info
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { toast } from 'sonner';
import {
  NutritionAppointment,
  NutritionConsultation,
  NutritionistProfile,
  BodyMetrics
} from '../types/nutrition';
import { Client } from '../types';

interface MemberNutritionProps {
  client?: Client | null;
}

type MemberNutritionTab = 'overview' | 'upcoming' | 'book' | 'history';

export default function MemberNutrition({ client }: MemberNutritionProps) {
  const {
    appointments,
    profiles,
    loading,
    bookAppointment,
    updateAppointmentStatus,
    fetchClientConsultations
  } = useNutrition();

  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<MemberNutritionTab>('overview');

  // Resolved Client ID and Name
  const resolvedClientId = client?.id || currentUser?.clientDocId || currentUser?.clientRecordId || currentUser?.id || '';
  const resolvedClientName = client?.name || currentUser?.name || 'Member';

  // State for member consultation history (metrics & clinical feedback)
  const [consultationHistory, setConsultationHistory] = useState<NutritionConsultation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Booking Form State
  const [selectedNutritionistId, setSelectedNutritionistId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [clientGoals, setClientGoals] = useState<string>('');
  const [bookingLoading, setBookingLoading] = useState<boolean>(false);

  // Completed Checklist State (local state persisted in component session)
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({});

  // Cancel Appointment Confirmation Modal State
  const [cancelModalAppointment, setCancelModalAppointment] = useState<NutritionAppointment | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('');
  const [cancelling, setCancelling] = useState(false);

  // Load client consultations on mount and when resolvedClientId changes
  useEffect(() => {
    if (!resolvedClientId) {
      setLoadingHistory(false);
      return;
    }

    setLoadingHistory(true);
    fetchClientConsultations(resolvedClientId)
      .then((history) => {
        setConsultationHistory(history);
      })
      .catch((err) => {
        console.error("Error fetching member consultation history:", err);
      })
      .finally(() => {
        setLoadingHistory(false);
      });
  }, [resolvedClientId, fetchClientConsultations]);

  // Filter appointments for this member
  const myAppointments = useMemo(() => {
    return appointments.filter(
      (app) =>
        app.clientId === resolvedClientId ||
        (client?.memberId && app.clientId === client.memberId) ||
        (currentUser?.id && app.clientId === currentUser.id)
    );
  }, [appointments, resolvedClientId, client?.memberId, currentUser?.id]);

  const upcomingAppointments = useMemo(() => {
    return myAppointments.filter((app) => app.status === 'Scheduled' || app.status === 'Rescheduled');
  }, [myAppointments]);

  const pastAppointments = useMemo(() => {
    return myAppointments.filter((app) => ['Completed', 'No-show', 'Cancelled'].includes(app.status));
  }, [myAppointments]);

  // Active nutritionist profiles
  const activeProfiles = useMemo(() => {
    return profiles.filter((p) => p.active);
  }, [profiles]);

  // Selected Nutritionist Object
  const selectedNutritionist = useMemo(() => {
    return activeProfiles.find((p) => p.userId === selectedNutritionistId || p.id === selectedNutritionistId);
  }, [activeProfiles, selectedNutritionistId]);

  // Calculate available time slots for the chosen date and nutritionist
  const availableSlots = useMemo(() => {
    if (!selectedNutritionist || !selectedDate) return [];

    const dateObj = new Date(selectedDate + 'T00:00:00');
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[dateObj.getDay()] ?? '';

    const daySchedule = selectedNutritionist.schedule ? selectedNutritionist.schedule[dayOfWeek] : null;

    let startTimeStr = '10:00';
    let endTimeStr = '18:00';
    let duration = 45;

    if (daySchedule && daySchedule.enabled) {
      startTimeStr = daySchedule.startTime || '10:00';
      endTimeStr = daySchedule.endTime || '18:00';
      duration = daySchedule.appointmentDuration || 45;
    } else if (daySchedule && !daySchedule.enabled) {
      // Nutritionist does not work on this day
      return [];
    }

    // Parse start and end time in minutes
    const parseMinutes = (t: string) => {
      const parts = t.split(':').map((p) => parseInt(p, 10));
      const hours = parts[0] ?? 0;
      const mins = parts[1] ?? 0;
      return hours * 60 + mins;
    };

    const formatMinutes = (m: number) => {
      const h = Math.floor(m / 60);
      const min = m % 60;
      return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    };

    const startMins = parseMinutes(startTimeStr);
    const endMins = parseMinutes(endTimeStr);

    const slots: { start: string; end: string; booked: boolean }[] = [];

    // Find any already booked appointments for this nutritionist on this date
    const bookedOnDate = appointments.filter(
      (a) =>
        a.nutritionistId === selectedNutritionist.userId &&
        a.date === selectedDate &&
        (a.status === 'Scheduled' || a.status === 'Rescheduled' || a.status === 'Completed')
    );

    for (let current = startMins; current + duration <= endMins; current += duration) {
      const slotStart = formatMinutes(current);
      const slotEnd = formatMinutes(current + duration);

      const isBooked = bookedOnDate.some(
        (b) => b.startTime === slotStart || (b.startTime < slotEnd && b.endTime > slotStart)
      );

      slots.push({
        start: slotStart,
        end: slotEnd,
        booked: isBooked
      });
    }

    return slots;
  }, [selectedNutritionist, selectedDate, appointments]);

  // Handle Booking
  const handleConfirmBooking = async () => {
    if (!selectedNutritionist || !selectedDate || !selectedSlot) {
      toast.error('Please choose a nutritionist, date, and time slot.');
      return;
    }

    setBookingLoading(true);
    try {
      await bookAppointment({
        clientId: resolvedClientId,
        clientName: resolvedClientName,
        clientPhone: client?.phone || currentUser?.phone || '',
        clientEmail: client?.email || currentUser?.email || '',
        nutritionistId: selectedNutritionist.userId,
        nutritionistName: selectedNutritionist.name,
        date: selectedDate,
        startTime: selectedSlot.start,
        endTime: selectedSlot.end,
        status: 'Scheduled',
        paymentStatus: 'pending',
        notes: clientGoals.trim() || undefined
      });

      toast.success(`Consultation booked with Dr. ${selectedNutritionist.name}!`);
      setActiveTab('upcoming');
      setSelectedNutritionistId('');
      setSelectedDate('');
      setSelectedSlot(null);
      setClientGoals('');
    } catch (err) {
      console.error("Booking error:", err);
      toast.error('Failed to book appointment. Please try again.');
    } finally {
      setBookingLoading(false);
    }
  };

  // Handle Cancel Appointment
  const handleExecuteCancel = async () => {
    if (!cancelModalAppointment) return;

    setCancelling(true);
    try {
      await updateAppointmentStatus(
        cancelModalAppointment.id,
        'Cancelled',
        cancelReasonInput || 'Cancelled by member via portal'
      );
      toast.success('Appointment cancelled.');
      setCancelModalAppointment(null);
      setCancelReasonInput('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to cancel appointment.');
    } finally {
      setCancelling(false);
    }
  };

  // Latest Consultation Record
  const latestConsultation = consultationHistory.length > 0 ? consultationHistory[0] : null;
  const initialConsultation = consultationHistory.length > 0 ? consultationHistory[consultationHistory.length - 1] : null;

  // Chart data for biometric progress
  const chartData = useMemo(() => {
    return [...consultationHistory]
      .reverse()
      .map((c) => ({
        date: c.date,
        weight: c.metrics?.weight,
        bodyFat: c.metrics?.bodyFatPercentage,
        muscleMass: c.metrics?.muscleMass
      }))
      .filter((d) => d.weight !== undefined || d.bodyFat !== undefined || d.muscleMass !== undefined);
  }, [consultationHistory]);

  const todayStr = new Date().toISOString().split('T')[0] ?? '';

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-3 text-xs text-muted-foreground">Loading nutrition workspace...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome Card */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold font-logo text-primary tracking-wide">
                NUTRITION & BODY COMPOSITION
              </h2>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                Track biometric progress, view clinical nutritionist notes, and book consultations
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('book')}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-xs md:text-sm font-semibold shadow-xs transition-all"
          >
            <Plus className="h-4 w-4" />
            Book Consultation
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap bg-card p-1 rounded-xl border border-border gap-1 w-full sm:w-max">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all ${
            activeTab === 'overview'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          <Scale className="h-4 w-4" />
          Body Progress & Advice
        </button>

        <button
          onClick={() => setActiveTab('upcoming')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all ${
            activeTab === 'upcoming'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          <Calendar className="h-4 w-4" />
          Upcoming ({upcomingAppointments.length})
        </button>

        <button
          onClick={() => setActiveTab('book')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all ${
            activeTab === 'book'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          <Plus className="h-4 w-4" />
          Book Session
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs md:text-sm font-medium transition-all ${
            activeTab === 'history'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          <FileText className="h-4 w-4" />
          History & Feedback
        </button>
      </div>

      {/* TAB 1: OVERVIEW & BODY METRICS TRACKER */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Latest Metric KPI Cards */}
          {latestConsultation?.metrics ? (
            (() => {
              const m = latestConsultation.metrics;
              const im = initialConsultation?.metrics;

              const weightDelta = m.weight && im?.weight ? (m.weight - im.weight).toFixed(1) : null;
              const fatDelta =
                m.bodyFatPercentage && im?.bodyFatPercentage
                  ? (m.bodyFatPercentage - im.bodyFatPercentage).toFixed(1)
                  : null;

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {/* Weight */}
                  <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>Current Weight</span>
                      <Scale className="h-4 w-4 text-blue-500" />
                    </div>
                    <p className="text-2xl font-bold mt-2 text-card-foreground">
                      {m.weight ? `${m.weight} kg` : '--'}
                    </p>
                    {weightDelta && (
                      <p
                        className={`text-xs mt-1 font-semibold ${
                          parseFloat(weightDelta) <= 0 ? 'text-emerald-500' : 'text-amber-500'
                        }`}
                      >
                        {parseFloat(weightDelta) <= 0 ? '' : '+'}
                        {weightDelta} kg overall
                      </p>
                    )}
                  </div>

                  {/* Body Fat */}
                  <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>Body Fat</span>
                      <Flame className="h-4 w-4 text-rose-500" />
                    </div>
                    <p className="text-2xl font-bold mt-2 text-card-foreground">
                      {m.bodyFatPercentage ? `${m.bodyFatPercentage}%` : '--'}
                    </p>
                    {fatDelta && (
                      <p
                        className={`text-xs mt-1 font-semibold ${
                          parseFloat(fatDelta) <= 0 ? 'text-emerald-500' : 'text-amber-500'
                        }`}
                      >
                        {parseFloat(fatDelta) <= 0 ? '' : '+'}
                        {fatDelta}% overall
                      </p>
                    )}
                  </div>

                  {/* Muscle Mass */}
                  <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>Muscle Mass</span>
                      <Dumbbell className="h-4 w-4 text-emerald-500" />
                    </div>
                    <p className="text-2xl font-bold mt-2 text-card-foreground">
                      {m.muscleMass ? `${m.muscleMass} kg` : '--'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Lean tissue</p>
                  </div>

                  {/* BMR */}
                  <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>BMR (Basal Rate)</span>
                      <HeartPulse className="h-4 w-4 text-purple-500" />
                    </div>
                    <p className="text-2xl font-bold mt-2 text-card-foreground">
                      {m.bmr ? `${m.bmr} kcal` : '--'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Maintenance burn</p>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="bg-card p-6 rounded-xl border border-border text-center space-y-2">
              <Scale className="h-8 w-8 text-muted-foreground mx-auto opacity-30" />
              <p className="text-sm font-semibold text-card-foreground">No biometric check-ins logged yet</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Schedule your initial nutrition consultation with our specialists to measure your weight, body fat %, muscle mass, and BMR.
              </p>
              <button
                onClick={() => setActiveTab('book')}
                className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold"
              >
                Book Your First Consultation
              </button>
            </div>
          )}

          {/* Biometric Progress Chart */}
          {chartData.length > 0 && (
            <div className="bg-card p-6 rounded-xl border border-border shadow-xs space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-card-foreground">Biometric Progress Curves</h3>
                  <p className="text-xs text-muted-foreground">Tracking weight, lean mass, and body fat % over time</p>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="date" stroke="#888888" fontSize={11} />
                    <YAxis stroke="#888888" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        borderColor: 'var(--border)',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      name="Weight (kg)"
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="bodyFat"
                      stroke="#ef4444"
                      strokeWidth={2}
                      name="Body Fat %"
                      dot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="muscleMass"
                      stroke="#10b981"
                      strokeWidth={2}
                      name="Muscle Mass (kg)"
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Latest Nutritionist Advice & Tasks Card */}
          {latestConsultation && (
            <div className="bg-card p-6 rounded-xl border border-border shadow-xs space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-card-foreground">
                      Latest Advice & Recommendations
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      From Dr. {latestConsultation.nutritionistName || 'Specialist'} on {latestConsultation.date}
                    </p>
                  </div>
                </div>
              </div>

              {latestConsultation.dietaryPlan && (
                <div className="p-4 bg-muted/40 rounded-xl border border-border space-y-1.5">
                  <span className="text-xs font-bold text-card-foreground uppercase tracking-wider block">
                    Dietary Plan & Guidelines
                  </span>
                  <p className="text-xs md:text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                    {latestConsultation.dietaryPlan}
                  </p>
                </div>
              )}

              {latestConsultation.notes && (
                <div className="p-4 bg-background rounded-xl border border-border space-y-1.5">
                  <span className="text-xs font-bold text-card-foreground uppercase tracking-wider block">
                    Clinical Notes & Caloric Targets
                  </span>
                  <p className="text-xs md:text-sm text-card-foreground whitespace-pre-line leading-relaxed">
                    {latestConsultation.notes}
                  </p>
                </div>
              )}

              {latestConsultation.followUpTasks && latestConsultation.followUpTasks.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold text-card-foreground uppercase tracking-wider block">
                    Your Action Checklist
                  </span>
                  <div className="space-y-2">
                    {latestConsultation.followUpTasks.map((task, idx) => {
                      const taskId = `${latestConsultation.id}-${idx}`;
                      const isDone = !!completedTasks[taskId];

                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            setCompletedTasks({
                              ...completedTasks,
                              [taskId]: !isDone
                            });
                          }}
                          className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center gap-3 ${
                            isDone ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-background border-border hover:border-primary/40'
                          }`}
                        >
                          <div
                            className={`h-5 w-5 rounded flex items-center justify-center border transition-colors ${
                              isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-input bg-card'
                            }`}
                          >
                            {isDone && <Check className="h-3.5 w-3.5" />}
                          </div>
                          <span
                            className={`text-xs md:text-sm ${
                              isDone ? 'line-through text-muted-foreground' : 'text-card-foreground font-medium'
                            }`}
                          >
                            {task}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: UPCOMING APPOINTMENTS */}
      {activeTab === 'upcoming' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-card-foreground">Scheduled Consultations</h3>
            <button
              onClick={() => setActiveTab('book')}
              className="text-xs text-primary font-semibold hover:underline"
            >
              + Book Another Session
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {upcomingAppointments.length === 0 ? (
              <div className="col-span-full p-12 text-center bg-card border border-border rounded-xl">
                <Calendar className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-base font-semibold">No upcoming appointments</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You do not have any pending consultations scheduled.
                </p>
                <button
                  onClick={() => setActiveTab('book')}
                  className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold"
                >
                  Book a Consultation Now
                </button>
              </div>
            ) : (
              upcomingAppointments.map((app) => (
                <div
                  key={app.id}
                  className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                        {app.status}
                      </span>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                          app.paymentStatus === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-amber-500/10 text-amber-500'
                        }`}
                      >
                        {app.paymentStatus === 'completed' ? 'Paid' : 'Pending Payment'}
                      </span>
                    </div>

                    <div className="space-y-2 mt-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-card-foreground">
                        <Calendar className="h-4 w-4 text-primary" />
                        <span>{app.date}</span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          {app.startTime} - {app.endTime}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-card-foreground font-medium">
                        <User className="h-3.5 w-3.5 text-emerald-500" />
                        <span>Dr. {app.nutritionistName}</span>
                      </div>

                      {app.notes && (
                        <div className="bg-muted/40 p-2.5 rounded-lg text-xs text-muted-foreground italic mt-2">
                          "{app.notes}"
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border flex justify-end">
                    <button
                      onClick={() => {
                        setCancelModalAppointment(app);
                        setCancelReasonInput('');
                      }}
                      className="text-xs text-rose-500 hover:text-rose-600 font-semibold transition-colors"
                    >
                      Cancel Consultation
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: BOOK CONSULTATION */}
      {activeTab === 'book' && (
        <div className="max-w-2xl mx-auto bg-card border border-border rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
          <div>
            <h3 className="text-xl font-bold text-card-foreground">Book Nutrition Consultation</h3>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Select your specialist, date, and preferred time slot for a personalized nutrition check-in
            </p>
          </div>

          <div className="space-y-5">
            {/* Step 1: Select Nutritionist */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                1. Choose Specialist
              </label>

              {activeProfiles.length === 0 ? (
                <div className="p-4 bg-muted/40 rounded-xl text-center text-xs text-muted-foreground">
                  No active nutritionists found. Please check back later or contact gym reception.
                </div>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {activeProfiles.map((p) => {
                    const isSelected = selectedNutritionistId === p.userId || selectedNutritionistId === p.id;

                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          setSelectedNutritionistId(p.userId || p.id);
                          setSelectedSlot(null);
                        }}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-primary/10 border-primary shadow-xs'
                            : 'bg-background border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs ${
                              isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                            }`}
                          >
                            {p.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm text-card-foreground truncate">Dr. {p.name}</h4>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {p.specialties ? p.specialties.join(', ') : 'Nutrition Specialist'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 2: Select Date */}
            {selectedNutritionist && (
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  2. Choose Date
                </label>
                <input
                  type="date"
                  min={todayStr}
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedSlot(null);
                  }}
                  className="w-full p-2.5 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                />
              </div>
            )}

            {/* Step 3: Select Slot */}
            {selectedNutritionist && selectedDate && (
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  3. Select Available Time Slot
                </label>

                {availableSlots.length === 0 ? (
                  <div className="p-4 bg-muted/40 rounded-xl text-xs text-muted-foreground flex items-center gap-2">
                    <Info className="h-4 w-4 text-amber-500 shrink-0" />
                    <span>
                      Dr. {selectedNutritionist.name} is not taking bookings on this day. Please choose another date.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {availableSlots.map((slot, idx) => {
                      const isSelected = selectedSlot?.start === slot.start;

                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={slot.booked}
                          onClick={() => setSelectedSlot(slot)}
                          className={`p-2.5 rounded-lg border text-xs font-semibold transition-all ${
                            slot.booked
                              ? 'bg-muted text-muted-foreground opacity-40 cursor-not-allowed border-transparent'
                              : isSelected
                              ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                              : 'bg-background hover:bg-muted text-card-foreground border-border'
                          }`}
                        >
                          <div>
                            {slot.start} - {slot.end}
                          </div>
                          <span className="text-[10px] opacity-75">
                            {slot.booked ? 'Booked' : 'Available'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Goals / Focus Area */}
            {selectedSlot && (
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  4. Your Goal / Focus Area (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Discuss nutrition for upcoming competition, review body fat results, meal prep strategy..."
                  value={clientGoals}
                  onChange={(e) => setClientGoals(e.target.value)}
                  className="w-full p-3 bg-background border border-input rounded-xl text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                />
              </div>
            )}

            {/* Confirm Booking CTA */}
            {selectedSlot && (
              <div className="pt-4 border-t border-border">
                <button
                  type="button"
                  disabled={bookingLoading}
                  onClick={handleConfirmBooking}
                  className="w-full py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-sm font-bold shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {bookingLoading ? 'Booking Consultation...' : 'Confirm Consultation Booking'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: HISTORY & CLINICAL NOTES */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-bold text-card-foreground">Past Consultations & Clinical Records</h3>
            <p className="text-xs text-muted-foreground">
              Review biometric records and dietitian notes from all previous consultations
            </p>
          </div>

          {loadingHistory ? (
            <div className="p-8 text-center bg-card border border-border rounded-xl">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-xs text-muted-foreground mt-2">Loading historical records...</p>
            </div>
          ) : consultationHistory.length === 0 ? (
            <div className="p-12 text-center bg-card border border-border rounded-xl">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-base font-semibold">No past consultation notes found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Completed consultation summaries and diet plans will be stored here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {consultationHistory.map((rec) => (
                <div key={rec.id} className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="font-bold text-sm text-card-foreground">{rec.date}</span>
                      {rec.nutritionistName && (
                        <span className="text-xs text-muted-foreground">with Dr. {rec.nutritionistName}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      {rec.metrics?.weight && (
                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded font-medium">
                          Weight: {rec.metrics.weight}kg
                        </span>
                      )}
                      {rec.metrics?.bodyFatPercentage && (
                        <span className="px-2 py-0.5 bg-rose-500/10 text-rose-500 rounded font-medium">
                          Body Fat: {rec.metrics.bodyFatPercentage}%
                        </span>
                      )}
                      {rec.metrics?.muscleMass && (
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded font-medium">
                          Muscle: {rec.metrics.muscleMass}kg
                        </span>
                      )}
                      {rec.metrics?.bmr && (
                        <span className="px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded font-medium">
                          BMR: {rec.metrics.bmr} kcal
                        </span>
                      )}
                    </div>
                  </div>

                  {rec.dietaryPlan && (
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                        Dietary Recommendations
                      </span>
                      <p className="text-xs md:text-sm text-card-foreground bg-background p-3 rounded-lg border border-border whitespace-pre-line">
                        {rec.dietaryPlan}
                      </p>
                    </div>
                  )}

                  {rec.notes && (
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                        Specialist Feedback & Clinical Notes
                      </span>
                      <p className="text-xs md:text-sm text-muted-foreground bg-background p-3 rounded-lg border border-border whitespace-pre-line">
                        {rec.notes}
                      </p>
                    </div>
                  )}

                  {rec.followUpTasks && rec.followUpTasks.length > 0 && (
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                        Assigned Tasks
                      </span>
                      <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                        {rec.followUpTasks.map((t, idx) => (
                          <li key={idx} className="text-card-foreground">
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CANCEL APPOINTMENT CONFIRMATION MODAL */}
      {cancelModalAppointment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-0">
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-border flex justify-between items-center bg-muted/20">
              <h3 className="font-bold text-base text-rose-500 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Cancel Consultation
              </h3>
              <button
                onClick={() => setCancelModalAppointment(null)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">
                Are you sure you want to cancel your consultation with{' '}
                <span className="font-semibold text-foreground">Dr. {cancelModalAppointment.nutritionistName}</span> scheduled
                for {cancelModalAppointment.date} at {cancelModalAppointment.startTime}?
              </p>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Reason for cancellation (optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Schedule conflict, feeling unwell..."
                  value={cancelReasonInput}
                  onChange={(e) => setCancelReasonInput(e.target.value)}
                  className="w-full p-2.5 bg-background border border-input rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-2 bg-muted/20">
              <button
                onClick={() => setCancelModalAppointment(null)}
                className="px-3 py-1.5 hover:bg-muted rounded-lg text-xs font-medium"
              >
                Keep Session
              </button>
              <button
                disabled={cancelling}
                onClick={handleExecuteCancel}
                className="px-4 py-1.5 bg-rose-500 text-white hover:bg-rose-600 rounded-lg text-xs font-bold disabled:opacity-50"
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
