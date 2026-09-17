using MitrixoGym.Desktop.Core.Database;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Domain.Models;
using MitrixoGym.Desktop.Core.Security;
using MitrixoGym.Desktop.Core.Sync;
using Xunit;

namespace MitrixoGym.Desktop.Tests;

/// <summary>
/// Verifies Section 15 & Section 18: Device Revocation Security.
/// A revoked device is denied and outbox push is halted and fails closed.
/// </summary>
public class DeviceRevocationTests : IDisposable
{
    private readonly string _dbPath;
    private readonly SqliteDatabaseContext _context;
    private readonly SqliteMemberRepository _memberRepo;
    private readonly SqliteAttendanceRepository _attendanceRepo;
    private readonly SqliteOutboxRepository _outboxRepo;
    private readonly SqliteSyncStateRepository _syncStateRepo;
    private readonly OutboxService _outboxService;

    public DeviceRevocationTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"mitrixo_revocation_{Guid.NewGuid():N}.db");
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
    public async Task RevokedDevice_HaltsOutboxPushImmediately_FailsClosed()
    {
        await _context.InitializeDatabaseAsync();

        const string tenantId = "strike";
        const string deviceId = "dev-workstation-revoked-01";

        // 1. Mark device as revoked in local device_state table
        var revokedDevice = new DeviceStateRecord
        {
            DeviceId = deviceId,
            TenantId = tenantId,
            DeviceName = "Compromised Front Desk PC",
            AppVersion = "1.0.0",
            IsRevoked = true,
            RevokedAtUtc = DateTimeOffset.UtcNow.AddHours(-1)
        };
        await _syncStateRepo.UpsertDeviceStateAsync(revokedDevice);

        // 2. Enqueue check-in operations in the outbox
        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            await _memberRepo.UpsertMemberAsync(new MemberEntity
            {
                Id = "mem-rev-1",
                TenantId = tenantId,
                Name = "Tarek Boxer",
                Phone = "+201011223344",
                SessionsRemaining = 10
            }, conn);
        }

        var att = new AttendanceEntity
        {
            Id = "att-rev-1",
            TenantId = tenantId,
            ClientId = "mem-rev-1",
            ClientName = "Tarek Boxer",
            DateUtc = DateTimeOffset.UtcNow,
            RecordedByUserId = "staff-1"
        };
        await _outboxService.EnqueueCheckInAsync(att, deviceId, decrementSessions: true);

        var pendingBefore = await _outboxRepo.GetPendingOperationsAsync(tenantId, 10);
        Assert.Single(pendingBefore);

        // 3. Attempt push through SyncPushService
        var mockApiClient = new GuardedMockApiClient();
        var pushService = new SyncPushService(_context, _outboxRepo, _syncStateRepo, mockApiClient);

        var result = await pushService.PushPendingOperationsAsync(tenantId, deviceId);

        // 4. Verify push was completely halted and failed closed:
        // - PushedCount == 0
        // - ErrorMessage indicates revocation
        // - Mock API client was NEVER called (network call blocked)
        // - Operation remains intact in Pending state (no data loss)
        Assert.Equal(0, result.PushedCount);
        Assert.NotNull(result.ErrorMessage);
        Assert.Contains("revoked", result.ErrorMessage, StringComparison.OrdinalIgnoreCase);
        Assert.False(mockApiClient.WasPushCalled);

        var pendingAfter = await _outboxRepo.GetPendingOperationsAsync(tenantId, 10);
        Assert.Single(pendingAfter);
        Assert.Equal(OutboxStatus.Pending, pendingAfter[0].Status);
    }

    [Fact]
    public async Task SyncCoordinator_HaltsOnRevocation()
    {
        await _context.InitializeDatabaseAsync();

        const string tenantId = "strike";
        const string deviceId = "dev-coord-revoked";

        // Register device as revoked
        await _syncStateRepo.UpsertDeviceStateAsync(new DeviceStateRecord
        {
            DeviceId = deviceId,
            TenantId = tenantId,
            DeviceName = "Revoked Terminal",
            AppVersion = "1.0.0",
            IsRevoked = true,
            RevokedAtUtc = DateTimeOffset.UtcNow
        });

        var tenantConfig = TenantConfiguration.CreateStrike();
        var mockApiClient = new GuardedMockApiClient();
        var pushService = new SyncPushService(_context, _outboxRepo, _syncStateRepo, mockApiClient);
        var pullService = new SyncPullService(_context, _memberRepo, _attendanceRepo, _syncStateRepo, mockApiClient);

        var coordinator = new SyncCoordinator(
            pushService,
            pullService,
            _outboxRepo,
            _syncStateRepo,
            tenantConfig,
            deviceId);

        // Execute sync
        await coordinator.SyncNowAsync();

        // Verify coordinator halts in Error state with revocation message
        Assert.Equal(SyncCoordinatorStatus.Error, coordinator.Status);
        Assert.NotNull(coordinator.LastError);
        Assert.Contains("revoked", coordinator.LastError, StringComparison.OrdinalIgnoreCase);
        Assert.False(coordinator.IsSyncing);
        Assert.False(mockApiClient.WasPushCalled);
    }

    [Fact]
    public async Task ServerRevocationResponse_MarksDeviceRevokedLocally_AndHaltsFurtherPushes()
    {
        await _context.InitializeDatabaseAsync();

        const string tenantId = "strike";
        const string deviceId = "dev-server-revoked-01";

        // 1. Device is initially active locally
        await _syncStateRepo.UpsertDeviceStateAsync(new DeviceStateRecord
        {
            DeviceId = deviceId,
            TenantId = tenantId,
            DeviceName = "Front Desk PC 2",
            AppVersion = "1.0.0",
            IsRevoked = false
        });

        // 2. Enqueue an outbox operation
        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            await _memberRepo.UpsertMemberAsync(new MemberEntity
            {
                Id = "mem-rev-2",
                TenantId = tenantId,
                Name = "Member 2",
                Phone = "+201022334455"
            }, conn);
        }

        var att = new AttendanceEntity
        {
            Id = "att-rev-2",
            TenantId = tenantId,
            ClientId = "mem-rev-2",
            DateUtc = DateTimeOffset.UtcNow,
            RecordedByUserId = "staff-2"
        };
        await _outboxService.EnqueueCheckInAsync(att, deviceId);

        var pendingOps = await _outboxRepo.GetPendingOperationsAsync(tenantId, 10);
        Assert.Single(pendingOps);
        var opId = pendingOps[0].OperationId;

        // 3. Setup mock API client to return DEVICE_REVOKED (HTTP 403)
        var mockApiClient = new GuardedMockApiClient
        {
            PushResponse = new SyncPushResponse
            {
                Success = false,
                Accepted = [],
                Rejected = [
                    new RejectedOperationDto
                    {
                        OperationId = opId,
                        ErrorCode = "DEVICE_REVOKED",
                        ErrorMessage = "This device registration has been revoked by gym administrator.",
                        IsRetryable = false
                    }
                ]
            }
        };

        var pushService = new SyncPushService(_context, _outboxRepo, _syncStateRepo, mockApiClient);

        // 4. First push attempt: Server rejects with DEVICE_REVOKED
        var result1 = await pushService.PushPendingOperationsAsync(tenantId, deviceId);
        Assert.NotNull(result1.ErrorMessage);
        Assert.Contains("revoked", result1.ErrorMessage, StringComparison.OrdinalIgnoreCase);

        // 5. Verify local SQLite device_state has been updated to IsRevoked = true
        var localDevice = await _syncStateRepo.GetDeviceStateAsync(deviceId, tenantId);
        Assert.NotNull(localDevice);
        Assert.True(localDevice.IsRevoked);
        Assert.NotNull(localDevice.RevokedAtUtc);

        // Reset call tracker on mock API
        mockApiClient.WasPushCalled = false;

        // 6. Second push attempt: Must halt locally without making any server call
        var result2 = await pushService.PushPendingOperationsAsync(tenantId, deviceId);
        Assert.Equal(0, result2.PushedCount);
        Assert.Contains("revoked", result2.ErrorMessage, StringComparison.OrdinalIgnoreCase);
        Assert.False(mockApiClient.WasPushCalled); // Guarded: zero outgoing network requests
    }

    private class GuardedMockApiClient : ISyncApiClient
    {
        public bool WasPushCalled { get; set; } = false;
        public SyncPushResponse? PushResponse { get; set; }

        public Task<SyncPushResponse> PushOperationsAsync(SyncPushRequest request, string? authToken = null, CancellationToken cancellationToken = default)
        {
            WasPushCalled = true;
            return Task.FromResult(PushResponse ?? new SyncPushResponse { Success = true });
        }

        public Task<SyncPullResponse> PullChangesAsync(string tenantId, string deviceId, string? cursor, int limit = 100, string? authToken = null, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(new SyncPullResponse { Success = true });
        }
    }
}
