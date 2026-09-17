using Microsoft.Data.Sqlite;

namespace MitrixoGym.Desktop.Core.Database;

/// <summary>
/// Manages SQLite connection lifecycle, WAL mode, foreign keys, and atomic transaction execution.
/// </summary>
public interface ISqliteDatabaseContext : IDisposable, IAsyncDisposable
{
    /// <summary>
    /// File path to the SQLite database file on disk.
    /// </summary>
    string DatabasePath { get; }

    /// <summary>
    /// Connection string used for SQLite database connections.
    /// </summary>
    string ConnectionString { get; }

    /// <summary>
    /// Opens and configures a new SQLite connection with required pragmas (WAL, foreign keys, busy timeout).
    /// </summary>
    Task<SqliteConnection> CreateOpenConnectionAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Executes a unit of work inside an explicit SQLite transaction.
    /// Commits if successful, rolls back automatically on error.
    /// </summary>
    Task<T> ExecuteInTransactionAsync<T>(
        Func<SqliteConnection, SqliteTransaction, Task<T>> action,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Executes a unit of work inside an explicit SQLite transaction with no return value.
    /// Commits if successful, rolls back automatically on error.
    /// </summary>
    Task ExecuteInTransactionAsync(
        Func<SqliteConnection, SqliteTransaction, Task> action,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Runs a SQLite integrity check.
    /// </summary>
    Task<bool> CheckIntegrityAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Forces a WAL checkpoint (TRUNCATE) to merge WAL file into main database.
    /// </summary>
    Task CheckpointWalAsync(CancellationToken cancellationToken = default);
}
