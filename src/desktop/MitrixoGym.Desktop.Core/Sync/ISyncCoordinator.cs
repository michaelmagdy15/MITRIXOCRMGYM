using System.ComponentModel;
using MitrixoGym.Desktop.Core.Domain.Enums;

namespace MitrixoGym.Desktop.Core.Sync;

/// <summary>
/// Orchestrates the push-then-pull synchronization pipeline, tracks connection status,
/// and exposes observable state for WinUI reception views.
/// </summary>
public interface ISyncCoordinator : INotifyPropertyChanged
{
    SyncCoordinatorStatus Status { get; }
    int PendingCount { get; }
    int FailedCount { get; }
    int ConflictCount { get; }
    DateTimeOffset? LastSyncTimeUtc { get; }
    string? LastError { get; }
    bool IsSyncing { get; }

    /// <summary>
    /// Executes a full push-then-pull synchronization cycle.
    /// </summary>
    Task SyncNowAsync(string? authToken = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Refreshes local outbox, conflict, and sync state counters from SQLite.
    /// </summary>
    Task RefreshStatusAsync(CancellationToken cancellationToken = default);
}
