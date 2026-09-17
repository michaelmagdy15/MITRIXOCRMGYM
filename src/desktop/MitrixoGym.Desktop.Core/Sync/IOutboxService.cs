using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Domain.Entities;

namespace MitrixoGym.Desktop.Core.Sync;

/// <summary>
/// Service managing atomic outbox enqueuing and durable mutation lifecycle.
/// </summary>
public interface IOutboxService
{
    /// <summary>
    /// Atomically executes a local business mutation and enqueues an outbox operation in the same SQLite transaction.
    /// </summary>
    Task EnqueueOutboxOperationAsync(
        OutboxOperation operation,
        Func<SqliteConnection, SqliteTransaction, Task>? localBusinessMutation = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Enqueues a check-in operation atomically alongside the attendance entity insert.
    /// </summary>
    Task EnqueueCheckInAsync(
        AttendanceEntity attendance,
        string deviceId,
        bool decrementSessions = false,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Alias for EnqueueCheckInAsync to record check-in and enqueue outbox operation.
    /// </summary>
    Task RecordCheckInAsync(
        AttendanceEntity attendance,
        string deviceId,
        bool decrementSessions = false,
        CancellationToken cancellationToken = default);
}
