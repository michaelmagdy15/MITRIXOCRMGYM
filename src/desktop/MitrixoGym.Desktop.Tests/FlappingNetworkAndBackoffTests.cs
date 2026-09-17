using MitrixoGym.Desktop.Core.Database;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Domain.Models;
using MitrixoGym.Desktop.Core.Sync;
using Xunit;

namespace MitrixoGym.Desktop.Tests;

/// <summary>
/// Verifies Section 15 & Section 18: Flapping Network & Exponential Backoff with Jitter.
/// Transient disconnect simulation and retry schedule backoff logic.
/// </summary>
public class FlappingNetworkAndBackoffTests : IDisposable
{
    private readonly string _dbPath;
    private readonly SqliteDatabaseContext _context;
    private readonly SqliteMemberRepository _memberRepo;
    private readonly SqliteAttendanceRepository _attendanceRepo;
    private readonly SqliteOutboxRepository _outboxRepo;
    private readonly SqliteSyncStateRepository _syncStateRepo;
    private readonly OutboxService _outboxService;

    public FlappingNetworkAndBackoffTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"mitrixo_flapping_{Guid.NewGuid():N}.db");
        _context = new SqliteDatabaseContext(_dbPath);
        _memberRepo = new SqliteMemberRepository(_context);
        _attendanceRepo = new SqliteAttendanceRepository(_context);
        _outboxRepo = new SqliteOutboxRepository(_context);
        _syncStateRepo = new SqliteSyncStateRepository(_context);
        _outboxService = new OutboxService(_context, _outboxRepo, _attendanceRepo);
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
    public void CalculateNextAttempt_FollowsExponentialBackoff_WithJitter()
    {
        var baseTime = new DateTimeOffset(2026, 9, 17, 12, 0, 0, TimeSpan.Zero);

        // 1. Verify exact exponential progression with zero jitter
        // Attempt 1: 2^(1-1) * 1000 = 1,000ms (1s)
        var a1 = SyncPushService.CalculateNextAttempt(1, baseTime, jitterMsOverride: 0);
        Assert.Equal(baseTime.AddSeconds(1), a1);

        // Attempt 2: 2^(2-1) * 1000 = 2,000ms (2s)
        var a2 = SyncPushService.CalculateNextAttempt(2, baseTime, jitterMsOverride: 0);
        Assert.Equal(baseTime.AddSeconds(2), a2);

        // Attempt 3: 2^(3-1) * 1000 = 4,000ms (4s)
        var a3 = SyncPushService.CalculateNextAttempt(3, baseTime, jitterMsOverride: 0);
        Assert.Equal(baseTime.AddSeconds(4), a3);

        // Attempt 4: 2^(4-1) * 1000 = 8,000ms (8s)
        var a4 = SyncPushService.CalculateNextAttempt(4, baseTime, jitterMsOverride: 0);
        Assert.Equal(baseTime.AddSeconds(8), a4);

        // Attempt 5: 2^(5-1) * 1000 = 16,000ms (16s)
        var a5 = SyncPushService.CalculateNextAttempt(5, baseTime, jitterMsOverride: 0);
        Assert.Equal(baseTime.AddSeconds(16), a5);

        // Attempt 6: 2^(6-1) * 1000 = 32,000ms (32s)
        var a6 = SyncPushService.CalculateNextAttempt(6, baseTime, jitterMsOverride: 0);
        Assert.Equal(baseTime.AddSeconds(32), a6);

        // Attempt 7: capped at max 60,000ms (60s)
        var a7 = SyncPushService.CalculateNextAttempt(7, baseTime, jitterMsOverride: 0);
        Assert.Equal(baseTime.AddSeconds(60), a7);

        // Attempt 10: stays capped at max 60,000ms (60s)
        var a10 = SyncPushService.CalculateNextAttempt(10, baseTime, jitterMsOverride: 0);
        Assert.Equal(baseTime.AddSeconds(60), a10);

        // 2. Verify randomized jitter falls strictly within expected range [expMs, expMs + 1000ms]
        for (int i = 0; i < 50; i++)
        {
            var withJitter = SyncPushService.CalculateNextAttempt(1, baseTime);
            var deltaMs = (withJitter - baseTime).TotalMilliseconds;
            Assert.InRange(deltaMs, 1000, 2000);
        }
    }

    [Fact]
    public async Task FlappingNetworkSimulation_RetriesWithBackoff_AndRecoversWhenStabilized()
    {
        await _context.InitializeDatabaseAsync();

        const string tenantId = "strike";
        const string deviceId = "dev-reception-flapping";

        // 1. Seed member and enqueue check-in
        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            await _memberRepo.UpsertMemberAsync(new MemberEntity
            {
                Id = "mem-flap-1",
                TenantId = tenantId,
                Name = "Flapping Member",
                Phone = "+201088776655",
                SessionsRemaining = 15
            }, conn);
        }

        var att = new AttendanceEntity
        {
            Id = "att-flap-1",
            TenantId = tenantId,
            ClientId = "mem-flap-1",
            DateUtc = DateTimeOffset.UtcNow,
            RecordedByUserId = "staff-flapping"
        };
        await _outboxService.EnqueueCheckInAsync(att, deviceId, decrementSessions: true);

        // 2. Setup flapping network: first 2 push attempts fail with network exception
        var flappingClient = new FlappingNetworkMockApiClient(failuresBeforeSuccess: 2);
        var pushService = new SyncPushService(_context, _outboxRepo, _syncStateRepo, flappingClient);

        // First attempt (Network disconnect)
        var result1 = await pushService.PushPendingOperationsAsync(tenantId, deviceId);
        Assert.NotNull(result1.ErrorMessage);
        Assert.Contains("Connection reset", result1.ErrorMessage);

        // Verify operation was rescheduled with attempt_count = 1 and future next_attempt
        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT attempt_count, next_attempt_at_utc, last_error_code FROM outbox_operations WHERE entity_id = 'att-flap-1';";
            using var reader = await cmd.ExecuteReaderAsync();
            Assert.True(await reader.ReadAsync());
            Assert.Equal(1, reader.GetInt32(0));
            Assert.False(reader.IsDBNull(1));
            Assert.Equal("NETWORK_ERROR", reader.GetString(2));
        }

        // Verify sync_state recorded backoff
        var state1 = await _syncStateRepo.GetSyncStateAsync(tenantId);
        Assert.NotNull(state1);
        Assert.Equal(5000, state1.CurrentBackoffMs);
        Assert.Contains("Connection reset", state1.LastError);

        // Second attempt (Flapping continues)
        // Reset next_attempt to simulate timer expiration
        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            using var resetCmd = conn.CreateCommand();
            resetCmd.CommandText = "UPDATE outbox_operations SET next_attempt_at_utc = NULL;";
            await resetCmd.ExecuteNonQueryAsync();
        }

        var result2 = await pushService.PushPendingOperationsAsync(tenantId, deviceId);
        Assert.NotNull(result2.ErrorMessage);

        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT attempt_count FROM outbox_operations WHERE entity_id = 'att-flap-1';";
            var attempts = Convert.ToInt32(await cmd.ExecuteScalarAsync());
            Assert.Equal(2, attempts);
        }

        // Third attempt: Network stabilizes!
        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            using var resetCmd = conn.CreateCommand();
            resetCmd.CommandText = "UPDATE outbox_operations SET next_attempt_at_utc = NULL;";
            await resetCmd.ExecuteNonQueryAsync();
        }

        var result3 = await pushService.PushPendingOperationsAsync(tenantId, deviceId);
        Assert.Null(result3.ErrorMessage);
        Assert.Equal(1, result3.AcceptedCount);

        // Pull changes to clear backoff
        var pullService = new SyncPullService(_context, _memberRepo, _attendanceRepo, _syncStateRepo, flappingClient);
        await pullService.PullChangesAsync(tenantId, deviceId);

        // 3. Acceptance Verification: All operations synced, backoff cleared
        var finalPending = await _outboxRepo.GetPendingOutboxCountAsync(tenantId);
        Assert.Equal(0, finalPending);

        var finalSyncState = await _syncStateRepo.GetSyncStateAsync(tenantId);
        Assert.NotNull(finalSyncState);
        Assert.Equal(0, finalSyncState.CurrentBackoffMs);
        Assert.Null(finalSyncState.LastError);

        // Verify attendance row is Synced
        var attResult = await _attendanceRepo.GetAttendanceForMemberAsync("mem-flap-1", tenantId);
        Assert.Single(attResult);
        Assert.Equal(SyncState.Synced, attResult[0].SyncState);
    }

    private class FlappingNetworkMockApiClient : ISyncApiClient
    {
        private readonly int _failuresBeforeSuccess;
        private int _currentFailures = 0;

        public FlappingNetworkMockApiClient(int failuresBeforeSuccess)
        {
            _failuresBeforeSuccess = failuresBeforeSuccess;
        }

        public Task<SyncPushResponse> PushOperationsAsync(SyncPushRequest request, string? authToken = null, CancellationToken cancellationToken = default)
        {
            if (_currentFailures < _failuresBeforeSuccess)
            {
                _currentFailures++;
                throw new HttpRequestException("Connection reset by peer (flapping transient network disconnect)");
            }

            var accepted = request.Operations.Select(op => new AcceptedOperationDto
            {
                OperationId = op.OperationId,
                ServerVersion = 500,
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
            return Task.FromResult(new SyncPullResponse
            {
                Success = true,
                HasMore = false,
                NextCursor = "cursor-stabilized",
                Changes = []
            });
        }
    }
}
