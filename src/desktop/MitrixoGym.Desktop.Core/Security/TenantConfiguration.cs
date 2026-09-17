namespace MitrixoGym.Desktop.Core.Security;

/// <summary>
/// Enforces the compiled tenant constraint ('strike' vs 'inzanathletics').
/// Prevents cross-tenant data leakage or fallback in accordance with the security spec.
/// </summary>
public sealed class TenantConfiguration
{
    public const string StrikeTenantId = "strike";
    public const string InzanTenantId = "inzanathletics";

    public string TenantId { get; }
    public string ProductName { get; }
    public string FirestoreDatabaseId { get; }
    public string DefaultApiBaseUrl { get; }
    public string DatabaseFileName { get; }
    public string WebAppUrl { get; }

    private TenantConfiguration(
        string tenantId,
        string productName,
        string firestoreDatabaseId,
        string databaseFileName,
        string webAppUrl,
        string? apiBaseUrl = null)
    {
        if (tenantId != StrikeTenantId && tenantId != InzanTenantId)
        {
            throw new ArgumentException($"Invalid tenant ID '{tenantId}'. Only '{StrikeTenantId}' or '{InzanTenantId}' are permitted.", nameof(tenantId));
        }

        TenantId = tenantId;
        ProductName = productName;
        FirestoreDatabaseId = firestoreDatabaseId;
        DatabaseFileName = databaseFileName;
        WebAppUrl = webAppUrl;
        DefaultApiBaseUrl = apiBaseUrl ?? webAppUrl;
    }

    /// <summary>
    /// Factory for Strike Desktop build configuration.
    /// </summary>
    public static TenantConfiguration CreateStrike(string? apiBaseUrl = null)
    {
        return new TenantConfiguration(
            tenantId: StrikeTenantId,
            productName: "Strike Desktop",
            firestoreDatabaseId: "(default)",
            databaseFileName: "strike_local.db",
            webAppUrl: "https://strike-egy.com",
            apiBaseUrl: apiBaseUrl
        );
    }

    /// <summary>
    /// Factory for Inzan Athletics Desktop build configuration.
    /// </summary>
    public static TenantConfiguration CreateInzan(string? apiBaseUrl = null)
    {
        return new TenantConfiguration(
            tenantId: InzanTenantId,
            productName: "Inzan Athletics Desktop",
            firestoreDatabaseId: "db-inzanathletics",
            databaseFileName: "inzan_local.db",
            webAppUrl: "https://inzanathletics.mitrixo.com",
            apiBaseUrl: apiBaseUrl
        );
    }

    /// <summary>
    /// Strictly validates that an entity or request matches this product's compiled tenant.
    /// Throws InvalidOperationException on mismatch to prevent cross-tenant leakage.
    /// </summary>
    public void ValidateTenant(string tenantId)
    {
        if (!string.Equals(TenantId, tenantId, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Cross-tenant security violation: Operation targeted tenant '{tenantId}', but this client is compiled strictly for '{TenantId}'.");
        }
    }
}
