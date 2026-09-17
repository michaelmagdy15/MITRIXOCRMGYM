using MitrixoGym.Desktop.Core.Database;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Domain.Models;
using MitrixoGym.Desktop.Core.Security;
using MitrixoGym.Desktop.Core.Sync;
using MitrixoGym.Desktop.Core.ViewModels;
using Xunit;

namespace MitrixoGym.Desktop.Core.Tests;

public class ViewModelTests : IDisposable
{
    private readonly string _dbPath;
    private readonly SqliteDatabaseContext _context;
    private readonly SqliteMemberRepository _memberRepo;
    private readonly SqliteAttendanceRepository _attendanceRepo;
    private readonly SqliteOutboxRepository _outboxRepo;
    private readonly SqliteSyncStateRepository _syncStateRepo;
    private readonly OutboxService _outboxService;
    private readonly TenantConfiguration _tenantConfig;
    private readonly FakeSyncCoordinator _syncCoordinator;

    public ViewModelTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"mitrixo_vm_test_{Guid.NewGuid():N}.db");
        _context = new SqliteDatabaseContext(_dbPath);
        _memberRepo = new SqliteMemberRepository(_context);
        _attendanceRepo = new SqliteAttendanceRepository(_context);
        _outboxRepo = new SqliteOutboxRepository(_context);
        _syncStateRepo = new SqliteSyncStateRepository(_context);
        _outboxService = new OutboxService(_context, _outboxRepo, _attendanceRepo);
        _tenantConfig = TenantConfiguration.CreateStrike();
        _syncCoordinator = new FakeSyncCoordinator();
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
    public async Task MainReceptionViewModel_SearchAndQuickCheckIn_Succeeds()
    {
        await _context.InitializeDatabaseAsync();

        // 1. Seed member
        var member = new MemberEntity
        {
            Id = "mem-vm-1",
            TenantId = "strike",
            Name = "Mohamed Ali",
            Phone = "+201122334455",
            MemberCode = "STR-777",
            Status = "Active",
            PackageType = "Pro Boxing 12",
            SessionsRemaining = 10,
            ServerVersion = 1,
            SyncState = SyncState.Synced
        };

        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            await _memberRepo.UpsertMemberAsync(member, conn);
        }

        var vm = new MainReceptionViewModel(
            _memberRepo,
            _outboxService,
            _syncCoordinator,
            _outboxRepo,
            _attendanceRepo,
            _tenantConfig,
            "dev-vm-test-1");

        await vm.InitializeAsync();
        Assert.Equal(1, vm.ActiveMembersCount);

        // 2. Search for member
        vm.SearchText = "STR-777";
        await vm.SearchCommand.ExecuteAsync(null);

        Assert.Single(vm.SearchResults);
        Assert.NotNull(vm.SelectedMember);
        Assert.Equal("Mohamed Ali", vm.SelectedMember.Name);

        // 3. Quick check-in
        await vm.QuickCheckInCommand.ExecuteAsync(null);

        Assert.True(vm.HasCheckInSuccess);
        Assert.Contains("Mohamed Ali", vm.CheckInSuccessMessage);
        Assert.Equal(1, vm.TodayCheckInCount);
        Assert.Equal(9, vm.SelectedMember.SessionsRemaining);

        // 4. Verify outbox record created
        var pendingOps = await _outboxRepo.GetPendingOperationsAsync("strike", 10);
        Assert.Single(pendingOps);
        Assert.Equal("attendance", pendingOps[0].EntityType);
        Assert.Equal("CheckIn", pendingOps[0].OperationType);
    }

    [Fact]
    public void MainReceptionViewModel_FastLockAndUnlock_BehavesCorrectly()
    {
        var vm = new MainReceptionViewModel(
            _memberRepo,
            _outboxService,
            _syncCoordinator,
            _outboxRepo,
            _attendanceRepo,
            _tenantConfig,
            "dev-vm-test-1");

        Assert.False(vm.IsLocked);

        vm.FastLockCommand.Execute(null);
        Assert.True(vm.IsLocked);

        // Invalid PIN
        vm.PinInput = "00";
        vm.UnlockCommand.Execute(null);
        Assert.True(vm.IsLocked);
        Assert.NotNull(vm.UnlockErrorMessage);

        // Correct default PIN
        vm.PinInput = "1234";
        vm.UnlockCommand.Execute(null);
        Assert.False(vm.IsLocked);
        Assert.Null(vm.UnlockErrorMessage);
    }

    [Fact]
    public async Task OutboxInspectorViewModel_RefreshAndRetry_Works()
    {
        await _context.InitializeDatabaseAsync();

        // Seed a failed outbox operation
        using (var conn = await _context.CreateOpenConnectionAsync())
        using (var tx = conn.BeginTransaction())
        {
            var op = new OutboxOperation
            {
                OperationId = "op-fail-1",
                TenantId = "strike",
                DeviceId = "dev-1",
                ActorUserId = "user-1",
                EntityType = "attendance",
                EntityId = "att-1",
                OperationType = "CheckIn",
                PayloadJson = "{}",
                SchemaVersion = 1,
                CreatedAtUtc = DateTimeOffset.UtcNow,
                AttemptCount = 3,
                Status = OutboxStatus.Failed,
                LastErrorCode = "NETWORK_ERROR",
                LastErrorMessage = "Server unreachable"
            };
            await _outboxRepo.EnqueueAsync(op, conn, tx);
            tx.Commit();
        }

        var inspector = new OutboxInspectorViewModel(_outboxRepo, _tenantConfig, _syncCoordinator);
        await inspector.RefreshCommand.ExecuteAsync(null);

        Assert.Equal(1, inspector.FailedCount);
        Assert.Single(inspector.FailedOperations);

        // Retry the failed operation
        await inspector.RetryOperationCommand.ExecuteAsync(inspector.FailedOperations[0]);

        // After retry, it should be pending
        Assert.Equal(0, inspector.FailedCount);
        Assert.Equal(1, inspector.PendingCount);
    }

    private class FakeSyncCoordinator : CommunityToolkit.Mvvm.ComponentModel.ObservableObject, ISyncCoordinator
    {
        public SyncCoordinatorStatus Status { get; set; } = SyncCoordinatorStatus.Idle;
        public int PendingCount { get; set; } = 0;
        public int FailedCount { get; set; } = 0;
        public int ConflictCount { get; set; } = 0;
        public DateTimeOffset? LastSyncTimeUtc { get; set; } = DateTimeOffset.UtcNow;
        public string? LastError { get; set; } = null;
        public bool IsSyncing { get; set; } = false;

        public Task RefreshStatusAsync(CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task SyncNowAsync(string? authToken = null, CancellationToken cancellationToken = default) => Task.CompletedTask;
    }
}
