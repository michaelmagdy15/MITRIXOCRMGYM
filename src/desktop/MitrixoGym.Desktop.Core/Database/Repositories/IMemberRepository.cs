using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Domain.Entities;

namespace MitrixoGym.Desktop.Core.Database.Repositories;

public interface IMemberRepository
{
    /// <summary>
    /// Fast local search matching member name, phone, or member code within the tenant.
    /// </summary>
    Task<IReadOnlyList<MemberEntity>> SearchMembersAsync(
        string query,
        string tenantId,
        int limit = 50,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets a single member by their unique ID within the tenant.
    /// </summary>
    Task<MemberEntity?> GetMemberByIdAsync(
        string id,
        string tenantId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets a member by exact phone number match within the tenant.
    /// </summary>
    Task<MemberEntity?> GetMemberByPhoneAsync(
        string phone,
        string tenantId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Inserts or updates a member in the local database working set.
    /// </summary>
    Task UpsertMemberAsync(
        MemberEntity member,
        SqliteConnection connection,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Batch upserts members inside an active transaction.
    /// </summary>
    Task UpsertMembersBatchAsync(
        IEnumerable<MemberEntity> members,
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Soft deletes a member by marking deleted_at.
    /// </summary>
    Task SoftDeleteMemberAsync(
        string id,
        string tenantId,
        DateTimeOffset deletedAt,
        SqliteConnection connection,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns total active members count for the tenant.
    /// </summary>
    Task<int> GetActiveMemberCountAsync(
        string tenantId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns breakdown counts: (total, active, expired, leads)
    /// </summary>
    Task<(int Total, int Active, int Expired, int Leads)> GetMemberStatusCountsAsync(
        string tenantId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Filters members by status ('Active', 'Expired', 'Lead', or null for All) and search query.
    /// </summary>
    Task<IReadOnlyList<MemberEntity>> FilterMembersAsync(
        string tenantId,
        string? status,
        string? query,
        int limit = 100,
        CancellationToken cancellationToken = default);
}
