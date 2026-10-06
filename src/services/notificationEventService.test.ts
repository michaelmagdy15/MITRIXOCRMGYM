import assert from 'assert';
import { renderNotificationContent } from './notificationEventService';
import { NotificationDeliveryLog, NotificationEventParams } from '../types/notificationEvent';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

/**
 * In-memory Mock Firestore for Notification Delivery Testing
 */
class MockFirestoreNotificationDb {
  public notifications: any[] = [];
  public deliveryLogs = new Map<string, NotificationDeliveryLog>();

  async dispatchSimulated(params: NotificationEventParams): Promise<NotificationDeliveryLog> {
    const { title, body } = renderNotificationContent(params.eventType, params.data);
    const channels = params.channels || ['in_app'];

    // 1. Idempotency check
    if (params.idempotencyKey) {
      for (const log of this.deliveryLogs.values()) {
        if (log.idempotencyKey === params.idempotencyKey) {
          return {
            ...log,
            status: 'skipped_duplicate'
          };
        }
      }
    }

    // 2. In-app dispatch
    if (channels.includes('in_app')) {
      this.notifications.push({
        recipientId: params.recipientId,
        title,
        message: body,
        type: params.eventType,
        data: params.data
      });
    }

    // 3. Write delivery log
    const logId = `log_${Math.random().toString(36).substring(2, 9)}`;
    const log: NotificationDeliveryLog = {
      id: logId,
      eventType: params.eventType,
      recipientId: params.recipientId,
      recipientType: params.recipientType,
      recipientName: params.recipientName,
      recipientEmail: params.recipientEmail,
      channels,
      title,
      body,
      metadata: params.data,
      status: 'delivered',
      sentAt: new Date().toISOString(),
      idempotencyKey: params.idempotencyKey
    };
    this.deliveryLogs.set(logId, log);
    return log;
  }
}

async function runTests() {
  console.log('Running Notification Event & Delivery Logging tests...');

  // Test 1: Template rendering for client events
  await test('1. Template renders correct copy for booking confirmation and reminders', () => {
    const r1 = renderNotificationContent('booking_confirmed', {
      serviceName: 'Boxing 1-on-1',
      date: '2026-10-10',
      time: '18:00',
      coachName: 'Coach Tamer'
    });
    assert.strictEqual(r1.title, 'Booking Confirmed');
    assert.ok(r1.body.includes('Boxing 1-on-1'));
    assert.ok(r1.body.includes('Coach Tamer'));

    const r2 = renderNotificationContent('session_reminder_48h', {
      serviceName: 'Private PT',
      date: '2026-10-12',
      time: '14:00'
    });
    assert.strictEqual(r2.title, 'Session Reminder (48 Hours)');
    assert.ok(r2.body.includes('24 hours'));
  });

  // Test 2: Template rendering for waitlist promotion and instructor cancellation
  await test('2. Template renders waitlist promotion and class cancellation with token refund notice', () => {
    const promo = renderNotificationContent('waitlist_promoted', {
      serviceName: 'HIIT Conditioning',
      date: '2026-10-08',
      time: '19:00'
    });
    assert.strictEqual(promo.title, 'Promoted from Waitlist! 🎉');
    assert.ok(promo.body.includes('HIIT Conditioning'));

    const cancel = renderNotificationContent('instructor_cancelled', {
      serviceName: 'Morning Kickboxing',
      date: '2026-10-09'
    });
    assert.strictEqual(cancel.title, 'Class Cancelled by Gym');
    assert.ok(cancel.body.includes('session token has been automatically refunded'));
  });

  // Test 3: Template rendering for Front Desk alerts
  await test('3. Front Desk alerts render high capacity and repeated no-show warnings', () => {
    const cap = renderNotificationContent('frontdesk_fully_booked', {
      time: '18:00',
      date: 'Today',
      branch: 'Main Gym'
    });
    assert.strictEqual(cap.title, 'High Capacity Alert');
    assert.ok(cap.body.includes('100% fully booked'));

    const noShow = renderNotificationContent('frontdesk_repeated_noshow', {
      clientName: 'Ahmed Helmy',
      clientId: 'MEM-104'
    });
    assert.strictEqual(noShow.title, 'Repeated No-Show Alert');
    assert.ok(noShow.body.includes('Ahmed Helmy'));
  });

  // Test 4: Dispatch and Delivery Logging
  await test('4. Dispatch creates in-app notification and delivery log with metadata', async () => {
    const dbMock = new MockFirestoreNotificationDb();
    const result = await dbMock.dispatchSimulated({
      eventType: 'payment_confirmed',
      recipientId: 'mem_1',
      recipientType: 'member',
      recipientName: 'Ali Magdy',
      channels: ['in_app', 'push'],
      data: {
        amount: 2500,
        serviceName: 'Annual Pro Package'
      },
      idempotencyKey: 'idemp_pay_1'
    });

    assert.strictEqual(result.status, 'delivered');
    assert.strictEqual(result.channels.length, 2);
    assert.strictEqual(dbMock.notifications.length, 1);
    assert.strictEqual(dbMock.notifications[0].title, 'Payment Received');
    assert.strictEqual(dbMock.deliveryLogs.size, 1);
  });

  // Test 5: Idempotency deduplication
  await test('5. Duplicate submission with identical idempotencyKey is skipped', async () => {
    const dbMock = new MockFirestoreNotificationDb();
    const key = 'idemp_duplicate_test';

    const first = await dbMock.dispatchSimulated({
      eventType: 'pt_balance_low',
      recipientId: 'mem_2',
      recipientType: 'member',
      recipientName: 'Sara Ali',
      data: { sessionsRemaining: 1, serviceName: 'Boxing 10 Sessions' },
      idempotencyKey: key
    });
    assert.strictEqual(first.status, 'delivered');

    const second = await dbMock.dispatchSimulated({
      eventType: 'pt_balance_low',
      recipientId: 'mem_2',
      recipientType: 'member',
      recipientName: 'Sara Ali',
      data: { sessionsRemaining: 1, serviceName: 'Boxing 10 Sessions' },
      idempotencyKey: key
    });
    assert.strictEqual(second.status, 'skipped_duplicate');

    // Exactly 1 notification and 1 delivery log must exist
    assert.strictEqual(dbMock.notifications.length, 1);
    assert.strictEqual(dbMock.deliveryLogs.size, 1);
  });

  console.log('All Notification Event & Delivery Logging tests passed successfully! ✅\n');
}

runTests();
