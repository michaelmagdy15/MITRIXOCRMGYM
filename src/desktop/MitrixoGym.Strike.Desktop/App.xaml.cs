using System.IO;
using System.Net.Http;
using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using MitrixoGym.Desktop.Core.Database;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Security;
using MitrixoGym.Desktop.Core.Sync;
using MitrixoGym.Desktop.Core.ViewModels;

namespace MitrixoGym.Strike.Desktop;

public partial class App : Application
{
    private ServiceProvider? _serviceProvider;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var services = new ServiceCollection();

        // 1. Strike Tenant Configuration
        var tenantConfig = TenantConfiguration.CreateStrike();
        services.AddSingleton(tenantConfig);

        // 2. Database path in LocalAppData
        var appDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MitrixoGym",
            "Strike");
        Directory.CreateDirectory(appDataDir);
        var dbPath = Path.Combine(appDataDir, tenantConfig.DatabaseFileName);

        var dbContext = new SqliteDatabaseContext(dbPath);
        services.AddSingleton<ISqliteDatabaseContext>(dbContext);

        // 3. Device Identification
        var deviceId = $"strike-desk-{Environment.MachineName.ToLowerInvariant()}";
        services.AddSingleton(deviceId);

        // 4. Repositories
        services.AddSingleton<IMemberRepository, SqliteMemberRepository>();
        services.AddSingleton<IAttendanceRepository, SqliteAttendanceRepository>();
        services.AddSingleton<IPaymentRepository, SqlitePaymentRepository>();
        services.AddSingleton<IScheduleRepository, SqliteScheduleRepository>();
        services.AddSingleton<IOutboxRepository, SqliteOutboxRepository>();
        services.AddSingleton<ISyncStateRepository, SqliteSyncStateRepository>();

        // 5. Outbox & Sync Services
        services.AddSingleton<IOutboxService, OutboxService>();
        services.AddSingleton<ISyncApiClient>(sp => new SyncApiClient(new HttpClient { BaseAddress = new Uri(tenantConfig.DefaultApiBaseUrl) }));
        services.AddSingleton<ISyncPushService, SyncPushService>();
        services.AddSingleton<ISyncPullService, SyncPullService>();
        services.AddSingleton<ISyncCoordinator, SyncCoordinator>(sp => new SyncCoordinator(
            sp.GetRequiredService<ISyncPushService>(),
            sp.GetRequiredService<ISyncPullService>(),
            sp.GetRequiredService<IOutboxRepository>(),
            sp.GetRequiredService<ISyncStateRepository>(),
            tenantConfig,
            deviceId));

        // 6. ViewModels
        services.AddTransient<MainReceptionViewModel>(sp => new MainReceptionViewModel(
            sp.GetRequiredService<IMemberRepository>(),
            sp.GetRequiredService<IOutboxService>(),
            sp.GetRequiredService<ISyncCoordinator>(),
            sp.GetRequiredService<IOutboxRepository>(),
            sp.GetRequiredService<IAttendanceRepository>(),
            tenantConfig,
            deviceId,
            sp.GetRequiredService<IPaymentRepository>(),
            sp.GetRequiredService<IScheduleRepository>()));

        _serviceProvider = services.BuildServiceProvider();

        // Initialize SQLite Database and run schema migrations
        await dbContext.InitializeDatabaseAsync();

        // Seed real Strike members from authoritative snapshot if local database has only samples
        await SeedSnapshotStrikeDataAsync(_serviceProvider);
        await SeedSnapshotStrikeClassesAsync(_serviceProvider);

        var mainVm = _serviceProvider.GetRequiredService<MainReceptionViewModel>();
        await mainVm.InitializeAsync();

        var mainWindow = new MainWindow
        {
            DataContext = mainVm
        };
        mainWindow.Show();
    }

    private static async Task SeedSnapshotStrikeDataAsync(IServiceProvider sp)
    {
        var memberRepo = sp.GetRequiredService<IMemberRepository>();
        var count = await memberRepo.GetActiveMemberCountAsync("strike");
        // If we already have the full member roster (> 100 members), no need to re-seed
        if (count > 100) return;

        var db = sp.GetRequiredService<ISqliteDatabaseContext>();
        using var conn = await db.CreateOpenConnectionAsync();

        try
        {
            var assembly = typeof(App).Assembly;
            var resourceName = "MitrixoGym.Strike.Desktop.Assets.strike_members.json";
            using var stream = assembly.GetManifestResourceStream(resourceName);

            Stream? jsonStream = stream;
            if (jsonStream == null)
            {
                var diskPath = Path.Combine(AppContext.BaseDirectory, "Assets", "strike_members.json");
                if (File.Exists(diskPath))
                {
                    jsonStream = File.OpenRead(diskPath);
                }
            }

            if (jsonStream != null)
            {
                using var doc = await System.Text.Json.JsonDocument.ParseAsync(jsonStream);
                var root = doc.RootElement;

                using var tx = conn.BeginTransaction();
                foreach (var item in root.EnumerateArray())
                {
                    var id = item.GetProperty("id").GetString() ?? Guid.NewGuid().ToString();
                    var name = item.GetProperty("name").GetString() ?? "Unnamed Member";
                    var phone = item.GetProperty("phone").GetString() ?? "";
                    var memberCode = item.GetProperty("memberCode").GetString() ?? "";
                    var status = item.GetProperty("status").GetString() ?? "Active";
                    var package = item.GetProperty("currentPackageName").GetString() ?? "Standard Package";
                    var remaining = item.GetProperty("remainingSessions").GetInt32();
                    var total = item.GetProperty("totalSessions").GetInt32();
                    var branch = item.GetProperty("branch").GetString() ?? "MAIN";
                    
                    DateTimeOffset? expiry = null;
                    if (item.TryGetProperty("membershipExpiryUtc", out var expProp) &&
                        expProp.ValueKind == System.Text.Json.JsonValueKind.String &&
                        DateTimeOffset.TryParse(expProp.GetString(), out var parsedExp))
                    {
                        expiry = parsedExp;
                    }

                    var member = new MemberEntity
                    {
                        Id = id,
                        TenantId = "strike",
                        Name = name,
                        Phone = phone,
                        MemberCode = memberCode,
                        Status = status,
                        PackageType = package,
                        SessionsRemaining = remaining,
                        PtSessionsRemaining = total,
                        MembershipExpiry = expiry ?? DateTimeOffset.UtcNow.AddMonths(1),
                        BranchId = branch,
                        Notes = "Strike Authoritative Snapshot Member",
                        SyncState = SyncState.Synced,
                        ServerVersion = 1
                    };

                    await memberRepo.UpsertMemberAsync(member, conn, tx);
                }
                tx.Commit();
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[Strike Seed] Error importing snapshot: {ex.Message}");
        }
    }

    private static async Task SeedSnapshotStrikeClassesAsync(IServiceProvider sp)
    {
        var scheduleRepo = sp.GetRequiredService<IScheduleRepository>();
        var existing = await scheduleRepo.GetSchedulesAsync("strike");
        if (existing.Count > 0) return;

        var db = sp.GetRequiredService<ISqliteDatabaseContext>();
        using var conn = await db.CreateOpenConnectionAsync();

        try
        {
            var assembly = typeof(App).Assembly;
            var resourceName = "MitrixoGym.Strike.Desktop.Assets.strike_classes.json";
            using var stream = assembly.GetManifestResourceStream(resourceName);

            Stream? jsonStream = stream;
            if (jsonStream == null)
            {
                var diskPath = Path.Combine(AppContext.BaseDirectory, "Assets", "strike_classes.json");
                if (File.Exists(diskPath))
                {
                    jsonStream = File.OpenRead(diskPath);
                }
            }

            if (jsonStream != null)
            {
                using var doc = await System.Text.Json.JsonDocument.ParseAsync(jsonStream);
                var root = doc.RootElement;

                using var tx = conn.BeginTransaction();
                foreach (var item in root.EnumerateArray())
                {
                    var id = item.GetProperty("id").GetString() ?? Guid.NewGuid().ToString();
                    var tenantId = item.TryGetProperty("tenantId", out var tProp) ? (tProp.GetString() ?? "strike") : "strike";
                    var title = item.GetProperty("title").GetString() ?? "Class";
                    var instructor = item.TryGetProperty("instructorName", out var insProp) ? insProp.GetString() : "Strike Coach";
                    
                    var startTime = item.TryGetProperty("startTime", out var stProp) ? stProp.GetString() : null;
                    if (startTime != null && startTime.Contains('T') && DateTime.TryParse(startTime, out var dtStart))
                    {
                        startTime = dtStart.ToString("HH:mm");
                    }

                    var endTime = item.TryGetProperty("endTime", out var etProp) ? etProp.GetString() : null;
                    if (endTime != null && endTime.Contains('T') && DateTime.TryParse(endTime, out var dtEnd))
                    {
                        endTime = dtEnd.ToString("HH:mm");
                    }

                    var dayOfWeek = item.TryGetProperty("dayOfWeek", out var dProp) ? dProp.GetString() : null;
                    var branch = item.TryGetProperty("branch", out var bProp) ? bProp.GetString() : "Maxim Compound";
                    var capacity = item.TryGetProperty("capacity", out var capProp) ? capProp.GetInt32() : 20;
                    var booked = item.TryGetProperty("bookedCount", out var bkProp) ? bkProp.GetInt32() : 0;

                    var schedule = new ClassScheduleEntity
                    {
                        Id = id,
                        TenantId = tenantId,
                        Title = title,
                        InstructorName = instructor,
                        StartTime = startTime,
                        EndTime = endTime,
                        DayOfWeek = dayOfWeek,
                        Branch = branch,
                        Capacity = capacity,
                        BookedCount = booked,
                        SyncState = SyncState.Synced,
                        ServerVersion = 1
                    };

                    await scheduleRepo.UpsertScheduleAsync(schedule, conn, tx);
                }
                tx.Commit();
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"[Strike Seed] Error importing classes: {ex.Message}");
        }
    }
}
