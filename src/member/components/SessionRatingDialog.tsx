import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Session } from '../../types';

interface SessionRatingDialogProps {
  session: Session | null;
  onOpenChange: (open: boolean) => void;
}

export function SessionRatingDialog({ session, onOpenChange }: SessionRatingDialogProps) {
  const [rating, setRating] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hoveredRating, setHoveredRating] = useState<number>(0);

  // Reset state when session changes
  React.useEffect(() => {
    if (session) {
      setRating(session.rating || 0);
      setFeedback(session.feedback || '');
    }
  }, [session]);

  const handleSubmit = async () => {
    if (!session || rating === 0) return;
    
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'sessions', session.id), {
        rating,
        feedback,
        updatedAt: new Date().toISOString()
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Error submitting rating:", error);
      alert("Failed to submit rating. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!session) return null;

  return (
    <Dialog open={!!session} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Rate Your Session</DialogTitle>
          <DialogDescription>
            How was your training session? Your feedback helps us improve.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 flex flex-col items-center">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className="transition-transform hover:scale-110 focus:outline-none"
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                onClick={() => setRating(star)}
              >
                <Star
                  className={`h-10 w-10 ${
                    (hoveredRating || rating) >= star
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-muted-foreground/30'
                  } transition-colors`}
                />
              </button>
            ))}
          </div>

          <div className="w-full space-y-2">
            <Textarea 
              placeholder="Tell us more about your experience... (Optional)" 
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="h-24 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || rating === 0}>
            {isSubmitting ? 'Submitting...' : 'Submit Rating'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
