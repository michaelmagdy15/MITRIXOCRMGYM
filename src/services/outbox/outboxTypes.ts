export type OutboxOperationType =
  | 'attendance.checkin'
  | 'client.create'
  | 'client.update'
  | 'payment.create'
  | string;

export type OutboxStatus = 'pending' | 'in-flight' | 'acknowledged' | 'failed';

export interface OutboxEntry {
  operationId: string;
  tenantId: string;
  operationType: OutboxOperationType;
  entityId: string;
  payload: Record<string, any>;
  status: OutboxStatus;
  retryCount: number;
  lastError?: string;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface FlushResult {
  sent: number;
  succeeded: number;
  failed: number;
}

export type OutboxChangeListener = (pendingCount: number) => void;
