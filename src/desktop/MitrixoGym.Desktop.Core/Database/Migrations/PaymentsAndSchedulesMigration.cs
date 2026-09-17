using Microsoft.Data.Sqlite;

namespace MitrixoGym.Desktop.Core.Database.Migrations;

/// <summary>
/// Migration 2: Creates payments and class_schedules tables for offline CRM capabilities.
/// </summary>
public class PaymentsAndSchedulesMigration : IDatabaseMigration
{
    public int Version => 2;
    public string Description => "Creates payments and class_schedules working-set tables.";

    public async Task ApplyAsync(SqliteConnection connection, SqliteTransaction transaction, CancellationToken cancellationToken = default)
    {
        const string sql = @"
            -- Payments table (offline payment recording & transaction history)
            CREATE TABLE IF NOT EXISTS payments (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                client_id TEXT NOT NULL,
                client_name TEXT,
                amount REAL NOT NULL DEFAULT 0,
                payment_method TEXT NOT NULL DEFAULT 'Cash',
                package_name TEXT,
                date_utc TEXT NOT NULL,
                recorded_by_user_id TEXT NOT NULL,
                notes TEXT,
                server_version INTEGER NOT NULL DEFAULT 0,
                server_updated_at TEXT,
                deleted_at TEXT,
                sync_state TEXT NOT NULL DEFAULT 'Synced'
            );

            CREATE INDEX IF NOT EXISTS idx_payments_tenant_date ON payments(tenant_id, date_utc DESC);
            CREATE INDEX IF NOT EXISTS idx_payments_tenant_client ON payments(tenant_id, client_id);

            -- Class schedules table (timetables and session planning)
            CREATE TABLE IF NOT EXISTS class_schedules (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                title TEXT NOT NULL,
                instructor_name TEXT,
                start_time TEXT,
                end_time TEXT,
                day_of_week TEXT,
                branch TEXT,
                capacity INTEGER NOT NULL DEFAULT 20,
                booked_count INTEGER NOT NULL DEFAULT 0,
                server_version INTEGER NOT NULL DEFAULT 0,
                server_updated_at TEXT,
                deleted_at TEXT,
                sync_state TEXT NOT NULL DEFAULT 'Synced'
            );

            CREATE INDEX IF NOT EXISTS idx_schedules_tenant_day ON class_schedules(tenant_id, day_of_week);
        ";

        using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = sql;
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }
}
