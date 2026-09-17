using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Domain.Entities;

namespace MitrixoGym.Desktop.Core.Database.Repositories;

public interface IOutboxRepository
{
    /// <summary>
    /// Enqueues an outbox operation inside an active transaction.
    /// </summary>
    Task EnqueueAsync(
        OutboxOperation operation,
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets pending outbox operations ready for push (status is Pending and nextAttemptAtUtc <= now).
    /// </summary>
    Task<IReadOnlyList<OutboxOperation>> GetPendingOperationsAsync(
        string tenantId,
        int batchSize = 50,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks a batch of operations as InFlight during push processing.
    /// </summary>
    Task MarkOperationsInFlightAsync(
        IEnumerable<string> operationIds,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks an operation as Synced upon server acknowledgment.
    /// </summary>
    Task MarkOperationSyncedAsync(
        string operationId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Marks an operation as permanently Failed.
    /// </summary>
    Task MarkOperationFailedAsync(
        string operationId,
        string errorCode,
        string errorMessage,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Reschedules an operation for retry with exponential backoff.
    /// </summary>
    Task ScheduleOperationRetryAsync(
        string operationId,
        int attemptCount,
        DateTimeOffset nextAttemptAtUtc,
        string lastErrorCode,
        string lastErrorMessage,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Records a concurrency or domain conflict in the conflicts table.
    /// </summary>
    Task SaveConflictAsync(
        ConflictRecord conflict,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets pending conflicts that require staff attention.
    /// </summary>
    Task<IReadOnlyList<ConflictRecord>> GetPendingConflictsAsync(
        string tenantId,
        int limit = 50,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns count of pending operations in the outbox queue.
    /// </summary>
    Task<int> GetPendingOutboxCountAsync(
        string tenantId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Resets any operations stuck in InFlight status back to Pending (e.g. after crash or restart).
    /// </summary>
    Task ResetInFlightOperationsAsync(
        string tenantId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns count of permanently failed operations in the outbox queue.
    /// </summary>
    Task<int> GetFailedOutboxCountAsync(
        string tenantId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets permanently failed outbox operations for the tenant.
    /// </summary>
    Task<IReadOnlyList<OutboxOperation>> GetFailedOperationsAsync(
        string tenantId,
        int limit = 50,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets all recent outbox operations (pending, in flight, failed, synced) for diagnostics.
    /// </summary>
    Task<IReadOnlyList<OutboxOperation>> GetAllOperationsAsync(
        string tenantId,
        int limit = 100,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Resets an operation to Pending so it can be retried immediately.
    /// </summary>
    Task RetryOperationAsync(
        string operationId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Resets all failed operations for the tenant to Pending for immediate retry.
    /// </summary>
    Task RetryAllFailedAsync(
        string tenantId,
        CancellationToken cancellationToken = default);
}
