using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Database.Migrations;

namespace MitrixoGym.Desktop.Core.Database;

/// <summary>
/// SQLite Database Context managing connection lifecycle, WAL mode, foreign keys, and controlled write transactions.
/// </summary>
public class SqliteDatabaseContext : ISqliteDatabaseContext
{
    private readonly SemaphoreSlim _writeLock = new(1, 1);
    private readonly DatabaseMigrationRunner _migrationRunner;
    private bool _isDisposed;

    public string DatabasePath { get; }
    public string ConnectionString { get; }

    /// <summary>
    /// Creates a new SqliteDatabaseContext for the specified database path and optional encryption password.
    /// </summary>
    public SqliteDatabaseContext(
        string databasePath,
        string? encryptionPassword = null,
        DatabaseMigrationRunner? migrationRunner = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(databasePath);
        DatabasePath = databasePath;

        // Ensure target directory exists
        var dir = Path.GetDirectoryName(databasePath);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
        {
            Directory.CreateDirectory(dir);
        }

        var builder = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            Cache = SqliteCacheMode.Shared
        };

        if (!string.IsNullOrEmpty(encryptionPassword))
        {
            builder.Password = encryptionPassword;
        }

        ConnectionString = builder.ConnectionString;
        _migrationRunner = migrationRunner ?? new DatabaseMigrationRunner();
    }

    /// <summary>
    /// Initializes database, configures pragmas, and runs all forward migrations.
    /// </summary>
    public async Task InitializeDatabaseAsync(CancellationToken cancellationToken = default)
    {
        await _writeLock.WaitAsync(cancellationToken);
        try
        {
            using var connection = await CreateOpenConnectionInternalAsync(cancellationToken);
            await _migrationRunner.MigrateAsync(connection, cancellationToken);
        }
        finally
        {
            _writeLock.Release();
        }
    }

    /// <summary>
    /// Opens and configures a new SQLite connection with required production pragmas:
    /// - WAL mode (PRAGMA journal_mode=WAL;)
    /// - Foreign keys (PRAGMA foreign_keys=ON;)
    /// - Busy timeout (PRAGMA busy_timeout=5000;)
    /// </summary>
    public async Task<SqliteConnection> CreateOpenConnectionAsync(CancellationToken cancellationToken = default)
    {
        return await CreateOpenConnectionInternalAsync(cancellationToken);
    }

    private async Task<SqliteConnection> CreateOpenConnectionInternalAsync(CancellationToken cancellationToken)
    {
        var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync(cancellationToken);

        const string pragmaSql = @"
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
        ";

        using var cmd = connection.CreateCommand();
        cmd.CommandText = pragmaSql;
        await cmd.ExecuteNonQueryAsync(cancellationToken);

        return connection;
    }

    /// <summary>
    /// Atomically executes an operation inside an explicit SQLite transaction using the controlled writer lock.
    /// </summary>
    public async Task<T> ExecuteInTransactionAsync<T>(
        Func<SqliteConnection, SqliteTransaction, Task<T>> action,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(action);

        await _writeLock.WaitAsync(cancellationToken);
        try
        {
            using var connection = await CreateOpenConnectionInternalAsync(cancellationToken);
            using var transaction = connection.BeginTransaction();
            try
            {
                var result = await action(connection, transaction);
                transaction.Commit();
                return result;
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }
        finally
        {
            _writeLock.Release();
        }
    }

    /// <summary>
    /// Atomically executes an action inside an explicit SQLite transaction using the controlled writer lock.
    /// </summary>
    public async Task ExecuteInTransactionAsync(
        Func<SqliteConnection, SqliteTransaction, Task> action,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(action);

        await _writeLock.WaitAsync(cancellationToken);
        try
        {
            using var connection = await CreateOpenConnectionInternalAsync(cancellationToken);
            using var transaction = connection.BeginTransaction();
            try
            {
                await action(connection, transaction);
                transaction.Commit();
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }
        finally
        {
            _writeLock.Release();
        }
    }

    /// <summary>
    /// Executes PRAGMA integrity_check to verify database health.
    /// </summary>
    public async Task<bool> CheckIntegrityAsync(CancellationToken cancellationToken = default)
    {
        using var connection = await CreateOpenConnectionInternalAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "PRAGMA integrity_check;";
        var result = await cmd.ExecuteScalarAsync(cancellationToken);
        return string.Equals(result?.ToString(), "ok", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Performs an intentional WAL checkpoint (TRUNCATE) to merge changes into the main SQLite database.
    /// </summary>
    public async Task CheckpointWalAsync(CancellationToken cancellationToken = default)
    {
        await _writeLock.WaitAsync(cancellationToken);
        try
        {
            using var connection = await CreateOpenConnectionInternalAsync(cancellationToken);
            using var cmd = connection.CreateCommand();
            cmd.CommandText = "PRAGMA wal_checkpoint(TRUNCATE);";
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
        finally
        {
            _writeLock.Release();
        }
    }

    public void Dispose()
    {
        if (!_isDisposed)
        {
            _writeLock.Dispose();
            _isDisposed = true;
        }
        GC.SuppressFinalize(this);
    }

    public ValueTask DisposeAsync()
    {
        Dispose();
        return ValueTask.CompletedTask;
    }
}
