using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MitrixoGym.Desktop.Core.Database.Repositories;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;
using MitrixoGym.Desktop.Core.Security;
using MitrixoGym.Desktop.Core.Sync;

namespace MitrixoGym.Desktop.Core.ViewModels;

public partial class MainReceptionViewModel : ObservableObject
{
    private readonly IMemberRepository _memberRepository;
    private readonly IOutboxService _outboxService;
    private readonly ISyncCoordinator _syncCoordinator;
    private readonly IAttendanceRepository _attendanceRepository;
    private readonly IPaymentRepository? _paymentRepository;
    private readonly IScheduleRepository? _scheduleRepository;
    private readonly TenantConfiguration _tenantConfig;
    private readonly string _deviceId;

    // --- Active Module / Navigation Tab in Offline CRM ---
    [ObservableProperty]
    private string _selectedTab = "dashboard"; // "dashboard", "clients", "attendance", "payments", "schedule", "outbox"

    public bool IsDashboardTab => SelectedTab == "dashboard";
    public bool IsClientsTab => SelectedTab == "clients";
    public bool IsAttendanceTab => SelectedTab == "attendance";
    public bool IsPaymentsTab => SelectedTab == "payments";
    public bool IsScheduleTab => SelectedTab == "schedule";
    public bool IsOutboxTab => SelectedTab == "outbox";

    partial void OnSelectedTabChanged(string value)
    {
        OnPropertyChanged(nameof(IsDashboardTab));
        OnPropertyChanged(nameof(IsClientsTab));
        OnPropertyChanged(nameof(IsAttendanceTab));
        OnPropertyChanged(nameof(IsPaymentsTab));
        OnPropertyChanged(nameof(IsScheduleTab));
        OnPropertyChanged(nameof(IsOutboxTab));
    }

    [RelayCommand]
    public void SetTab(string tab)
    {
        if (!string.IsNullOrWhiteSpace(tab))
        {
            SelectedTab = tab.ToLowerInvariant();
        }
    }

    // --- Search and Members Directory ---
    [ObservableProperty]
    private string _searchText = string.Empty;

    [ObservableProperty]
    private ObservableCollection<MemberEntity> _searchResults = [];

    [ObservableProperty]
    private MemberEntity? _selectedMember;

    [ObservableProperty]
    private string _selectedStatusFilter = "All"; // "All", "Active", "Expired", "Lead"

    // --- Dashboard KPI Metrics ---
    [ObservableProperty]
    private int _totalMembersCount;

    [ObservableProperty]
    private int _activeMembersCount;

    [ObservableProperty]
    private int _expiredMembersCount;

    [ObservableProperty]
    private int _leadsCount;

    [ObservableProperty]
    private int _todayCheckInCount;

    [ObservableProperty]
    private decimal _todayRevenue;

    // --- State and Messages ---
    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private string? _statusMessage;

    [ObservableProperty]
    private string? _checkInSuccessMessage;

    [ObservableProperty]
    private bool _hasCheckInSuccess;

    [ObservableProperty]
    private bool _isOutboxDrawerOpen;

    [ObservableProperty]
    private bool _isLocked;

    [ObservableProperty]
    private string _currentReceptionist = "Front Desk Staff";

    [ObservableProperty]
    private string _pinInput = string.Empty;

    [ObservableProperty]
    private string? _unlockErrorMessage;

    [ObservableProperty]
    private ObservableCollection<AttendanceEntity> _recentCheckIns = [];

    // --- POS / Payments Module ---
    [ObservableProperty]
    private ObservableCollection<PaymentEntity> _recentPayments = [];

    [ObservableProperty]
    private decimal _posAmount = 1500;

    [ObservableProperty]
    private string _posMethod = "Cash"; // "Cash", "Credit Card", "Instapay", "Bank Transfer"

    [ObservableProperty]
    private string _posPackage = "1 Month Boxing Membership";

    [ObservableProperty]
    private string _posNotes = string.Empty;

    [ObservableProperty]
    private string? _posSuccessMessage;

    [ObservableProperty]
    private bool _hasPosSuccess;

    // --- Class Schedules Module ---
    [ObservableProperty]
    private ObservableCollection<ClassScheduleEntity> _classSchedules = [];

