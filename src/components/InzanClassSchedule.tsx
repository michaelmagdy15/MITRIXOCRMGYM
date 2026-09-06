import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Users, CheckCircle, AlertTriangle, Dumbbell, Sparkles } from 'lucide-react';
import { useClasses } from '../hooks/useClasses';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { format, addDays, subDays, isSameDay } from 'date-fns';
import { safeFormatDate, safeFormatTime, safeIsSameDay } from '../utils/dateUtils';

export const InzanClassSchedule: React.FC = () => {
  const { classes, loading } = useClasses();
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [actionClassId, setActionClassId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Available categories derived from classes
  const categories = useMemo(() => {
    const set = new Set<string>();
    classes.forEach(c => {
      if (c.category) set.add(c.category);
    });
    return Array.from(set);
  }, [classes]);

  // Filter classes by selected date and category
  const filteredClasses = useMemo(() => {
    return classes.filter(cls => {
      if (!cls.startTime) return false;
      const matchesDate = safeIsSameDay(cls.startTime, selectedDate);
      const matchesCategory = selectedCategory === 'all' || cls.category === selectedCategory;
      return matchesDate && matchesCategory;
    }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [classes, selectedDate, selectedCategory]);

  const handleBookingAction = async (classId: string, action: 'join' | 'leave') => {
    if (!currentUser?.id) {
      setFeedbackMessage({ text: 'Please log in to book or manage classes.', type: 'error' });
      return;
    }

    setActionClassId(classId);
    setFeedbackMessage(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/classes/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          classId,
          action,
          clientId: currentUser.id
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action} class`);
      }

      setFeedbackMessage({
        text: action === 'join' ? 'Booking confirmed successfully!' : 'Booking cancelled successfully.',
        type: 'success'
      });
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: any) {
      console.error(`Error ${action}ing class:`, err);
      setFeedbackMessage({
        text: err.message || `Failed to ${action} class. Please try again.`,
        type: 'error'
      });
      setTimeout(() => setFeedbackMessage(null), 5000);
    } finally {
      setActionClassId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading class schedule...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Date Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card/60 backdrop-blur-md p-4 rounded-xl border">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Class Schedule</h2>
          <p className="text-sm text-muted-foreground">Browse daily fitness classes and reserve your spot</p>
        </div>

        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setSelectedDate(subDays(selectedDate, 1))}
            title="Previous Day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Button 
            variant="outline"
            className="font-medium min-w-[160px]"
            onClick={() => setSelectedDate(new Date())}
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
            {safeIsSameDay(selectedDate, new Date()) ? 'Today' : safeFormatDate(selectedDate, 'EEE, MMM d')}
          </Button>

          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            title="Next Day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Category Pills */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <Button
            variant={selectedCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory('all')}
            className="rounded-full text-xs font-medium"
          >
            All Categories
          </Button>
          {categories.map(cat => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className="rounded-full text-xs font-medium whitespace-nowrap"
            >
              {cat}
            </Button>
          ))}
        </div>
      )}

      {/* Feedback Alert */}
      {feedbackMessage && (
        <div className={`p-4 rounded-lg flex items-center gap-3 border ${
          feedbackMessage.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
        }`}>
          {feedbackMessage.type === 'success' ? (
            <CheckCircle className="h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          )}
          <span className="text-sm font-medium">{feedbackMessage.text}</span>
        </div>
      )}

      {/* Class Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredClasses.length === 0 ? (
          <div className="col-span-full text-center py-16 px-4 bg-muted/20 border border-dashed rounded-xl">
            <Dumbbell className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-semibold">No classes scheduled</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              There are no classes scheduled for {safeFormatDate(selectedDate, 'EEEE, MMMM d, yyyy')}{selectedCategory !== 'all' ? ` in ${selectedCategory}` : ''}.
            </p>
          </div>
        ) : (
          filteredClasses.map(cls => {
            const attendees = cls.attendees || [];
            const waitlist = cls.waitlist || [];
            const currentUserId = currentUser?.id || '';
            const isBooked = attendees.includes(currentUserId);
            const isWaitlisted = waitlist.includes(currentUserId);
            const isFull = attendees.length >= cls.capacity;
            const isBusy = actionClassId === cls.id;

            return (
              <Card key={cls.id} className="overflow-hidden flex flex-col border hover:border-primary/40 transition-colors">
                <div className={`h-1.5 ${isBooked ? 'bg-emerald-500' : isWaitlisted ? 'bg-amber-500' : 'bg-primary'}`} />
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {cls.category || 'General'}
                        </span>
                        {isBooked && (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-xs">
                            Booked
                          </Badge>
                        )}
                        {isWaitlisted && (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-xs">
                            Waitlisted
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg font-bold">{cls.name}</CardTitle>
                      <CardDescription className="text-sm mt-0.5">
                        Coach: {cls.instructorName || 'TBA'}
                      </CardDescription>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground shrink-0">
                      {cls.price === 0 ? 'Free' : `$${cls.price}`}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col justify-between pt-0 space-y-4">
                  <div className="space-y-2 text-sm bg-muted/40 p-3 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center text-muted-foreground">
                        <Clock className="mr-1.5 h-4 w-4 text-primary" />
                        <span>Time</span>
                      </div>
                      <span className="font-medium">
                        {safeFormatTime(cls.startTime)} - {safeFormatTime(cls.endTime)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center text-muted-foreground">
                        <Users className="mr-1.5 h-4 w-4 text-primary" />
                        <span>Capacity</span>
                      </div>
                      <div className="text-right">
                        <span className={`font-semibold ${isFull ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                          {attendees.length} / {cls.capacity}
                        </span>
                        {waitlist.length > 0 && (
                          <span className="text-xs text-muted-foreground ml-1.5">
                            ({waitlist.length} waitlist)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div>
                    {isBooked ? (
                      <Button 
                        variant="outline" 
                        className="w-full border-rose-500/30 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
                        disabled={isBusy}
                        onClick={() => handleBookingAction(cls.id, 'leave')}
                      >
                        {isBusy ? 'Cancelling...' : 'Cancel Reservation'}
                      </Button>
                    ) : isWaitlisted ? (
                      <Button 
                        variant="outline" 
                        className="w-full border-amber-500/30 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400"
                        disabled={isBusy}
                        onClick={() => handleBookingAction(cls.id, 'leave')}
                      >
                        {isBusy ? 'Leaving waitlist...' : 'Leave Waitlist'}
                      </Button>
                    ) : isFull ? (
                      <Button 
                        variant="secondary" 
                        className="w-full font-medium"
                        disabled={isBusy}
                        onClick={() => handleBookingAction(cls.id, 'join')}
                      >
                        {isBusy ? 'Joining...' : 'Join Waitlist'}
                      </Button>
                    ) : (
                      <Button 
                        className="w-full font-semibold shadow-sm"
                        disabled={isBusy}
                        onClick={() => handleBookingAction(cls.id, 'join')}
                      >
                        {isBusy ? 'Booking...' : cls.price === 0 ? 'Book Class' : `Pay & Book ($${cls.price})`}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};
