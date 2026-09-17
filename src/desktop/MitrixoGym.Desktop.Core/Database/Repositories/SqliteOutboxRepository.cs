using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;

namespace MitrixoGym.Desktop.Core.Database.Repositories;

public class SqliteOutboxRepository : IOutboxRepository
{
    private readonly ISqliteDatabaseContext _context;

    public SqliteOutboxRepository(ISqliteDatabaseContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task EnqueueAsync(
        OutboxOperation op,
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(op);
        ArgumentNullException.ThrowIfNull(connection);
        ArgumentNullException.ThrowIfNull(transaction);

        using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = @"
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
        AddOutboxParameters(cmd, op);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<OutboxOperation>> GetPendingOperationsAsync(
        string tenantId,
        int batchSize = 50,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        var nowUtc = DateTimeOffset.UtcNow.ToString("O");

        cmd.CommandText = @"
            SELECT operation_id, tenant_id, device_id, actor_user_id,
                   entity_type, entity_id, operation_type, base_server_version,
                   payload_json, schema_version, created_at_utc,
                   attempt_count, next_attempt_at_utc, status,
                   last_error_code, last_error_message
            FROM outbox_operations
            WHERE tenant_id = @tenantId
              AND status = 'Pending'
              AND (next_attempt_at_utc IS NULL OR next_attempt_at_utc <= @nowUtc)
            ORDER BY created_at_utc ASC
            LIMIT @batchSize;
        ";
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        cmd.Parameters.AddWithValue("@nowUtc", nowUtc);
        cmd.Parameters.AddWithValue("@batchSize", batchSize);

        var list = new List<OutboxOperation>();
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            list.Add(MapOutboxFromReader(reader));
        }

        return list;
    }

    public async Task MarkOperationsInFlightAsync(
        IEnumerable<string> operationIds,
        CancellationToken cancellationToken = default)
    {
        var ids = operationIds.ToList();
        if (ids.Count == 0) return;

        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "UPDATE outbox_operations SET status = 'InFlight' WHERE operation_id = @id;";
            var pId = cmd.Parameters.Add("@id", SqliteType.Text);

            foreach (var id in ids)
            {
                pId.Value = id;
                await cmd.ExecuteNonQueryAsync(cancellationToken);
            }
        }, cancellationToken);
    }

    public async Task MarkOperationSyncedAsync(
        string operationId,
        CancellationToken cancellationToken = default)
    {
        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
                UPDATE outbox_operations
                SET status = 'Synced', last_error_code = NULL, last_error_message = NULL
                WHERE operation_id = @opId;
            ";
            cmd.Parameters.AddWithValue("@opId", operationId);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }, cancellationToken);
    }

    public async Task MarkOperationFailedAsync(
        string operationId,
        string errorCode,
        string errorMessage,
        CancellationToken cancellationToken = default)
    {
        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
                UPDATE outbox_operations
                SET status = 'Failed',
                    last_error_code = @code,
                    last_error_message = @msg
                WHERE operation_id = @opId;
            ";
            cmd.Parameters.AddWithValue("@opId", operationId);
            cmd.Parameters.AddWithValue("@code", errorCode);
            cmd.Parameters.AddWithValue("@msg", errorMessage);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }, cancellationToken);
    }

    public async Task ScheduleOperationRetryAsync(
        string operationId,
        int attemptCount,
        DateTimeOffset nextAttemptAtUtc,
        string lastErrorCode,
        string lastErrorMessage,
        CancellationToken cancellationToken = default)
    {
        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
                UPDATE outbox_operations
                SET status = 'Pending',
                    attempt_count = @attemptCount,
                    next_attempt_at_utc = @nextAttempt,
                    last_error_code = @code,
                    last_error_message = @msg
                WHERE operation_id = @opId;
            ";
            cmd.Parameters.AddWithValue("@opId", operationId);
            cmd.Parameters.AddWithValue("@attemptCount", attemptCount);
            cmd.Parameters.AddWithValue("@nextAttempt", nextAttemptAtUtc.ToString("O"));
            cmd.Parameters.AddWithValue("@code", lastErrorCode);
            cmd.Parameters.AddWithValue("@msg", lastErrorMessage);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }, cancellationToken);
    }

    public async Task SaveConflictAsync(
        ConflictRecord conflict,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(conflict);

        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
                INSERT INTO conflicts (
                    conflict_id, tenant_id, entity_type, entity_id, operation_id,
                    local_intent_json, server_state_json, reason_code,
                    resolution_state, created_at_utc, resolved_at_utc,
                    resolved_by_user_id, resolution_notes
                ) VALUES (
                    @conflictId, @tenantId, @entityType, @entityId, @opId,
                    @localIntent, @serverState, @reasonCode,
                    @resolutionState, @createdAt, @resolvedAt,
                    @resolvedBy, @resolutionNotes
                )
                ON CONFLICT(conflict_id) DO UPDATE SET
                    server_state_json = excluded.server_state_json,
                    reason_code = excluded.reason_code,
                    resolution_state = excluded.resolution_state,
                    resolved_at_utc = excluded.resolved_at_utc,
                    resolved_by_user_id = excluded.resolved_by_user_id,
                    resolution_notes = excluded.resolution_notes;
            ";
            cmd.Parameters.AddWithValue("@conflictId", conflict.ConflictId);
            cmd.Parameters.AddWithValue("@tenantId", conflict.TenantId);
            cmd.Parameters.AddWithValue("@entityType", conflict.EntityType);
            cmd.Parameters.AddWithValue("@entityId", conflict.EntityId);
            cmd.Parameters.AddWithValue("@opId", conflict.OperationId);
            cmd.Parameters.AddWithValue("@localIntent", conflict.LocalIntentJson);
            cmd.Parameters.AddWithValue("@serverState", conflict.ServerStateJson);
            cmd.Parameters.AddWithValue("@reasonCode", conflict.ReasonCode);
            cmd.Parameters.AddWithValue("@resolutionState", conflict.ResolutionState.ToString());
            cmd.Parameters.AddWithValue("@createdAt", conflict.CreatedAtUtc.ToString("O"));
            cmd.Parameters.AddWithValue("@resolvedAt", (object?)conflict.ResolvedAtUtc?.ToString("O") ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@resolvedBy", (object?)conflict.ResolvedByUserId ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@resolutionNotes", (object?)conflict.ResolutionNotes ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }, cancellationToken);
    }

    public async Task<IReadOnlyList<ConflictRecord>> GetPendingConflictsAsync(
        string tenantId,
        int limit = 50,
        CancellationToken cancellationToken = default)
    {
        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT conflict_id, tenant_id, entity_type, entity_id, operation_id,
                   local_intent_json, server_state_json, reason_code,
                   resolution_state, created_at_utc, resolved_at_utc,
                   resolved_by_user_id, resolution_notes
            FROM conflicts
            WHERE tenant_id = @tenantId AND resolution_state = 'Pending'
            ORDER BY created_at_utc DESC
            LIMIT @limit;
        ";
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        cmd.Parameters.AddWithValue("@limit", limit);

        var list = new List<ConflictRecord>();
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            list.Add(new ConflictRecord
            {
                ConflictId = rGetString(reader, 0),
                TenantId = rGetString(reader, 1),
                EntityType = rGetString(reader, 2),
                EntityId = rGetString(reader, 3),
                OperationId = rGetString(reader, 4),
                LocalIntentJson = rGetString(reader, 5),
                ServerStateJson = rGetString(reader, 6),
                ReasonCode = rGetString(reader, 7),
                ResolutionState = Enum.TryParse<ConflictResolutionState>(reader.GetString(8), true, out var crs) ? crs : ConflictResolutionState.Pending,
                CreatedAtUtc = DateTimeOffset.Parse(reader.GetString(9)),
                ResolvedAtUtc = reader.IsDBNull(10) ? null : DateTimeOffset.Parse(reader.GetString(10)),
                ResolvedByUserId = reader.IsDBNull(11) ? null : reader.GetString(11),
                ResolutionNotes = reader.IsDBNull(12) ? null : reader.GetString(12)
            });
        }
        return list;

        static string rGetString(SqliteDataReader r, int i) => r.GetString(i);
    }

    public async Task<int> GetPendingOutboxCountAsync(
        string tenantId,
        CancellationToken cancellationToken = default)
    {
        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT COUNT(1) FROM outbox_operations WHERE tenant_id = @tenantId AND status IN ('Pending', 'InFlight');";
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        var res = await cmd.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt32(res);
    }

    public async Task<int> GetFailedOutboxCountAsync(
        string tenantId,
        CancellationToken cancellationToken = default)
    {
        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT COUNT(1) FROM outbox_operations WHERE tenant_id = @tenantId AND status = 'Failed';";
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        var res = await cmd.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt32(res);
    }

    public async Task ResetInFlightOperationsAsync(
        string tenantId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
                UPDATE outbox_operations
                SET status = 'Pending'
                WHERE tenant_id = @tenantId AND status = 'InFlight';
            ";
            cmd.Parameters.AddWithValue("@tenantId", tenantId);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }, cancellationToken);
    }

    public async Task<IReadOnlyList<OutboxOperation>> GetFailedOperationsAsync(
        string tenantId,
        int limit = 50,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT operation_id, tenant_id, device_id, actor_user_id,
                   entity_type, entity_id, operation_type, base_server_version,
                   payload_json, schema_version, created_at_utc,
                   attempt_count, next_attempt_at_utc, status,
                   last_error_code, last_error_message
            FROM outbox_operations
            WHERE tenant_id = @tenantId
              AND status = 'Failed'
            ORDER BY created_at_utc DESC
            LIMIT @limit;
        ";
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        cmd.Parameters.AddWithValue("@limit", limit);

        var list = new List<OutboxOperation>();
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            list.Add(MapOutboxFromReader(reader));
        }

        return list;
    }

    public async Task<IReadOnlyList<OutboxOperation>> GetAllOperationsAsync(
        string tenantId,
        int limit = 100,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT operation_id, tenant_id, device_id, actor_user_id,
                   entity_type, entity_id, operation_type, base_server_version,
                   payload_json, schema_version, created_at_utc,
                   attempt_count, next_attempt_at_utc, status,
                   last_error_code, last_error_message
            FROM outbox_operations
            WHERE tenant_id = @tenantId
            ORDER BY created_at_utc DESC
            LIMIT @limit;
        ";
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        cmd.Parameters.AddWithValue("@limit", limit);

        var list = new List<OutboxOperation>();
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            list.Add(MapOutboxFromReader(reader));
        }

        return list;
    }

    public async Task RetryOperationAsync(
        string operationId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(operationId);

        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
                UPDATE outbox_operations
                SET status = 'Pending',
                    next_attempt_at_utc = NULL,
                    last_error_code = NULL,
                    last_error_message = NULL
                WHERE operation_id = @opId;
            ";
            cmd.Parameters.AddWithValue("@opId", operationId);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }, cancellationToken);
    }

    public async Task RetryAllFailedAsync(
        string tenantId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
                UPDATE outbox_operations
                SET status = 'Pending',
                    next_attempt_at_utc = NULL,
                    last_error_code = NULL,
                    last_error_message = NULL
                WHERE tenant_id = @tenantId AND status = 'Failed';
            ";
            cmd.Parameters.AddWithValue("@tenantId", tenantId);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }, cancellationToken);
    }

    private static void AddOutboxParameters(SqliteCommand cmd, OutboxOperation op)
    {
        cmd.Parameters.AddWithValue("@opId", op.OperationId);
        cmd.Parameters.AddWithValue("@tenantId", op.TenantId);
        cmd.Parameters.AddWithValue("@deviceId", op.DeviceId);
        cmd.Parameters.AddWithValue("@actorId", op.ActorUserId);
        cmd.Parameters.AddWithValue("@entityType", op.EntityType);
        cmd.Parameters.AddWithValue("@entityId", op.EntityId);
        cmd.Parameters.AddWithValue("@opType", op.OperationType);
        cmd.Parameters.AddWithValue("@baseVersion", (object?)op.BaseServerVersion ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@payloadJson", op.PayloadJson);
        cmd.Parameters.AddWithValue("@schemaVer", op.SchemaVersion);
        cmd.Parameters.AddWithValue("@createdAt", op.CreatedAtUtc.ToString("O"));
        cmd.Parameters.AddWithValue("@attemptCount", op.AttemptCount);
        cmd.Parameters.AddWithValue("@nextAttempt", (object?)op.NextAttemptAtUtc?.ToString("O") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status", op.Status.ToString());
        cmd.Parameters.AddWithValue("@lastErrorCode", (object?)op.LastErrorCode ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@lastErrorMessage", (object?)op.LastErrorMessage ?? DBNull.Value);
    }

    private static OutboxOperation MapOutboxFromReader(SqliteDataReader r)
    {
        return new OutboxOperation
        {
            OperationId = r.GetString(0),
            TenantId = r.GetString(1),
            DeviceId = r.GetString(2),
            ActorUserId = r.GetString(3),
            EntityType = r.GetString(4),
            EntityId = r.GetString(5),
            OperationType = r.GetString(6),
            BaseServerVersion = r.IsDBNull(7) ? null : r.GetInt64(7),
            PayloadJson = r.GetString(8),
            SchemaVersion = r.GetInt32(9),
            CreatedAtUtc = DateTimeOffset.Parse(r.GetString(10)),
            AttemptCount = r.GetInt32(11),
            NextAttemptAtUtc = r.IsDBNull(12) ? null : DateTimeOffset.Parse(r.GetString(12)),
            Status = Enum.TryParse<OutboxStatus>(r.GetString(13), true, out var st) ? st : OutboxStatus.Pending,
            LastErrorCode = r.IsDBNull(14) ? null : r.GetString(14),
            LastErrorMessage = r.IsDBNull(15) ? null : r.GetString(15)
        };
    }
}
