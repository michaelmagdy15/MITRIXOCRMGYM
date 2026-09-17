using System.Text.Json;
using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Database;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Domain.Models;

namespace MitrixoGym.Desktop.Core.Sync;

public class OutboxService : IOutboxService
{
    private readonly ISqliteDatabaseContext _context;
    private readonly IOutboxRepository _outboxRepository;
    private readonly IAttendanceRepository _attendanceRepository;

    public OutboxService(
        ISqliteDatabaseContext context,
        IOutboxRepository outboxRepository,
        IAttendanceRepository attendanceRepository)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
        _outboxRepository = outboxRepository ?? throw new ArgumentNullException(nameof(outboxRepository));
        _attendanceRepository = attendanceRepository ?? throw new ArgumentNullException(nameof(attendanceRepository));
    }

    public async Task EnqueueOutboxOperationAsync(
        OutboxOperation operation,
        Func<SqliteConnection, SqliteTransaction, Task>? localBusinessMutation = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(operation);

        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            if (localBusinessMutation != null)
            {
                await localBusinessMutation(conn, tx);
            }

            await _outboxRepository.EnqueueAsync(operation, conn, tx, cancellationToken);
        }, cancellationToken);
    }

    public async Task EnqueueCheckInAsync(
        AttendanceEntity attendance,
        string deviceId,
        bool decrementSessions = false,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(attendance);
        ArgumentException.ThrowIfNullOrWhiteSpace(deviceId);

        var payload = new AttendanceCheckInPayload
        {
            AttendanceId = attendance.Id,
            ClientId = attendance.ClientId,
            ClientName = attendance.ClientName,
            BranchId = attendance.BranchId,
            DateUtc = attendance.DateUtc,
            RecordedByUserId = attendance.RecordedByUserId,
            PackageName = attendance.PackageName,
            Notes = attendance.Notes
        };

        var outboxOp = new OutboxOperation
        {
            OperationId = Guid.NewGuid().ToString("D"),
            TenantId = attendance.TenantId,
            DeviceId = deviceId,
            ActorUserId = attendance.RecordedByUserId,
            EntityType = "attendance",
            EntityId = attendance.Id,
            OperationType = "CheckIn",
            BaseServerVersion = attendance.ServerVersion,
            PayloadJson = JsonSerializer.Serialize(payload),
            SchemaVersion = 1,
            CreatedAtUtc = DateTimeOffset.UtcNow,
            AttemptCount = 0,
            Status = OutboxStatus.Pending
        };

        // Record check-in and enqueue outbox operation atomically in a single transaction
        await _attendanceRepository.RecordCheckInAsync(attendance, outboxOp, decrementSessions, cancellationToken);
    }

    public Task RecordCheckInAsync(
        AttendanceEntity attendance,
        string deviceId,
        bool decrementSessions = false,
        CancellationToken cancellationToken = default)
    {
        return EnqueueCheckInAsync(attendance, deviceId, decrementSessions, cancellationToken);
    }
}
