import { TaskTemplate, OperationalStaffTask, StaffTaskKPI } from '../types/taskRecurrence';

/**
 * Deterministic Task ID generator to guarantee single creation per day per branch
 */
export function generateRecurringTaskId(templateId: string, date: string, branch?: string): string {
  const cleanBranch = (branch || 'all').toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `task_${templateId}_${date}_${cleanBranch}`;
}

/**
 * Checks whether a task was completed before or on its deadline.
 */
export function isTaskCompletedOnTime(dueDate: string, dueTime: string, completedAtIso: string): boolean {
  try {
    const completed = new Date(completedAtIso);
    if (isNaN(completed.getTime())) return true;

    const isUtc = completedAtIso.endsWith('Z');
    const deadlineString = isUtc
      ? `${dueDate}T${dueTime.padStart(5, '0')}:00.000Z`
      : `${dueDate}T${dueTime.padStart(5, '0')}:00`;
    const deadline = new Date(deadlineString);
    return completed.getTime() <= deadline.getTime();
  } catch {
    return true;
  }
}

/**
 * Idempotently generates daily staff tasks from active templates.
 * Skips templates that have already generated a task for the target date and branch.
 */
export function generateDailyTasksFromTemplates(
  templates: TaskTemplate[],
  targetDate: string, // YYYY-MM-DD
  existingTaskIds: Set<string>,
  branch?: string
): OperationalStaffTask[] {
  const newTasks: OperationalStaffTask[] = [];
  const now = new Date().toISOString();

  for (const tpl of templates) {
    if (!tpl.isActive) continue;

    // Check branch match
    if (tpl.branch && branch && tpl.branch !== branch && tpl.branch !== 'ALL') {
      continue;
    }

    const taskId = generateRecurringTaskId(tpl.id, targetDate, branch || tpl.branch);
    if (existingTaskIds.has(taskId)) {
      // Already generated today; skip duplicate
      continue;
    }

    newTasks.push({
      id: taskId,
      templateId: tpl.id,
      title: tpl.title,
      description: tpl.description,
      department: tpl.department,
      dueDate: targetDate,
      dueTime: tpl.dueTimeOfDay || '12:00',
      status: 'Pending',
      priority: tpl.priority,
      branch: branch || tpl.branch,
      createdAt: now,
      updatedAt: now
    });
  }

  return newTasks;
}

/**
 * Calculates operational completion KPIs across staff members.
 */
export function calculateStaffKPIs(tasks: OperationalStaffTask[]): StaffTaskKPI[] {
  const staffMap = new Map<string, {
    staffId: string;
    staffName: string;
    department: string;
    total: number;
    completed: number;
    onTime: number;
    late: number;
    missed: number;
  }>();

  for (const task of tasks) {
    const key = task.assignedTo || 'Unassigned';
    const name = task.assignedToName || 'Unassigned';
    const dept = task.department || 'General';

    if (!staffMap.has(key)) {
      staffMap.set(key, {
        staffId: key,
        staffName: name,
        department: dept,
        total: 0,
        completed: 0,
        onTime: 0,
        late: 0,
        missed: 0
      });
    }

    const row = staffMap.get(key)!;
    row.total += 1;

    if (task.status === 'Completed') {
      row.completed += 1;
      if (task.completedAt && isTaskCompletedOnTime(task.dueDate, task.dueTime, task.completedAt)) {
        row.onTime += 1;
      } else {
        row.late += 1;
      }
    } else if (task.status === 'Missed') {
      row.missed += 1;
    }
  }

  return Array.from(staffMap.values()).map((row) => ({
    staffId: row.staffId,
    staffName: row.staffName,
    department: row.department,
    totalTasks: row.total,
    completedTasks: row.completed,
    completedOnTime: row.onTime,
    completedLate: row.late,
    missedTasks: row.missed,
    completionRatePercent: row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0
  }));
}
