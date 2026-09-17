using System.Text.Json;
using MitrixoGym.Desktop.Core.Database;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Domain.Models;

namespace MitrixoGym.Desktop.Core.Sync;

public class SyncPullService : ISyncPullService
{
    private readonly ISqliteDatabaseContext _context;
    private readonly IMemberRepository _memberRepository;
    private readonly IAttendanceRepository _attendanceRepository;
    private readonly ISyncStateRepository _syncStateRepository;
    private readonly ISyncApiClient _apiClient;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public SyncPullService(
        ISqliteDatabaseContext context,
        IMemberRepository memberRepository,
        IAttendanceRepository attendanceRepository,
        ISyncStateRepository syncStateRepository,
        ISyncApiClient apiClient)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
        _memberRepository = memberRepository ?? throw new ArgumentNullException(nameof(memberRepository));
        _attendanceRepository = attendanceRepository ?? throw new ArgumentNullException(nameof(attendanceRepository));
        _syncStateRepository = syncStateRepository ?? throw new ArgumentNullException(nameof(syncStateRepository));
        _apiClient = apiClient ?? throw new ArgumentNullException(nameof(apiClient));
    }

    public async Task<PullResult> PullChangesAsync(
        string tenantId,
        string deviceId,
        string? authToken = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);
        ArgumentException.ThrowIfNullOrWhiteSpace(deviceId);

        // 1. Get current committed cursor
        var state = await _syncStateRepository.GetSyncStateAsync(tenantId, cancellationToken);
        var cursor = state?.LastCommittedCursor;

        // 2. Fetch changes from server
        SyncPullResponse response;
        try
        {
            response = await _apiClient.PullChangesAsync(tenantId, deviceId, cursor, limit: 100, authToken, cancellationToken);
        }
        catch (Exception ex)
        {
            await _syncStateRepository.SetBackoffAndErrorAsync(tenantId, 5000, ex.Message, cancellationToken);
            return new PullResult
            {
                ErrorMessage = ex.Message
            };
        }

        var result = new PullResult
        {
            HasMore = response.HasMore,
            NextCursor = response.NextCursor
        };

        if (response.Changes.Count == 0)
        {
            // If there are no changes, advance cursor if server supplied one
            if (!string.IsNullOrEmpty(response.NextCursor) && response.NextCursor != cursor)
            {
                await _context.ExecuteInTransactionAsync(async (conn, tx) =>
                {
                    await _syncStateRepository.UpdateCursorAndCommitAsync(
                        tenantId,
                        response.NextCursor,
                        response.ServerTimeUtc,
                        conn,
                        tx,
                        cancellationToken);
                }, cancellationToken);
            }
            return result;
        }

        // 3. Apply changes and receipts in a single SQLite transaction
        await _context.ExecuteInTransactionAsync(async (conn, tx) =>
        {
            foreach (var change in response.Changes)
            {
                // Check inbox receipts for deduplication
                var alreadyApplied = await _syncStateRepository.HasInboxReceiptAsync(
                    change.EventId,
                    tenantId,
                    conn,
                    tx,
                    cancellationToken);

                if (alreadyApplied)
                {
                    result.SkippedCount++;
                    continue;
                }

                var isDelete = string.Equals(change.Action, "Delete", StringComparison.OrdinalIgnoreCase);

                if (string.Equals(change.EntityType, "member", StringComparison.OrdinalIgnoreCase))
                {
                    if (isDelete)
                    {
                        await _memberRepository.SoftDeleteMemberAsync(
                            change.EntityId,
                            tenantId,
                            change.ServerUpdatedAt,
                            conn,
                            tx,
                            cancellationToken);
                    }
                    else
                    {
                        var member = JsonSerializer.Deserialize<MemberEntity>(change.PayloadJson, JsonOptions);
                        if (member != null)
                        {
                            member.Id = change.EntityId;
                            member.TenantId = tenantId;
                            member.ServerVersion = change.ServerVersion;
                            member.ServerUpdatedAt = change.ServerUpdatedAt;
                            member.SyncState = SyncState.Synced;

                            await _memberRepository.UpsertMemberAsync(member, conn, tx, cancellationToken);
                        }
                    }
                }
                else if (string.Equals(change.EntityType, "attendance", StringComparison.OrdinalIgnoreCase))
                {
                    if (isDelete)
                    {
                        await _attendanceRepository.SoftDeleteAttendanceAsync(
                            change.EntityId,
                            tenantId,
                            change.ServerUpdatedAt,
                            conn,
                            tx,
                            cancellationToken);
                    }
                    else
                    {
                        var attendance = JsonSerializer.Deserialize<AttendanceEntity>(change.PayloadJson, JsonOptions);
                        if (attendance != null)
                        {
                            attendance.Id = change.EntityId;
                            attendance.TenantId = tenantId;
                            attendance.ServerVersion = change.ServerVersion;
                            attendance.ServerUpdatedAt = change.ServerUpdatedAt;
                            attendance.SyncState = SyncState.Synced;

                            await _attendanceRepository.UpsertAttendanceAsync(attendance, conn, tx, cancellationToken);
                        }
                    }
                }

                // Record inbox receipt
                var receipt = new InboxReceipt
                {
                    EventId = change.EventId,
                    TenantId = tenantId,
                    EntityType = change.EntityType,
                    EntityId = change.EntityId,
                    AppliedAtUtc = DateTimeOffset.UtcNow,
                    ServerVersion = change.ServerVersion
                };

                await _syncStateRepository.RecordInboxReceiptAsync(receipt, conn, tx, cancellationToken);
                result.AppliedCount++;
            }

            // Advance cursor only after all items have been processed in this transaction
            await _syncStateRepository.UpdateCursorAndCommitAsync(
                tenantId,
                response.NextCursor ?? cursor,
                response.ServerTimeUtc,
                conn,
                tx,
                cancellationToken);
        }, cancellationToken);

        // Reset backoff on successful transaction commit
        await _syncStateRepository.ResetBackoffAsync(tenantId, cancellationToken);

        return result;
    }
}
