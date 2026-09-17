using MitrixoGym.Desktop.Core.Database;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Domain.Models;
using MitrixoGym.Desktop.Core.Sync;
using Xunit;

namespace MitrixoGym.Desktop.Tests;

/// <summary>
/// Verifies Section 18 Phase 1 Production Acceptance Gate:
/// "Seven days offline does not lose check-ins or make the UI unusable."
/// Queuing hundreds of offline check-ins across 7 days without internet.
/// Reconnecting and verifying all outbox operations are drained in strict chronological order with monotonic cursors.
/// </summary>
public class SevenDayOfflineQueueingTests : IDisposable
{
    private readonly string _dbPath;
    private readonly SqliteDatabaseContext _context;
    private readonly SqliteMemberRepository _memberRepo;
    private readonly SqliteAttendanceRepository _attendanceRepo;
    private readonly SqliteOutboxRepository _outboxRepo;
    private readonly SqliteSyncStateRepository _syncStateRepo;
    private readonly OutboxService _outboxService;

    public SevenDayOfflineQueueingTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"mitrixo_7day_{Guid.NewGuid():N}.db");
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
    public async Task SevenDayOfflineQueueing_AndReconnectionDrain_ProcessedInStrictChronologicalOrderWithMonotonicCursors()
    {
        await _context.InitializeDatabaseAsync();

        const string tenantId = "strike";
        const string deviceId = "dev-reception-pos-01";

        // 1. Seed members
        const int memberCount = 20;
        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            for (int i = 1; i <= memberCount; i++)
            {
                await _memberRepo.UpsertMemberAsync(new MemberEntity
                {
                    Id = $"mem-7day-{i}",
                    TenantId = tenantId,
                    Name = $"Member {i}",
                    Phone = $"+2010200000{i:D2}",
                    MemberCode = $"STR-{i:D3}",
                    Status = "Active",
                    PackageType = "Monthly Card",
                    SessionsRemaining = 100,
                    ServerVersion = 1,
                    SyncState = SyncState.Synced
                }, conn);
            }
        }

        // 2. Simulate 7 Days Offline:
        // Day 1 through Day 7: 35 check-ins per day = 245 check-ins total
        var baseDate = DateTimeOffset.UtcNow.AddDays(-7);
        var expectedOrderedOpIds = new List<string>();
        int checkInIndex = 0;

        for (int day = 0; day < 7; day++)
        {
            var currentDayDate = baseDate.AddDays(day);

            for (int hour = 0; hour < 35; hour++)
            {
                checkInIndex++;
                var memberId = $"mem-7day-{(checkInIndex % memberCount) + 1}";
                var checkInTime = currentDayDate.AddMinutes(hour * 20);

                var att = new AttendanceEntity
                {
                    Id = $"att-7day-{checkInIndex:D4}",
                    TenantId = tenantId,
                    ClientId = memberId,
                    ClientName = $"Member {(checkInIndex % memberCount) + 1}",
                    BranchId = "branch-zamalek",
                    DateUtc = checkInTime,
                    RecordedByUserId = "staff-offline-reception",
                    PackageName = "Monthly Card",
                    Notes = $"Offline check-in Day {day + 1} #{hour + 1}"
                };

                // Enqueue check-in while completely offline
                await _outboxService.EnqueueCheckInAsync(att, deviceId, decrementSessions: true);
            }
        }

        // Verify that 245 check-ins are pending locally in the outbox
        var totalQueued = await _outboxRepo.GetPendingOutboxCountAsync(tenantId);
        Assert.Equal(245, totalQueued);

        // Verify member balances decremented accurately offline
        var sampleMember = await _memberRepo.GetMemberByIdAsync("mem-7day-1", tenantId);
        Assert.NotNull(sampleMember);
        Assert.True(sampleMember.SessionsRemaining < 100);

        // 3. Reconnect after 7 days offline and Drain the Queue
        var mockApiClient = new ChronologicalDrainMockApiClient();
        var pushService = new SyncPushService(_context, _outboxRepo, _syncStateRepo, mockApiClient);

        // Drain all batches (batch size is 50 in SyncPushService)
        bool hasMorePending = true;
        int pushCycles = 0;

        while (hasMorePending)
        {
            pushCycles++;
            var pushResult = await pushService.PushPendingOperationsAsync(tenantId, deviceId);
            Assert.True(pushResult.AcceptedCount > 0);
            Assert.Null(pushResult.ErrorMessage);

            hasMorePending = pushResult.HasRemainingPending;
        }

        // 245 items / 50 per batch = 5 push cycles
        Assert.Equal(5, pushCycles);

        // 4. Verify Strict Chronological Ordering:
        // All operations pushed to the server must be strictly ordered by CreatedAtUtc ASC
        var pushedOps = mockApiClient.PushedOperations;
        Assert.Equal(245, pushedOps.Count);

        for (int i = 0; i < pushedOps.Count - 1; i++)
        {
            var curr = pushedOps[i];
            var next = pushedOps[i + 1];
            Assert.True(curr.CreatedAtUtc <= next.CreatedAtUtc,
                $"Chronological order violation at index {i}: {curr.CreatedAtUtc} > {next.CreatedAtUtc}");
        }

        // Verify 100% of outbox operations are now marked Synced
        var remainingPending = await _outboxRepo.GetPendingOutboxCountAsync(tenantId);
        Assert.Equal(0, remainingPending);

        // 5. Test Monotonic Cursor Advancement during Reconnection Pull
        var cursorValues = new List<string> { "cur-day-1", "cur-day-2", "cur-day-3", "cur-day-4", "cur-day-final" };
        var pullApiClient = new MultiPageCursorMockApiClient(cursorValues);
        var pullService = new SyncPullService(_context, _memberRepo, _attendanceRepo, _syncStateRepo, pullApiClient);

        // Pull multiple pages until caught up
        bool hasMorePull = true;
        var observedCursors = new List<string>();

        while (hasMorePull)
        {
            var pullResult = await pullService.PullChangesAsync(tenantId, deviceId);
            if (!string.IsNullOrEmpty(pullResult.NextCursor))
            {
                observedCursors.Add(pullResult.NextCursor);
            }
            hasMorePull = pullResult.HasMore;
        }

        // Verify monotonic advancement through expected cursor chain
        Assert.Equal(cursorValues, observedCursors);

        // Verify the sync_state record committed the final cursor
        var finalSyncState = await _syncStateRepo.GetSyncStateAsync(tenantId);
        Assert.NotNull(finalSyncState);
        Assert.Equal("cur-day-final", finalSyncState.LastCommittedCursor);
        Assert.Equal(0, finalSyncState.CurrentBackoffMs);
        Assert.Null(finalSyncState.LastError);

        // Verify SQLite database health and zero corruption
        Assert.True(await _context.CheckIntegrityAsync());
    }

    private class ChronologicalDrainMockApiClient : ISyncApiClient
    {
        public List<OutboxOperationPushDto> PushedOperations { get; } = new();

        public Task<SyncPushResponse> PushOperationsAsync(SyncPushRequest request, string? authToken = null, CancellationToken cancellationToken = default)
        {
            PushedOperations.AddRange(request.Operations);

            var accepted = request.Operations.Select((op, idx) => new AcceptedOperationDto
            {
                OperationId = op.OperationId,
                ServerVersion = 2000 + idx,
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

    private class MultiPageCursorMockApiClient : ISyncApiClient
    {
        private readonly List<string> _cursors;
        private int _currentIndex = 0;

        public MultiPageCursorMockApiClient(List<string> cursors)
        {
            _cursors = cursors;
        }

        public Task<SyncPushResponse> PushOperationsAsync(SyncPushRequest request, string? authToken = null, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(new SyncPushResponse { Success = true });
        }

        public Task<SyncPullResponse> PullChangesAsync(string tenantId, string deviceId, string? cursor, int limit = 100, string? authToken = null, CancellationToken cancellationToken = default)
        {
            if (_currentIndex >= _cursors.Count)
            {
                return Task.FromResult(new SyncPullResponse
                {
                    Success = true,
                    HasMore = false,
                    NextCursor = _cursors.LastOrDefault(),
                    Changes = []
                });
            }

            var nextCursor = _cursors[_currentIndex];
            _currentIndex++;
            bool hasMore = _currentIndex < _cursors.Count;

            return Task.FromResult(new SyncPullResponse
            {
                Success = true,
                HasMore = hasMore,
                NextCursor = nextCursor,
                ServerTimeUtc = DateTimeOffset.UtcNow,
                Changes = []
            });
        }
    }
}
