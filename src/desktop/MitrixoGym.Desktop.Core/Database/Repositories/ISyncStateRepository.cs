using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Domain.Entities;

namespace MitrixoGym.Desktop.Core.Database.Repositories;

public interface ISyncStateRepository
{
    /// <summary>
    /// Gets the current persistent sync state for the given tenant.
    /// </summary>
    Task<SyncStateRecord?> GetSyncStateAsync(
        string tenantId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates the pull cursor and last sync timestamp inside an active commit transaction.
    /// </summary>
    Task UpdateCursorAndCommitAsync(
        string tenantId,
        string? cursor,
        DateTimeOffset serverTimeUtc,
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates backoff delay and last error message upon network or transient failure.
    /// </summary>
    Task SetBackoffAndErrorAsync(
        string tenantId,
        int backoffMs,
        string? errorMessage,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Resets backoff interval to 0 and clears the last error on successful sync.
    /// </summary>
    Task ResetBackoffAsync(
        string tenantId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks if a server event ID has already been applied locally (inbox deduplication).
    /// </summary>
    Task<bool> HasInboxReceiptAsync(
        string eventId,
        string tenantId,
        SqliteConnection connection,
        SqliteTransaction? transaction = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Records an applied server event receipt inside the pull commit transaction.
    /// </summary>
    Task RecordInboxReceiptAsync(
        InboxReceipt receipt,
        SqliteConnection connection,
        SqliteTransaction transaction,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets local device registration state.
    /// </summary>
    Task<DeviceStateRecord?> GetDeviceStateAsync(
        string deviceId,
        string tenantId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Inserts or updates device state metadata.
    /// </summary>
    Task UpsertDeviceStateAsync(
        DeviceStateRecord deviceState,
        CancellationToken cancellationToken = default);
}
