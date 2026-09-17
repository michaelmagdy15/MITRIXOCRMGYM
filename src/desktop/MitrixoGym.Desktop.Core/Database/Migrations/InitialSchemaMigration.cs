using Microsoft.Data.Sqlite;

namespace MitrixoGym.Desktop.Core.Database.Migrations;

/// <summary>
/// Migration 1: Initial schema creating all local working-set and synchronization tables.
/// </summary>
public class InitialSchemaMigration : IDatabaseMigration
{
    public int Version => 1;
    public string Description => "Initial schema for offline sync, members, attendance, outbox, inbox, conflicts, and device state.";

    public async Task ApplyAsync(SqliteConnection connection, SqliteTransaction transaction, CancellationToken cancellationToken = default)
    {
        const string sql = @"
            -- Members table (working set)
            CREATE TABLE IF NOT EXISTS members (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                member_code TEXT,
                status TEXT NOT NULL DEFAULT 'Active',
                package_type TEXT,
                sessions_remaining INTEGER,
                pt_sessions_remaining INTEGER,
                start_date TEXT,
                membership_expiry TEXT,
                branch_id TEXT,
                gender TEXT,
                date_of_birth TEXT,
                notes TEXT,
                photo_url TEXT,
                email TEXT,
                server_version INTEGER NOT NULL DEFAULT 0,
                server_updated_at TEXT,
                deleted_at TEXT,
                sync_state TEXT NOT NULL DEFAULT 'Synced'
            );

            CREATE INDEX IF NOT EXISTS idx_members_tenant_phone ON members(tenant_id, phone);
            CREATE INDEX IF NOT EXISTS idx_members_tenant_name ON members(tenant_id, name COLLATE NOCASE);
            CREATE INDEX IF NOT EXISTS idx_members_tenant_code ON members(tenant_id, member_code);
            CREATE INDEX IF NOT EXISTS idx_members_tenant_sync ON members(tenant_id, sync_state);

            -- Attendance table (offline check-ins and history)
            CREATE TABLE IF NOT EXISTS attendance (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                client_name TEXT,
                branch_id TEXT,
                date_utc TEXT NOT NULL,
                recorded_by_user_id TEXT NOT NULL,
                package_name TEXT,
                notes TEXT,
                server_version INTEGER NOT NULL DEFAULT 0,
                server_updated_at TEXT,
                deleted_at TEXT,
                sync_state TEXT NOT NULL DEFAULT 'Synced',
                FOREIGN KEY(client_id) REFERENCES members(id) ON DELETE RESTRICT
            );

            CREATE INDEX IF NOT EXISTS idx_attendance_tenant_client ON attendance(tenant_id, client_id);
            CREATE INDEX IF NOT EXISTS idx_attendance_tenant_date ON attendance(tenant_id, date_utc DESC);

            -- Outbox operations (durable mutation queue)
            CREATE TABLE IF NOT EXISTS outbox_operations (
                operation_id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                actor_user_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                operation_type TEXT NOT NULL,
                base_server_version INTEGER,
                payload_json TEXT NOT NULL,
                schema_version INTEGER NOT NULL DEFAULT 1,
                created_at_utc TEXT NOT NULL,
                attempt_count INTEGER NOT NULL DEFAULT 0,
                next_attempt_at_utc TEXT,
                status TEXT NOT NULL DEFAULT 'Pending',
                last_error_code TEXT,
                last_error_message TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_outbox_queue ON outbox_operations(tenant_id, status, next_attempt_at_utc);

            -- Inbox receipts (pull deduplication)
            CREATE TABLE IF NOT EXISTS inbox_receipts (
                event_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                applied_at_utc TEXT NOT NULL,
                server_version INTEGER NOT NULL,
                PRIMARY KEY (event_id, tenant_id)
            );

            -- Sync state (cursor, backoff, last error)
            CREATE TABLE IF NOT EXISTS sync_state (
                tenant_id TEXT PRIMARY KEY,
                last_committed_cursor TEXT,
                last_sync_time_utc TEXT,
                current_backoff_ms INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                updated_at_utc TEXT NOT NULL
            );

            -- Conflicts table (concurrency and invariant rejection ledger)
            CREATE TABLE IF NOT EXISTS conflicts (
                conflict_id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                operation_id TEXT NOT NULL,
                local_intent_json TEXT NOT NULL,
                server_state_json TEXT NOT NULL,
                reason_code TEXT NOT NULL,
                resolution_state TEXT NOT NULL DEFAULT 'Pending',
                created_at_utc TEXT NOT NULL,
                resolved_at_utc TEXT,
                resolved_by_user_id TEXT,
                resolution_notes TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_conflicts_tenant_res ON conflicts(tenant_id, resolution_state);

            -- Device state (non-secret device registration)
            CREATE TABLE IF NOT EXISTS device_state (
                device_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                device_name TEXT NOT NULL,
                registered_at_utc TEXT NOT NULL,
                last_seen_at_utc TEXT NOT NULL,
                app_version TEXT NOT NULL,
                is_revoked INTEGER NOT NULL DEFAULT 0,
                revoked_at_utc TEXT,
                PRIMARY KEY (device_id, tenant_id)
            );
        ";

        using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = sql;
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }
}
