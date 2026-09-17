using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using MitrixoGym.Desktop.Core.Domain.Models;

namespace MitrixoGym.Desktop.Core.Sync;

public class SyncApiClient : ISyncApiClient
{
    private readonly HttpClient _httpClient;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public SyncApiClient(HttpClient httpClient)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
    }

    public async Task<SyncPushResponse> PushOperationsAsync(
        SyncPushRequest request,
        string? authToken = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "/api/desktop/sync/push");
        if (!string.IsNullOrWhiteSpace(authToken))
        {
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authToken);
        }
        httpRequest.Headers.Add("X-Tenant-Id", request.TenantId);
        httpRequest.Headers.Add("X-Device-Id", request.DeviceId);

        var json = JsonSerializer.Serialize(request, JsonOptions);
        httpRequest.Content = new StringContent(json, Encoding.UTF8, "application/json");

        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            return new SyncPushResponse
            {
                Success = false,
                Rejected = request.Operations.Select(op => new RejectedOperationDto
                {
                    OperationId = op.OperationId,
                    ErrorCode = $"HTTP_{(int)response.StatusCode}",
                    ErrorMessage = string.IsNullOrWhiteSpace(content) ? response.ReasonPhrase : content,
                    IsRetryable = (int)response.StatusCode >= 500 || response.StatusCode == System.Net.HttpStatusCode.RequestTimeout
                }).ToList()
            };
        }

        var result = JsonSerializer.Deserialize<SyncPushResponse>(content, JsonOptions);
        return result ?? new SyncPushResponse { Success = true };
    }

    public async Task<SyncPullResponse> PullChangesAsync(
        string tenantId,
        string deviceId,
        string? cursor,
        int limit = 100,
        string? authToken = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);
        ArgumentException.ThrowIfNullOrWhiteSpace(deviceId);

        var uri = $"/api/desktop/sync/pull?limit={limit}";
        if (!string.IsNullOrWhiteSpace(cursor))
        {
            uri += $"&cursor={Uri.EscapeDataString(cursor)}";
        }

        using var httpRequest = new HttpRequestMessage(HttpMethod.Get, uri);
        if (!string.IsNullOrWhiteSpace(authToken))
        {
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authToken);
        }
        httpRequest.Headers.Add("X-Tenant-Id", tenantId);
        httpRequest.Headers.Add("X-Device-Id", deviceId);

        using var response = await _httpClient.SendAsync(httpRequest, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"Server returned error code {(int)response.StatusCode}: {content}");
        }

        var result = JsonSerializer.Deserialize<SyncPullResponse>(content, JsonOptions);
        return result ?? new SyncPullResponse { Success = true };
    }
}
