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

namespace MitrixoGym.Inzan.Desktop;

public partial class App : Application
{
    private ServiceProvider? _serviceProvider;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var services = new ServiceCollection();

        // 1. Inzan Athletics Tenant Configuration
        var tenantConfig = TenantConfiguration.CreateInzan();
        services.AddSingleton(tenantConfig);

        // 2. Database path in LocalAppData
        var appDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MitrixoGym",
            "Inzan");
        Directory.CreateDirectory(appDataDir);
        var dbPath = Path.Combine(appDataDir, tenantConfig.DatabaseFileName);

        var dbContext = new SqliteDatabaseContext(dbPath);
        services.AddSingleton<ISqliteDatabaseContext>(dbContext);

        // 3. Device Identification
        var deviceId = $"inzan-desk-{Environment.MachineName.ToLowerInvariant()}";
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

        // Seed real Inzan members from authoritative snapshot if local database is empty
        await SeedSnapshotInzanDataAsync(_serviceProvider);
        await SeedSnapshotInzanClassesAsync(_serviceProvider);

        var mainVm = _serviceProvider.GetRequiredService<MainReceptionViewModel>();
        await mainVm.InitializeAsync();

        var mainWindow = new MainWindow
        {
            DataContext = mainVm
        };
        mainWindow.Show();
    }

    private static async Task SeedSnapshotInzanDataAsync(IServiceProvider sp)
    {
        var memberRepo = sp.GetRequiredService<IMemberRepository>();
        var count = await memberRepo.GetActiveMemberCountAsync("inzanathletics");
        // If we already have the full member roster (> 100 members), no need to re-seed
        if (count > 100) return;

        var db = sp.GetRequiredService<ISqliteDatabaseContext>();
        using var conn = await db.CreateOpenConnectionAsync();

        try
        {
            var assembly = typeof(App).Assembly;
            var resourceName = "MitrixoGym.Inzan.Desktop.Assets.inzan_members.json";
            using var stream = assembly.GetManifestResourceStream(resourceName);

            Stream? jsonStream = stream;
            if (jsonStream == null)
            {
                var diskPath = Path.Combine(AppContext.BaseDirectory, "Assets", "inzan_members.json");
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
                        TenantId = "inzanathletics",
                        Name = name,
                        Phone = phone,
                        MemberCode = memberCode,
                        Status = status,
                        PackageType = package,
                        SessionsRemaining = remaining,
                        PtSessionsRemaining = total,
                        MembershipExpiry = expiry ?? DateTimeOffset.UtcNow.AddMonths(1),
                        BranchId = branch,
                        Notes = "Inzan Authoritative Snapshot Member",
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
            System.Diagnostics.Debug.WriteLine($"[Inzan Seed] Error importing snapshot: {ex.Message}");
        }
    }

    private static async Task SeedSnapshotInzanClassesAsync(IServiceProvider sp)
    {
        var scheduleRepo = sp.GetRequiredService<IScheduleRepository>();
        var existing = await scheduleRepo.GetSchedulesAsync("inzanathletics");
        if (existing.Count > 0) return;

        var db = sp.GetRequiredService<ISqliteDatabaseContext>();
        using var conn = await db.CreateOpenConnectionAsync();

        try
        {
            var assembly = typeof(App).Assembly;
            var resourceName = "MitrixoGym.Inzan.Desktop.Assets.inzan_classes.json";
            using var stream = assembly.GetManifestResourceStream(resourceName);

            Stream? jsonStream = stream;
            if (jsonStream == null)
            {
                var diskPath = Path.Combine(AppContext.BaseDirectory, "Assets", "inzan_classes.json");
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
                    var tenantId = item.TryGetProperty("tenantId", out var tProp) ? tProp.GetString() ?? "inzanathletics" : "inzanathletics";
                    var title = item.GetProperty("title").GetString() ?? "Class";
                    var instructor = item.TryGetProperty("instructorName", out var iProp) ? iProp.GetString() : null;
                    var rawStart = item.TryGetProperty("startTime", out var stProp) ? stProp.GetString() : null;
                    var rawEnd = item.TryGetProperty("endTime", out var etProp) ? etProp.GetString() : null;

                    string? startTime = rawStart;
                    if (DateTimeOffset.TryParse(rawStart, out var parsedStart))
                    {
                        startTime = parsedStart.ToString("HH:mm");
                    }
                    else if (DateTime.TryParse(rawStart, out var parsedDt))
                    {
                        startTime = parsedDt.ToString("HH:mm");
                    }

                    string? endTime = rawEnd;
                    if (DateTimeOffset.TryParse(rawEnd, out var parsedEnd))
                    {
                        endTime = parsedEnd.ToString("HH:mm");
                    }
                    else if (DateTime.TryParse(rawEnd, out var parsedDtEnd))
                    {
                        endTime = parsedDtEnd.ToString("HH:mm");
                    }

                    var dayOfWeek = item.TryGetProperty("dayOfWeek", out var dProp) ? dProp.GetString() : "Sunday";
                    var branch = item.TryGetProperty("branch", out var bProp) ? bProp.GetString() : "Garden 8";
                    var capacity = item.TryGetProperty("capacity", out var cProp) ? cProp.GetInt32() : 15;
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
            System.Diagnostics.Debug.WriteLine($"[Inzan Seed Classes] Error importing snapshot: {ex.Message}");
        }
    }
}
