using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;

namespace MitrixoGym.Desktop.Core.Database.Repositories;

public class SqliteMemberRepository : IMemberRepository
{
    private readonly ISqliteDatabaseContext _context;

    public SqliteMemberRepository(ISqliteDatabaseContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task<IReadOnlyList<MemberEntity>> SearchMembersAsync(
        string query,
        string tenantId,
        int limit = 50,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();

        if (string.IsNullOrWhiteSpace(query))
        {
            cmd.CommandText = @"
                SELECT id, tenant_id, name, phone, member_code, status, package_type,
                       sessions_remaining, pt_sessions_remaining, start_date, membership_expiry,
                       branch_id, gender, date_of_birth, notes, photo_url, email,
                       server_version, server_updated_at, deleted_at, sync_state
                FROM members
                WHERE tenant_id = @tenantId AND deleted_at IS NULL
                ORDER BY name COLLATE NOCASE ASC
                LIMIT @limit;
            ";
            cmd.Parameters.AddWithValue("@tenantId", tenantId);
            cmd.Parameters.AddWithValue("@limit", limit);
        }
        else
        {
            var pattern = $"%{query.Trim()}%";
            cmd.CommandText = @"
                SELECT id, tenant_id, name, phone, member_code, status, package_type,
                       sessions_remaining, pt_sessions_remaining, start_date, membership_expiry,
                       branch_id, gender, date_of_birth, notes, photo_url, email,
                       server_version, server_updated_at, deleted_at, sync_state
                FROM members
                WHERE tenant_id = @tenantId
                  AND deleted_at IS NULL
                  AND (name LIKE @pattern OR phone LIKE @pattern OR member_code LIKE @pattern)
                ORDER BY name COLLATE NOCASE ASC
                LIMIT @limit;
            ";
            cmd.Parameters.AddWithValue("@tenantId", tenantId);
            cmd.Parameters.AddWithValue("@pattern", pattern);
            cmd.Parameters.AddWithValue("@limit", limit);
        }

        var results = new List<MemberEntity>();
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            results.Add(MapMemberFromReader(reader));
        }

        return results;
    }

    public async Task<MemberEntity?> GetMemberByIdAsync(
        string id,
        string tenantId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT id, tenant_id, name, phone, member_code, status, package_type,
                   sessions_remaining, pt_sessions_remaining, start_date, membership_expiry,
                   branch_id, gender, date_of_birth, notes, photo_url, email,
                   server_version, server_updated_at, deleted_at, sync_state
            FROM members
            WHERE id = @id AND tenant_id = @tenantId;
        ";
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@tenantId", tenantId);

        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (await reader.ReadAsync(cancellationToken))
        {
            return MapMemberFromReader(reader);
        }

        return null;
    }

    public async Task<MemberEntity?> GetMemberByPhoneAsync(
        string phone,
        string tenantId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(phone);
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            SELECT id, tenant_id, name, phone, member_code, status, package_type,
                   sessions_remaining, pt_sessions_remaining, start_date, membership_expiry,
                   branch_id, gender, date_of_birth, notes, photo_url, email,
                   server_version, server_updated_at, deleted_at, sync_state
            FROM members
            WHERE phone = @phone AND tenant_id = @tenantId AND deleted_at IS NULL
            LIMIT 1;
        ";
        cmd.Parameters.AddWithValue("@phone", phone);
        cmd.Parameters.AddWithValue("@tenantId", tenantId);

        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (await reader.ReadAsync(cancellationToken))
        {
            return MapMemberFromReader(reader);
        }

        return null;
    }

