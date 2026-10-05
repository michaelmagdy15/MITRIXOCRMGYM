import { useState, useCallback } from 'react';

function generateOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Returns a stable operation id for the lifetime of a payment flow.
 * Call resetOperationId() when opening a new checkout dialog to ensure
 * retries within the same dialog are idempotent, while reopening creates
 * a fresh key.
 */
export function useOperationId() {
  const [operationId, setOperationId] = useState<string>(generateOperationId);

  const resetOperationId = useCallback(() => {
    setOperationId(generateOperationId());
  }, []);

  return { operationId, resetOperationId };
}
