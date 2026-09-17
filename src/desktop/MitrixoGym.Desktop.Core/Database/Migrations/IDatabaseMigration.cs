using Microsoft.Data.Sqlite;

namespace MitrixoGym.Desktop.Core.Database.Migrations;

/// <summary>
/// Forward-only schema migration contract.
/// </summary>
public interface IDatabaseMigration
{
    int Version { get; }
    string Description { get; }
    Task ApplyAsync(SqliteConnection connection, SqliteTransaction transaction, CancellationToken cancellationToken = default);
}
