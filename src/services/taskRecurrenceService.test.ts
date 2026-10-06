import assert from 'assert';
import {
  generateDailyTasksFromTemplates,
  isTaskCompletedOnTime,
  calculateStaffKPIs
} from './taskRecurrenceService';
import { TaskTemplate, OperationalStaffTask } from '../types/taskRecurrence';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function runTests() {
  console.log('Running Task Recurrence & Staff KPI unit tests...');

  const templates: TaskTemplate[] = [
    {
      id: 'tpl_floor_am',
      title: 'Morning Floor & Mat Sanitization',
      description: 'Check boxing mats, wipe down ring rails and spray disinfectant',
      department: 'Operations',
      recurrence: 'DAILY',
      dueTimeOfDay: '10:00',
      priority: 'High',
      isActive: true
    },
    {
      id: 'tpl_cash_pm',
      title: 'Evening Cash Drawer Verification',
      description: 'Count physical cash and reconcile with shift report',
      department: 'Finance',
      recurrence: 'DAILY',
      dueTimeOfDay: '22:00',
      priority: 'High',
      isActive: true
    },
    {
      id: 'tpl_inactive',
      title: 'Deprecated Seasonal Inspection',
      description: 'Old task',
      department: 'Operations',
      recurrence: 'DAILY',
      dueTimeOfDay: '12:00',
      priority: 'Low',
      isActive: false
    }
  ];

  // Test 1: Daily Task Generation
  await test('1. Active templates generate daily tasks with correct attributes', () => {
    const existing = new Set<string>();
    const tasks = generateDailyTasksFromTemplates(templates, '2026-10-06', existing, 'Inzan Main');

    assert.strictEqual(tasks.length, 2); // 2 active, 1 inactive skipped
    assert.strictEqual(tasks[0]?.title, 'Morning Floor & Mat Sanitization');
    assert.strictEqual(tasks[0]?.status, 'Pending');
    assert.strictEqual(tasks[0]?.dueDate, '2026-10-06');
    assert.strictEqual(tasks[0]?.dueTime, '10:00');
  });

  // Test 2: Idempotent Generation
  await test('2. Running generation again on the same day generates 0 duplicates', () => {
    const existing = new Set<string>();
    const firstRun = generateDailyTasksFromTemplates(templates, '2026-10-06', existing, 'Inzan Main');
    firstRun.forEach(t => existing.add(t.id));

    // Second run with existing IDs populated
    const secondRun = generateDailyTasksFromTemplates(templates, '2026-10-06', existing, 'Inzan Main');
    assert.strictEqual(secondRun.length, 0); // No duplicates generated!
  });

  // Test 3: On-time completion detection
  await test('3. isTaskCompletedOnTime detects early vs overdue completions', () => {
    // Due 10:00, completed 09:45 -> on time
    const onTime = isTaskCompletedOnTime('2026-10-06', '10:00', '2026-10-06T09:45:00.000Z');
    assert.strictEqual(onTime, true);

    // Due 10:00, completed 10:30 -> late
    const late = isTaskCompletedOnTime('2026-10-06', '10:00', '2026-10-06T10:30:00.000Z');
    assert.strictEqual(late, false);
  });

  // Test 4: Staff KPI Calculation
  await test('4. calculateStaffKPIs aggregates completion rate and timeliness correctly', () => {
    const sampleTasks: OperationalStaffTask[] = [
      {
        id: 't1',
        title: 'Task 1',
        description: '',
        department: 'Operations',
        assignedTo: 'staff_ahmed',
        assignedToName: 'Ahmed FrontDesk',
        dueDate: '2026-10-06',
        dueTime: '10:00',
        status: 'Completed',
        completedAt: '2026-10-06T09:30:00.000Z',
        priority: 'Medium',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 't2',
        title: 'Task 2',
        description: '',
        department: 'Operations',
        assignedTo: 'staff_ahmed',
        assignedToName: 'Ahmed FrontDesk',
        dueDate: '2026-10-06',
        dueTime: '14:00',
        status: 'Completed',
        completedAt: '2026-10-06T15:00:00.000Z', // Late
        priority: 'High',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 't3',
        title: 'Task 3',
        description: '',
        department: 'Operations',
        assignedTo: 'staff_ahmed',
        assignedToName: 'Ahmed FrontDesk',
        dueDate: '2026-10-06',
        dueTime: '18:00',
        status: 'Missed',
        priority: 'Medium',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 't4',
        title: 'Task 4',
        description: '',
        department: 'Finance',
        assignedTo: 'staff_mona',
        assignedToName: 'Mona Accountant',
        dueDate: '2026-10-06',
        dueTime: '20:00',
        status: 'Completed',
        completedAt: '2026-10-06T19:00:00.000Z',
        priority: 'High',
        createdAt: '',
        updatedAt: ''
      }
    ];

    const kpis = calculateStaffKPIs(sampleTasks);
    assert.strictEqual(kpis.length, 2);

    const ahmed = kpis.find(k => k.staffId === 'staff_ahmed')!;
    assert.strictEqual(ahmed.totalTasks, 3);
    assert.strictEqual(ahmed.completedTasks, 2);
    assert.strictEqual(ahmed.completedOnTime, 1);
    assert.strictEqual(ahmed.completedLate, 1);
    assert.strictEqual(ahmed.missedTasks, 1);
    // 2/3 = 67%
    assert.strictEqual(ahmed.completionRatePercent, 67);

    const mona = kpis.find(k => k.staffId === 'staff_mona')!;
    assert.strictEqual(mona.totalTasks, 1);
    assert.strictEqual(mona.completedTasks, 1);
    assert.strictEqual(mona.completedOnTime, 1);
    assert.strictEqual(mona.completionRatePercent, 100);
  });

  console.log('All Task Recurrence & Staff KPI unit tests passed successfully! ✅\n');
}

runTests();