    [ObservableProperty]
    private string _selectedScheduleDay = "All";

    // --- Web vs Offline Mode Switcher ---
    [ObservableProperty]
    private bool _isWebCrmMode = true;

    [ObservableProperty]
    private string _webAppUrl = string.Empty;

    public bool IsOfflineReceptionMode => !IsWebCrmMode;

    partial void OnIsWebCrmModeChanged(bool value)
    {
        OnPropertyChanged(nameof(IsOfflineReceptionMode));
    }

    public SyncStatusViewModel SyncStatus { get; }
    public OutboxInspectorViewModel OutboxInspector { get; }
    public TenantConfiguration TenantConfig => _tenantConfig;

    public MainReceptionViewModel(
        IMemberRepository memberRepository,
        IOutboxService outboxService,
        ISyncCoordinator syncCoordinator,
        IOutboxRepository outboxRepository,
        IAttendanceRepository attendanceRepository,
        TenantConfiguration tenantConfig,
        string deviceId,
        IPaymentRepository? paymentRepository = null,
        IScheduleRepository? scheduleRepository = null)
    {
        _memberRepository = memberRepository ?? throw new ArgumentNullException(nameof(memberRepository));
        _outboxService = outboxService ?? throw new ArgumentNullException(nameof(outboxService));
        _syncCoordinator = syncCoordinator ?? throw new ArgumentNullException(nameof(syncCoordinator));
        _attendanceRepository = attendanceRepository ?? throw new ArgumentNullException(nameof(attendanceRepository));
        _tenantConfig = tenantConfig ?? throw new ArgumentNullException(nameof(tenantConfig));
        _deviceId = string.IsNullOrWhiteSpace(deviceId) ? throw new ArgumentNullException(nameof(deviceId)) : deviceId;
        _paymentRepository = paymentRepository;
        _scheduleRepository = scheduleRepository;

        SyncStatus = new SyncStatusViewModel(_syncCoordinator, _tenantConfig);
        OutboxInspector = new OutboxInspectorViewModel(outboxRepository, _tenantConfig, _syncCoordinator);
        WebAppUrl = _tenantConfig.WebAppUrl;
    }

    [RelayCommand]
    public void SwitchToWebCrm() => IsWebCrmMode = true;

    [RelayCommand]
    public void SwitchToOfflineReception() => IsWebCrmMode = false;

    [RelayCommand]
    public void ToggleAppMode() => IsWebCrmMode = !IsWebCrmMode;

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            IsLoading = true;

            // 1. Load Status Breakdown Counts for Dashboard & Clients
            var counts = await _memberRepository.GetMemberStatusCountsAsync(_tenantConfig.TenantId, cancellationToken);
            TotalMembersCount = counts.Total;
            ActiveMembersCount = counts.Active;
            ExpiredMembersCount = counts.Expired;
            LeadsCount = counts.Leads;

            // 2. Load Recent Check-ins
            var recent = await _attendanceRepository.GetRecentAttendanceAsync(_tenantConfig.TenantId, 25, cancellationToken);
            RecentCheckIns.Clear();
            foreach (var att in recent)
            {
                RecentCheckIns.Add(att);
            }
            TodayCheckInCount = RecentCheckIns.Count(a => a.DateUtc.Date == DateTimeOffset.UtcNow.Date);

            // 3. Load Payments History & Today's Revenue
            if (_paymentRepository != null)
            {
                TodayRevenue = await _paymentRepository.GetTodayRevenueAsync(_tenantConfig.TenantId, cancellationToken);
                var payments = await _paymentRepository.GetRecentPaymentsAsync(_tenantConfig.TenantId, 25, cancellationToken);
                RecentPayments.Clear();
                foreach (var p in payments)
                {
                    RecentPayments.Add(p);
                }
            }

            // 4. Load Class Schedules
            if (_scheduleRepository != null)
            {
                var schedules = await _scheduleRepository.GetSchedulesAsync(_tenantConfig.TenantId, null, cancellationToken);
                ClassSchedules.Clear();
                foreach (var s in schedules)
                {
                    ClassSchedules.Add(s);
                }
            }

            await SyncStatus.RefreshAsync(cancellationToken);
            await OutboxInspector.RefreshAsync(cancellationToken);

