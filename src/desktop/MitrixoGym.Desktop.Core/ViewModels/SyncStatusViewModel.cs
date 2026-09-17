using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Security;
using MitrixoGym.Desktop.Core.Sync;

namespace MitrixoGym.Desktop.Core.ViewModels;

public partial class SyncStatusViewModel : ObservableObject
{
    private readonly ISyncCoordinator _syncCoordinator;
    private readonly TenantConfiguration _tenantConfig;

    [ObservableProperty]
    private bool _isOnline = true;

    [ObservableProperty]
    private SyncCoordinatorStatus _status = SyncCoordinatorStatus.Idle;

    [ObservableProperty]
    private int _pendingCount;

    [ObservableProperty]
    private int _failedCount;

    [ObservableProperty]
    private int _conflictCount;

    [ObservableProperty]
    private DateTimeOffset? _lastSyncTimeUtc;

    [ObservableProperty]
    private string? _lastError;

    [ObservableProperty]
    private bool _isSyncing;

    [ObservableProperty]
    private string _syncPillText = "Synced";

    [ObservableProperty]
    private string _syncPillState = "Synced";

    [ObservableProperty]
    private string _lastSyncDisplay = "Never";

    public string TenantId => _tenantConfig.TenantId;
    public string ProductName => _tenantConfig.ProductName;

    public SyncStatusViewModel(ISyncCoordinator syncCoordinator, TenantConfiguration tenantConfig)
    {
        _syncCoordinator = syncCoordinator ?? throw new ArgumentNullException(nameof(syncCoordinator));
        _tenantConfig = tenantConfig ?? throw new ArgumentNullException(nameof(tenantConfig));

        _syncCoordinator.PropertyChanged += OnSyncCoordinatorPropertyChanged;
        UpdateFromCoordinator();
    }

    private void OnSyncCoordinatorPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        UpdateFromCoordinator();
    }

    public void UpdateFromCoordinator()
    {
        Status = _syncCoordinator.Status;
        PendingCount = _syncCoordinator.PendingCount;
        FailedCount = _syncCoordinator.FailedCount;
        ConflictCount = _syncCoordinator.ConflictCount;
        LastSyncTimeUtc = _syncCoordinator.LastSyncTimeUtc;
        LastError = _syncCoordinator.LastError;
        IsSyncing = _syncCoordinator.IsSyncing;
        IsOnline = Status != SyncCoordinatorStatus.Offline;

        // Compute Sync Pill Text and State
        if (IsSyncing || Status == SyncCoordinatorStatus.Syncing)
        {
            SyncPillState = "Syncing";
            SyncPillText = "Syncing...";
        }
        else if (Status == SyncCoordinatorStatus.Offline)
        {
            SyncPillState = "Offline";
            SyncPillText = PendingCount > 0 ? $"Offline ({PendingCount} pending)" : "Offline";
        }
        else if (FailedCount > 0)
        {
            SyncPillState = "Failed";
            SyncPillText = $"Failed ({FailedCount})";
        }
        else if (ConflictCount > 0)
        {
            SyncPillState = "Conflict";
            SyncPillText = $"Conflicts ({ConflictCount})";
        }
        else if (PendingCount > 0)
        {
            SyncPillState = "Pending";
            SyncPillText = $"Pending ({PendingCount})";
        }
        else
        {
            SyncPillState = "Synced";
            SyncPillText = "Synced";
        }

        // Compute Last Sync Display
        if (LastSyncTimeUtc.HasValue)
        {
            var diff = DateTimeOffset.UtcNow - LastSyncTimeUtc.Value;
            if (diff.TotalSeconds < 60)
            {
                LastSyncDisplay = "Just now";
            }
            else if (diff.TotalMinutes < 60)
            {
                LastSyncDisplay = $"{(int)diff.TotalMinutes}m ago";
            }
            else
            {
                LastSyncDisplay = LastSyncTimeUtc.Value.ToLocalTime().ToString("HH:mm");
            }
        }
        else
        {
            LastSyncDisplay = "Never";
        }
    }

    [RelayCommand]
    public async Task SyncNowAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await _syncCoordinator.SyncNowAsync(authToken: null, cancellationToken);
        }
        catch (Exception ex)
        {
            LastError = ex.Message;
        }
        finally
        {
            UpdateFromCoordinator();
        }
    }

    [RelayCommand]
    public async Task RefreshAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await _syncCoordinator.RefreshStatusAsync(cancellationToken);
        }
        finally
        {
            UpdateFromCoordinator();
        }
    }
}
