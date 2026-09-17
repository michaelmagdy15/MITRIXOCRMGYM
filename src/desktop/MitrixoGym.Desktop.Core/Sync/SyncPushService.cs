using MitrixoGym.Desktop.Core.Database;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Domain.Models;

namespace MitrixoGym.Desktop.Core.Sync;

public class SyncPushService : ISyncPushService
{
    private readonly ISqliteDatabaseContext _context;
    private readonly IOutboxRepository _outboxRepository;
    private readonly ISyncStateRepository _syncStateRepository;
    private readonly ISyncApiClient _apiClient;

    public SyncPushService(
        ISqliteDatabaseContext context,
        IOutboxRepository outboxRepository,
        ISyncStateRepository syncStateRepository,
        ISyncApiClient apiClient)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
        _outboxRepository = outboxRepository ?? throw new ArgumentNullException(nameof(outboxRepository));
        _syncStateRepository = syncStateRepository ?? throw new ArgumentNullException(nameof(syncStateRepository));
        _apiClient = apiClient ?? throw new ArgumentNullException(nameof(apiClient));
    }

    public async Task<PushResult> PushPendingOperationsAsync(
        string tenantId,
        string deviceId,
        string? authToken = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);
        ArgumentException.ThrowIfNullOrWhiteSpace(deviceId);

        // Check if device is revoked locally; if so, halt outbox push immediately and fail closed
        var deviceState = await _syncStateRepository.GetDeviceStateAsync(deviceId, tenantId, cancellationToken);
        if (deviceState != null && deviceState.IsRevoked)
        {
            return new PushResult
            {
                ErrorMessage = $"Device '{deviceId}' has been revoked. Outbox push halted.",
                PushedCount = 0
            };
        }

        const int batchSize = 50;
        var pendingOps = await _outboxRepository.GetPendingOperationsAsync(tenantId, batchSize, cancellationToken);
        if (pendingOps.Count == 0)
        {
            return new PushResult { PushedCount = 0 };
        }

        var result = new PushResult
        {
            PushedCount = pendingOps.Count
        };

        // 1. Mark in-flight
        var opIds = pendingOps.Select(o => o.OperationId).ToList();
        await _outboxRepository.MarkOperationsInFlightAsync(opIds, cancellationToken);

        // 2. Build request
        var request = new SyncPushRequest
        {
            TenantId = tenantId,
            DeviceId = deviceId,
            Operations = pendingOps.Select(o => new OutboxOperationPushDto
            {
                OperationId = o.OperationId,
                TenantId = o.TenantId,
                DeviceId = o.DeviceId,
                ActorUserId = o.ActorUserId,
                EntityType = o.EntityType,
                EntityId = o.EntityId,
                OperationType = o.OperationType,
                BaseServerVersion = o.BaseServerVersion,
                PayloadJson = o.PayloadJson,
                SchemaVersion = o.SchemaVersion,
                CreatedAtUtc = o.CreatedAtUtc
            }).ToList()
        };

        SyncPushResponse response;
        try
        {
            response = await _apiClient.PushOperationsAsync(request, authToken, cancellationToken);
        }
        catch (Exception ex)
        {
            // Network or transient server error - reschedule batch with exponential backoff and jitter
            foreach (var op in pendingOps)
            {
                var nextAttempt = CalculateNextAttempt(op.AttemptCount + 1);
                await _outboxRepository.ScheduleOperationRetryAsync(
                    op.OperationId,
                    op.AttemptCount + 1,
                    nextAttempt,
                    "NETWORK_ERROR",
                    ex.Message,
                    cancellationToken);
            }

            await _syncStateRepository.SetBackoffAndErrorAsync(tenantId, 5000, ex.Message, cancellationToken);
            result.ErrorMessage = ex.Message;
            return result;
        }

        var pendingMap = pendingOps.ToDictionary(o => o.OperationId);

        // 3. Process accepted operations
        foreach (var accepted in response.Accepted)
        {
            if (!pendingMap.TryGetValue(accepted.OperationId, out var op)) continue;

            await _context.ExecuteInTransactionAsync(async (conn, tx) =>
            {
                // Mark outbox entry as Synced
                using (var cmd = conn.CreateCommand())
                {
                    cmd.Transaction = tx;
                    cmd.CommandText = "UPDATE outbox_operations SET status = 'Synced', last_error_code = NULL, last_error_message = NULL WHERE operation_id = @id;";
                    cmd.Parameters.AddWithValue("@id", accepted.OperationId);
                    await cmd.ExecuteNonQueryAsync(cancellationToken);
                }

                // If business entity was an attendance or member, update sync_state
                if (string.Equals(op.EntityType, "attendance", StringComparison.OrdinalIgnoreCase))
                {
                    using var attCmd = conn.CreateCommand();
                    attCmd.Transaction = tx;
                    attCmd.CommandText = @"
                        UPDATE attendance
                        SET sync_state = 'Synced',
                            server_version = @ver,
                            server_updated_at = @updatedAt
                        WHERE id = @id;
                    ";
                    attCmd.Parameters.AddWithValue("@id", op.EntityId);
                    attCmd.Parameters.AddWithValue("@ver", accepted.ServerVersion);
                    attCmd.Parameters.AddWithValue("@updatedAt", accepted.ServerUpdatedAt.ToString("O"));
                    await attCmd.ExecuteNonQueryAsync(cancellationToken);
                }
                else if (string.Equals(op.EntityType, "member", StringComparison.OrdinalIgnoreCase))
                {
                    using var memCmd = conn.CreateCommand();
                    memCmd.Transaction = tx;
                    memCmd.CommandText = @"
                        UPDATE members
                        SET sync_state = 'Synced',
                            server_version = @ver,
                            server_updated_at = @updatedAt
                        WHERE id = @id;
                    ";
                    memCmd.Parameters.AddWithValue("@id", op.EntityId);
                    memCmd.Parameters.AddWithValue("@ver", accepted.ServerVersion);
                    memCmd.Parameters.AddWithValue("@updatedAt", accepted.ServerUpdatedAt.ToString("O"));
                    await memCmd.ExecuteNonQueryAsync(cancellationToken);
                }
            }, cancellationToken);

            result.AcceptedCount++;
        }

        // 4. Process rejected operations
        foreach (var rejected in response.Rejected)
        {
            if (string.Equals(rejected.ErrorCode, "DEVICE_REVOKED", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(rejected.ErrorCode, "HTTP_403", StringComparison.OrdinalIgnoreCase))
            {
                var dev = await _syncStateRepository.GetDeviceStateAsync(deviceId, tenantId, cancellationToken);
                if (dev != null)
                {
                    dev.IsRevoked = true;
                    dev.RevokedAtUtc = DateTimeOffset.UtcNow;
                    await _syncStateRepository.UpsertDeviceStateAsync(dev, cancellationToken);
                }
                result.ErrorMessage = $"Device '{deviceId}' has been revoked by the server. Outbox push halted.";
            }

            if (!pendingMap.TryGetValue(rejected.OperationId, out var op)) continue;

            if (rejected.ConflictServerStateJson != null || string.Equals(rejected.ErrorCode, "CONFLICT", StringComparison.OrdinalIgnoreCase))
            {
                // Invariant or concurrency conflict - record to conflicts table and mark failed
                var conflict = new ConflictRecord
                {
                    ConflictId = Guid.NewGuid().ToString("D"),
                    TenantId = tenantId,
                    EntityType = op.EntityType,
                    EntityId = op.EntityId,
                    OperationId = op.OperationId,
                    LocalIntentJson = op.PayloadJson,
                    ServerStateJson = rejected.ConflictServerStateJson ?? "{}",
                    ReasonCode = rejected.ErrorCode,
                    ResolutionState = ConflictResolutionState.Pending,
                    CreatedAtUtc = DateTimeOffset.UtcNow
                };

                await _outboxRepository.SaveConflictAsync(conflict, cancellationToken);
                await _outboxRepository.MarkOperationFailedAsync(op.OperationId, rejected.ErrorCode, rejected.ErrorMessage ?? "Conflict rejected by server.", cancellationToken);
                result.ConflictCount++;
            }
            else if (rejected.IsRetryable)
            {
                var nextAttempt = CalculateNextAttempt(op.AttemptCount + 1);
                await _outboxRepository.ScheduleOperationRetryAsync(
                    op.OperationId,
                    op.AttemptCount + 1,
                    nextAttempt,
                    rejected.ErrorCode,
                    rejected.ErrorMessage ?? "Transient failure.",
                    cancellationToken);
                result.RejectedCount++;
            }
            else
            {
                // Permanent failure
                await _outboxRepository.MarkOperationFailedAsync(
                    op.OperationId,
                    rejected.ErrorCode,
                    rejected.ErrorMessage ?? "Permanent domain rejection.",
                    cancellationToken);
                result.RejectedCount++;
            }
        }

        // 5. Check if more pending remain
        var remainingCount = await _outboxRepository.GetPendingOutboxCountAsync(tenantId, cancellationToken);
        result.HasRemainingPending = remainingCount > 0;

        return result;
    }

    /// <summary>
    /// Calculates exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s, 32s, capped at 60s.
    /// </summary>
    public static DateTimeOffset CalculateNextAttempt(
        int attemptCount,
        DateTimeOffset? baseTimeUtc = null,
        int? jitterMsOverride = null)
    {
        var baseTime = baseTimeUtc ?? DateTimeOffset.UtcNow;
        var expMs = Math.Min(1000 * Math.Pow(2, Math.Min(attemptCount - 1, 6)), 60000);
        var jitterMs = jitterMsOverride ?? Random.Shared.Next(0, 1000);
        return baseTime.AddMilliseconds(expMs + jitterMs);
    }
}
