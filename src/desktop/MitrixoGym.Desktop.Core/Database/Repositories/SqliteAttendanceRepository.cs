using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;

namespace MitrixoGym.Desktop.Core.Database.Repositories;

public class SqliteAttendanceRepository : IAttendanceRepository
{
    private readonly ISqliteDatabaseContext _context;

    public SqliteAttendanceRepository(ISqliteDatabaseContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task RecordCheckInAsync(
        AttendanceEntity attendance,
        OutboxOperation outboxOp,
        bool decrementSessions = false,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(attendance);
        ArgumentNullException.ThrowIfNull(outboxOp);

        // Enforce transactional outbox pattern: mutation + outbox record in same SQLite transaction
        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            // 1. Insert attendance record
            attendance.SyncState = SyncState.Pending;
            using (var attCmd = conn.CreateCommand())
            {
                attCmd.Transaction = tx;
                attCmd.CommandText = GetUpsertAttendanceSql();
                AddAttendanceParameters(attCmd, attendance);
                await attCmd.ExecuteNonQueryAsync(cancellationToken);
            }

            // 2. Optionally decrement local sessions remaining for member
            if (decrementSessions)
            {
                using var decrCmd = conn.CreateCommand();
                decrCmd.Transaction = tx;
                decrCmd.CommandText = @"
                    UPDATE members
                    SET sessions_remaining = CASE
                        WHEN sessions_remaining > 0 THEN sessions_remaining - 1
                        ELSE 0
                    END
                    WHERE id = @clientId AND tenant_id = @tenantId;
                ";
                decrCmd.Parameters.AddWithValue("@clientId", attendance.ClientId);
                decrCmd.Parameters.AddWithValue("@tenantId", attendance.TenantId);
                await decrCmd.ExecuteNonQueryAsync(cancellationToken);
            }

            // 3. Insert outbox operation
            using (var outboxCmd = conn.CreateCommand())
            {
                outboxCmd.Transaction = tx;
                outboxCmd.CommandText = @"
                    INSERT INTO outbox_operations (
                        operation_id, tenant_id, device_id, actor_user_id,
                        entity_type, entity_id, operation_type, base_server_version,
                        payload_json, schema_version, created_at_utc,
                        attempt_count, next_attempt_at_utc, status,
                        last_error_code, last_error_message
                    ) VALUES (
                        @opId, @tenantId, @deviceId, @actorId,
                        @entityType, @entityId, @opType, @baseVersion,
                        @payloadJson, @schemaVer, @createdAt,
                        @attemptCount, @nextAttempt, @status,
                        @lastErrorCode, @lastErrorMessage
                    );
                ";
                outboxCmd.Parameters.AddWithValue("@opId", outboxOp.OperationId);
                outboxCmd.Parameters.AddWithValue("@tenantId", outboxOp.TenantId);
                outboxCmd.Parameters.AddWithValue("@deviceId", outboxOp.DeviceId);
                outboxCmd.Parameters.AddWithValue("@actorId", outboxOp.ActorUserId);
                outboxCmd.Parameters.AddWithValue("@entityType", outboxOp.EntityType);
                outboxCmd.Parameters.AddWithValue("@entityId", outboxOp.EntityId);
                outboxCmd.Parameters.AddWithValue("@opType", outboxOp.OperationType);
                outboxCmd.Parameters.AddWithValue("@baseVersion", (object?)outboxOp.BaseServerVersion ?? DBNull.Value);
                outboxCmd.Parameters.AddWithValue("@payloadJson", outboxOp.PayloadJson);
                outboxCmd.Parameters.AddWithValue("@schemaVer", outboxOp.SchemaVersion);
                outboxCmd.Parameters.AddWithValue("@createdAt", outboxOp.CreatedAtUtc.ToString("O"));
                outboxCmd.Parameters.AddWithValue("@attemptCount", outboxOp.AttemptCount);
                outboxCmd.Parameters.AddWithValue("@nextAttempt", (object?)outboxOp.NextAttemptAtUtc?.ToString("O") ?? DBNull.Value);
                outboxCmd.Parameters.AddWithValue("@status", outboxOp.Status.ToString());
                outboxCmd.Parameters.AddWithValue("@lastErrorCode", (object?)outboxOp.LastErrorCode ?? DBNull.Value);
                outboxCmd.Parameters.AddWithValue("@lastErrorMessage", (object?)outboxOp.LastErrorMessage ?? DBNull.Value);
                await outboxCmd.ExecuteNonQueryAsync(cancellationToken);
            }
        }, cancellationToken);
    }

    public async Task<IReadOnlyList<AttendanceEntity>> GetRecentAttendanceAsync(
        string tenantId,
        int limit = 50,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT id, tenant_id, client_id, client_name, branch_id, date_utc,
                   recorded_by_user_id, package_name, notes,
                   server_version, server_updated_at, deleted_at, sync_state
            FROM attendance
            WHERE tenant_id = @tenantId AND deleted_at IS NULL
            ORDER BY date_utc DESC
            LIMIT @limit;
        ";
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        cmd.Parameters.AddWithValue("@limit", limit);

        var results = new List<AttendanceEntity>();
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            results.Add(MapAttendanceFromReader(reader));
        }

        return results;
    }

    public async Task<IReadOnlyList<AttendanceEntity>> GetAttendanceForMemberAsync(
        string clientId,
        string tenantId,
        int limit = 20,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(clientId);
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT id, tenant_id, client_id, client_name, branch_id, date_utc,
                   recorded_by_user_id, package_name, notes,
                   server_version, server_updated_at, deleted_at, sync_state
            FROM attendance
            WHERE client_id = @clientId AND tenant_id = @tenantId AND deleted_at IS NULL
            ORDER BY date_utc DESC
            LIMIT @limit;
        ";
        cmd.Parameters.AddWithValue("@clientId", clientId);
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        cmd.Parameters.AddWithValue("@limit", limit);

        var results = new List<AttendanceEntity>();
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            results.Add(MapAttendanceFromReader(reader));
        }

        return results;
    }

    public async Task UpsertAttendanceAsync(
        AttendanceEntity attendance,
        SqliteConnection connection,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(attendance);
        ArgumentNullException.ThrowIfNull(connection);

        using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = GetUpsertAttendanceSql();
        AddAttendanceParameters(cmd, attendance);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task UpsertAttendanceBatchAsync(
        IEnumerable<AttendanceEntity> attendances,
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(attendances);
        ArgumentNullException.ThrowIfNull(connection);
        ArgumentNullException.ThrowIfNull(transaction);

        using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = GetUpsertAttendanceSql();

        foreach (var att in attendances)
        {
            cmd.Parameters.Clear();
            AddAttendanceParameters(cmd, att);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    public async Task SoftDeleteAttendanceAsync(
        string id,
        string tenantId,
        DateTimeOffset deletedAt,
        SqliteConnection connection,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = @"
            UPDATE attendance
            SET deleted_at = @deletedAt, sync_state = 'Synced'
            WHERE id = @id AND tenant_id = @tenantId;
        ";
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        cmd.Parameters.AddWithValue("@deletedAt", deletedAt.ToString("O"));
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    private static string GetUpsertAttendanceSql() => @"
        INSERT INTO attendance (
            id, tenant_id, client_id, client_name, branch_id, date_utc,
            recorded_by_user_id, package_name, notes,
            server_version, server_updated_at, deleted_at, sync_state
        ) VALUES (
            @id, @tenantId, @clientId, @clientName, @branchId, @dateUtc,
            @recordedBy, @packageName, @notes,
            @serverVersion, @serverUpdatedAt, @deletedAt, @syncState
        )
        ON CONFLICT(id) DO UPDATE SET
            tenant_id = excluded.tenant_id,
            client_id = excluded.client_id,
            client_name = excluded.client_name,
            branch_id = excluded.branch_id,
            date_utc = excluded.date_utc,
            recorded_by_user_id = excluded.recorded_by_user_id,
            package_name = excluded.package_name,
            notes = excluded.notes,
            server_version = excluded.server_version,
            server_updated_at = excluded.server_updated_at,
            deleted_at = excluded.deleted_at,
            sync_state = excluded.sync_state;
    ";

    private static void AddAttendanceParameters(SqliteCommand cmd, AttendanceEntity a)
    {
        cmd.Parameters.AddWithValue("@id", a.Id);
        cmd.Parameters.AddWithValue("@tenantId", a.TenantId);
        cmd.Parameters.AddWithValue("@clientId", a.ClientId);
        cmd.Parameters.AddWithValue("@clientName", (object?)a.ClientName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@branchId", (object?)a.BranchId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@dateUtc", a.DateUtc.ToString("O"));
        cmd.Parameters.AddWithValue("@recordedBy", a.RecordedByUserId);
        cmd.Parameters.AddWithValue("@packageName", (object?)a.PackageName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes", (object?)a.Notes ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@serverVersion", a.ServerVersion);
        cmd.Parameters.AddWithValue("@serverUpdatedAt", (object?)a.ServerUpdatedAt?.ToString("O") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@deletedAt", (object?)a.DeletedAt?.ToString("O") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@syncState", a.SyncState.ToString());
    }

    private static AttendanceEntity MapAttendanceFromReader(SqliteDataReader r)
    {
        return new AttendanceEntity
        {
            Id = r.GetString(0),
            TenantId = r.GetString(1),
            ClientId = r.GetString(2),
            ClientName = r.IsDBNull(3) ? null : r.GetString(3),
            BranchId = r.IsDBNull(4) ? null : r.GetString(4),
            DateUtc = DateTimeOffset.Parse(r.GetString(5)),
            RecordedByUserId = r.GetString(6),
            PackageName = r.IsDBNull(7) ? null : r.GetString(7),
            Notes = r.IsDBNull(8) ? null : r.GetString(8),
            ServerVersion = r.GetInt64(9),
            ServerUpdatedAt = r.IsDBNull(10) ? null : DateTimeOffset.Parse(r.GetString(10)),
            DeletedAt = r.IsDBNull(11) ? null : DateTimeOffset.Parse(r.GetString(11)),
            SyncState = Enum.TryParse<SyncState>(r.GetString(12), true, out var s) ? s : SyncState.Synced
        };
    }
}
