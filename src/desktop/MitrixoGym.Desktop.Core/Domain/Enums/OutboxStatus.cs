namespace MitrixoGym.Desktop.Core.Domain.Enums;

/// <summary>
/// Execution status of an outbox operation.
/// </summary>
public enum OutboxStatus
{
    Pending,
    InFlight,
    Synced,
    Failed
}
