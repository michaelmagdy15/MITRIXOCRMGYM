using CommunityToolkit.Mvvm.ComponentModel;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Security;

namespace MitrixoGym.Desktop.Core.Sync;

/// <summary>
/// MVVM-bindable sync coordinator managing cyclic push and pull synchronization.
/// </summary>
public partial class SyncCoordinator : ObservableObject, ISyncCoordinator
{
    private readonly ISyncPushService _pushService;
    private readonly ISyncPullService _pullService;
    private readonly IOutboxRepository _outboxRepository;
    private readonly ISyncStateRepository _syncStateRepository;
    private readonly TenantConfiguration _tenantConfig;
    private readonly string _deviceId;
    private readonly SemaphoreSlim _syncGate = new(1, 1);

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

    public SyncCoordinator(
        ISyncPushService pushService,
        ISyncPullService pullService,
        IOutboxRepository outboxRepository,
        ISyncStateRepository syncStateRepository,
        TenantConfiguration tenantConfig,
        string deviceId)
    {
        _pushService = pushService ?? throw new ArgumentNullException(nameof(pushService));
        _pullService = pullService ?? throw new ArgumentNullException(nameof(pullService));
        _outboxRepository = outboxRepository ?? throw new ArgumentNullException(nameof(outboxRepository));
        _syncStateRepository = syncStateRepository ?? throw new ArgumentNullException(nameof(syncStateRepository));
        _tenantConfig = tenantConfig ?? throw new ArgumentNullException(nameof(tenantConfig));
        _deviceId = string.IsNullOrWhiteSpace(deviceId) ? throw new ArgumentNullException(nameof(deviceId)) : deviceId;
    }

    public async Task RefreshStatusAsync(CancellationToken cancellationToken = default)
    {
        var tenantId = _tenantConfig.TenantId;
        PendingCount = await _outboxRepository.GetPendingOutboxCountAsync(tenantId, cancellationToken);
        FailedCount = await _outboxRepository.GetFailedOutboxCountAsync(tenantId, cancellationToken);
        var conflicts = await _outboxRepository.GetPendingConflictsAsync(tenantId, 100, cancellationToken);
        ConflictCount = conflicts.Count;

        var state = await _syncStateRepository.GetSyncStateAsync(tenantId, cancellationToken);
        LastSyncTimeUtc = state?.LastSyncTimeUtc;
        LastError = state?.LastError;
    }

    public async Task SyncNowAsync(string? authToken = null, CancellationToken cancellationToken = default)
    {
        if (!await _syncGate.WaitAsync(0, cancellationToken))
        {
            // Already running
            return;
        }

        try
        {
            IsSyncing = true;
            Status = SyncCoordinatorStatus.Syncing;

            var tenantId = _tenantConfig.TenantId;

            // Check if device is revoked before pushing
            var deviceState = await _syncStateRepository.GetDeviceStateAsync(_deviceId, tenantId, cancellationToken);
            if (deviceState != null && deviceState.IsRevoked)
            {
                Status = SyncCoordinatorStatus.Error;
                LastError = $"Device '{_deviceId}' has been revoked. Synchronization halted.";
                return;
            }

            // Reset any orphaned in-flight operations from previous crashed sessions back to pending
            await _outboxRepository.ResetInFlightOperationsAsync(tenantId, cancellationToken);

            // 1. Push pending outbox batches until drained or blocked
            bool hasMorePending = true;
            while (hasMorePending)
            {
                var pushResult = await _pushService.PushPendingOperationsAsync(
                    tenantId,
                    _deviceId,
                    authToken,
                    cancellationToken);

                if (!string.IsNullOrEmpty(pushResult.ErrorMessage))
                {
                    Status = SyncCoordinatorStatus.Error;
                    LastError = pushResult.ErrorMessage;
                    break;
                }

                hasMorePending = pushResult.HasRemainingPending && pushResult.AcceptedCount > 0;
            }

            // 2. Pull server changes until current cursor is caught up
            bool hasMorePull = true;
            while (hasMorePull)
            {
                var pullResult = await _pullService.PullChangesAsync(
                    tenantId,
                    _deviceId,
                    authToken,
                    cancellationToken);

                if (!string.IsNullOrEmpty(pullResult.ErrorMessage))
                {
                    Status = SyncCoordinatorStatus.Error;
                    LastError = pullResult.ErrorMessage;
                    break;
                }

                hasMorePull = pullResult.HasMore;
            }

            // 3. Refresh counters
            await RefreshStatusAsync(cancellationToken);

            if (Status != SyncCoordinatorStatus.Error)
            {
                Status = SyncCoordinatorStatus.Idle;
                LastError = null;
            }
        }
        catch (HttpRequestException ex)
        {
            Status = SyncCoordinatorStatus.Offline;
            LastError = ex.Message;
        }
        catch (Exception ex)
        {
            Status = SyncCoordinatorStatus.Error;
            LastError = ex.Message;
        }
        finally
        {
            IsSyncing = false;
            _syncGate.Release();
        }
    }
}
