namespace MitrixoGym.Desktop.Core.Security;

/// <summary>
/// Hardware/OS-backed encrypted credential store contract for local secrets and device tokens.
/// </summary>
public interface ICredentialStore
{
    /// <summary>
    /// Stores or overwrites a secret under the specified key.
    /// </summary>
    void SetSecret(string key, string secret);

    /// <summary>
    /// Retrieves a secret by key, or returns null if not found.
    /// </summary>
    string? GetSecret(string key);

    /// <summary>
    /// Removes a secret by key.
    /// </summary>
    void DeleteSecret(string key);

    /// <summary>
    /// Checks whether a secret exists for the specified key.
    /// </summary>
    bool HasSecret(string key);

    /// <summary>
    /// Clears all secrets securely (e.g., during device wipe or revocation).
    /// </summary>
    void ClearAllSecrets();
}
