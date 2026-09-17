using MitrixoGym.Desktop.Core.Database;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Sync;
using Xunit;

namespace MitrixoGym.Desktop.Core.Tests;

public class RepositoryTests : IDisposable
{
    private readonly string _dbPath;
    private readonly SqliteDatabaseContext _context;
    private readonly SqliteMemberRepository _memberRepo;
    private readonly SqliteAttendanceRepository _attendanceRepo;
    private readonly SqliteOutboxRepository _outboxRepo;
    private readonly OutboxService _outboxService;

    public RepositoryTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"mitrixo_repo_test_{Guid.NewGuid():N}.db");
        _context = new SqliteDatabaseContext(_dbPath);
        _memberRepo = new SqliteMemberRepository(_context);
        _attendanceRepo = new SqliteAttendanceRepository(_context);
        _outboxRepo = new SqliteOutboxRepository(_context);
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
    public async Task MemberRepository_UpsertAndSearch_WorksAccurately()
    {
        await _context.InitializeDatabaseAsync();

        var member1 = new MemberEntity
        {
            Id = "mem-1",
            TenantId = "strike",
            Name = "John Boxing",
            Phone = "+201001112233",
            MemberCode = "STR-100",
            Status = "Active",
            PackageType = "10 Sessions",
            SessionsRemaining = 8,
            ServerVersion = 1,
            SyncState = SyncState.Synced
        };

        var member2 = new MemberEntity
        {
            Id = "mem-2",
            TenantId = "strike",
            Name = "Sarah Athlete",
            Phone = "+201009998877",
            MemberCode = "STR-101",
            Status = "Active",
            PackageType = "Monthly",
            SessionsRemaining = 0,
            ServerVersion = 1,
            SyncState = SyncState.Synced
        };

        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            await _memberRepo.UpsertMemberAsync(member1, conn);
            await _memberRepo.UpsertMemberAsync(member2, conn);
        }

        // Search by phone
        var byPhone = await _memberRepo.GetMemberByPhoneAsync("+201001112233", "strike");
        Assert.NotNull(byPhone);
        Assert.Equal("John Boxing", byPhone.Name);

        // Search by name query
        var searchResults = await _memberRepo.SearchMembersAsync("Boxing", "strike");
        Assert.Single(searchResults);
        Assert.Equal("mem-1", searchResults[0].Id);

        // Search by code
        var codeResults = await _memberRepo.SearchMembersAsync("STR-101", "strike");
        Assert.Single(codeResults);
        Assert.Equal("mem-2", codeResults[0].Id);

        // Verify tenant isolation
        var crossTenantResults = await _memberRepo.SearchMembersAsync("Boxing", "inzanathletics");
        Assert.Empty(crossTenantResults);
    }

    [Fact]
    public async Task OutboxService_RecordCheckIn_AtomicallyCommitsAttendanceAndOutbox()
    {
        await _context.InitializeDatabaseAsync();

        // 1. Setup member
        var member = new MemberEntity
        {
            Id = "mem-10",
            TenantId = "strike",
            Name = "Karim Ahmed",
            Phone = "+201055555555",
            Status = "Active",
            PackageType = "Punch Card",
            SessionsRemaining = 5,
            ServerVersion = 1,
            SyncState = SyncState.Synced
        };

        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            await _memberRepo.UpsertMemberAsync(member, conn);
        }

        // 2. Perform check-in through OutboxService
        var attendance = new AttendanceEntity
        {
            Id = "att-" + Guid.NewGuid().ToString("N"),
            TenantId = "strike",
            ClientId = "mem-10",
            ClientName = "Karim Ahmed",
            BranchId = "branch-cairo",
            DateUtc = DateTimeOffset.UtcNow,
            RecordedByUserId = "user-reception-1",
            PackageName = "Punch Card",
            Notes = "Morning session"
        };

        await _outboxService.EnqueueCheckInAsync(attendance, "dev-workstation-1", decrementSessions: true);

        // 3. Verify attendance record is stored with SyncState == Pending
        var recent = await _attendanceRepo.GetAttendanceForMemberAsync("mem-10", "strike");
        Assert.Single(recent);
        Assert.Equal(attendance.Id, recent[0].Id);
        Assert.Equal(SyncState.Pending, recent[0].SyncState);

        // 4. Verify member sessions_remaining was decremented from 5 to 4
        var updatedMember = await _memberRepo.GetMemberByIdAsync("mem-10", "strike");
        Assert.NotNull(updatedMember);
        Assert.Equal(4, updatedMember.SessionsRemaining);

        // 5. Verify outbox_operations record was created in the same transaction
        var pendingOps = await _outboxRepo.GetPendingOperationsAsync("strike", 10);
        Assert.Single(pendingOps);
        Assert.Equal(attendance.Id, pendingOps[0].EntityId);
        Assert.Equal("attendance", pendingOps[0].EntityType);
        Assert.Equal("CheckIn", pendingOps[0].OperationType);
        Assert.Equal(OutboxStatus.Pending, pendingOps[0].Status);
    }
}
