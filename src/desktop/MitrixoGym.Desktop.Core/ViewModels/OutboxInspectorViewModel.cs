using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Security;
using MitrixoGym.Desktop.Core.Sync;

namespace MitrixoGym.Desktop.Core.ViewModels;

public partial class OutboxInspectorViewModel : ObservableObject
{
    private readonly IOutboxRepository _outboxRepository;
    private readonly TenantConfiguration _tenantConfig;
    private readonly ISyncCoordinator? _syncCoordinator;

    [ObservableProperty]
    private ObservableCollection<OutboxOperation> _pendingOperations = [];

    [ObservableProperty]
    private ObservableCollection<OutboxOperation> _failedOperations = [];

    [ObservableProperty]
    private ObservableCollection<ConflictRecord> _conflicts = [];

    [ObservableProperty]
    private OutboxOperation? _selectedOperation;

    [ObservableProperty]
    private ConflictRecord? _selectedConflict;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private string? _statusMessage;

    [ObservableProperty]
    private int _pendingCount;

    [ObservableProperty]
    private int _failedCount;

    [ObservableProperty]
    private int _conflictCount;

    [ObservableProperty]
    private string _selectedTab = "Pending";

    public OutboxInspectorViewModel(
        IOutboxRepository outboxRepository,
        TenantConfiguration tenantConfig,
        ISyncCoordinator? syncCoordinator = null)
    {
        _outboxRepository = outboxRepository ?? throw new ArgumentNullException(nameof(outboxRepository));
        _tenantConfig = tenantConfig ?? throw new ArgumentNullException(nameof(tenantConfig));
        _syncCoordinator = syncCoordinator;
    }

    [RelayCommand]
    public async Task RefreshAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            IsLoading = true;
            StatusMessage = "Refreshing outbox queue...";

            var tenantId = _tenantConfig.TenantId;

            var pending = await _outboxRepository.GetPendingOperationsAsync(tenantId, 100, cancellationToken);
            var failed = await _outboxRepository.GetFailedOperationsAsync(tenantId, 100, cancellationToken);
            var conflicts = await _outboxRepository.GetPendingConflictsAsync(tenantId, 100, cancellationToken);

            PendingOperations.Clear();
            foreach (var op in pending)
            {
                PendingOperations.Add(op);
            }

            FailedOperations.Clear();
            foreach (var op in failed)
            {
                FailedOperations.Add(op);
            }

            Conflicts.Clear();
            foreach (var conf in conflicts)
            {
                Conflicts.Add(conf);
            }

            PendingCount = PendingOperations.Count;
            FailedCount = FailedOperations.Count;
            ConflictCount = Conflicts.Count;

            StatusMessage = $"Updated: {PendingCount} pending, {FailedCount} failed, {ConflictCount} conflicts.";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error loading outbox: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public async Task RetryOperationAsync(OutboxOperation? operation, CancellationToken cancellationToken = default)
    {
        var target = operation ?? SelectedOperation;
        if (target == null) return;

        try
        {
            IsLoading = true;
            StatusMessage = $"Rescheduling operation {target.OperationId[..8]}...";

            await _outboxRepository.RetryOperationAsync(target.OperationId, cancellationToken);

            if (_syncCoordinator != null)
            {
                await _syncCoordinator.SyncNowAsync(authToken: null, cancellationToken);
            }

            await RefreshAsync(cancellationToken);
            StatusMessage = $"Operation {target.OperationId[..8]} queued for retry.";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Retry failed: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public async Task RetryAllFailedAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            IsLoading = true;
            StatusMessage = "Rescheduling all failed operations...";

            await _outboxRepository.RetryAllFailedAsync(_tenantConfig.TenantId, cancellationToken);

            if (_syncCoordinator != null)
            {
                await _syncCoordinator.SyncNowAsync(authToken: null, cancellationToken);
            }

            await RefreshAsync(cancellationToken);
            StatusMessage = "All failed operations rescheduled.";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Retry all failed: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }
}
