namespace MitrixoGym.Desktop.Core.Sync;

/// <summary>
/// Service responsible for pulling remote changes from the server and applying them transactionally.
/// </summary>
public interface ISyncPullService
{
    /// <summary>
    /// Pulls changes from the server after the last committed cursor, applies entity mutations and inbox receipts
    /// in a single transaction, and advances the cursor upon commit.
    /// </summary>
    Task<PullResult> PullChangesAsync(
        string tenantId,
        string deviceId,
        string? authToken = null,
        CancellationToken cancellationToken = default);
}

public class PullResult
{
    public int AppliedCount { get; set; }
    public int SkippedCount { get; set; }
    public bool HasMore { get; set; }
    public string? NextCursor { get; set; }
    public string? ErrorMessage { get; set; }
}