    public async Task UpsertMemberAsync(
        MemberEntity member,
        SqliteConnection connection,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(member);
        ArgumentNullException.ThrowIfNull(connection);

        using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = GetUpsertMemberSql();
        AddMemberParameters(cmd, member);
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task UpsertMembersBatchAsync(
        IEnumerable<MemberEntity> members,
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(members);
        ArgumentNullException.ThrowIfNull(connection);
        ArgumentNullException.ThrowIfNull(transaction);

        using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = GetUpsertMemberSql();

        foreach (var member in members)
        {
            cmd.Parameters.Clear();
            AddMemberParameters(cmd, member);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    public async Task SoftDeleteMemberAsync(
        string id,
        string tenantId,
        DateTimeOffset deletedAt,
        SqliteConnection connection,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default)
    {
        using var cmd = connection.CreateCommand();
        cmd.Transaction = transaction;
        cmd.CommandText = @"
            UPDATE members
            SET deleted_at = @deletedAt, sync_state = 'Synced'
            WHERE id = @id AND tenant_id = @tenantId;
        ";
        cmd.Parameters.AddWithValue("@id", id);
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        cmd.Parameters.AddWithValue("@deletedAt", deletedAt.ToString("O"));
        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<int> GetActiveMemberCountAsync(
        string tenantId,
        CancellationToken cancellationToken = default)
    {
        using var connection = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "SELECT COUNT(1) FROM members WHERE tenant_id = @tenantId AND deleted_at IS NULL;";
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        var scalar = await cmd.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt32(scalar);
    }

    public async Task<(int Total, int Active, int Expired, int Leads)> GetMemberStatusCountsAsync(
        string tenantId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);
        using var conn = await _context.CreateOpenConnectionAsync(cancellationToken);
        const string sql = @"
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'Active' THEN 1 END) as active,
                COUNT(CASE WHEN status = 'Expired' THEN 1 END) as expired,
                COUNT(CASE WHEN status = 'Lead' THEN 1 END) as leads
            FROM members
            WHERE tenant_id = @tenantId AND deleted_at IS NULL;
        ";
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (await reader.ReadAsync(cancellationToken))
        {
            return (reader.GetInt32(0), reader.GetInt32(1), reader.GetInt32(2), reader.GetInt32(3));
        }
        return (0, 0, 0, 0);
    }

    public async Task<IReadOnlyList<MemberEntity>> FilterMembersAsync(
        string tenantId,
        string? status,
        string? query,
        int limit = 100,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);
        using var conn = await _context.CreateOpenConnectionAsync(cancellationToken);
        using var cmd = conn.CreateCommand();

        var sql = @"
            SELECT id, tenant_id, name, phone, member_code, status, package_type,
                   sessions_remaining, pt_sessions_remaining, start_date, membership_expiry,
                   branch_id, gender, date_of_birth, notes, photo_url, email,
                   server_version, server_updated_at, deleted_at, sync_state
            FROM members
            WHERE tenant_id = @tenantId AND deleted_at IS NULL
        ";

        if (!string.IsNullOrWhiteSpace(status) && status != "All")
        {
            sql += " AND status = @status";
            cmd.Parameters.AddWithValue("@status", status);
        }

        if (!string.IsNullOrWhiteSpace(query))
        {
            sql += " AND (name LIKE @pattern OR phone LIKE @pattern OR member_code LIKE @pattern)";
            cmd.Parameters.AddWithValue("@pattern", $"%{query.Trim()}%");
        }

        sql += " ORDER BY name COLLATE NOCASE ASC LIMIT @limit;";
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        cmd.Parameters.AddWithValue("@limit", limit);

        var list = new List<MemberEntity>();
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            list.Add(MapMemberFromReader(reader));
        }
        return list;
    }

