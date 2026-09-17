using MitrixoGym.Desktop.Core.Database;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Domain.Models;
using MitrixoGym.Desktop.Core.Sync;
using Xunit;

namespace MitrixoGym.Desktop.Tests;

/// <summary>
/// Verifies Section 15 & Section 18: Crash Recovery & Interrupted Writes Simulation.
/// Mid-transaction crash simulation: verified that power-loss or aborted writes roll back completely,
/// leaving zero corrupted or partial state.
/// Restart recovery: unacknowledged outbox operations remain intact and resume safely.
/// </summary>
public class CrashRecoveryAndInterruptedWritesTests : IDisposable
{
    private readonly string _dbPath;
    private SqliteDatabaseContext _context;
    private SqliteMemberRepository _memberRepo;
    private SqliteAttendanceRepository _attendanceRepo;
    private SqliteOutboxRepository _outboxRepo;
    private SqliteSyncStateRepository _syncStateRepo;
    private OutboxService _outboxService;

    public CrashRecoveryAndInterruptedWritesTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"mitrixo_crash_{Guid.NewGuid():N}.db");
        _context = new SqliteDatabaseContext(_dbPath);
        _memberRepo = new SqliteMemberRepository(_context);
        _attendanceRepo = new SqliteAttendanceRepository(_context);
        _outboxRepo = new SqliteOutboxRepository(_context);
        _syncStateRepo = new SqliteSyncStateRepository(_context);
        _outboxService = new OutboxService(_context, _outboxRepo, _attendanceRepo);
    }

    public void Dispose()
    {
        _context?.Dispose();
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
    public async Task MidTransactionCrash_RollsBackCompletely_LeavingZeroCorruptedOrPartialState()
    {
        await _context.InitializeDatabaseAsync();

        const string tenantId = "strike";
        const string memberId = "mem-crash-test-01";

        // 1. Seed initial member with 10 sessions
        var initialMember = new MemberEntity
        {
            Id = memberId,
            TenantId = tenantId,
            Name = "Crash Recovery Member",
            Phone = "+201099887766",
            Status = "Active",
            PackageType = "10 Sessions Card",
            SessionsRemaining = 10,
            ServerVersion = 1,
            SyncState = SyncState.Synced
        };

        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            await _memberRepo.UpsertMemberAsync(initialMember, conn);
        }

        // 2. Simulate multi-step check-in that suffers abrupt power loss/exception before commit
        var attendanceId = "att-interrupted-01";

        await Assert.ThrowsAsync<ApplicationException>(async () =>
        {
            await _context.ExecuteInTransactionAsync(async (conn, tx) =>
            {
                // Step A: Decrement member sessions
                using var decrCmd = conn.CreateCommand();
                decrCmd.Transaction = tx;
                decrCmd.CommandText = "UPDATE members SET sessions_remaining = sessions_remaining - 1 WHERE id = @id;";
                decrCmd.Parameters.AddWithValue("@id", memberId);
                await decrCmd.ExecuteNonQueryAsync();

                // Step B: Insert attendance record
                var att = new AttendanceEntity
                {
                    Id = attendanceId,
                    TenantId = tenantId,
                    ClientId = memberId,
                    DateUtc = DateTimeOffset.UtcNow,
                    RecordedByUserId = "staff-reception"
                };
                await _attendanceRepo.UpsertAttendanceAsync(att, conn, tx);

                // Step C: Sudden simulated catastrophic power loss / aborted execution
                throw new ApplicationException("CATASTROPHIC_POWER_LOSS_BEFORE_COMMIT");
            });
        });

        // 3. Verify complete rollback: member sessions remains untouched at 10
        var verifiedMember = await _memberRepo.GetMemberByIdAsync(memberId, tenantId);
        Assert.NotNull(verifiedMember);
        Assert.Equal(10, verifiedMember.SessionsRemaining); // NOT 9!

        // 4. Verify attendance row was never committed
        var checkAtt = await _attendanceRepo.GetAttendanceForMemberAsync(memberId, tenantId);
        Assert.Empty(checkAtt);

        // 5. Verify outbox operations count is 0
        var pendingCount = await _outboxRepo.GetPendingOutboxCountAsync(tenantId);
        Assert.Equal(0, pendingCount);

        // 6. Verify SQLite integrity is 100% intact (zero WAL or page corruption)
        var isHealthy = await _context.CheckIntegrityAsync();
        Assert.True(isHealthy);
    }

    [Fact]
    public async Task RestartRecovery_UnacknowledgedOutboxOperations_RemainIntactAndResumeSafely()
    {
        await _context.InitializeDatabaseAsync();

        const string tenantId = "strike";
        const string deviceId = "dev-reception-pc1";

        // 1. Seed members and enqueue 5 offline check-ins
        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            for (int i = 1; i <= 5; i++)
            {
                await _memberRepo.UpsertMemberAsync(new MemberEntity
                {
                    Id = $"mem-restart-{i}",
                    TenantId = tenantId,
                    Name = $"Member {i}",
                    Phone = $"+2010111100{i}",
                    SessionsRemaining = 5
                }, conn);
            }
        }

        var queuedOperationIds = new List<string>();
        for (int i = 1; i <= 5; i++)
        {
            var att = new AttendanceEntity
            {
                Id = $"att-restart-{i}",
                TenantId = tenantId,
                ClientId = $"mem-restart-{i}",
                ClientName = $"Member {i}",
                DateUtc = DateTimeOffset.UtcNow.AddMinutes(-10 * i),
                RecordedByUserId = "reception-user"
            };

            await _outboxService.EnqueueCheckInAsync(att, deviceId, decrementSessions: true);
        }

        var pendingBeforeCrash = await _outboxRepo.GetPendingOperationsAsync(tenantId, 10);
        Assert.Equal(5, pendingBeforeCrash.Count);
        queuedOperationIds = pendingBeforeCrash.Select(o => o.OperationId).ToList();

        // 2. Simulate 2 operations being in-flight when sudden termination occurs
        var inFlightOps = queuedOperationIds.Take(2).ToList();
        await _outboxRepo.MarkOperationsInFlightAsync(inFlightOps);

        // 3. Simulate process crash / reboot: Close and dispose database context completely
        _context.Dispose();

        // 4. Restart application: instantiate fresh database context from disk file
        _context = new SqliteDatabaseContext(_dbPath);
        _memberRepo = new SqliteMemberRepository(_context);
        _attendanceRepo = new SqliteAttendanceRepository(_context);
        _outboxRepo = new SqliteOutboxRepository(_context);
        _syncStateRepo = new SqliteSyncStateRepository(_context);

        // Verify database health upon restart
        Assert.True(await _context.CheckIntegrityAsync());

        // 5. On restart, verify all unacknowledged outbox operations remain intact on disk
        var totalPendingCount = await _outboxRepo.GetPendingOutboxCountAsync(tenantId);
        Assert.Equal(5, totalPendingCount); // 3 Pending + 2 InFlight = 5 unacknowledged ops

        // 6. Reset in-flight operations back to pending so they can resume cleanly
        await _outboxRepo.ResetInFlightOperationsAsync(tenantId);

        var readyToPush = await _outboxRepo.GetPendingOperationsAsync(tenantId, 10);
        Assert.Equal(5, readyToPush.Count); // All 5 are now Pending and ready

        // 7. Reconnect to server and push all pending operations
        var mockApiClient = new CrashRecoveryMockApiClient();
        var pushService = new SyncPushService(_context, _outboxRepo, _syncStateRepo, mockApiClient);

        var pushResult = await pushService.PushPendingOperationsAsync(tenantId, deviceId);

        Assert.Equal(5, pushResult.PushedCount);
        Assert.Equal(5, pushResult.AcceptedCount);
        Assert.Equal(0, pushResult.ConflictCount);
        Assert.Null(pushResult.ErrorMessage);

        // 8. Verify all outbox operations are transitioned to Synced
        var finalPendingCount = await _outboxRepo.GetPendingOutboxCountAsync(tenantId);
        Assert.Equal(0, finalPendingCount);

        // Verify all 5 attendance records are now marked Synced
        for (int i = 1; i <= 5; i++)
        {
            var attList = await _attendanceRepo.GetAttendanceForMemberAsync($"mem-restart-{i}", tenantId);
            Assert.Single(attList);
            Assert.Equal(SyncState.Synced, attList[0].SyncState);
            Assert.True(attList[0].ServerVersion > 0);
        }
    }

    private class CrashRecoveryMockApiClient : ISyncApiClient
    {
        public Task<SyncPushResponse> PushOperationsAsync(SyncPushRequest request, string? authToken = null, CancellationToken cancellationToken = default)
        {
            var accepted = request.Operations.Select((op, idx) => new AcceptedOperationDto
            {
                OperationId = op.OperationId,
                ServerVersion = 100 + idx,
                ServerUpdatedAt = DateTimeOffset.UtcNow
            }).ToList();

            return Task.FromResult(new SyncPushResponse
            {
                Success = true,
                Accepted = accepted,
                Rejected = []
            });
        }

        public Task<SyncPullResponse> PullChangesAsync(string tenantId, string deviceId, string? cursor, int limit = 100, string? authToken = null, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(new SyncPullResponse { Success = true });
        }
    }
}
