using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Database;
using Xunit;

namespace MitrixoGym.Desktop.Core.Tests;

public class DatabaseContextTests : IDisposable
{
    private readonly string _dbPath;
    private readonly SqliteDatabaseContext _context;

    public DatabaseContextTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"mitrixo_test_{Guid.NewGuid():N}.db");
        _context = new SqliteDatabaseContext(_dbPath);
    }

    public void Dispose()
    {
        _context.Dispose();
        try
        {
            if (File.Exists(_dbPath)) File.Delete(_dbPath);
            var wal = $"{_dbPath}-wal";
            if (File.Exists(wal)) File.Delete(wal);
            var shm = $"{_dbPath}-shm";
            if (File.Exists(shm)) File.Delete(shm);
        }
        catch { }
    }

    [Fact]
    public async Task InitializeDatabase_SetsWalMode_ForeignKeys_And_BusyTimeout()
    {
        await _context.InitializeDatabaseAsync();

        using var connection = await _context.CreateOpenConnectionAsync();
        using var cmd = connection.CreateCommand();

        // 1. Verify journal_mode is WAL
        cmd.CommandText = "PRAGMA journal_mode;";
        var journalMode = await cmd.ExecuteScalarAsync();
        Assert.Equal("wal", journalMode?.ToString()?.ToLowerInvariant());

        // 2. Verify foreign_keys is ON (1)
        cmd.CommandText = "PRAGMA foreign_keys;";
        var foreignKeys = await cmd.ExecuteScalarAsync();
        Assert.Equal(1L, Convert.ToInt64(foreignKeys));

        // 3. Verify busy_timeout is 5000ms
        cmd.CommandText = "PRAGMA busy_timeout;";
        var busyTimeout = await cmd.ExecuteScalarAsync();
        Assert.Equal(5000L, Convert.ToInt64(busyTimeout));

        // 4. Verify integrity check passes
        var isHealthy = await _context.CheckIntegrityAsync();
        Assert.True(isHealthy);
    }

    [Fact]
    public async Task ExecuteInTransaction_RollsBack_OnException()
    {
        await _context.InitializeDatabaseAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(async () =>
        {
            await _context.ExecuteInTransactionAsync(async (conn, tx) =>
            {
                using var cmd = conn.CreateCommand();
                cmd.Transaction = tx;
                cmd.CommandText = @"
                    INSERT INTO members (id, tenant_id, name, phone, status, server_version, sync_state)
                    VALUES ('mem-rollback-1', 'strike', 'Rollback User', '123456789', 'Active', 1, 'Synced');
                ";
                await cmd.ExecuteNonQueryAsync();

                throw new InvalidOperationException("Simulated mid-transaction failure");
            });
        });

        // Verify row was rolled back and does not exist
        using var checkConn = await _context.CreateOpenConnectionAsync();
        using var checkCmd = checkConn.CreateCommand();
        checkCmd.CommandText = "SELECT COUNT(1) FROM members WHERE id = 'mem-rollback-1';";
        var count = Convert.ToInt32(await checkCmd.ExecuteScalarAsync());
        Assert.Equal(0, count);
    }
}