    private static string GetUpsertMemberSql() => @"
        INSERT INTO members (
            id, tenant_id, name, phone, member_code, status, package_type,
            sessions_remaining, pt_sessions_remaining, start_date, membership_expiry,
            branch_id, gender, date_of_birth, notes, photo_url, email,
            server_version, server_updated_at, deleted_at, sync_state
        ) VALUES (
            @id, @tenantId, @name, @phone, @memberCode, @status, @packageType,
            @sessionsRemaining, @ptSessionsRemaining, @startDate, @membershipExpiry,
            @branchId, @gender, @dateOfBirth, @notes, @photoUrl, @email,
            @serverVersion, @serverUpdatedAt, @deletedAt, @syncState
        )
        ON CONFLICT(id) DO UPDATE SET
            tenant_id = excluded.tenant_id,
            name = excluded.name,
            phone = excluded.phone,
            member_code = excluded.member_code,
            status = excluded.status,
            package_type = excluded.package_type,
            sessions_remaining = excluded.sessions_remaining,
            pt_sessions_remaining = excluded.pt_sessions_remaining,
            start_date = excluded.start_date,
            membership_expiry = excluded.membership_expiry,
            branch_id = excluded.branch_id,
            gender = excluded.gender,
            date_of_birth = excluded.date_of_birth,
            notes = excluded.notes,
            photo_url = excluded.photo_url,
            email = excluded.email,
            server_version = excluded.server_version,
            server_updated_at = excluded.server_updated_at,
            deleted_at = excluded.deleted_at,
            sync_state = excluded.sync_state;
    ";

    private static void AddMemberParameters(SqliteCommand cmd, MemberEntity m)
    {
        cmd.Parameters.AddWithValue("@id", m.Id);
        cmd.Parameters.AddWithValue("@tenantId", m.TenantId);
        cmd.Parameters.AddWithValue("@name", m.Name);
        cmd.Parameters.AddWithValue("@phone", m.Phone);
        cmd.Parameters.AddWithValue("@memberCode", (object?)m.MemberCode ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@status", m.Status);
        cmd.Parameters.AddWithValue("@packageType", (object?)m.PackageType ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@sessionsRemaining", (object?)m.SessionsRemaining ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@ptSessionsRemaining", (object?)m.PtSessionsRemaining ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@startDate", (object?)m.StartDate?.ToString("O") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@membershipExpiry", (object?)m.MembershipExpiry?.ToString("O") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@branchId", (object?)m.BranchId ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@gender", (object?)m.Gender ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@dateOfBirth", (object?)m.DateOfBirth?.ToString("O") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@notes", (object?)m.Notes ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@photoUrl", (object?)m.PhotoUrl ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@email", (object?)m.Email ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@serverVersion", m.ServerVersion);
        cmd.Parameters.AddWithValue("@serverUpdatedAt", (object?)m.ServerUpdatedAt?.ToString("O") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@deletedAt", (object?)m.DeletedAt?.ToString("O") ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@syncState", m.SyncState.ToString());
    }

    private static MemberEntity MapMemberFromReader(SqliteDataReader r)
    {
        return new MemberEntity
        {
            Id = r.GetString(0),
            TenantId = r.GetString(1),
            Name = r.GetString(2),
            Phone = r.GetString(3),
            MemberCode = r.IsDBNull(4) ? null : r.GetString(4),
            Status = r.GetString(5),
            PackageType = r.IsDBNull(6) ? null : r.GetString(6),
            SessionsRemaining = r.IsDBNull(7) ? null : r.GetInt32(7),
            PtSessionsRemaining = r.IsDBNull(8) ? null : r.GetInt32(8),
            StartDate = r.IsDBNull(9) ? null : DateTimeOffset.Parse(r.GetString(9)),
            MembershipExpiry = r.IsDBNull(10) ? null : DateTimeOffset.Parse(r.GetString(10)),
            BranchId = r.IsDBNull(11) ? null : r.GetString(11),
            Gender = r.IsDBNull(12) ? null : r.GetString(12),
            DateOfBirth = r.IsDBNull(13) ? null : DateTimeOffset.Parse(r.GetString(13)),
            Notes = r.IsDBNull(14) ? null : r.GetString(14),
            PhotoUrl = r.IsDBNull(15) ? null : r.GetString(15),
            Email = r.IsDBNull(16) ? null : r.GetString(16),
            ServerVersion = r.GetInt64(17),
            ServerUpdatedAt = r.IsDBNull(18) ? null : DateTimeOffset.Parse(r.GetString(18)),
            DeletedAt = r.IsDBNull(19) ? null : DateTimeOffset.Parse(r.GetString(19)),
            SyncState = Enum.TryParse<SyncState>(r.GetString(20), true, out var s) ? s : SyncState.Synced
        };
    }
}
