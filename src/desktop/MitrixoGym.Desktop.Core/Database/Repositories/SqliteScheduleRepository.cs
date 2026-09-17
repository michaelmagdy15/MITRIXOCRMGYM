using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;

namespace MitrixoGym.Desktop.Core.Database.Repositories;

/// <summary>
/// SQLite repository for gym class timetables and schedules.
/// </summary>
public class SqliteScheduleRepository : IScheduleRepository
{
    private readonly ISqliteDatabaseContext _context;

    public SqliteScheduleRepository(ISqliteDatabaseContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task UpsertScheduleAsync(ClassScheduleEntity schedule, SqliteConnection connection, SqliteTransaction? transaction = null, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(schedule);
        ArgumentNullException.ThrowIfNull(connection);

        const string sql = @"
            INSERT INTO class_schedules (
                id, tenant_id, title, instructor_name, start_time, end_time,
                day_of_week, branch, capacity, booked_count,
                server_version, server_updated_at, deleted_at, sync_state
            ) VALUES (
                @id, @tenantId, @title, @instructor, @start, @end,
                @day, @branch, @capacity, @booked,
                @serverVersion, @serverUpdatedAt, @deletedAt, @syncState
            )
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                instructor_name = excluded.instructor_name,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                day_of_week = excluded.day_of_week,
                branch = excluded.branch,
                capacity = excluded.capacity,
                booked_count = excluded.booked_count,
                server_version = excluded.server_version,
                server_updated_at = excluded.server_updated_at,
                deleted_at = excluded.deleted_at,
                sync_state = excluded.sync_state;
        ";

        using var cmd = connection.CreateCommand();
        if (transaction != null) cmd.Transaction = transaction;
        cmd.CommandText = sql;

        cmd.Parameters.AddWithValue("@id", schedule.Id);
        cmd.Parameters.AddWithValue("@tenantId", schedule.TenantId);
        cmd.Parameters.AddWithValue("@title", schedule.Title);
        cmd.Parameters.AddWithValue("@instructor", (object?)schedule.InstructorName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@start", (object?)schedule.StartTime ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@end", (object?)schedule.EndTime ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@day", (object?)schedule.DayOfWeek ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@branch", (object?)schedule.Branch ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@capacity", schedule.Capacity);
        cmd.Parameters.AddWithValue("@booked", schedule.BookedCount);
        cmd.Parameters.AddWithValue("@serverVersion", schedule.ServerVersion);
        cmd.Parameters.AddWithValue("@serverUpdatedAt", schedule.ServerUpdatedAt.HasValue ? schedule.ServerUpdatedAt.Value.ToString("O") : DBNull.Value);
        cmd.Parameters.AddWithValue("@deletedAt", schedule.DeletedAt.HasValue ? schedule.DeletedAt.Value.ToString("O") : DBNull.Value);
        cmd.Parameters.AddWithValue("@syncState", schedule.SyncState.ToString());

        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<List<ClassScheduleEntity>> GetSchedulesAsync(string tenantId, string? dayOfWeek = null, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        using var conn = await _context.CreateOpenConnectionAsync(cancellationToken);
        string sql;
        if (string.IsNullOrWhiteSpace(dayOfWeek) || dayOfWeek == "All")
        {
            sql = @"
                SELECT id, tenant_id, title, instructor_name, start_time, end_time,
                       day_of_week, branch, capacity, booked_count,
                       server_version, server_updated_at, deleted_at, sync_state
                FROM class_schedules
                WHERE tenant_id = @tenantId AND deleted_at IS NULL
                ORDER BY day_of_week ASC, start_time ASC;
            ";
        }
        else
        {
            sql = @"
                SELECT id, tenant_id, title, instructor_name, start_time, end_time,
                       day_of_week, branch, capacity, booked_count,
                       server_version, server_updated_at, deleted_at, sync_state
                FROM class_schedules
                WHERE tenant_id = @tenantId AND deleted_at IS NULL AND day_of_week = @day
                ORDER BY start_time ASC;
            ";
        }

        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        if (!string.IsNullOrWhiteSpace(dayOfWeek) && dayOfWeek != "All")
        {
            cmd.Parameters.AddWithValue("@day", dayOfWeek);
        }

        var list = new List<ClassScheduleEntity>();
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            list.Add(new ClassScheduleEntity
            {
                Id = reader.GetString(0),
                TenantId = reader.GetString(1),
                Title = reader.GetString(2),
                InstructorName = reader.IsDBNull(3) ? null : reader.GetString(3),
                StartTime = reader.IsDBNull(4) ? null : reader.GetString(4),
                EndTime = reader.IsDBNull(5) ? null : reader.GetString(5),
                DayOfWeek = reader.IsDBNull(6) ? null : reader.GetString(6),
                Branch = reader.IsDBNull(7) ? null : reader.GetString(7),
                Capacity = reader.GetInt32(8),
                BookedCount = reader.GetInt32(9),
                ServerVersion = reader.GetInt64(10),
                ServerUpdatedAt = reader.IsDBNull(11) ? null : DateTimeOffset.Parse(reader.GetString(11)),
                DeletedAt = reader.IsDBNull(12) ? null : DateTimeOffset.Parse(reader.GetString(12)),
                SyncState = Enum.TryParse<SyncState>(reader.GetString(13), out var state) ? state : SyncState.Synced
            });
        }
        return list;
    }
}