            // 5. Load Initial Member Roster (Top 50)
            await RefreshMembersListAsync(cancellationToken);

            StatusMessage = $"Ready. {TotalMembersCount} total members loaded.";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Initialization note: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public async Task SearchAsync(CancellationToken cancellationToken = default)
    {
        await RefreshMembersListAsync(cancellationToken);
    }

    [RelayCommand]
    public async Task FilterStatusAsync(string status, CancellationToken cancellationToken = default)
    {
        SelectedStatusFilter = status;
        await RefreshMembersListAsync(cancellationToken);
    }

    private async Task RefreshMembersListAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            IsLoading = true;
            var query = SearchText?.Trim() ?? string.Empty;
            var statusFilter = SelectedStatusFilter == "All" ? null : SelectedStatusFilter;

            var results = await _memberRepository.FilterMembersAsync(_tenantConfig.TenantId, statusFilter, query, 50, cancellationToken);
            
            SearchResults.Clear();
            foreach (var member in results)
            {
                SearchResults.Add(member);
            }

            if (SearchResults.Count == 0)
            {
                SelectedMember = null;
                StatusMessage = "No matching members found.";
            }
            else
            {
                SelectedMember = SearchResults[0];
                StatusMessage = $"Showing {SearchResults.Count} of {TotalMembersCount} members.";
            }
        }
        catch (Exception ex)
        {
            StatusMessage = $"Search error: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public void ClearSearch()
    {
        SearchText = string.Empty;
        SelectedStatusFilter = "All";
        _ = RefreshMembersListAsync();
    }

    [RelayCommand]
    public void SelectMember(MemberEntity? member)
    {
        SelectedMember = member;
        HasCheckInSuccess = false;
        CheckInSuccessMessage = null;
    }

    [RelayCommand]
    public async Task QuickCheckInAsync(CancellationToken cancellationToken = default)
    {
        if (SelectedMember == null)
        {
            StatusMessage = "Please select a member before checking in.";
            return;
        }

        try
        {
            IsLoading = true;

            var attendance = new AttendanceEntity
            {
                Id = Guid.NewGuid().ToString("D"),
                TenantId = _tenantConfig.TenantId,
                ClientId = SelectedMember.Id,
                ClientName = SelectedMember.Name,
                BranchId = SelectedMember.BranchId ?? "main",
                DateUtc = DateTimeOffset.UtcNow,
                RecordedByUserId = CurrentReceptionist,
                PackageName = SelectedMember.PackageType ?? "General Admission",
                Notes = "Desk Quick Check-In",
                SyncState = SyncState.Pending
            };

            // Atomically record attendance and enqueue outbox operation
            await _outboxService.RecordCheckInAsync(attendance, _deviceId, decrementSessions: true, cancellationToken);

            // Update local in-memory member session count if bounded
            if (SelectedMember.SessionsRemaining.HasValue && SelectedMember.SessionsRemaining.Value > 0)
            {
                SelectedMember.SessionsRemaining--;
            }

            TodayCheckInCount++;
            RecentCheckIns.Insert(0, attendance);

            CheckInSuccessMessage = $"✓ {SelectedMember.Name} checked in successfully! (Today: {TodayCheckInCount})";
            HasCheckInSuccess = true;
            StatusMessage = $"Check-in recorded locally. Queued for sync.";

            // Refresh sync status counters & trigger push
            _ = Task.Run(async () =>
            {
                try
                {
                    await SyncStatus.RefreshAsync(CancellationToken.None);
                    await OutboxInspector.RefreshAsync(CancellationToken.None);
                    await _syncCoordinator.SyncNowAsync(authToken: null, CancellationToken.None);
                }
                catch
                {
                    // Network errors handled gracefully by SyncCoordinator
                }
            });
        }
        catch (Exception ex)
        {
            StatusMessage = $"Check-in error: {ex.Message}";
            HasCheckInSuccess = false;
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public void DismissCheckInSuccess()
    {
        HasCheckInSuccess = false;
        CheckInSuccessMessage = null;
    }

    [RelayCommand]
    public async Task RecordPaymentAsync(CancellationToken cancellationToken = default)
    {
        if (PosAmount <= 0)
        {
            StatusMessage = "Please enter a valid payment amount.";
            return;
        }

        var member = SelectedMember;
        var clientId = member?.Id ?? "walk-in";
        var clientName = member?.Name ?? "Walk-in Guest";

        try
        {
            IsLoading = true;

            var payment = new PaymentEntity
            {
                Id = Guid.NewGuid().ToString("D"),
                TenantId = _tenantConfig.TenantId,
                ClientId = clientId,
                ClientName = clientName,
                Amount = PosAmount,
                PaymentMethod = PosMethod,
                PackageName = PosPackage,
                DateUtc = DateTimeOffset.UtcNow,
                RecordedByUserId = CurrentReceptionist,
                Notes = string.IsNullOrWhiteSpace(PosNotes) ? "Offline POS Reception Payment" : PosNotes.Trim(),
                SyncState = SyncState.Pending
            };

            var outboxOp = new OutboxOperation
            {
                OperationId = Guid.NewGuid().ToString("D"),
                TenantId = _tenantConfig.TenantId,
                DeviceId = _deviceId,
                ActorUserId = CurrentReceptionist,
                EntityType = "PAYMENT",
                EntityId = payment.Id,
                OperationType = "RECORD_PAYMENT",
                BaseServerVersion = 1,
                PayloadJson = System.Text.Json.JsonSerializer.Serialize(payment),
                CreatedAtUtc = DateTimeOffset.UtcNow,
                Status = OutboxStatus.Pending
            };

            await _outboxService.EnqueueOutboxOperationAsync(outboxOp, async (conn, tx) =>
            {
                if (_paymentRepository != null)
                {
                    await _paymentRepository.InsertPaymentAsync(payment, conn, tx, cancellationToken);
                }
            }, cancellationToken);

            RecentPayments.Insert(0, payment);
            TodayRevenue += PosAmount;

            PosSuccessMessage = $"✓ Payment of {PosAmount:N0} EGP ({PosMethod}) recorded for {clientName}!";
            HasPosSuccess = true;
            StatusMessage = "Payment recorded locally. Receipt ready.";

            // Reset notes
            PosNotes = string.Empty;

            // Trigger background sync
            _ = Task.Run(async () =>
            {
                try
                {
                    await SyncStatus.RefreshAsync(CancellationToken.None);
                    await OutboxInspector.RefreshAsync(CancellationToken.None);
                    await _syncCoordinator.SyncNowAsync(authToken: null, CancellationToken.None);
                }
                catch { }
            });
        }
        catch (Exception ex)
        {
            StatusMessage = $"Payment error: {ex.Message}";
            HasPosSuccess = false;
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public void DismissPosSuccess()
    {
        HasPosSuccess = false;
        PosSuccessMessage = null;
    }

    [RelayCommand]
    public async Task FilterScheduleDayAsync(string day, CancellationToken cancellationToken = default)
    {
        SelectedScheduleDay = day;
        if (_scheduleRepository != null)
        {
            var list = await _scheduleRepository.GetSchedulesAsync(_tenantConfig.TenantId, day == "All" ? null : day, cancellationToken);
            ClassSchedules.Clear();
            foreach (var s in list)
            {
                ClassSchedules.Add(s);
            }
        }
    }

    [RelayCommand]
    public void FastLock()
    {
        IsLocked = true;
        PinInput = string.Empty;
        UnlockErrorMessage = null;
    }

    [RelayCommand]
    public void Unlock()
    {
        if (string.IsNullOrWhiteSpace(PinInput) || (PinInput != "1234" && PinInput.Length < 4))
        {
            UnlockErrorMessage = "Invalid PIN. Use default 1234 or your 4+ digit staff PIN.";
            return;
        }

        IsLocked = false;
        PinInput = string.Empty;
        UnlockErrorMessage = null;
    }

    [RelayCommand]
    public void SwitchReceptionist(string? newName)
    {
        if (!string.IsNullOrWhiteSpace(newName))
        {
            CurrentReceptionist = newName.Trim();
        }
        FastLock();
    }

    [RelayCommand]
    public void ToggleOutboxDrawer()
    {
        IsOutboxDrawerOpen = !IsOutboxDrawerOpen;
        if (IsOutboxDrawerOpen)
        {
            _ = OutboxInspector.RefreshAsync();
        }
    }

    // --- Kiosk Auto-Scan & Verdict Banner ---
    [ObservableProperty]
    private string _kioskScannerText = string.Empty;

    [ObservableProperty]
    private string? _kioskVerdictMessage;

    [ObservableProperty]
    private bool _isKioskApproved;

    [ObservableProperty]
    private bool _hasKioskVerdict;

    [ObservableProperty]
    private MemberEntity? _lastScannedMember;

    [RelayCommand]
    public async Task ProcessKioskScanAsync(string? scanInput = null, CancellationToken cancellationToken = default)
    {
        var query = (scanInput ?? KioskScannerText)?.Trim();
        if (string.IsNullOrEmpty(query)) return;

        try
        {
            IsLoading = true;
            var matches = await _memberRepository.FilterMembersAsync(_tenantConfig.TenantId, null, query, 5, cancellationToken);
            var member = matches.FirstOrDefault();

            if (member != null)
            {
                SelectedMember = member;
                LastScannedMember = member;

                if (string.Equals(member.Status, "Active", StringComparison.OrdinalIgnoreCase))
                {
                    await QuickCheckInAsync(cancellationToken);
                    IsKioskApproved = true;
                    HasKioskVerdict = true;
                    var remainingStr = member.SessionsRemaining.HasValue ? $"{member.SessionsRemaining.Value} sessions left" : "Unlimited Membership";
                    KioskVerdictMessage = $"ACCESS GRANTED: {member.Name} ({member.MemberCode}) • {member.PackageType} • {remainingStr}";
                }
                else if (string.Equals(member.Status, "Expired", StringComparison.OrdinalIgnoreCase))
                {
                    IsKioskApproved = false;
                    HasKioskVerdict = true;
                    KioskVerdictMessage = $"ACCESS DENIED: {member.Name} ({member.MemberCode}) • MEMBERSHIP EXPIRED • Renew at Payments & POS";
                }
                else
                {
                    IsKioskApproved = false;
                    HasKioskVerdict = true;
                    KioskVerdictMessage = $"VERIFICATION REQUIRED: {member.Name} ({member.MemberCode}) • Status: {member.Status} • Please check with front desk staff.";
                }
            }
            else
            {
                IsKioskApproved = false;
                HasKioskVerdict = true;
                LastScannedMember = null;
                KioskVerdictMessage = $"MEMBER NOT FOUND: No record matching '{query}'. Please verify Member Code, Phone, or Name.";
            }

            KioskScannerText = string.Empty;
        }
        catch (Exception ex)
        {
            IsKioskApproved = false;
            HasKioskVerdict = true;
            KioskVerdictMessage = $"SCAN ERROR: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public void DismissKioskVerdict()
    {
        HasKioskVerdict = false;
        KioskVerdictMessage = null;
    }

    // --- POS Selection Helpers ---
    [RelayCommand]
    public void SelectPosPackage(string packageName)
    {
        if (string.IsNullOrWhiteSpace(packageName)) return;
        PosPackage = packageName;
        if (packageName.Contains("1 Month", StringComparison.OrdinalIgnoreCase))
        {
            PosAmount = 1500;
        }
        else if (packageName.Contains("3 Month", StringComparison.OrdinalIgnoreCase))
        {
            PosAmount = 3800;
        }
        else if (packageName.Contains("10 Session", StringComparison.OrdinalIgnoreCase))
        {
            PosAmount = 1200;
        }
        else if (packageName.Contains("PT", StringComparison.OrdinalIgnoreCase) || packageName.Contains("Private", StringComparison.OrdinalIgnoreCase))
        {
            PosAmount = 3000;
        }
        else if (packageName.Contains("Day Pass", StringComparison.OrdinalIgnoreCase))
        {
            PosAmount = 200;
        }
    }

    [RelayCommand]
    public void SelectPosMethod(string method)
    {
        if (!string.IsNullOrWhiteSpace(method))
        {
            PosMethod = method;
        }
    }

    [RelayCommand]
    public void OpenPaymentForSelectedMember()
    {
        if (SelectedMember != null)
        {
            if (!string.IsNullOrEmpty(SelectedMember.PackageType))
            {
                SelectPosPackage(SelectedMember.PackageType);
            }
            SetTab("payments");
        }
    }
}
