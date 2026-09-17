namespace MitrixoGym.Desktop.Core.Domain.Enums;

/// <summary>
/// Synchronization status of a local database entity.
/// </summary>
public enum SyncState
{
    Synced,
    Pending,
    Conflict,
    Failed
}
