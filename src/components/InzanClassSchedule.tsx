import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';
import { useClasses } from '../hooks/useClasses';
import { useClassBookings } from '../hooks/useClassBookings';
import { useAuth } from '../contexts/AuthContext';

export const InzanClassSchedule: React.FC = () => {
  const { classes, loading } = useClasses();
  const { currentUser } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  if (loading) {
    return <div className="p-4 flex justify-center">Loading classes...</div>;
  }

  // Basic layout for Inzan Athletics Class Schedule
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Class Schedule</h2>
        <div className="flex space-x-2">
           {/* Date picker placeholder */}
           <Button variant="outline"><Calendar className="mr-2 h-4 w-4"/> {selectedDate.toDateString()}</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {classes.length === 0 ? (
          <div className="col-span-full text-center p-8 text-muted-foreground bg-muted/20 rounded-lg">
            No classes scheduled for today.
          </div>
        ) : (
          classes.map(cls => (
            <Card key={cls.id} className="overflow-hidden">
              <div className={`h-2 ${cls.price > 0 ? 'bg-primary' : 'bg-green-500'}`} />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{cls.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{cls.instructorName}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {cls.price === 0 ? 'Free' : `$${cls.price}`}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-sm mb-4">
                  <div>
                    <p className="font-medium">Time</p>
                    <p className="text-muted-foreground">
                      {new Date(cls.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                      {new Date(cls.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">Capacity</p>
                    <p className="text-muted-foreground">0 / {cls.capacity}</p>
                  </div>
                </div>
                
                <Button className="w-full">
                  {cls.price === 0 ? 'Book Class' : 'Pay & Book'}
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
