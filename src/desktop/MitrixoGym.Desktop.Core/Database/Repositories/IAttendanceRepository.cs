using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Domain.Entities;

namespace MitrixoGym.Desktop.Core.Database.Repositories;

public interface IAttendanceRepository
{
    /// <summary>
    /// Atomically records a check-in locally and enqueues the outbox operation within a single transaction.
    /// Optionally decrements the member's remaining sessions locally.
    /// </summary>
    Task RecordCheckInAsync(
        AttendanceEntity attendance,
        OutboxOperation outboxOp,
        bool decrementSessions = false,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets recent attendance logs for the tenant ordered by check-in time descending.
    /// </summary>
    Task<IReadOnlyList<AttendanceEntity>> GetRecentAttendanceAsync(
        string tenantId,
        int limit = 50,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets attendance logs for a specific member.
    /// </summary>
    Task<IReadOnlyList<AttendanceEntity>> GetAttendanceForMemberAsync(
        string clientId,
        string tenantId,
        int limit = 20,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Upserts an attendance record inside an existing transaction or connection.
    /// </summary>
    Task UpsertAttendanceAsync(
        AttendanceEntity attendance,
        SqliteConnection connection,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Batch upserts attendance records during pull synchronization.
    /// </summary>
    Task UpsertAttendanceBatchAsync(
        IEnumerable<AttendanceEntity> attendances,
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Soft deletes an attendance record during pull synchronization.
    /// </summary>
    Task SoftDeleteAttendanceAsync(
        string id,
        string tenantId,
        DateTimeOffset deletedAt,
        SqliteConnection connection,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default);
}
