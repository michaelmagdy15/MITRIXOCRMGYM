using Microsoft.Data.Sqlite;

namespace MitrixoGym.Desktop.Core.Database.Migrations;

/// <summary>
/// Executes forward-only, transactional schema migrations against SQLite.
/// </summary>
public class DatabaseMigrationRunner
{
    private readonly IEnumerable<IDatabaseMigration> _migrations;

    public DatabaseMigrationRunner(IEnumerable<IDatabaseMigration>? migrations = null)
    {
        _migrations = (migrations ?? [new InitialSchemaMigration(), new PaymentsAndSchedulesMigration()])
            .OrderBy(m => m.Version)
            .ToList();
    }

    /// <summary>
    /// Applies any unapplied migrations to the target database in order.
    /// </summary>
    public async Task MigrateAsync(SqliteConnection connection, CancellationToken cancellationToken = default)
    {
        // 1. Ensure schema_migrations table exists
        const string createMigrationsTableSql = @"
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at_utc TEXT NOT NULL,
                description TEXT NOT NULL
            );
        ";

        using (var setupCmd = connection.CreateCommand())
        {
            setupCmd.CommandText = createMigrationsTableSql;
            await setupCmd.ExecuteNonQueryAsync(cancellationToken);
        }

        // 2. Fetch applied migration versions
        var appliedVersions = new HashSet<int>();
        const string queryAppliedSql = "SELECT version FROM schema_migrations ORDER BY version ASC;";
        using (var queryCmd = connection.CreateCommand())
        {
            queryCmd.CommandText = queryAppliedSql;
            using var reader = await queryCmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                appliedVersions.Add(reader.GetInt32(0));
            }
        }

        // 3. Apply pending migrations sequentially inside a transaction per migration
        foreach (var migration in _migrations)
        {
            if (appliedVersions.Contains(migration.Version))
            {
                continue;
            }

            using var transaction = connection.BeginTransaction();
            try
            {
                await migration.ApplyAsync(connection, transaction, cancellationToken);

                const string recordMigrationSql = @"
                    INSERT INTO schema_migrations (version, applied_at_utc, description)
                    VALUES (@version, @appliedAt, @desc);
                ";
                using (var recordCmd = connection.CreateCommand())
                {
                    recordCmd.Transaction = transaction;
                    recordCmd.CommandText = recordMigrationSql;
                    recordCmd.Parameters.AddWithValue("@version", migration.Version);
                    recordCmd.Parameters.AddWithValue("@appliedAt", DateTimeOffset.UtcNow.ToString("O"));
                    recordCmd.Parameters.AddWithValue("@desc", migration.Description);
                    await recordCmd.ExecuteNonQueryAsync(cancellationToken);
                }

                transaction.Commit();
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }
    }
}
