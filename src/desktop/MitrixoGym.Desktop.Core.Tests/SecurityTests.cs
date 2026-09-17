using MitrixoGym.Desktop.Core.Security;
using Xunit;

namespace MitrixoGym.Desktop.Core.Tests;

public class SecurityTests : IDisposable
{
    private readonly string _testVaultPath;

    public SecurityTests()
    {
        _testVaultPath = Path.Combine(Path.GetTempPath(), $"mitrixo_vault_{Guid.NewGuid():N}.dat");
    }

    public void Dispose()
    {
        try
        {
            if (File.Exists(_testVaultPath)) File.Delete(_testVaultPath);
        }
        catch { }
    }

    [Fact]
    public void TenantConfiguration_EnforcesCompiledConstraints()
    {
        var strike = TenantConfiguration.CreateStrike();
        Assert.Equal("strike", strike.TenantId);
        Assert.Equal("(default)", strike.FirestoreDatabaseId);
        Assert.Equal("Strike Desktop", strike.ProductName);

        // Strike tenant validates "strike"
        strike.ValidateTenant("strike");

        // Strike tenant rejects "inzanathletics" with security exception
        var exStrike = Assert.Throws<InvalidOperationException>(() => strike.ValidateTenant("inzanathletics"));
        Assert.Contains("Cross-tenant security violation", exStrike.Message);

        var inzan = TenantConfiguration.CreateInzan();
        Assert.Equal("inzanathletics", inzan.TenantId);
        Assert.Equal("db-inzanathletics", inzan.FirestoreDatabaseId);
        Assert.Equal("Inzan Athletics Desktop", inzan.ProductName);

        // Inzan validates "inzanathletics"
        inzan.ValidateTenant("inzanathletics");

        // Inzan rejects "strike"
        var exInzan = Assert.Throws<InvalidOperationException>(() => inzan.ValidateTenant("strike"));
        Assert.Contains("Cross-tenant security violation", exInzan.Message);
    }

    [Fact]
    public void DpapiCredentialStore_ProtectsAndPersistsSecrets()
    {
        var store1 = new DpapiCredentialStore("strike", _testVaultPath);

        Assert.False(store1.HasSecret("device_token"));
        Assert.Null(store1.GetSecret("device_token"));

        store1.SetSecret("device_token", "jwt.token.device.12345");
        store1.SetSecret("local_db_key", "super_secret_sqlite_key_xyz");

        Assert.True(store1.HasSecret("device_token"));
        Assert.Equal("jwt.token.device.12345", store1.GetSecret("device_token"));
        Assert.Equal("super_secret_sqlite_key_xyz", store1.GetSecret("local_db_key"));

        // Verify encrypted file exists on disk
        Assert.True(File.Exists(_testVaultPath));
        var rawBytes = File.ReadAllBytes(_testVaultPath);
        var rawContent = System.Text.Encoding.UTF8.GetString(rawBytes);
        // Ensure raw secrets are NOT stored in plain text
        Assert.DoesNotContain("super_secret_sqlite_key_xyz", rawContent);

        // Verify second instance loads the decrypted secrets accurately
        var store2 = new DpapiCredentialStore("strike", _testVaultPath);
        Assert.True(store2.HasSecret("device_token"));
        Assert.Equal("jwt.token.device.12345", store2.GetSecret("device_token"));

        // Delete secret
        store2.DeleteSecret("device_token");
        Assert.False(store2.HasSecret("device_token"));

        var store3 = new DpapiCredentialStore("strike", _testVaultPath);
        Assert.False(store3.HasSecret("device_token"));
        Assert.True(store3.HasSecret("local_db_key"));
    }
}
