namespace MitrixoGym.Desktop.Core.Domain.Entities;

/// <summary>
/// Non-secret device identity and registration status stored locally in SQLite.
/// Secrets such as device tokens and refresh credentials are stored via DPAPI.
/// </summary>
public class DeviceStateRecord
{
    /// <summary>
    /// Unique hardware/installation device ID.
    /// </summary>
    public required string DeviceId { get; set; }

    /// <summary>
    /// Tenant identifier to which this device is registered.
    /// </summary>
    public required string TenantId { get; set; }

    /// <summary>
    /// Friendly workstation name (e.g. "Front-Desk-01").
    /// </summary>
    public required string DeviceName { get; set; }

    /// <summary>
    /// Timestamp when initial device registration completed.
    /// </summary>
    public DateTimeOffset RegisteredAtUtc { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Timestamp when client last communicated with server.
    /// </summary>
    public DateTimeOffset LastSeenAtUtc { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Version string of the desktop application (e.g. "1.0.0").
    /// </summary>
    public required string AppVersion { get; set; }

    /// <summary>
    /// True if server has marked this device revoked.
    /// </summary>
    public bool IsRevoked { get; set; } = false;

    /// <summary>
    /// Timestamp of revocation, if revoked.
    /// </summary>
    public DateTimeOffset? RevokedAtUtc { get; set; }
}
