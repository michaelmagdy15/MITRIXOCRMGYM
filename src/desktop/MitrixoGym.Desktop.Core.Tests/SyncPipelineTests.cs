using System.Text.Json;
using MitrixoGym.Desktop.Core.Database;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Domain.Models;
using MitrixoGym.Desktop.Core.Sync;
using Xunit;

namespace MitrixoGym.Desktop.Core.Tests;

public class SyncPipelineTests : IDisposable
{
    private readonly string _dbPath;
    private readonly SqliteDatabaseContext _context;
    private readonly SqliteMemberRepository _memberRepo;
    private readonly SqliteAttendanceRepository _attendanceRepo;
    private readonly SqliteOutboxRepository _outboxRepo;
    private readonly SqliteSyncStateRepository _syncStateRepo;
    private readonly OutboxService _outboxService;

    public SyncPipelineTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"mitrixo_sync_test_{Guid.NewGuid():N}.db");
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
    public async Task PushService_MarksAcceptedAsSynced_And_HandlesConflicts()
    {
        await _context.InitializeDatabaseAsync();

        // 1. Enqueue two check-ins
        var att1 = new AttendanceEntity
        {
            Id = "att-push-1",
            TenantId = "strike",
            ClientId = "client-1",
            RecordedByUserId = "user-1"
        };
        var att2 = new AttendanceEntity
        {
            Id = "att-push-2",
            TenantId = "strike",
            ClientId = "client-2",
            RecordedByUserId = "user-1"
        };

        // Create dummy members to satisfy foreign keys
        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            await _memberRepo.UpsertMemberAsync(new MemberEntity { Id = "client-1", TenantId = "strike", Name = "C1", Phone = "111" }, conn);
            await _memberRepo.UpsertMemberAsync(new MemberEntity { Id = "client-2", TenantId = "strike", Name = "C2", Phone = "222" }, conn);
        }

        await _outboxService.EnqueueCheckInAsync(att1, "dev-1");
        await _outboxService.EnqueueCheckInAsync(att2, "dev-1");

        var pending = await _outboxRepo.GetPendingOperationsAsync("strike", 10);
        Assert.Equal(2, pending.Count);

        var op1 = pending.First(o => o.EntityId == "att-push-1");
        var op2 = pending.First(o => o.EntityId == "att-push-2");

        // 2. Setup mock API client: op1 accepted, op2 rejected with CONFLICT
        var mockApiClient = new MockSyncApiClient
        {
            PushHandler = req => Task.FromResult(new SyncPushResponse
            {
                Success = true,
                Accepted = [
                    new AcceptedOperationDto
                    {
                        OperationId = op1.OperationId,
                        ServerVersion = 10,
                        ServerUpdatedAt = DateTimeOffset.UtcNow
                    }
                ],
                Rejected = [
                    new RejectedOperationDto
                    {
                        OperationId = op2.OperationId,
                        ErrorCode = "CONFLICT",
                        ErrorMessage = "Concurrent duplicate attendance rejected.",
                        IsRetryable = false,
                        ConflictServerStateJson = "{\"existingAttendanceId\":\"att-existing-99\"}"
                    }
                ]
            })
        };

        var pushService = new SyncPushService(_context, _outboxRepo, _syncStateRepo, mockApiClient);
        var result = await pushService.PushPendingOperationsAsync("strike", "dev-1");

        Assert.Equal(2, result.PushedCount);
        Assert.Equal(1, result.AcceptedCount);
        Assert.Equal(1, result.ConflictCount);

        // 3. Verify op1 is marked Synced and attendance record updated
        var checkAtt1 = (await _attendanceRepo.GetAttendanceForMemberAsync("client-1", "strike"))[0];
        Assert.Equal(SyncState.Synced, checkAtt1.SyncState);
        Assert.Equal(10, checkAtt1.ServerVersion);

        // 4. Verify op2 recorded to conflicts table
        var conflicts = await _outboxRepo.GetPendingConflictsAsync("strike", 10);
        Assert.Single(conflicts);
        Assert.Equal(op2.OperationId, conflicts[0].OperationId);
        Assert.Equal("CONFLICT", conflicts[0].ReasonCode);
    }

    [Fact]
    public async Task PullService_AppliesChanges_DeduplicatesWithInboxReceipts_AndAdvancesCursor()
    {
        await _context.InitializeDatabaseAsync();

        var serverTime = DateTimeOffset.UtcNow;
        var memberPayload = JsonSerializer.Serialize(new MemberEntity
        {
            Id = "mem-pulled-1",
            TenantId = "strike",
            Name = "Pulled Member",
            Phone = "+20111222333",
            Status = "Active"
        });

        var mockApiClient = new MockSyncApiClient
        {
            PullHandler = (t, d, c, l) => Task.FromResult(new SyncPullResponse
            {
                Success = true,
                NextCursor = "cursor-v2",
                HasMore = false,
                ServerTimeUtc = serverTime,
                Changes = [
                    new ServerChangeDto
                    {
                        EventId = "evt-001",
                        EntityType = "member",
                        EntityId = "mem-pulled-1",
                        Action = "Upsert",
                        ServerVersion = 5,
                        ServerUpdatedAt = serverTime,
                        PayloadJson = memberPayload
                    }
                ]
            })
        };

        var pullService = new SyncPullService(_context, _memberRepo, _attendanceRepo, _syncStateRepo, mockApiClient);

        // First pull
        var result1 = await pullService.PullChangesAsync("strike", "dev-1");
        Assert.Equal(1, result1.AppliedCount);
        Assert.Equal(0, result1.SkippedCount);
        Assert.Equal("cursor-v2", result1.NextCursor);

        // Verify member was saved in local SQLite
        var member = await _memberRepo.GetMemberByIdAsync("mem-pulled-1", "strike");
        Assert.NotNull(member);
        Assert.Equal("Pulled Member", member.Name);
        Assert.Equal(5, member.ServerVersion);

        // Verify sync_state cursor was saved
        var syncState = await _syncStateRepo.GetSyncStateAsync("strike");
        Assert.NotNull(syncState);
        Assert.Equal("cursor-v2", syncState.LastCommittedCursor);

        // Second pull with same event ID (simulating duplicate delivery)
        var result2 = await pullService.PullChangesAsync("strike", "dev-1");
        Assert.Equal(0, result2.AppliedCount);
        Assert.Equal(1, result2.SkippedCount); // skipped via inbox_receipts!
    }

    private class MockSyncApiClient : ISyncApiClient
    {
        public Func<SyncPushRequest, Task<SyncPushResponse>>? PushHandler { get; set; }
        public Func<string, string, string?, int, Task<SyncPullResponse>>? PullHandler { get; set; }

        public Task<SyncPushResponse> PushOperationsAsync(SyncPushRequest request, string? authToken = null, CancellationToken cancellationToken = default)
        {
            if (PushHandler != null) return PushHandler(request);
            return Task.FromResult(new SyncPushResponse { Success = true });
        }

        public Task<SyncPullResponse> PullChangesAsync(string tenantId, string deviceId, string? cursor, int limit = 100, string? authToken = null, CancellationToken cancellationToken = default)
        {
            if (PullHandler != null) return PullHandler(tenantId, deviceId, cursor, limit);
            return Task.FromResult(new SyncPullResponse { Success = true });
        }
    }
}
