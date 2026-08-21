import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '../../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Client, User } from '../../types';

interface AssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  coaches: User[];
}

export function AssessmentDialog({ open, onOpenChange, client, coaches }: AssessmentDialogProps) {
  const [preferredCoachId, setPreferredCoachId] = useState<string>('any');
  const [preferredDate, setPreferredDate] = useState<string>('');
  const [preferredTime, setPreferredTime] = useState<string>('');
  const [injuries, setInjuries] = useState<string>('');
  const [goals, setGoals] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      let preferredCoachName = 'Any Coach';
      if (preferredCoachId !== 'any') {
        const coach = coaches.find(c => c.id === preferredCoachId);
        if (coach) preferredCoachName = coach.name;
      }

      await addDoc(collection(db, 'assessments'), {
        clientId: client.id,
        clientName: client.name,
        preferredCoachId: preferredCoachId === 'any' ? null : preferredCoachId,
        preferredCoachName,
        preferredDate,
        preferredTime,
        injuries,
        goals,
        status: 'Pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onOpenChange(false);
        setPreferredCoachId('any');
        setPreferredDate('');
        setPreferredTime('');
        setInjuries('');
        setGoals('');
      }, 2000);
    } catch (error) {
      console.error("Error submitting assessment:", error);
      alert("Failed to submit assessment request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Request Assessment</DialogTitle>
          <DialogDescription>
            Fill out this form to request a personal training assessment. A coach will review your details and contact you to schedule it.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center">
            <div className="h-12 w-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h3 className="text-lg font-medium">Request Submitted</h3>
            <p className="text-sm text-muted-foreground mt-1">A coach will be in touch with you shortly.</p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Preferred Coach (Optional)</Label>
              <Select value={preferredCoachId} onValueChange={(val: string | null) => setPreferredCoachId(val || '')}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a coach" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any Available Coach</SelectItem>
                  {coaches.map(coach => (
                    <SelectItem key={coach.id} value={coach.id}>{coach.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Preferred Availability</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input 
                  placeholder="e.g. Mon/Wed" 
                  value={preferredDate} 
                  onChange={(e) => setPreferredDate(e.target.value)} 
                />
                <Input 
                  placeholder="e.g. Evenings" 
                  value={preferredTime} 
                  onChange={(e) => setPreferredTime(e.target.value)} 
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Current Injuries or Medical Conditions</Label>
              <Textarea 
                placeholder="List any injuries or conditions we should know about..." 
                value={injuries}
                onChange={(e) => setInjuries(e.target.value)}
                className="h-20 resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label>Fitness Goals</Label>
              <Textarea 
                placeholder="What are you hoping to achieve?" 
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                className="h-20 resize-none"
              />
            </div>
          </div>
        )}

        {!success && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
