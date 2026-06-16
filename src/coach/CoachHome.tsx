import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar, Users, Dumbbell, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type CoachTab = 'home' | 'schedule' | 'members' | 'sessions' | 'profile';

export default function CoachHome({ onNavigate }: { onNavigate: (tab: CoachTab) => void }) {
  const { currentUser } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome, {currentUser?.name || 'Coach'}!</h2>
        <p className="text-muted-foreground mt-1">Here is your daily overview.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => onNavigate('schedule')}>
          <CardHeader className="p-4 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">My Schedule</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground">Manage your availability</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => onNavigate('sessions')}>
          <CardHeader className="p-4 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
            <Dumbbell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground">View upcoming PT</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => onNavigate('members')}>
          <CardHeader className="p-4 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground">Check your clients</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => onNavigate('profile')}>
          <CardHeader className="p-4 flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Profile</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground">Update your details</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today's Overview</CardTitle>
          <CardDescription>You have no upcoming sessions scheduled for today.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
