import React, { useState, useMemo, useEffect } from 'react';
import { useNutrition } from './hooks/useNutrition';
import { useAuth } from './contexts/AuthContext';
import { useClients } from './hooks/useClients';
import { useCoaches } from './hooks/useCoaches';
import {
  Calendar,
  Clock,
  User,
  CheckCircle,
  XCircle,
  Search,
  Activity,
  FileText,
  Plus,
  Edit2,
  Trash2,
  TrendingUp,
  Scale,
  Flame,
  Dumbbell,
  HeartPulse,
  Filter,
  AlertCircle,
  RefreshCw,
  Eye,
  Check,
  Phone,
  ArrowUpRight,
  ShieldCheck,
  ChevronDown,
  Download
} from 'lucide-react';
import {
  NutritionAppointment,
  NutritionConsultation,
  NutritionistProfile,
  NutritionAppointmentStatus,
  BodyMetrics,
  NutritionistScheduleDay
} from './types/nutrition';
import { Client } from './types';
import { toast } from 'sonner';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

type ModuleTab = 'appointments' | 'nutritionists' | 'clients' | 'analytics';

const STATUS_COLORS: Record<NutritionAppointmentStatus, { bg: string; text: string; border: string }> = {
  Scheduled: { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/20' },
  Completed: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/20' },
  Cancelled: { bg: 'bg-rose-500/10', text: 'text-rose-500', border: 'border-rose-500/20' },
  Rescheduled: { bg: 'bg-purple-500/10', text: 'text-purple-500', border: 'border-purple-500/20' },
  'No-show': { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20' }
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#ef4444', '#a855f7', '#f59e0b'];

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function NutritionModule() {
  const {
    appointments,
    profiles,
    loading,
    bookAppointment,
    updateAppointmentStatus,
    updateAppointment,
    deleteAppointment,
    saveConsultationNotes,
    fetchConsultationNotes,
    fetchClientConsultations,
    saveNutritionistProfile
  } = useNutrition();

  const { currentUser, isSuperUser } = useAuth();
  const { clients } = useClients(currentUser);
  const { coaches } = useCoaches();

  const isManagerOrSama =
    isSuperUser ||
    currentUser?.role === 'manager' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'crm_admin' ||
    (currentUser?.name ? currentUser.name.toLowerCase().includes('sama') : false);

  const [activeTab, setActiveTab] = useState<ModuleTab>('appointments');

  // Appointments Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'upcoming' | 'past'>('all');
  const [nutritionistFilter, setNutritionistFilter] = useState<string>('all');

  // Dialog States
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [showConsultationDialog, setShowConsultationDialog] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showNutritionistDialog, setShowNutritionistDialog] = useState(false);

  // Active target appointment
  const [selectedAppointment, setSelectedAppointment] = useState<NutritionAppointment | null>(null);

  // Consultation Notes / Metrics State
  const [consultationNotes, setConsultationNotes] = useState('');
  const [dietaryPlan, setDietaryPlan] = useState('');
  const [metricsWeight, setMetricsWeight] = useState<string>('');
  const [metricsBodyFat, setMetricsBodyFat] = useState<string>('');
  const [metricsMuscleMass, setMetricsMuscleMass] = useState<string>('');
  const [metricsBmr, setMetricsBmr] = useState<string>('');
  const [metricsHeight, setMetricsHeight] = useState<string>('');
  const [metricsVisceralFat, setMetricsVisceralFat] = useState<string>('');
  const [followUpTasks, setFollowUpTasks] = useState<string[]>([]);
  const [newTaskInput, setNewTaskInput] = useState('');
  const [markCompletedOnSave, setMarkCompletedOnSave] = useState(true);
  const [savingConsultation, setSavingConsultation] = useState(false);

  // Booking Form State
  const [bookingClientId, setBookingClientId] = useState('');
  const [bookingClientSearch, setBookingClientSearch] = useState('');
  const [bookingNutritionistId, setBookingNutritionistId] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingStartTime, setBookingStartTime] = useState('10:00');
  const [bookingEndTime, setBookingEndTime] = useState('10:45');
  const [bookingPaymentStatus, setBookingPaymentStatus] = useState<'pending' | 'completed'>('pending');
  const [bookingNotes, setBookingNotes] = useState('');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  // Reschedule Form State
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');

  // Cancel Form State
  const [cancelReason, setCancelReason] = useState('');

  // Nutritionist Profile Form State
  const [editingProfileUserId, setEditingProfileUserId] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileSpecialties, setProfileSpecialties] = useState<string[]>([]);
  const [newSpecialtyInput, setNewSpecialtyInput] = useState('');
  const [profileActive, setProfileActive] = useState(true);
  const [profileSchedule, setProfileSchedule] = useState<Record<string, NutritionistScheduleDay>>({});
  const [savingProfile, setSavingProfile] = useState(false);

  // Client History Tab State
  const [selectedClientForHistory, setSelectedClientForHistory] = useState<Client | null>(null);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [clientConsultations, setClientConsultations] = useState<NutritionConsultation[]>([]);
  const [loadingClientConsultations, setLoadingClientConsultations] = useState(false);

  // Load client consultation history when client is selected
  useEffect(() => {
    if (selectedClientForHistory) {
      setLoadingClientConsultations(true);
      fetchClientConsultations(selectedClientForHistory.id)
        .then((items) => {
          setClientConsultations(items);
        })
        .finally(() => {
          setLoadingClientConsultations(false);
        });
    } else {
      setClientConsultations([]);
    }
  }, [selectedClientForHistory, fetchClientConsultations]);

  // Load existing consultation notes if opening dialog for an appointment
  const handleOpenConsultationDialog = async (app: NutritionAppointment) => {
    setSelectedAppointment(app);
    setConsultationNotes('');
    setDietaryPlan('');
    setMetricsWeight('');
    setMetricsBodyFat('');
    setMetricsMuscleMass('');
    setMetricsBmr('');
    setMetricsHeight('');
    setMetricsVisceralFat('');
    setFollowUpTasks([]);
    setMarkCompletedOnSave(app.status === 'Scheduled');

    try {
      const existing = await fetchConsultationNotes(app.id);
      if (existing) {
        setConsultationNotes(existing.notes || '');
        setDietaryPlan(existing.dietaryPlan || '');
        if (existing.metrics) {
          if (existing.metrics.weight !== undefined) setMetricsWeight(String(existing.metrics.weight));
          if (existing.metrics.bodyFatPercentage !== undefined) setMetricsBodyFat(String(existing.metrics.bodyFatPercentage));
          if (existing.metrics.muscleMass !== undefined) setMetricsMuscleMass(String(existing.metrics.muscleMass));
          if (existing.metrics.bmr !== undefined) setMetricsBmr(String(existing.metrics.bmr));
          if (existing.metrics.height !== undefined) setMetricsHeight(String(existing.metrics.height));
          if (existing.metrics.visceralFat !== undefined) setMetricsVisceralFat(String(existing.metrics.visceralFat));
        }
        setFollowUpTasks(existing.followUpTasks || []);
      }
    } catch (err) {
      console.error("Error fetching notes", err);
    }
    setShowConsultationDialog(true);
  };

  // Auto-calculate BMR helper based on Katch-McArdle or Harris-Benedict
  const handleAutoCalculateBMR = () => {
    const w = parseFloat(metricsWeight);
    const bf = parseFloat(metricsBodyFat);
    const h = parseFloat(metricsHeight);

    if (w && bf) {
      // Katch-McArdle Formula: BMR = 370 + (21.6 * Lean Body Mass in kg)
      const leanMass = w * (1 - bf / 100);
      const calculatedBmr = Math.round(370 + 21.6 * leanMass);
      setMetricsBmr(String(calculatedBmr));
      if (!metricsMuscleMass) {
        setMetricsMuscleMass((w * (1 - bf / 100)).toFixed(1));
      }
      toast.success(`Calculated BMR (${calculatedBmr} kcal) via Lean Mass`);
    } else if (w && h) {
      // Standard approximation
      const approxBmr = Math.round(10 * w + 6.25 * h - 5 * 28 + 5);
      setMetricsBmr(String(approxBmr));
      toast.success(`Estimated BMR (${approxBmr} kcal)`);
    } else {
      toast.error('Enter at least Weight and Body Fat % (or Height) to auto-calculate BMR.');
    }
  };

  // Save Consultation Notes & Body Metrics
  const handleSaveConsultation = async () => {
    if (!selectedAppointment) return;
    setSavingConsultation(true);

    try {
      const parsedMetrics: BodyMetrics = {};
      if (metricsWeight.trim() !== '') parsedMetrics.weight = parseFloat(metricsWeight);
      if (metricsBodyFat.trim() !== '') parsedMetrics.bodyFatPercentage = parseFloat(metricsBodyFat);
      if (metricsMuscleMass.trim() !== '') parsedMetrics.muscleMass = parseFloat(metricsMuscleMass);
      if (metricsBmr.trim() !== '') parsedMetrics.bmr = parseFloat(metricsBmr);
      if (metricsHeight.trim() !== '') parsedMetrics.height = parseFloat(metricsHeight);
      if (metricsVisceralFat.trim() !== '') parsedMetrics.visceralFat = parseFloat(metricsVisceralFat);

      await saveConsultationNotes(selectedAppointment.id, {
        clientId: selectedAppointment.clientId,
        clientName: selectedAppointment.clientName,
        nutritionistId: selectedAppointment.nutritionistId,
        nutritionistName: selectedAppointment.nutritionistName,
        date: selectedAppointment.date,
        notes: consultationNotes,
        dietaryPlan: dietaryPlan,
        metrics: parsedMetrics,
        followUpTasks: followUpTasks
      });

      if (markCompletedOnSave && selectedAppointment.status === 'Scheduled') {
        await updateAppointmentStatus(selectedAppointment.id, 'Completed');
      }

      toast.success('Consultation notes & body composition metrics saved successfully!');
      setShowConsultationDialog(false);
      setSelectedAppointment(null);

      // Refresh client consultation history if on clients tab
      if (selectedClientForHistory && selectedClientForHistory.id === selectedAppointment.clientId) {
        const updated = await fetchClientConsultations(selectedClientForHistory.id);
        setClientConsultations(updated);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to save consultation notes. Please try again.');
    } finally {
      setSavingConsultation(false);
    }
  };

  // Save / Book New Appointment
  const handleCreateBooking = async () => {
    if (!bookingClientId || !bookingNutritionistId || !bookingDate || !bookingStartTime || !bookingEndTime) {
      toast.error('Please fill in all required booking details.');
      return;
    }

    const client = clients.find((c) => c.id === bookingClientId);
    const profile = profiles.find((p) => p.userId === bookingNutritionistId || p.id === bookingNutritionistId);

    if (!client || !profile) {
      toast.error('Invalid client or nutritionist selection.');
      return;
    }

    setBookingSubmitting(true);
    try {
      await bookAppointment({
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone || '',
        clientEmail: client.email || '',
        nutritionistId: profile.userId,
        nutritionistName: profile.name,
        date: bookingDate,
        startTime: bookingStartTime,
        endTime: bookingEndTime,
        status: 'Scheduled',
        paymentStatus: bookingPaymentStatus,
        notes: bookingNotes
      });

      toast.success(`Appointment booked for ${client.name} with Dr. ${profile.name}`);
      setShowBookingDialog(false);
      setBookingClientId('');
      setBookingNutritionistId('');
      setBookingDate('');
      setBookingNotes('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to book appointment.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  // Reschedule Action
  const handleConfirmReschedule = async () => {
    if (!selectedAppointment || !rescheduleDate || !rescheduleTime) {
      toast.error('Please specify new date and time.');
      return;
    }

    try {
      await updateAppointment(selectedAppointment.id, {
        date: rescheduleDate,
        startTime: rescheduleTime,
        status: 'Rescheduled',
        notes: rescheduleReason
          ? `${selectedAppointment.notes || ''} [Rescheduled: ${rescheduleReason}]`.trim()
          : selectedAppointment.notes
      });
      toast.success('Appointment rescheduled successfully.');
      setShowRescheduleDialog(false);
      setSelectedAppointment(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to reschedule appointment.');
    }
  };

  // Cancel Action
  const handleConfirmCancel = async () => {
    if (!selectedAppointment) return;

    try {
      await updateAppointmentStatus(selectedAppointment.id, 'Cancelled', cancelReason || 'Cancelled by staff');
      toast.success('Appointment marked as cancelled.');
      setShowCancelDialog(false);
      setSelectedAppointment(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to cancel appointment.');
    }
  };

  // Open Nutritionist Edit Dialog
  const handleOpenNutritionistEdit = (profile?: NutritionistProfile) => {
    if (profile) {
      setEditingProfileUserId(profile.userId);
      setProfileName(profile.name);
      setProfileEmail(profile.email || '');
      setProfilePhone(profile.phone || '');
      setProfileBio(profile.bio || '');
      setProfileSpecialties(profile.specialties || []);
      setProfileActive(profile.active);
      setProfileSchedule(profile.schedule || {});
    } else {
      // New profile template
      setEditingProfileUserId('');
      setProfileName('');
      setProfileEmail('');
      setProfilePhone('');
      setProfileBio('');
      setProfileSpecialties(['Sports Nutrition', 'Weight Management']);
      setProfileActive(true);
      const defaultSched: Record<string, NutritionistScheduleDay> = {};
      DAYS_OF_WEEK.forEach((d) => {
        defaultSched[d] = {
          enabled: d !== 'Friday',
          startTime: '10:00',
          endTime: '18:00',
          appointmentDuration: 45
        };
      });
      setProfileSchedule(defaultSched);
    }
    setShowNutritionistDialog(true);
  };

  // Save Nutritionist Profile
  const handleSaveNutritionist = async () => {
    if (!profileName.trim() || !editingProfileUserId.trim()) {
      toast.error('Name and linked User ID are required.');
      return;
    }

    setSavingProfile(true);
    try {
      await saveNutritionistProfile(editingProfileUserId, {
        name: profileName,
        email: profileEmail,
        phone: profilePhone,
        bio: profileBio,
        active: profileActive,
        specialties: profileSpecialties,
        schedule: profileSchedule
      });
      toast.success('Nutritionist profile saved successfully!');
      setShowNutritionistDialog(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save nutritionist profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // Filtered Appointments
  const filteredAppointments = useMemo(() => {
    const today = new Date().toISOString().split('T')[0] ?? '';

    return appointments.filter((app) => {
      // Search
      const term = searchTerm.toLowerCase();
      const matchSearch =
        !searchTerm ||
        app.clientName.toLowerCase().includes(term) ||
        app.nutritionistName.toLowerCase().includes(term) ||
        (app.clientPhone && app.clientPhone.includes(term));

      // Status
      const matchStatus = statusFilter === 'all' || app.status === statusFilter;

      // Date
      let matchDate = true;
      if (dateFilter === 'today') {
        matchDate = app.date === today;
      } else if (dateFilter === 'upcoming') {
        matchDate = app.date >= today;
      } else if (dateFilter === 'past') {
        matchDate = app.date < today;
      }

      // Nutritionist
      const matchNutr = nutritionistFilter === 'all' || app.nutritionistId === nutritionistFilter;

      return matchSearch && matchStatus && matchDate && matchNutr;
    });
  }, [appointments, searchTerm, statusFilter, dateFilter, nutritionistFilter]);

  // Appointments Summary KPIs
  const todayStr = new Date().toISOString().split('T')[0] ?? '';
  const queueStats = useMemo(() => {
    const todayCount = appointments.filter((a) => a.date === todayStr).length;
    const scheduledCount = appointments.filter((a) => a.status === 'Scheduled').length;
    const completedCount = appointments.filter((a) => a.status === 'Completed').length;
    const noShowCount = appointments.filter((a) => a.status === 'No-show').length;
    const notesLoggedCount = appointments.filter((a) => a.hasConsultationNotes).length;
    return { todayCount, scheduledCount, completedCount, noShowCount, notesLoggedCount };
  }, [appointments, todayStr]);

  const exportNutritionCSV = () => {
    const headers = ['Date', 'Time', 'Client', 'Nutritionist', 'Status'];
    const rows = appointments.map(a => [
      a.date,
      a.startTime,
      clients.find(c => c.id === a.clientId)?.name || a.clientId,
      profiles.find(p => p.id === a.nutritionistId)?.name || a.nutritionistId,
      a.status
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `nutrition_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report exported to CSV');
  };

  // Analytics Stats
  const analyticsData = useMemo(() => {
    const total = appointments.length;
    const completed = appointments.filter((a) => a.status === 'Completed').length;
    const scheduled = appointments.filter((a) => a.status === 'Scheduled').length;
    const noShow = appointments.filter((a) => a.status === 'No-show').length;
    const cancelled = appointments.filter((a) => a.status === 'Cancelled').length;
    const rescheduled = appointments.filter((a) => a.status === 'Rescheduled').length;

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const noShowRate = total > 0 ? Math.round((noShow / total) * 100) : 0;

    // Status breakdown for PieChart
    const statusChartData = [
      { name: 'Completed', value: completed },
      { name: 'Scheduled', value: scheduled },
      { name: 'Cancelled', value: cancelled },
      { name: 'Rescheduled', value: rescheduled },
      { name: 'No-show', value: noShow }
    ].filter((item) => item.value > 0);

    // Nutritionist breakdown
    const nutrMap: Record<string, { name: string; count: number; completed: number }> = {};
    appointments.forEach((a) => {
      const name = a.nutritionistName || 'Unknown';
      if (!nutrMap[name]) {
        nutrMap[name] = { name, count: 0, completed: 0 };
      }
      const item = nutrMap[name];
      if (item) {
        item.count += 1;
        if (a.status === 'Completed') item.completed += 1;
      }
    });
    const nutritionistWorkload = Object.values(nutrMap);

    return {
      total,
      completed,
      scheduled,
      noShow,
      cancelled,
      rescheduled,
      completionRate,
      noShowRate,
      statusChartData,
      nutritionistWorkload
    };
  }, [appointments]);

  if (loading) {
    return (
      <div className="p-12 flex flex-col justify-center items-center h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
        <p className="mt-4 text-sm text-muted-foreground">Loading Nutrition Workspace...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-2xl border border-border shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold font-logo text-primary tracking-wide">
                NUTRITION & BODY COMPOSITION
              </h1>
              <p className="text-muted-foreground text-sm">
                Consultation queue, nutritionist rosters, clinical notes & longitudinal body metrics
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={() => setShowBookingDialog(true)}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-sm font-semibold shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            Book Consultation
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap bg-card p-1.5 rounded-xl border border-border gap-1 w-full md:w-max">
        <button
          onClick={() => setActiveTab('appointments')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'appointments'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          <Calendar className="h-4 w-4" />
          Appointments Queue
          {queueStats.scheduledCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                activeTab === 'appointments'
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {queueStats.scheduledCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('nutritionists')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'nutritionists'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          <User className="h-4 w-4" />
          Nutritionists ({profiles.length})
        </button>

        <button
          onClick={() => setActiveTab('clients')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'clients'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'hover:bg-muted text-muted-foreground'
          }`}
        >
          <Scale className="h-4 w-4" />
          Client History & Metrics
        </button>

        {isManagerOrSama && (
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'analytics'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            Analytics & Reports
          </button>
        )}
      </div>

      {/* TAB 1: APPOINTMENTS QUEUE */}
      {activeTab === 'appointments' && (
        <div className="space-y-6">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today's Queue</span>
                <Clock className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-2xl font-bold mt-2">{queueStats.todayCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Sessions on schedule</p>
            </div>

            <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Upcoming</span>
                <Calendar className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold mt-2">{queueStats.scheduledCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Scheduled appointments</p>
            </div>

            <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Completed</span>
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold mt-2">{queueStats.completedCount}</p>
              <p className="text-xs text-emerald-500 font-medium mt-1">{queueStats.notesLoggedCount} with metrics</p>
            </div>

            <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">No-shows</span>
                <XCircle className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold mt-2">{queueStats.noShowCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Unattended sessions</p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-card p-4 rounded-xl border border-border shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by client name, nutritionist, or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Completed">Completed</option>
                  <option value="No-show">No-show</option>
                  <option value="Rescheduled">Rescheduled</option>
                  <option value="Cancelled">Cancelled</option>
                </select>

                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value as any)}
                  className="px-3 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                >
                  <option value="all">All Dates</option>
                  <option value="today">Today</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="past">Past</option>
                </select>

                <select
                  value={nutritionistFilter}
                  onChange={(e) => setNutritionistFilter(e.target.value)}
                  className="px-3 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                >
                  <option value="all">All Nutritionists</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.userId}>
                      Dr. {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Appointments Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredAppointments.length === 0 ? (
              <div className="col-span-full p-12 text-center bg-card border border-border rounded-xl">
                <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-base font-medium">No nutrition appointments found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Adjust your search or filter parameters, or book a new appointment.
                </p>
                <button
                  onClick={() => setShowBookingDialog(true)}
                  className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
                >
                  Book New Appointment
                </button>
              </div>
            ) : (
              filteredAppointments.map((app) => {
                const statusStyle = STATUS_COLORS[app.status] || STATUS_COLORS.Scheduled;

                return (
                  <div
                    key={app.id}
                    className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Header */}
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}
                        >
                          {app.status}
                        </span>

                        <div className="text-right">
                          <div className="text-xs text-muted-foreground font-medium flex items-center gap-1 justify-end">
                            <Calendar className="h-3 w-3" />
                            {app.date}
                          </div>
                          <div className="text-sm font-bold flex items-center gap-1 justify-end text-card-foreground">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {app.startTime} - {app.endTime}
                          </div>
                        </div>
                      </div>

                      {/* Client & Specialist Info */}
                      <div className="space-y-2.5 mb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-primary" />
                            <span className="font-bold text-base text-card-foreground">{app.clientName}</span>
                          </div>
                          {app.clientPhone && (
                            <div className="text-xs text-muted-foreground ml-6 flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {app.clientPhone}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Activity className="h-4 w-4 text-emerald-500" />
                          <span>Dr. {app.nutritionistName}</span>
                        </div>

                        {app.notes && (
                          <div className="bg-muted/40 p-2 rounded-lg text-xs text-muted-foreground italic line-clamp-2">
                            "{app.notes}"
                          </div>
                        )}

                        {app.cancellationReason && (
                          <div className="bg-rose-500/10 text-rose-500 p-2 rounded-lg text-xs">
                            Cancellation reason: {app.cancellationReason}
                          </div>
                        )}
                      </div>

                      {/* Payment & Metric Status Pills */}
                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                            app.paymentStatus === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          }`}
                        >
                          Payment: {app.paymentStatus || 'pending'}
                        </span>

                        {app.hasConsultationNotes ? (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            Metrics Recorded
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                            No Metrics Logged
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-3 border-t border-border flex flex-col gap-2">
                      <button
                        onClick={() => handleOpenConsultationDialog(app)}
                        className={`w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                          app.hasConsultationNotes
                            ? 'bg-primary/10 text-primary hover:bg-primary/20'
                            : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {app.hasConsultationNotes ? 'View / Edit Consultation & Metrics' : 'Log Consultation Notes & Metrics'}
                      </button>

                      <div className="flex items-center justify-between gap-1">
                        {app.status === 'Scheduled' && (
                          <>
                            <button
                              onClick={async () => {
                                await updateAppointmentStatus(app.id, 'Completed');
                                toast.success('Marked as completed.');
                              }}
                              className="flex-1 py-1.5 px-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-md text-xs font-medium transition-colors text-center"
                            >
                              Complete
                            </button>
                            <button
                              onClick={async () => {
                                await updateAppointmentStatus(app.id, 'No-show');
                                toast.success('Marked as No-show.');
                              }}
                              className="flex-1 py-1.5 px-2 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 rounded-md text-xs font-medium transition-colors text-center"
                            >
                              No-show
                            </button>
                            <button
                              onClick={() => {
                                setSelectedAppointment(app);
                                setRescheduleDate(app.date);
                                setRescheduleTime(app.startTime);
                                setRescheduleReason('');
                                setShowRescheduleDialog(true);
                              }}
                              className="py-1.5 px-2 hover:bg-muted rounded-md text-xs font-medium text-muted-foreground transition-colors"
                            >
                              Reschedule
                            </button>
                          </>
                        )}

                        {app.status !== 'Cancelled' && (
                          <button
                            onClick={() => {
                              setSelectedAppointment(app);
                              setCancelReason('');
                              setShowCancelDialog(true);
                            }}
                            className="py-1.5 px-2 hover:bg-rose-500/10 text-rose-500 rounded-md text-xs font-medium transition-colors"
                          >
                            Cancel
                          </button>
                        )}

                        {isManagerOrSama && (
                          <button
                            onClick={async () => {
                              if (window.confirm(`Delete appointment for ${app.clientName}?`)) {
                                await deleteAppointment(app.id);
                                toast.success('Appointment deleted.');
                              }
                            }}
                            className="py-1.5 px-2 hover:bg-destructive/10 text-destructive rounded-md text-xs transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: NUTRITIONISTS ROSTER */}
      {activeTab === 'nutritionists' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-xl border border-border">
            <div>
              <h2 className="text-lg font-bold text-card-foreground">Nutritionist Team & Schedules</h2>
              <p className="text-xs text-muted-foreground">Manage active specialists, weekly availability and slot durations</p>
            </div>
            {isManagerOrSama && (
              <button
                onClick={() => handleOpenNutritionistEdit()}
                className="flex items-center gap-2 px-3.5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg text-sm font-semibold transition-all"
              >
                <Plus className="h-4 w-4" />
                Add Nutritionist Profile
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {profiles.length === 0 ? (
              <div className="col-span-full p-12 text-center bg-card border border-border rounded-xl">
                <User className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-base font-medium">No nutritionists registered yet.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add staff nutritionist profiles to enable appointment scheduling.
                </p>
                {isManagerOrSama && (
                  <button
                    onClick={() => handleOpenNutritionistEdit()}
                    className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
                  >
                    Add First Nutritionist
                  </button>
                )}
              </div>
            ) : (
              profiles.map((p) => {
                const activeDays = Object.entries(p.schedule || {}).filter(([_, s]) => s.enabled);

                return (
                  <div key={p.id} className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-base">
                          {p.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-bold text-card-foreground flex items-center gap-2">
                            Dr. {p.name}
                            <span
                              className={`h-2 w-2 rounded-full ${p.active ? 'bg-emerald-500' : 'bg-rose-500'}`}
                              title={p.active ? 'Active' : 'Inactive'}
                            />
                          </h3>
                          <span className="text-xs text-muted-foreground">ID: {p.userId}</span>
                        </div>
                      </div>

                      {isManagerOrSama && (
                        <button
                          onClick={() => handleOpenNutritionistEdit(p)}
                          className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit Profile"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {p.bio && <p className="text-xs text-muted-foreground line-clamp-2">{p.bio}</p>}

                    {/* Specialties */}
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                        Specialties
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {p.specialties && p.specialties.length > 0 ? (
                          p.specialties.map((spec, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 bg-primary/10 text-primary rounded-md text-xs font-medium"
                            >
                              {spec}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground italic">General Nutrition</span>
                        )}
                      </div>
                    </div>

                    {/* Schedule Overview */}
                    <div className="pt-3 border-t border-border">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                        Working Hours ({activeDays.length} days/wk)
                      </span>
                      <div className="space-y-1 text-xs">
                        {activeDays.length === 0 ? (
                          <span className="text-muted-foreground italic">No active availability configured</span>
                        ) : (
                          activeDays.slice(0, 4).map(([day, s]) => (
                            <div key={day} className="flex justify-between text-muted-foreground">
                              <span className="font-medium text-card-foreground">{day.substring(0, 3)}:</span>
                              <span>
                                {s.startTime} - {s.endTime} ({s.appointmentDuration}m)
                              </span>
                            </div>
                          ))
                        )}
                        {activeDays.length > 4 && (
                          <span className="text-[11px] text-primary block mt-1">
                            +{activeDays.length - 4} more active days
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CLIENT HISTORY & METRICS TRACKING */}
      {activeTab === 'clients' && (
        <div className="space-y-6">
          {/* Client Selector */}
          <div className="bg-card p-5 rounded-xl border border-border shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-lg font-bold text-card-foreground">Longitudinal Body Composition Tracking</h2>
                <p className="text-xs text-muted-foreground">
                  Select a member to inspect historical consultations, weight curves, and body fat progression
                </p>
              </div>

              {selectedClientForHistory && (
                <button
                  onClick={() => {
                    // Open booking pre-filled for this client
                    setBookingClientId(selectedClientForHistory.id);
                    setBookingClientSearch(selectedClientForHistory.name);
                    setShowBookingDialog(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Book For {selectedClientForHistory.name.split(' ')[0]}
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search member by name, member ID or phone..."
                value={clientSearchQuery}
                onChange={(e) => setClientSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
              />

              {clientSearchQuery.trim().length > 0 && !selectedClientForHistory && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-card border border-border rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-border">
                  {clients
                    .filter(
                      (c) =>
                        c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
                        (c.phone && c.phone.includes(clientSearchQuery)) ||
                        (c.memberId && c.memberId.toLowerCase().includes(clientSearchQuery.toLowerCase()))
                    )
                    .slice(0, 8)
                    .map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedClientForHistory(c);
                          setClientSearchQuery('');
                        }}
                        className="p-3 hover:bg-muted cursor-pointer flex justify-between items-center text-sm"
                      >
                        <div>
                          <p className="font-semibold text-card-foreground">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.memberId ? `#${c.memberId} • ` : ''}
                            {c.phone}
                          </p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))}
                </div>
              )}
            </div>

            {selectedClientForHistory && (
              <div className="p-4 bg-muted/40 rounded-xl border border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                    {selectedClientForHistory.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-card-foreground flex items-center gap-2">
                      {selectedClientForHistory.name}
                      {selectedClientForHistory.memberId && (
                        <span className="text-xs font-mono px-2 py-0.5 bg-card border border-border rounded">
                          #{selectedClientForHistory.memberId}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-muted-foreground">{selectedClientForHistory.phone}</p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedClientForHistory(null)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Change Member
                </button>
              </div>
            )}
          </div>

          {/* Member Metrics Progression */}
          {selectedClientForHistory ? (
            loadingClientConsultations ? (
              <div className="p-8 text-center bg-card border border-border rounded-xl">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">Loading member consultation history...</p>
              </div>
            ) : clientConsultations.length === 0 ? (
              <div className="p-12 text-center bg-card border border-border rounded-xl">
                <Scale className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                <p className="text-base font-medium">No recorded nutrition consultations yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Book an appointment or record metrics from the queue to start tracking progress.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Latest Body Metrics KPIs */}
                {(() => {
                  const latest = clientConsultations[0];
                  const m = latest?.metrics;
                  const oldest = clientConsultations[clientConsultations.length - 1];
                  const om = oldest?.metrics;

                  const weightDelta = m?.weight && om?.weight ? (m.weight - om.weight).toFixed(1) : null;
                  const fatDelta =
                    m?.bodyFatPercentage && om?.bodyFatPercentage
                      ? (m.bodyFatPercentage - om.bodyFatPercentage).toFixed(1)
                      : null;

                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                          <span>Weight</span>
                          <Scale className="h-4 w-4 text-blue-500" />
                        </div>
                        <p className="text-2xl font-bold mt-2">
                          {m?.weight ? `${m.weight} kg` : '--'}
                        </p>
                        {weightDelta && (
                          <p
                            className={`text-xs mt-1 font-medium ${
                              parseFloat(weightDelta) <= 0 ? 'text-emerald-500' : 'text-amber-500'
                            }`}
                          >
                            {parseFloat(weightDelta) <= 0 ? '' : '+'}
                            {weightDelta} kg overall
                          </p>
                        )}
                      </div>

                      <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                          <span>Body Fat</span>
                          <Flame className="h-4 w-4 text-rose-500" />
                        </div>
                        <p className="text-2xl font-bold mt-2">
                          {m?.bodyFatPercentage ? `${m.bodyFatPercentage}%` : '--'}
                        </p>
                        {fatDelta && (
                          <p
                            className={`text-xs mt-1 font-medium ${
                              parseFloat(fatDelta) <= 0 ? 'text-emerald-500' : 'text-amber-500'
                            }`}
                          >
                            {parseFloat(fatDelta) <= 0 ? '' : '+'}
                            {fatDelta}% overall
                          </p>
                        )}
                      </div>

                      <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                          <span>Muscle Mass</span>
                          <Dumbbell className="h-4 w-4 text-emerald-500" />
                        </div>
                        <p className="text-2xl font-bold mt-2">
                          {m?.muscleMass ? `${m.muscleMass} kg` : '--'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Lean mass</p>
                      </div>

                      <div className="bg-card p-4 rounded-xl border border-border shadow-xs">
                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                          <span>BMR</span>
                          <HeartPulse className="h-4 w-4 text-purple-500" />
                        </div>
                        <p className="text-2xl font-bold mt-2">{m?.bmr ? `${m.bmr} kcal` : '--'}</p>
                        <p className="text-xs text-muted-foreground mt-1">Basal Metabolic Rate</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Progress Chart */}
                <div className="bg-card p-6 rounded-xl border border-border shadow-xs">
                  <h3 className="text-base font-bold text-card-foreground mb-4">Body Composition Progression</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={[...clientConsultations]
                          .reverse()
                          .map((c) => ({
                            date: c.date,
                            weight: c.metrics?.weight,
                            bodyFat: c.metrics?.bodyFatPercentage,
                            muscleMass: c.metrics?.muscleMass
                          }))}
                      >
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

                {/* Consultation History Timeline */}
                <div className="bg-card p-6 rounded-xl border border-border shadow-xs space-y-4">
                  <h3 className="text-base font-bold text-card-foreground">Past Consultations & Clinical Notes</h3>
                  <div className="space-y-4">
                    {clientConsultations.map((c) => (
                      <div key={c.id} className="p-4 bg-background border border-border rounded-xl space-y-3">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-primary" />
                            <span className="font-bold text-sm text-card-foreground">{c.date}</span>
                            {c.nutritionistName && (
                              <span className="text-xs text-muted-foreground">with Dr. {c.nutritionistName}</span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2 text-xs">
                            {c.metrics?.weight && (
                              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded font-medium">
                                W: {c.metrics.weight}kg
                              </span>
                            )}
                            {c.metrics?.bodyFatPercentage && (
                              <span className="px-2 py-0.5 bg-rose-500/10 text-rose-500 rounded font-medium">
                                BF: {c.metrics.bodyFatPercentage}%
                              </span>
                            )}
                            {c.metrics?.muscleMass && (
                              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded font-medium">
                                Muscle: {c.metrics.muscleMass}kg
                              </span>
                            )}
                            {c.metrics?.bmr && (
                              <span className="px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded font-medium">
                                BMR: {c.metrics.bmr} kcal
                              </span>
                            )}
                          </div>
                        </div>

                        {c.notes && (
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                              Clinical Assessment
                            </span>
                            <p className="text-sm text-card-foreground bg-card p-3 rounded-lg border border-border whitespace-pre-line">
                              {c.notes}
                            </p>
                          </div>
                        )}

                        {c.dietaryPlan && (
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                              Dietary Plan & Recommendations
                            </span>
                            <p className="text-sm text-card-foreground bg-card p-3 rounded-lg border border-border whitespace-pre-line">
                              {c.dietaryPlan}
                            </p>
                          </div>
                        )}

                        {c.followUpTasks && c.followUpTasks.length > 0 && (
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                              Follow-up Action Items
                            </span>
                            <ul className="list-disc list-inside text-xs space-y-1 text-muted-foreground">
                              {c.followUpTasks.map((t, idx) => (
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
                </div>
              </div>
            )
          ) : (
            <div className="p-12 text-center bg-card border border-border rounded-xl">
              <Scale className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-25" />
              <p className="text-base font-semibold">Select a member to view body progress</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Use the search box above to choose any gym member and analyze their biometric progress over time.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-card-foreground">Manager Analytics</h2>
            <button
              onClick={exportNutritionCSV}
              className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card p-5 rounded-xl border border-border shadow-xs">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Total Sessions
                </span>
                <Calendar className="h-5 w-5 text-blue-500" />
              </div>
              <h3 className="text-3xl font-bold text-card-foreground">{analyticsData.total}</h3>
              <p className="text-xs text-muted-foreground mt-1">{analyticsData.scheduled} upcoming</p>
            </div>

            <div className="bg-card p-5 rounded-xl border border-border shadow-xs">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Completion Rate
                </span>
                <CheckCircle className="h-5 w-5 text-emerald-500" />
              </div>
              <h3 className="text-3xl font-bold text-card-foreground">{analyticsData.completionRate}%</h3>
              <p className="text-xs text-emerald-500 font-medium mt-1">{analyticsData.completed} completed</p>
            </div>

            <div className="bg-card p-5 rounded-xl border border-border shadow-xs">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">No-Show Rate</span>
                <XCircle className="h-5 w-5 text-amber-500" />
              </div>
              <h3 className="text-3xl font-bold text-card-foreground">{analyticsData.noShowRate}%</h3>
              <p className="text-xs text-amber-500 font-medium mt-1">{analyticsData.noShow} unattended</p>
            </div>

            <div className="bg-card p-5 rounded-xl border border-border shadow-xs">
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Specialists</span>
                <User className="h-5 w-5 text-purple-500" />
              </div>
              <h3 className="text-3xl font-bold text-card-foreground">{profiles.length}</h3>
              <p className="text-xs text-muted-foreground mt-1">Active nutritionists</p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Breakdown Donut */}
            <div className="bg-card p-6 rounded-xl border border-border shadow-xs">
              <h3 className="text-base font-bold text-card-foreground mb-4">Appointment Status Distribution</h3>
              <div className="h-64 w-full flex items-center justify-center">
                {analyticsData.statusChartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No appointment data to chart</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analyticsData.statusChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {analyticsData.statusChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          borderColor: 'var(--border)',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Specialist Workload BarChart */}
            <div className="bg-card p-6 rounded-xl border border-border shadow-xs">
              <h3 className="text-base font-bold text-card-foreground mb-4">Nutritionist Workload (Sessions)</h3>
              <div className="h-64 w-full">
                {analyticsData.nutritionistWorkload.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center pt-20">No workload records</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData.nutritionistWorkload}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="name" stroke="#888888" fontSize={11} />
                      <YAxis stroke="#888888" fontSize={11} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          borderColor: 'var(--border)',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="count" fill="#3b82f6" name="Total Sessions" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="completed" fill="#10b981" name="Completed" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG: CONSULTATION NOTES & BODY METRICS */}
      {showConsultationDialog && selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in-0">
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-border flex justify-between items-center bg-muted/20">
              <div>
                <h3 className="font-bold text-lg text-card-foreground">
                  Consultation Notes & Body Metrics
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Client: <span className="font-semibold text-foreground">{selectedAppointment.clientName}</span> •
                  Specialist: <span className="font-semibold text-foreground">Dr. {selectedAppointment.nutritionistName}</span> •
                  Date: {selectedAppointment.date}
                </p>
              </div>
              <button
                onClick={() => setShowConsultationDialog(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Body Composition Metrics Section */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-primary" />
                    <h4 className="text-sm font-bold text-card-foreground uppercase tracking-wider">
                      Body Composition Metrics
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoCalculateBMR}
                    className="text-xs text-primary hover:underline font-semibold flex items-center gap-1"
                  >
                    <HeartPulse className="h-3.5 w-3.5" />
                    Auto-Calc BMR
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Weight (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 78.5"
                      value={metricsWeight}
                      onChange={(e) => setMetricsWeight(e.target.value)}
                      className="w-full p-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Body Fat (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 18.2"
                      value={metricsBodyFat}
                      onChange={(e) => setMetricsBodyFat(e.target.value)}
                      className="w-full p-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Muscle Mass (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 64.0"
                      value={metricsMuscleMass}
                      onChange={(e) => setMetricsMuscleMass(e.target.value)}
                      className="w-full p-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">BMR (kcal)</label>
                    <input
                      type="number"
                      placeholder="e.g. 1750"
                      value={metricsBmr}
                      onChange={(e) => setMetricsBmr(e.target.value)}
                      className="w-full p-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Height (cm)</label>
                    <input
                      type="number"
                      placeholder="e.g. 178"
                      value={metricsHeight}
                      onChange={(e) => setMetricsHeight(e.target.value)}
                      className="w-full p-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Visceral Fat (1-30)</label>
                    <input
                      type="number"
                      placeholder="e.g. 6"
                      value={metricsVisceralFat}
                      onChange={(e) => setMetricsVisceralFat(e.target.value)}
                      className="w-full p-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Private Clinical Notes */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-emerald-500" />
                  <h4 className="text-sm font-bold text-card-foreground uppercase tracking-wider">
                    Clinical Consultation Notes
                  </h4>
                </div>
                <textarea
                  rows={4}
                  placeholder="Record private clinical assessment, caloric targets, macronutrient split, and health observations..."
                  value={consultationNotes}
                  onChange={(e) => setConsultationNotes(e.target.value)}
                  className="w-full p-3 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                />
              </div>

              {/* Dietary Plan & Guidelines */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" />
                  <h4 className="text-sm font-bold text-card-foreground uppercase tracking-wider">
                    Dietary Plan & Recommendations
                  </h4>
                </div>
                <textarea
                  rows={3}
                  placeholder="Outline meal guidelines, supplement stack, hydration target, pre/post workout nutrition..."
                  value={dietaryPlan}
                  onChange={(e) => setDietaryPlan(e.target.value)}
                  className="w-full p-3 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                />
              </div>

              {/* Follow-up Tasks */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Client Follow-up Action Items
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Drink 3.5L water daily, send food diary weekly..."
                    value={newTaskInput}
                    onChange={(e) => setNewTaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newTaskInput.trim()) {
                          setFollowUpTasks([...followUpTasks, newTaskInput.trim()]);
                          setNewTaskInput('');
                        }
                      }
                    }}
                    className="flex-1 p-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newTaskInput.trim()) {
                        setFollowUpTasks([...followUpTasks, newTaskInput.trim()]);
                        setNewTaskInput('');
                      }
                    }}
                    className="px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-xs font-semibold"
                  >
                    Add
                  </button>
                </div>

                {followUpTasks.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    {followUpTasks.map((t, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center p-2 bg-muted/40 rounded-lg text-xs"
                      >
                        <span className="text-card-foreground font-medium">• {t}</span>
                        <button
                          type="button"
                          onClick={() => setFollowUpTasks(followUpTasks.filter((_, i) => i !== idx))}
                          className="text-rose-500 hover:text-rose-600 font-bold px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Update Checkbox */}
              {selectedAppointment.status === 'Scheduled' && (
                <div className="flex items-center gap-2 p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <input
                    type="checkbox"
                    id="markCompleted"
                    checked={markCompletedOnSave}
                    onChange={(e) => setMarkCompletedOnSave(e.target.checked)}
                    className="h-4 w-4 rounded accent-emerald-500"
                  />
                  <label htmlFor="markCompleted" className="text-xs font-medium text-emerald-500 cursor-pointer">
                    Automatically mark appointment status as "Completed" upon saving
                  </label>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-3 bg-muted/20">
              <button
                type="button"
                onClick={() => setShowConsultationDialog(false)}
                className="px-4 py-2 hover:bg-muted rounded-xl text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingConsultation}
                onClick={handleSaveConsultation}
                className="px-5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-sm font-bold shadow-xs disabled:opacity-50"
              >
                {savingConsultation ? 'Saving...' : 'Save Notes & Metrics'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG: BOOK NEW APPOINTMENT */}
      {showBookingDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in-0">
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg overflow-hidden my-8">
            <div className="p-5 border-b border-border flex justify-between items-center bg-muted/20">
              <h3 className="font-bold text-lg text-card-foreground">Book Nutrition Consultation</h3>
              <button
                onClick={() => setShowBookingDialog(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Select Member */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Gym Member <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search member by name or phone..."
                    value={bookingClientSearch}
                    onChange={(e) => {
                      setBookingClientSearch(e.target.value);
                      if (bookingClientId) setBookingClientId('');
                    }}
                    className="w-full p-2.5 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                  />

                  {bookingClientSearch && !bookingClientId && (
                    <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-border">
                      {clients
                        .filter(
                          (c) =>
                            c.name.toLowerCase().includes(bookingClientSearch.toLowerCase()) ||
                            (c.phone && c.phone.includes(bookingClientSearch))
                        )
                        .slice(0, 6)
                        .map((c) => (
                          <div
                            key={c.id}
                            onClick={() => {
                              setBookingClientId(c.id);
                              setBookingClientSearch(`${c.name} (${c.phone || c.memberId || 'No phone'})`);
                            }}
                            className="p-2.5 hover:bg-muted cursor-pointer text-sm"
                          >
                            <p className="font-medium text-card-foreground">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.phone}</p>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Select Nutritionist */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Nutritionist / Dietitian <span className="text-rose-500">*</span>
                </label>
                <select
                  value={bookingNutritionistId}
                  onChange={(e) => setBookingNutritionistId(e.target.value)}
                  className="w-full p-2.5 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                >
                  <option value="">-- Select Specialist --</option>
                  {profiles
                    .filter((p) => p.active)
                    .map((p) => (
                      <option key={p.id} value={p.userId}>
                        Dr. {p.name} {p.specialties ? `(${p.specialties.slice(0, 2).join(', ')})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  min={todayStr}
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="w-full p-2.5 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                />
              </div>

              {/* Time Slots */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Start Time</label>
                  <input
                    type="time"
                    value={bookingStartTime}
                    onChange={(e) => setBookingStartTime(e.target.value)}
                    className="w-full p-2.5 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">End Time</label>
                  <input
                    type="time"
                    value={bookingEndTime}
                    onChange={(e) => setBookingEndTime(e.target.value)}
                    className="w-full p-2.5 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                  />
                </div>
              </div>

              {/* Payment Status */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Payment Status</label>
                <select
                  value={bookingPaymentStatus}
                  onChange={(e) => setBookingPaymentStatus(e.target.value as 'pending' | 'completed')}
                  className="w-full p-2.5 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                >
                  <option value="pending">Pending Payment</option>
                  <option value="completed">Completed / Entitlement Paid</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">
                  Client Goals / Appointment Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Contest prep nutrition review, fat loss restart..."
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  className="w-full p-2.5 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/50 outline-none"
                />
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-3 bg-muted/20">
              <button
                type="button"
                onClick={() => setShowBookingDialog(false)}
                className="px-4 py-2 hover:bg-muted rounded-xl text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bookingSubmitting || !bookingClientId || !bookingNutritionistId || !bookingDate}
                onClick={handleCreateBooking}
                className="px-5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-sm font-bold shadow-xs disabled:opacity-50"
              >
                {bookingSubmitting ? 'Booking...' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG: RESCHEDULE APPOINTMENT */}
      {showRescheduleDialog && selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-border flex justify-between items-center bg-muted/20">
              <h3 className="font-bold text-base text-card-foreground">Reschedule Appointment</h3>
              <button onClick={() => setShowRescheduleDialog(false)} className="p-1 text-muted-foreground">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">
                Rescheduling consultation for{' '}
                <span className="font-semibold text-foreground">{selectedAppointment.clientName}</span>.
              </p>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">New Date</label>
                <input
                  type="date"
                  min={todayStr}
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full p-2 bg-background border border-input rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">New Start Time</label>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full p-2 bg-background border border-input rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Reason (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Member requested change"
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  className="w-full p-2 bg-background border border-input rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2 bg-muted/20">
              <button
                onClick={() => setShowRescheduleDialog(false)}
                className="px-3 py-1.5 hover:bg-muted rounded-lg text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReschedule}
                className="px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold"
              >
                Save Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG: CANCEL APPOINTMENT */}
      {showCancelDialog && selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-border flex justify-between items-center bg-muted/20">
              <h3 className="font-bold text-base text-rose-500">Cancel Appointment</h3>
              <button onClick={() => setShowCancelDialog(false)} className="p-1 text-muted-foreground">
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">
                Are you sure you want to cancel the appointment for{' '}
                <span className="font-semibold text-foreground">{selectedAppointment.clientName}</span> on{' '}
                {selectedAppointment.date}?
              </p>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Cancellation Reason</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Member emergency, medical reason..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full p-2 bg-background border border-input rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2 bg-muted/20">
              <button
                onClick={() => setShowCancelDialog(false)}
                className="px-3 py-1.5 hover:bg-muted rounded-lg text-xs font-medium"
              >
                Keep Appointment
              </button>
              <button
                onClick={handleConfirmCancel}
                className="px-4 py-1.5 bg-rose-500 text-white hover:bg-rose-600 rounded-lg text-xs font-bold"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG: NUTRITIONIST PROFILE & SCHEDULE */}
      {showNutritionistDialog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in-0">
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-border flex justify-between items-center bg-muted/20">
              <h3 className="font-bold text-lg text-card-foreground">
                {editingProfileUserId ? 'Edit Nutritionist Profile & Schedule' : 'Add Nutritionist Profile'}
              </h3>
              <button onClick={() => setShowNutritionistDialog(false)} className="p-1 text-muted-foreground">
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Profile Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sarah Mansour"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full p-2.5 bg-background border border-input rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">
                    Linked User ID / Coach <span className="text-rose-500">*</span>
                  </label>
                  {coaches.length > 0 ? (
                    <select
                      value={editingProfileUserId}
                      onChange={(e) => {
                        setEditingProfileUserId(e.target.value);
                        const c = coaches.find((coach) => (coach.userId || coach.id) === e.target.value);
                        if (c && !profileName) setProfileName(c.name);
                      }}
                      className="w-full p-2.5 bg-background border border-input rounded-lg text-sm"
                    >
                      <option value="">-- Choose Coach / User --</option>
                      {coaches.map((c) => (
                        <option key={c.id} value={c.userId || c.id}>
                          {c.name} ({c.phone || c.email || c.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. user-uid-123 or coach name"
                      value={editingProfileUserId}
                      onChange={(e) => setEditingProfileUserId(e.target.value)}
                      className="w-full p-2.5 bg-background border border-input rounded-lg text-sm"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Email</label>
                  <input
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className="w-full p-2.5 bg-background border border-input rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1">Phone</label>
                  <input
                    type="tel"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="w-full p-2.5 bg-background border border-input rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Bio / Credentials</label>
                <textarea
                  rows={2}
                  placeholder="Clinical Dietitian, Master's in Sports Nutrition, ISSN Certified..."
                  value={profileBio}
                  onChange={(e) => setProfileBio(e.target.value)}
                  className="w-full p-2.5 bg-background border border-input rounded-lg text-sm"
                />
              </div>

              {/* Specialties Tag Manager */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Specialties</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add specialty tag..."
                    value={newSpecialtyInput}
                    onChange={(e) => setNewSpecialtyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newSpecialtyInput.trim()) {
                          setProfileSpecialties([...profileSpecialties, newSpecialtyInput.trim()]);
                          setNewSpecialtyInput('');
                        }
                      }
                    }}
                    className="flex-1 p-2 bg-background border border-input rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newSpecialtyInput.trim()) {
                        setProfileSpecialties([...profileSpecialties, newSpecialtyInput.trim()]);
                        setNewSpecialtyInput('');
                      }
                    }}
                    className="px-3 py-2 bg-muted hover:bg-muted/80 rounded-lg text-xs font-semibold"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-2">
                  {profileSpecialties.map((spec, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 bg-primary/10 text-primary rounded-md text-xs font-medium flex items-center gap-1.5"
                    >
                      {spec}
                      <button
                        type="button"
                        onClick={() => setProfileSpecialties(profileSpecialties.filter((_, idx) => idx !== i))}
                        className="text-primary hover:text-destructive"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Weekly Availability Schedule */}
              <div className="space-y-3 pt-4 border-t border-border">
                <h4 className="text-sm font-bold text-card-foreground">Weekly Working Schedule</h4>
                <div className="space-y-2">
                  {DAYS_OF_WEEK.map((day) => {
                    const sched = profileSchedule[day] || {
                      enabled: false,
                      startTime: '10:00',
                      endTime: '18:00',
                      appointmentDuration: 45
                    };

                    return (
                      <div
                        key={day}
                        className={`p-3 rounded-xl border transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
                          sched.enabled ? 'bg-background border-border' : 'bg-muted/30 border-transparent opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-3 w-32">
                          <input
                            type="checkbox"
                            id={`day-${day}`}
                            checked={sched.enabled}
                            onChange={(e) => {
                              setProfileSchedule({
                                ...profileSchedule,
                                [day]: { ...sched, enabled: e.target.checked }
                              });
                            }}
                            className="h-4 w-4 rounded accent-primary"
                          />
                          <label htmlFor={`day-${day}`} className="font-bold text-xs cursor-pointer">
                            {day}
                          </label>
                        </div>

                        {sched.enabled && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span>From</span>
                            <input
                              type="time"
                              value={sched.startTime}
                              onChange={(e) => {
                                setProfileSchedule({
                                  ...profileSchedule,
                                  [day]: { ...sched, startTime: e.target.value }
                                });
                              }}
                              className="p-1.5 bg-background border border-input rounded text-xs"
                            />
                            <span>To</span>
                            <input
                              type="time"
                              value={sched.endTime}
                              onChange={(e) => {
                                setProfileSchedule({
                                  ...profileSchedule,
                                  [day]: { ...sched, endTime: e.target.value }
                                });
                              }}
                              className="p-1.5 bg-background border border-input rounded text-xs"
                            />
                            <span>Slot Duration:</span>
                            <select
                              value={sched.appointmentDuration}
                              onChange={(e) => {
                                setProfileSchedule({
                                  ...profileSchedule,
                                  [day]: { ...sched, appointmentDuration: parseInt(e.target.value) }
                                });
                              }}
                              className="p-1.5 bg-background border border-input rounded text-xs"
                            >
                              <option value="30">30 min</option>
                              <option value="45">45 min</option>
                              <option value="60">60 min</option>
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Active status */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="profileActive"
                  checked={profileActive}
                  onChange={(e) => setProfileActive(e.target.checked)}
                  className="h-4 w-4 rounded accent-primary"
                />
                <label htmlFor="profileActive" className="text-sm font-semibold cursor-pointer">
                  Active (profile can receive bookings)
                </label>
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-3 bg-muted/20">
              <button
                type="button"
                onClick={() => setShowNutritionistDialog(false)}
                className="px-4 py-2 hover:bg-muted rounded-xl text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingProfile || !profileName.trim() || !editingProfileUserId.trim()}
                onClick={handleSaveNutritionist}
                className="px-5 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl text-sm font-bold shadow-xs disabled:opacity-50"
              >
                {savingProfile ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
