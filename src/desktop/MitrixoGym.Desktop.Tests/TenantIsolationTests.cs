using MitrixoGym.Desktop.Core.Database;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Security;
using Xunit;

namespace MitrixoGym.Desktop.Tests;

/// <summary>
/// Verifies Section 3 & Section 18: Strict Tenant Isolation.
/// Strike can never read or write Inzan data, and Inzan can never read or write Strike data.
/// Cross-tenant token or payload rejection.
/// </summary>
public class TenantIsolationTests : IDisposable
{
    private readonly string _dbPath;
    private readonly SqliteDatabaseContext _context;
    private readonly SqliteMemberRepository _memberRepo;
    private readonly SqliteAttendanceRepository _attendanceRepo;
    private readonly SqliteOutboxRepository _outboxRepo;

    public TenantIsolationTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"mitrixo_tenant_iso_{Guid.NewGuid():N}.db");
        _context = new SqliteDatabaseContext(_dbPath);
        _memberRepo = new SqliteMemberRepository(_context);
        _attendanceRepo = new SqliteAttendanceRepository(_context);
        _outboxRepo = new SqliteOutboxRepository(_context);
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
    public async Task StrikeDatabaseContext_CannotQueryOrAccess_InzanData()
    {
        await _context.InitializeDatabaseAsync();

        // 1. Seed members for both tenants into local database
        var strikeMember = new MemberEntity
        {
            Id = "mem-strike-001",
            TenantId = "strike",
            Name = "Ahmed Strike Boxer",
            Phone = "+201011111111",
            MemberCode = "STR-001",
            Status = "Active",
            PackageType = "Boxing Unlimited",
            SessionsRemaining = 12,
            ServerVersion = 1,
            SyncState = SyncState.Synced
        };

        var inzanMember = new MemberEntity
        {
            Id = "mem-inzan-999",
            TenantId = "inzanathletics",
            Name = "Omar Inzan Athlete",
            Phone = "+201099999999",
            MemberCode = "INZ-999",
            Status = "Active",
            PackageType = "CrossFit Pro",
            SessionsRemaining = 20,
            ServerVersion = 1,
            SyncState = SyncState.Synced
        };

        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            await _memberRepo.UpsertMemberAsync(strikeMember, conn);
            await _memberRepo.UpsertMemberAsync(inzanMember, conn);
        }

        // 2. Querying member by ID: Strike cannot read Inzan member
        var strikeQueryResult = await _memberRepo.GetMemberByIdAsync("mem-inzan-999", "strike");
        Assert.Null(strikeQueryResult);

        // Inzan can read its own
        var inzanQueryResult = await _memberRepo.GetMemberByIdAsync("mem-inzan-999", "inzanathletics");
        Assert.NotNull(inzanQueryResult);
        Assert.Equal("Omar Inzan Athlete", inzanQueryResult.Name);

        // 3. Querying member by Phone: Strike cannot read Inzan member
        var strikePhoneResult = await _memberRepo.GetMemberByPhoneAsync("+201099999999", "strike");
        Assert.Null(strikePhoneResult);

        // 4. Searching members: Strike search never returns Inzan members
        var strikeSearchName = await _memberRepo.SearchMembersAsync("Omar", "strike");
        Assert.Empty(strikeSearchName);

        var strikeSearchCode = await _memberRepo.SearchMembersAsync("INZ", "strike");
        Assert.Empty(strikeSearchCode);

        // Strike search returns only Strike members
        var strikeSearchValid = await _memberRepo.SearchMembersAsync("Ahmed", "strike");
        Assert.Single(strikeSearchValid);
        Assert.Equal("mem-strike-001", strikeSearchValid[0].Id);

        // 5. Active member count isolation
        var strikeCount = await _memberRepo.GetActiveMemberCountAsync("strike");
        Assert.Equal(1, strikeCount);

        var inzanCount = await _memberRepo.GetActiveMemberCountAsync("inzanathletics");
        Assert.Equal(1, inzanCount);

        // 6. Attendance records isolation
        var strikeAttendance = new AttendanceEntity
        {
            Id = "att-str-01",
            TenantId = "strike",
            ClientId = "mem-strike-001",
            ClientName = "Ahmed Strike Boxer",
            DateUtc = DateTimeOffset.UtcNow,
            RecordedByUserId = "staff-str"
        };

        var inzanAttendance = new AttendanceEntity
        {
            Id = "att-inz-01",
            TenantId = "inzanathletics",
            ClientId = "mem-inzan-999",
            ClientName = "Omar Inzan Athlete",
            DateUtc = DateTimeOffset.UtcNow,
            RecordedByUserId = "staff-inz"
        };

        using (var conn = await _context.CreateOpenConnectionAsync())
        {
            await _attendanceRepo.UpsertAttendanceAsync(strikeAttendance, conn);
            await _attendanceRepo.UpsertAttendanceAsync(inzanAttendance, conn);
        }

        // Attendance by member isolation
        var attByMemberStrike = await _attendanceRepo.GetAttendanceForMemberAsync("mem-strike-001", "strike");
        Assert.Single(attByMemberStrike);
        Assert.Equal("att-str-01", attByMemberStrike[0].Id);

        // Attempting to query Inzan attendance using Strike tenant returns empty
        var attCrossCheck = await _attendanceRepo.GetAttendanceForMemberAsync("mem-inzan-999", "strike");
        Assert.Empty(attCrossCheck);

        // 7. Outbox operations isolation
        using (var conn = await _context.CreateOpenConnectionAsync())
        using (var tx = conn.BeginTransaction())
        {
            var strikeOp = new OutboxOperation
            {
                OperationId = "op-str-001",
                TenantId = "strike",
                DeviceId = "dev-strike",
                ActorUserId = "user-str",
                EntityType = "attendance",
                EntityId = "att-str-01",
                OperationType = "CheckIn",
                PayloadJson = "{}",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                Status = OutboxStatus.Pending
            };

            var inzanOp = new OutboxOperation
            {
                OperationId = "op-inz-001",
                TenantId = "inzanathletics",
                DeviceId = "dev-inzan",
                ActorUserId = "user-inz",
                EntityType = "attendance",
                EntityId = "att-inz-01",
                OperationType = "CheckIn",
                PayloadJson = "{}",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                Status = OutboxStatus.Pending
            };

            await _outboxRepo.EnqueueAsync(strikeOp, conn, tx);
            await _outboxRepo.EnqueueAsync(inzanOp, conn, tx);
            tx.Commit();
        }

        var strikePending = await _outboxRepo.GetPendingOperationsAsync("strike", 50);
        Assert.Single(strikePending);
        Assert.Equal("op-str-001", strikePending[0].OperationId);

        var inzanPending = await _outboxRepo.GetPendingOperationsAsync("inzanathletics", 50);
        Assert.Single(inzanPending);
        Assert.Equal("op-inz-001", inzanPending[0].OperationId);

        Assert.Equal(1, await _outboxRepo.GetPendingOutboxCountAsync("strike"));
        Assert.Equal(1, await _outboxRepo.GetPendingOutboxCountAsync("inzanathletics"));
    }

    [Fact]
    public void CrossTenantToken_OrPayload_IsRejectedImmediately()
    {
        var strikeConfig = TenantConfiguration.CreateStrike();
        var inzanConfig = TenantConfiguration.CreateInzan();

        // 1. Strike config rejects inzan tenant token or request
        var ex1 = Assert.Throws<InvalidOperationException>(() => strikeConfig.ValidateTenant("inzanathletics"));
        Assert.Contains("Cross-tenant security violation", ex1.Message);
        Assert.Contains("inzanathletics", ex1.Message);
        Assert.Contains("strike", ex1.Message);

        // 2. Inzan config rejects strike tenant token or request
        var ex2 = Assert.Throws<InvalidOperationException>(() => inzanConfig.ValidateTenant("strike"));
        Assert.Contains("Cross-tenant security violation", ex2.Message);
        Assert.Contains("strike", ex2.Message);
        Assert.Contains("inzanathletics", ex2.Message);

        // 3. Rejects arbitrary invalid tenant
        Assert.Throws<InvalidOperationException>(() => strikeConfig.ValidateTenant("arbitrary_tenant"));
        Assert.Throws<InvalidOperationException>(() => inzanConfig.ValidateTenant("random_gym"));

        // 4. Valid tenant checks pass cleanly
        strikeConfig.ValidateTenant("strike");
        strikeConfig.ValidateTenant("STRIKE"); // Case-insensitive acceptance of own tenant
        inzanConfig.ValidateTenant("inzanathletics");
        inzanConfig.ValidateTenant("INZANATHLETICS");

        // 5. Verify isolated physical databases and Firestore DB targets
        Assert.Equal("(default)", strikeConfig.FirestoreDatabaseId);
        Assert.Equal("db-inzanathletics", inzanConfig.FirestoreDatabaseId);
        Assert.NotEqual(strikeConfig.DatabaseFileName, inzanConfig.DatabaseFileName);
        Assert.Equal("strike_local.db", strikeConfig.DatabaseFileName);
        Assert.Equal("inzan_local.db", inzanConfig.DatabaseFileName);
    }
}
