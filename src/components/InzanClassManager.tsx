import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useClasses } from '../hooks/useClasses';
import { InzanClassAnalytics } from './InzanClassAnalytics';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const InzanClassManager: React.FC = () => {
  const { classes, loading, addClass, deleteClass } = useClasses();
  const [isCreating, setIsCreating] = useState(false);

  if (loading) {
    return <div className="p-4 flex justify-center">Loading manager dashboard...</div>;
  }

  const handleCreateDummyClass = async () => {
    setIsCreating(true);
    try {
      const now = new Date();
      const end = new Date(now.getTime() + 60 * 60 * 1000); // +1 hour
      
      await addClass({
        name: 'HIIT Bootcamp',
        instructorId: 'inst-1',
        instructorName: 'Coach Sarah',
        category: 'Cardio',
        capacity: 20,
        price: 0,
        startTime: now.toISOString(),
        endTime: end.toISOString(),
        status: 'active'
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Class Management (Inzan)</h2>
        <Button onClick={handleCreateDummyClass} disabled={isCreating}>
          + Create Class
        </Button>
      </div>

      <Tabs defaultValue="classes" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="classes">Class Schedule</TabsTrigger>
          <TabsTrigger value="analytics">Manager Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="classes">
          <Card>
            <CardHeader>
              <CardTitle>Active Classes</CardTitle>
            </CardHeader>
        <CardContent>
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Class</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Instructor</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Time</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Capacity</th>
                  <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {classes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">No classes created yet.</td>
                  </tr>
                ) : (
                  classes.map(cls => (
                    <tr key={cls.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle font-medium">{cls.name}</td>
                      <td className="p-4 align-middle">{cls.instructorName}</td>
                      <td className="p-4 align-middle">
                        {new Date(cls.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-4 align-middle">{cls.capacity}</td>
                      <td className="p-4 align-middle text-right">
                        <Button variant="ghost" size="sm" onClick={() => deleteClass(cls.id)}>Delete</Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <InzanClassAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
};
