import React, { useState } from 'react';
import { AttendanceReconciliationModal } from '../components/attendance/AttendanceReconciliationModal';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Sparkles } from 'lucide-react';

export default function AttendanceReconciliationPage() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <Card className="border bg-card/60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl font-black flex items-center gap-2">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
                Paper Roster Attendance Reconciliation Engine
              </CardTitle>
              <CardDescription>
                Align digital CRM attendance with physical front-desk paper rosters, forgive false no-show penalties, and backdate attendance immutably.
              </CardDescription>
            </div>
            <Button onClick={() => setIsOpen(true)} className="font-bold">
              <Sparkles className="h-4 w-4 mr-2" />
              Open Reconciliation Workspace
            </Button>
          </div>
        </CardHeader>
      </Card>

      <AttendanceReconciliationModal 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)} 
      />
    </div>
  );
}
