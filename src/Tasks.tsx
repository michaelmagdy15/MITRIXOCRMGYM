import React, { useState } from 'react';
import { useAppContext } from './context';
import { useAuth } from './contexts/AuthContext';
import { useTasks } from './hooks/useTasks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Calendar as CalendarIcon, CheckCircle2, Circle, Clock, AlertCircle, Trash2, Edit } from 'lucide-react';
import { format, parseISO, isBefore, isToday } from 'date-fns';
import { Task, TaskStatus, TaskPriority } from './types';
import { Badge } from '@/components/ui/badge';

export default function Tasks() {
  const { users, clients } = useAppContext();
  const { currentUser } = useAuth();
  const { tasks, addTask, updateTask, deleteTask } = useTasks();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  
  const [newTask, setNewTask] = useState<Partial<Task>>({
    title: '',
    description: '',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    status: 'Pending',
    priority: 'Medium',
    assignedTo: currentUser?.id || '',
    clientId: 'none'
  });

  const handleAddTask = async () => {
    if (!newTask.title || !newTask.dueDate || !newTask.assignedTo) return;
    
    await addTask({
      title: newTask.title,
      description: newTask.description,
      dueDate: newTask.dueDate,
      status: newTask.status as TaskStatus,
      priority: newTask.priority as TaskPriority,
      assignedTo: newTask.assignedTo,
      clientId: newTask.clientId === 'none' ? undefined : newTask.clientId,
    });
    
    setIsAddOpen(false);
    setNewTask({
      title: '',
      description: '',
      dueDate: format(new Date(), 'yyyy-MM-dd'),
      status: 'Pending',
      priority: 'Medium',
      assignedTo: currentUser?.id || '',
      clientId: 'none'
    });
  };

  const handleEditTask = async () => {
    if (!editingTask || !editingTask.title || !editingTask.dueDate || !editingTask.assignedTo) return;
    
    await updateTask(editingTask.id, {
      title: editingTask.title,
      description: editingTask.description,
      dueDate: editingTask.dueDate,
      status: editingTask.status,
      priority: editingTask.priority,
      assignedTo: editingTask.assignedTo,
      clientId: editingTask.clientId === 'none' ? undefined : editingTask.clientId,
    });
    
    setIsEditOpen(false);
    setEditingTask(null);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'High': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'Medium': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'Low': return 'text-green-500 bg-green-500/10 border-green-500/20';
      default: return 'text-muted-foreground bg-muted border-muted';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'In Progress': return <Clock className="h-5 w-5 text-amber-500" />;
      default: return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  // Returns true when the current user is only an assignee (not the creator and not a manager+)
  const isAssigneeOnly = (task: Task): boolean => {
    if (!currentUser) return true;
    const role = currentUser.role;
    if (role === 'manager' || role === 'admin' || role === 'super_admin' || role === 'crm_admin') return false;
    if (task.createdBy === currentUser.id) return false;
    return task.assignedTo === currentUser.id;
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.status === 'Completed' && b.status !== 'Completed') return 1;
    if (a.status !== 'Completed' && b.status === 'Completed') return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
          <p className="text-muted-foreground">Manage your to-dos and follow-ups.</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Task
            </Button>
          } />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input 
                  value={newTask.title} 
                  onChange={e => setNewTask({...newTask, title: e.target.value})} 
                  placeholder="Follow up with lead..."
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input 
                  value={newTask.description} 
                  onChange={e => setNewTask({...newTask, description: e.target.value})} 
                  placeholder="Optional details..."
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input 
                    type="date" 
                    value={newTask.dueDate} 
                    onChange={e => setNewTask({...newTask, dueDate: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={newTask.priority} onValueChange={(v) => v && setNewTask({...newTask, priority: v as TaskPriority})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Low">Low</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Assign To</Label>
                  <Select value={newTask.assignedTo} onValueChange={v => v && setNewTask({...newTask, assignedTo: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {users.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name || u.email || 'Unknown User'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Related Client (Optional)</Label>
                  <Select value={newTask.clientId || 'none'} onValueChange={v => v && setNewTask({...newTask, clientId: v})}>
                    <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full" onClick={handleAddTask} disabled={!newTask.title || !newTask.dueDate}>
                Create Task
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {sortedTasks.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/20">
            <CheckCircle2 className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">No tasks found</h3>
            <p className="text-muted-foreground">You're all caught up!</p>
          </div>
        ) : (
          sortedTasks.map(task => {
            const isOverdue = task.status !== 'Completed' && isBefore(parseISO(task.dueDate), new Date()) && !isToday(parseISO(task.dueDate));
            const assignedUser = users.find(u => u.id === task.assignedTo);
            const relatedClient = clients.find(c => c.id === task.clientId);

            return (
              <Card key={task.id} className={`transition-all ${task.status === 'Completed' ? 'opacity-60 bg-muted/50' : ''}`}>
                <CardContent className="p-4 sm:p-6 flex items-start gap-4">
                  <button 
                    onClick={() => updateTask(task.id, { status: task.status === 'Completed' ? 'Pending' : 'Completed' })}
                    className="mt-1 flex-shrink-0 hover:scale-110 transition-transform"
                  >
                    {getStatusIcon(task.status)}
                  </button>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div>
                        <h4 className={`font-medium text-base ${task.status === 'Completed' ? 'line-through text-muted-foreground' : ''}`}>
                          {task.title}
                        </h4>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant="outline" className={getPriorityColor(task.priority)}>
                          {task.priority}
                        </Badge>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                            setEditingTask(task);
                            setIsEditOpen(true);
                          }}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          {!isAssigneeOnly(task) && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteTask(task.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-muted-foreground">
                      <div className={`flex items-center gap-1 ${isOverdue ? 'text-destructive font-medium' : ''}`}>
                        <CalendarIcon className="h-3.5 w-3.5" />
                        {format(parseISO(task.dueDate), 'MMM d, yyyy')}
                        {isOverdue && <AlertCircle className="h-3.5 w-3.5 ml-1" />}
                      </div>
                      
                      {assignedUser && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Assignee:</span> {assignedUser.name}
                        </div>
                      )}
                      
                      {relatedClient && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">Client:</span> {relatedClient.name}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTask && isAssigneeOnly(editingTask) ? 'Update Task Status' : 'Edit Task'}</DialogTitle>
          </DialogHeader>
          {editingTask && (
            <div className="space-y-4 py-4">
              {isAssigneeOnly(editingTask) ? (
                /* Assignees can only change status */
                <>
                  <p className="text-sm text-muted-foreground border rounded-md p-3 bg-muted/30">
                    <strong>{editingTask.title}</strong>
                    {editingTask.description && <span className="block mt-1">{editingTask.description}</span>}
                  </p>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={editingTask.status} onValueChange={(v) => v && setEditingTask({...editingTask, status: v as TaskStatus})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                /* Creators / managers get full edit */
                <>
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      value={editingTask.title}
                      onChange={e => setEditingTask({...editingTask, title: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={editingTask.description || ''}
                      onChange={e => setEditingTask({...editingTask, description: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Due Date</Label>
                      <Input
                        type="date"
                        value={editingTask.dueDate}
                        onChange={e => setEditingTask({...editingTask, dueDate: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={editingTask.status} onValueChange={(v) => v && setEditingTask({...editingTask, status: v as TaskStatus})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="In Progress">In Progress</SelectItem>
                          <SelectItem value="Completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={editingTask.priority} onValueChange={(v) => v && setEditingTask({...editingTask, priority: v as TaskPriority})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Assign To</Label>
                      <Select value={editingTask.assignedTo} onValueChange={v => v && setEditingTask({...editingTask, assignedTo: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {users.filter(u => u.role === 'rep' || u.role === 'manager' || u.role === 'admin').map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name || u.email || 'Unknown User'}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Related Client (Optional)</Label>
                    <Select value={editingTask.clientId || 'none'} onValueChange={v => v && setEditingTask({...editingTask, clientId: v})}>
                      <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {clients.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <Button className="w-full" onClick={handleEditTask} disabled={!editingTask.title || !editingTask.dueDate}>
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
