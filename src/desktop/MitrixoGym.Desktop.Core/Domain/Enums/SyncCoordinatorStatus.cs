namespace MitrixoGym.Desktop.Core.Domain.Enums;

/// <summary>
/// Status of the background synchronization coordinator.
/// </summary>
public enum SyncCoordinatorStatus
{
    Idle,
    Syncing,
    Offline,
    Error
}
