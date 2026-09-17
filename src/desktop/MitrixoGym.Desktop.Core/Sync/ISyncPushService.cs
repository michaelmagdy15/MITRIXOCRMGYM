namespace MitrixoGym.Desktop.Core.Sync;

/// <summary>
/// Service responsible for pushing local outbox mutations to the backend sync API.
/// </summary>
public interface ISyncPushService
{
    /// <summary>
    /// Processes a bounded batch of pending outbox operations, pushes them to the server,
    /// marks acknowledged operations as Synced, and applies exponential backoff with jitter for retries.
    /// </summary>
    Task<PushResult> PushPendingOperationsAsync(
        string tenantId,
        string deviceId,
        string? authToken = null,
        CancellationToken cancellationToken = default);
}

public class PushResult
{
    public int PushedCount { get; set; }
    public int AcceptedCount { get; set; }
    public int RejectedCount { get; set; }
    public int ConflictCount { get; set; }
    public bool HasRemainingPending { get; set; }
    public string? ErrorMessage { get; set; }
}
