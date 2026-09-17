using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace MitrixoGym.Desktop.Core.Security;

/// <summary>
/// DPAPI-backed local credential store using Windows ProtectedData with DataProtectionScope.CurrentUser.
/// Encrypts secrets at rest on disk with per-tenant entropy.
/// </summary>
public class DpapiCredentialStore : ICredentialStore
{
    private readonly string _filePath;
    private readonly byte[] _entropy;
    private readonly object _syncLock = new();
    private Dictionary<string, string> _cache = [];
    private bool _isLoaded;

    public DpapiCredentialStore(string tenantId, string? customStoragePath = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        _entropy = Encoding.UTF8.GetBytes($"MitrixoGym.DPAPI.Vault.{tenantId.ToLowerInvariant()}");

        if (!string.IsNullOrWhiteSpace(customStoragePath))
        {
            _filePath = customStoragePath;
        }
        else
        {
            var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            _filePath = Path.Combine(localAppData, "MitrixoGym", tenantId, "vault.dat");
        }

        var dir = Path.GetDirectoryName(_filePath);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
        {
            Directory.CreateDirectory(dir);
        }
    }

    public void SetSecret(string key, string secret)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        ArgumentNullException.ThrowIfNull(secret);

        lock (_syncLock)
        {
            EnsureLoaded();
            _cache[key] = secret;
            PersistVault();
        }
    }

    public string? GetSecret(string key)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);

        lock (_syncLock)
        {
            EnsureLoaded();
            return _cache.TryGetValue(key, out var val) ? val : null;
        }
    }

    public void DeleteSecret(string key)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);

        lock (_syncLock)
        {
            EnsureLoaded();
            if (_cache.Remove(key))
            {
                PersistVault();
            }
        }
    }

    public bool HasSecret(string key)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(key);

        lock (_syncLock)
        {
            EnsureLoaded();
            return _cache.ContainsKey(key);
        }
    }

    public void ClearAllSecrets()
    {
        lock (_syncLock)
        {
            _cache.Clear();
            if (File.Exists(_filePath))
            {
                File.Delete(_filePath);
            }
            _isLoaded = true;
        }
    }

    private void EnsureLoaded()
    {
        if (_isLoaded) return;

        if (!File.Exists(_filePath))
        {
            _cache = [];
            _isLoaded = true;
            return;
        }

        try
        {
            var encryptedBytes = File.ReadAllBytes(_filePath);
            if (encryptedBytes.Length == 0)
            {
                _cache = [];
                _isLoaded = true;
                return;
            }

            byte[] decryptedBytes;
            if (OperatingSystem.IsWindows())
            {
                decryptedBytes = ProtectedData.Unprotect(encryptedBytes, _entropy, DataProtectionScope.CurrentUser);
            }
            else
            {
                // In non-Windows test environments, read directly if not protected
                decryptedBytes = encryptedBytes;
            }

            var json = Encoding.UTF8.GetString(decryptedBytes);
            _cache = JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? [];
        }
        catch
        {
            // If decryption fails due to machine migration or key change, fail closed
            _cache = [];
        }

        _isLoaded = true;
    }

    private void PersistVault()
    {
        var json = JsonSerializer.Serialize(_cache);
        var plainBytes = Encoding.UTF8.GetBytes(json);

        byte[] cipherBytes;
        if (OperatingSystem.IsWindows())
        {
            cipherBytes = ProtectedData.Protect(plainBytes, _entropy, DataProtectionScope.CurrentUser);
        }
        else
        {
            cipherBytes = plainBytes;
        }

        var tempPath = $"{_filePath}.tmp";
        File.WriteAllBytes(tempPath, cipherBytes);
        File.Move(tempPath, _filePath, overwrite: true);
    }
}
