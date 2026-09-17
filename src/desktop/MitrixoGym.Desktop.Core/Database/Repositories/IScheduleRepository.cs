using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Domain.Entities;

namespace MitrixoGym.Desktop.Core.Database.Repositories;

/// <summary>
/// Repository interface for class schedules and timetables in local working set.
/// </summary>
public interface IScheduleRepository
{
    Task UpsertScheduleAsync(ClassScheduleEntity schedule, SqliteConnection connection, SqliteTransaction? transaction = null, CancellationToken cancellationToken = default);
    Task<List<ClassScheduleEntity>> GetSchedulesAsync(string tenantId, string? dayOfWeek = null, CancellationToken cancellationToken = default);
}
