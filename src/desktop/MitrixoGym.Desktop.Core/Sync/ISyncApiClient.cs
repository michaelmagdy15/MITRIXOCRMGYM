using MitrixoGym.Desktop.Core.Domain.Models;

namespace MitrixoGym.Desktop.Core.Sync;

/// <summary>
/// HTTP client contract for interacting with the backend sync API.
/// </summary>
public interface ISyncApiClient
{
    /// <summary>
    /// Pushes a batch of outbox operations to POST /api/desktop/sync/push.
    /// </summary>
    Task<SyncPushResponse> PushOperationsAsync(
        SyncPushRequest request,
        string? authToken = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Pulls a batch of changes from GET /api/desktop/sync/pull?cursor=...&limit=...
    /// </summary>
    Task<SyncPullResponse> PullChangesAsync(
        string tenantId,
        string deviceId,
        string? cursor,
        int limit = 100,
        string? authToken = null,
        CancellationToken cancellationToken = default);
}
