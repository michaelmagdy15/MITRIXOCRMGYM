using System.Text.Json.Serialization;

namespace MitrixoGym.Desktop.Core.Domain.Models;

/// <summary>
/// Domain payload stored in outbox for an attendance check-in mutation.
/// </summary>
public class AttendanceCheckInPayload
{
    public required string AttendanceId { get; set; }
    public required string ClientId { get; set; }
    public string? ClientName { get; set; }
    public string? BranchId { get; set; }
    public DateTimeOffset DateUtc { get; set; }
    public required string RecordedByUserId { get; set; }
    public string? PackageName { get; set; }
    public string? Notes { get; set; }
}

/// <summary>
/// Request DTO sent to POST /api/desktop/sync/push.
/// </summary>
public class SyncPushRequest
{
    [JsonPropertyName("tenantId")]
    public required string TenantId { get; set; }

    [JsonPropertyName("deviceId")]
    public required string DeviceId { get; set; }

    [JsonPropertyName("operations")]
    public List<OutboxOperationPushDto> Operations { get; set; } = [];
}

public class OutboxOperationPushDto
{
    [JsonPropertyName("operationId")]
    public required string OperationId { get; set; }

    [JsonPropertyName("tenantId")]
    public required string TenantId { get; set; }

    [JsonPropertyName("deviceId")]
    public required string DeviceId { get; set; }

    [JsonPropertyName("actorUserId")]
    public required string ActorUserId { get; set; }

    [JsonPropertyName("entityType")]
    public required string EntityType { get; set; }

    [JsonPropertyName("entityId")]
    public required string EntityId { get; set; }

    [JsonPropertyName("operationType")]
    public required string OperationType { get; set; }

    [JsonPropertyName("baseServerVersion")]
    public long? BaseServerVersion { get; set; }

    [JsonPropertyName("payloadJson")]
    public required string PayloadJson { get; set; }

    [JsonPropertyName("schemaVersion")]
    public int SchemaVersion { get; set; } = 1;

    [JsonPropertyName("createdAtUtc")]
    public DateTimeOffset CreatedAtUtc { get; set; }
}

/// <summary>
/// Response DTO received from POST /api/desktop/sync/push.
/// </summary>
public class SyncPushResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("accepted")]
    public List<AcceptedOperationDto> Accepted { get; set; } = [];

    [JsonPropertyName("rejected")]
    public List<RejectedOperationDto> Rejected { get; set; } = [];
}

public class AcceptedOperationDto
{
    [JsonPropertyName("operationId")]
    public required string OperationId { get; set; }

    [JsonPropertyName("serverVersion")]
    public long ServerVersion { get; set; }

    [JsonPropertyName("serverUpdatedAt")]
    public DateTimeOffset ServerUpdatedAt { get; set; }
}

public class RejectedOperationDto
{
    [JsonPropertyName("operationId")]
    public required string OperationId { get; set; }

    [JsonPropertyName("errorCode")]
    public required string ErrorCode { get; set; }

    [JsonPropertyName("errorMessage")]
    public string? ErrorMessage { get; set; }

    [JsonPropertyName("isRetryable")]
    public bool IsRetryable { get; set; }

    [JsonPropertyName("conflictServerStateJson")]
    public string? ConflictServerStateJson { get; set; }
}

/// <summary>
/// Response DTO received from GET /api/desktop/sync/pull?cursor=...&limit=...
/// </summary>
public class SyncPullResponse
{
    [JsonPropertyName("success")]
    public bool Success { get; set; }

    [JsonPropertyName("nextCursor")]
    public string? NextCursor { get; set; }

    [JsonPropertyName("hasMore")]
    public bool HasMore { get; set; }

    [JsonPropertyName("serverTimeUtc")]
    public DateTimeOffset ServerTimeUtc { get; set; }

    [JsonPropertyName("changes")]
    public List<ServerChangeDto> Changes { get; set; } = [];
}

public class ServerChangeDto
{
    [JsonPropertyName("eventId")]
    public required string EventId { get; set; }

    [JsonPropertyName("entityType")]
    public required string EntityType { get; set; }

    [JsonPropertyName("entityId")]
    public required string EntityId { get; set; }

    [JsonPropertyName("action")]
    public required string Action { get; set; } // "Upsert" | "Delete"

    [JsonPropertyName("serverVersion")]
    public long ServerVersion { get; set; }

    [JsonPropertyName("serverUpdatedAt")]
    public DateTimeOffset ServerUpdatedAt { get; set; }

    [JsonPropertyName("payloadJson")]
    public required string PayloadJson { get; set; }
}
