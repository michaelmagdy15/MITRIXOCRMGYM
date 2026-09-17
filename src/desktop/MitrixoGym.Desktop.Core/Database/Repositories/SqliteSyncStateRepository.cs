using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Domain.Entities;

namespace MitrixoGym.Desktop.Core.Database.Repositories;

public class SqliteSyncStateRepository : ISyncStateRepository
{
    private readonly ISqliteDatabaseContext _context;

    public SqliteSyncStateRepository(ISqliteDatabaseContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<SyncStateRecord?> GetSyncStateAsync(
        string tenantId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT tenant_id, last_committed_cursor, last_sync_time_utc,
                   current_backoff_ms, last_error, updated_at_utc
            FROM sync_state
            WHERE tenant_id = @tenantId;
        ";
        cmd.Parameters.AddWithValue("@tenantId", tenantId);

        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (await reader.ReadAsync(cancellationToken))
        {
            return new SyncStateRecord
            {
                TenantId = reader.GetString(0),
                LastCommittedCursor = reader.IsDBNull(1) ? null : reader.GetString(1),
                LastSyncTimeUtc = reader.IsDBNull(2) ? null : DateTimeOffset.Parse(reader.GetString(2)),
                CurrentBackoffMs = reader.GetInt32(3),
                LastError = reader.IsDBNull(4) ? null : reader.GetString(4),
                UpdatedAtUtc = DateTimeOffset.Parse(reader.GetString(5))
            };
        }

        return null;
    }

    public async Task UpdateCursorAndCommitAsync(
        string tenantId,
        string? cursor,
        DateTimeOffset serverTimeUtc,
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken = default)
    {
        using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = @"
            INSERT INTO sync_state (
                tenant_id, last_committed_cursor, last_sync_time_utc,
                current_backoff_ms, last_error, updated_at_utc
            ) VALUES (
                @tenantId, @cursor, @syncTime,
                0, NULL, @updatedAt
            )
            ON CONFLICT(tenant_id) DO UPDATE SET
                last_committed_cursor = excluded.last_committed_cursor,
                last_sync_time_utc = excluded.last_sync_time_utc,
                current_backoff_ms = 0,
                last_error = NULL,
                updated_at_utc = excluded.updated_at_utc;
        ";
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        cmd.Parameters.AddWithValue("@cursor", (object?)cursor ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@syncTime", serverTimeUtc.ToString("O"));
        cmd.Parameters.AddWithValue("@updatedAt", DateTimeOffset.UtcNow.ToString("O"));
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task SetBackoffAndErrorAsync(
        string tenantId,
        int backoffMs,
        string? errorMessage,
        CancellationToken cancellationToken = default)
    {
        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
                INSERT INTO sync_state (
                    tenant_id, last_committed_cursor, last_sync_time_utc,
                    current_backoff_ms, last_error, updated_at_utc
                ) VALUES (
                    @tenantId, NULL, NULL,
                    @backoffMs, @lastError, @updatedAt
                )
                ON CONFLICT(tenant_id) DO UPDATE SET
                    current_backoff_ms = excluded.current_backoff_ms,
                    last_error = excluded.last_error,
                    updated_at_utc = excluded.updated_at_utc;
            ";
            cmd.Parameters.AddWithValue("@tenantId", tenantId);
            cmd.Parameters.AddWithValue("@backoffMs", backoffMs);
            cmd.Parameters.AddWithValue("@lastError", (object?)errorMessage ?? DBNull.Value);
            cmd.Parameters.AddWithValue("@updatedAt", DateTimeOffset.UtcNow.ToString("O"));
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }, cancellationToken);
    }

    public async Task ResetBackoffAsync(
        string tenantId,
        CancellationToken cancellationToken = default)
    {
        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
                UPDATE sync_state
                SET current_backoff_ms = 0, last_error = NULL, updated_at_utc = @updatedAt
                WHERE tenant_id = @tenantId;
            ";
            cmd.Parameters.AddWithValue("@tenantId", tenantId);
            cmd.Parameters.AddWithValue("@updatedAt", DateTimeOffset.UtcNow.ToString("O"));
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }, cancellationToken);
    }

    public async Task<bool> HasInboxReceiptAsync(
        string eventId,
        string tenantId,
        SqliteConnection connection,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = "SELECT 1 FROM inbox_receipts WHERE event_id = @eventId AND tenant_id = @tenantId LIMIT 1;";
        cmd.Parameters.AddWithValue("@eventId", eventId);
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        var result = await cmd.ExecuteScalarAsync(cancellationToken);
        return result != null;
    }

    public async Task RecordInboxReceiptAsync(
        InboxReceipt receipt,
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken = default)
    {
        using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = @"
            INSERT OR IGNORE INTO inbox_receipts (
                event_id, tenant_id, entity_type, entity_id, applied_at_utc, server_version
            ) VALUES (
                @eventId, @tenantId, @entityType, @entityId, @appliedAt, @serverVersion
            );
        ";
        cmd.Parameters.AddWithValue("@eventId", receipt.EventId);
        cmd.Parameters.AddWithValue("@tenantId", receipt.TenantId);
        cmd.Parameters.AddWithValue("@entityType", receipt.EntityType);
        cmd.Parameters.AddWithValue("@entityId", receipt.EntityId);
        cmd.Parameters.AddWithValue("@appliedAt", receipt.AppliedAtUtc.ToString("O"));
        cmd.Parameters.AddWithValue("@serverVersion", receipt.ServerVersion);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<DeviceStateRecord?> GetDeviceStateAsync(
        string deviceId,
        string tenantId,
        CancellationToken cancellationToken = default)
    {
        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT device_id, tenant_id, device_name, registered_at_utc,
                   last_seen_at_utc, app_version, is_revoked, revoked_at_utc
            FROM device_state
            WHERE device_id = @deviceId AND tenant_id = @tenantId;
        ";
        cmd.Parameters.AddWithValue("@deviceId", deviceId);
        cmd.Parameters.AddWithValue("@tenantId", tenantId);

        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (await reader.ReadAsync(cancellationToken))
        {
            return new DeviceStateRecord
            {
                DeviceId = reader.GetString(0),
                TenantId = reader.GetString(1),
                DeviceName = reader.GetString(2),
                RegisteredAtUtc = DateTimeOffset.Parse(reader.GetString(3)),
                LastSeenAtUtc = DateTimeOffset.Parse(reader.GetString(4)),
                AppVersion = reader.GetString(5),
                IsRevoked = reader.GetInt32(6) == 1,
                RevokedAtUtc = reader.IsDBNull(7) ? null : DateTimeOffset.Parse(reader.GetString(7))
            };
        }

        return null;
    }

    public async Task UpsertDeviceStateAsync(
        DeviceStateRecord ds,
        CancellationToken cancellationToken = default)
    {
        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = @"
                INSERT INTO device_state (
                    device_id, tenant_id, device_name, registered_at_utc,
                    last_seen_at_utc, app_version, is_revoked, revoked_at_utc
                ) VALUES (
                    @deviceId, @tenantId, @deviceName, @regAt,
                    @lastSeen, @appVer, @isRevoked, @revokedAt
                )
                ON CONFLICT(device_id, tenant_id) DO UPDATE SET
                    device_name = excluded.device_name,
                    last_seen_at_utc = excluded.last_seen_at_utc,
                    app_version = excluded.app_version,
                    is_revoked = excluded.is_revoked,
                    revoked_at_utc = excluded.revoked_at_utc;
            ";
            cmd.Parameters.AddWithValue("@deviceId", ds.DeviceId);
            cmd.Parameters.AddWithValue("@tenantId", ds.TenantId);
            cmd.Parameters.AddWithValue("@deviceName", ds.DeviceName);
            cmd.Parameters.AddWithValue("@regAt", ds.RegisteredAtUtc.ToString("O"));
            cmd.Parameters.AddWithValue("@lastSeen", ds.LastSeenAtUtc.ToString("O"));
            cmd.Parameters.AddWithValue("@appVer", ds.AppVersion);
            cmd.Parameters.AddWithValue("@isRevoked", ds.IsRevoked ? 1 : 0);
            cmd.Parameters.AddWithValue("@revokedAt", (object?)ds.RevokedAtUtc?.ToString("O") ?? DBNull.Value);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }, cancellationToken);
    }
}
