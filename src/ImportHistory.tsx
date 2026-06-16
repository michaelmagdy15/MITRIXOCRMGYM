import React from 'react';
import { useAppContext } from './context';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { History, RotateCcw } from 'lucide-react';
import { ConfirmDialog } from './components/ConfirmDialog';

export default function ImportHistory() {
  const { currentUser, importBatches, rollbackImport } = useAppContext();
  const [isConfirmRollbackOpen, setIsConfirmRollbackOpen] = React.useState(false);
  const [batchToRollback, setBatchToRollback] = React.useState<string | null>(null);

  if (currentUser?.role !== 'admin' && currentUser?.role !== 'super_admin' && currentUser?.role !== 'crm_admin') {
    return null;
  }

  const handleRollback = async (batchId: string) => {
    setBatchToRollback(batchId);
    setIsConfirmRollbackOpen(true);
  };

  const confirmRollback = async () => {
    if (batchToRollback) {
      await rollbackImport(batchToRollback);
      setBatchToRollback(null);
    }
  };

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <History className="mr-2 h-4 w-4" />
            Import History
          </Button>
        }
      />
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import History & Rollback</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>File Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {importBatches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(batch => (
                <TableRow key={batch.id}>
                  <TableCell>{format(parseISO(batch.date), 'MMM d, yyyy h:mm a')}</TableCell>
                  <TableCell>{batch.fileName}</TableCell>
                  <TableCell>{batch.status}</TableCell>
                  <TableCell>
                    {batch.status === 'Completed' && (
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => handleRollback(batch.id)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Rollback
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {importBatches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No import history found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>

      <ConfirmDialog 
        isOpen={isConfirmRollbackOpen}
        onOpenChange={setIsConfirmRollbackOpen}
        title="Rollback Import"
        description="Are you sure you want to rollback this import? This will delete all clients imported in this batch. This action cannot be undone."
        onConfirm={confirmRollback}
        variant="destructive"
        confirmText="Rollback"
      />
    </Dialog>
  );
}
