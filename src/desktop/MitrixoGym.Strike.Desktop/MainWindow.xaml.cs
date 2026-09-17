using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Microsoft.Web.WebView2.Core;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.ViewModels;

namespace MitrixoGym.Strike.Desktop;

public partial class MainWindow : Window
{
    private bool _isWebViewInitialized;

    public MainWindow()
    {
        InitializeComponent();
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        await InitializeWebViewAsync();
    }

    private async Task InitializeWebViewAsync()
    {
        if (_isWebViewInitialized) return;
        try
        {
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "MitrixoGym",
                "Strike",
                "WebView2");
            Directory.CreateDirectory(userDataFolder);

            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await CrmWebView.EnsureCoreWebView2Async(env);

            // Configure comprehensive web capabilities
            var settings = CrmWebView.CoreWebView2.Settings;
            settings.IsScriptEnabled = true;
            settings.IsWebMessageEnabled = true;
            settings.AreDefaultContextMenusEnabled = true;
            settings.AreDevToolsEnabled = true;
            settings.IsZoomControlEnabled = true;
            settings.AreBrowserAcceleratorKeysEnabled = true;
            settings.IsStatusBarEnabled = false;

            // Desktop UserAgent (preserves standard Edge/Chrome desktop token, never triggers mobile layout checks)
            settings.UserAgent = settings.UserAgent + " MitrixoDesktop/1.12 (Windows NT 10.0; Win64; x64)";

            // 1. Permissions: Auto-grant Camera (QR Code check-in / barcode reader), Notifications, Clipboard, Microphone
            CrmWebView.CoreWebView2.PermissionRequested += OnPermissionRequested;

            // 2. Downloads: Support exporting member lists, Excel sheets, and PDF invoices seamlessly
            CrmWebView.CoreWebView2.DownloadStarting += OnDownloadStarting;

            // 3. Popups & New Windows: In-app links stay inside desktop app; external links open in system browser
            CrmWebView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;

            // 4. Navigation Status
            CrmWebView.NavigationCompleted += OnNavigationCompleted;

            var targetUrl = "https://strike-egy.com";
            if (DataContext is MainReceptionViewModel vm && !string.IsNullOrEmpty(vm.WebAppUrl))
            {
                targetUrl = vm.WebAppUrl;
            }

            CrmWebView.Source = new Uri(targetUrl);
            _isWebViewInitialized = true;
        }
        catch (Exception ex)
        {
            if (DataContext is MainReceptionViewModel vm)
            {
                vm.SwitchToOfflineReception();
                vm.StatusMessage = $"Offline reception desk active ({ex.Message})";
            }
        }
    }

    private void OnPermissionRequested(object? sender, CoreWebView2PermissionRequestedEventArgs e)
    {
        if (e.PermissionKind == CoreWebView2PermissionKind.Camera ||
            e.PermissionKind == CoreWebView2PermissionKind.Notifications ||
            e.PermissionKind == CoreWebView2PermissionKind.ClipboardRead ||
            e.PermissionKind == CoreWebView2PermissionKind.Microphone)
        {
            e.State = CoreWebView2PermissionState.Allow;
            e.Handled = true;
        }
    }

    private void OnDownloadStarting(object? sender, CoreWebView2DownloadStartingEventArgs e)
    {
        // Allow downloads to proceed seamlessly with default browser dialog/progress
        e.Handled = false;
    }

    private void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        if (string.IsNullOrEmpty(e.Uri)) return;

        if (e.Uri.Contains("strike-egy.com") ||
            e.Uri.Contains("inzanathletics.mitrixo.com") ||
            e.Uri.StartsWith("blob:") ||
            e.Uri.StartsWith("data:") ||
            e.Uri.StartsWith("about:blank"))
        {
            e.Handled = true;
            CrmWebView.Source = new Uri(e.Uri);
        }
        else
        {
            e.Handled = true;
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(e.Uri)
                {
                    UseShellExecute = true
                });
            }
            catch { }
        }
    }

    private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (!e.IsSuccess && DataContext is MainReceptionViewModel vm)
        {
            vm.StatusMessage = $"Web CRM offline ({e.WebErrorStatus}). Offline reception desk available.";
        }
    }

    private void NavBack_Click(object sender, RoutedEventArgs e)
    {
        if (CrmWebView.CanGoBack) CrmWebView.GoBack();
    }

    private void NavForward_Click(object sender, RoutedEventArgs e)
    {
        if (CrmWebView.CanGoForward) CrmWebView.GoForward();
    }

    private void NavReload_Click(object sender, RoutedEventArgs e)
    {
        CrmWebView.Reload();
    }

    private void NavHome_Click(object sender, RoutedEventArgs e)
    {
        var targetUrl = "https://strike-egy.com";
        if (DataContext is MainReceptionViewModel vm && !string.IsNullOrEmpty(vm.WebAppUrl))
        {
            targetUrl = vm.WebAppUrl;
        }
        CrmWebView.Source = new Uri(targetUrl);
    }

    private void ToggleFullscreen_Click(object sender, RoutedEventArgs e)
    {
        if (WindowState == WindowState.Maximized && WindowStyle == WindowStyle.None)
        {
            WindowStyle = WindowStyle.SingleBorderWindow;
            WindowState = WindowState.Normal;
        }
        else
        {
            WindowStyle = WindowStyle.None;
            WindowState = WindowState.Maximized;
        }
    }

    private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.F5)
        {
            CrmWebView.Reload();
            e.Handled = true;
        }
        else if (e.Key == Key.F11)
        {
            ToggleFullscreen_Click(this, new RoutedEventArgs());
            e.Handled = true;
        }
    }

    private void SearchBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            if (DataContext is MainReceptionViewModel vm)
            {
                _ = vm.SearchCommand.ExecuteAsync(null);
            }
        }
    }

    private void MemberCard_Click(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement element && element.DataContext is MemberEntity member)
        {
            if (DataContext is MainReceptionViewModel vm)
            {
                vm.SelectMember(member);
            }
        }
    }

    private void MemberRow_Click(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement element && element.DataContext is MemberEntity member)
        {
            if (DataContext is MainReceptionViewModel vm)
            {
                vm.SelectMember(member);
            }
        }
    }

    private void CloseMemberDrawer_Click(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainReceptionViewModel vm)
        {
            vm.SelectedMember = null;
        }
    }

    private void SwitchToPaymentsForMember_Click(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainReceptionViewModel vm)
        {
            vm.OpenPaymentForSelectedMember();
        }
    }

    private void DrawerBackdrop_Click(object sender, MouseButtonEventArgs e)
    {
        if (DataContext is MainReceptionViewModel vm)
        {
            vm.IsOutboxDrawerOpen = false;
        }
    }

    private void LockPinBox_PasswordChanged(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainReceptionViewModel vm)
        {
            vm.PinInput = LockPinBox.Password;
        }
    }

    private void LockPinBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            if (DataContext is MainReceptionViewModel vm)
            {
                vm.UnlockCommand.Execute(null);
            }
        }
    }

    private void SwitchStaff_Click(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainReceptionViewModel vm)
        {
            vm.SwitchReceptionist(SwitchStaffBox.Text);
            SwitchStaffBox.Clear();
        }
    }

    private void SidebarNav_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string tab && DataContext is MainReceptionViewModel vm)
        {
            vm.SetTab(tab);
        }
    }

    private async void KioskScannerBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter && DataContext is MainReceptionViewModel vm)
        {
            var code = KioskScannerBox.Text.Trim();
            if (!string.IsNullOrEmpty(code))
            {
                await vm.ProcessKioskScanAsync(code);
                KioskScannerBox.Clear();
            }
        }
    }

    private async void KioskScanButton_Click(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainReceptionViewModel vm)
        {
            var code = KioskScannerBox.Text.Trim();
            if (!string.IsNullOrEmpty(code))
            {
                await vm.ProcessKioskScanAsync(code);
                KioskScannerBox.Clear();
            }
        }
    }

    private async void DashboardQuickCheckIn_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter && DataContext is MainReceptionViewModel vm)
        {
            var code = DashboardScannerBox.Text.Trim();
            if (!string.IsNullOrEmpty(code))
            {
                await vm.ProcessKioskScanAsync(code);
                DashboardScannerBox.Clear();
            }
        }
    }

    private async void DashboardQuickCheckIn_Click(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainReceptionViewModel vm)
        {
            var code = DashboardScannerBox.Text.Trim();
            if (!string.IsNullOrEmpty(code))
            {
                await vm.ProcessKioskScanAsync(code);
                DashboardScannerBox.Clear();
            }
        }
    }

    private async void ScheduleDayFilter_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string day && DataContext is MainReceptionViewModel vm)
        {
            await vm.FilterScheduleDayAsync(day);
        }
    }

    private async void StatusFilter_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string status && DataContext is MainReceptionViewModel vm)
        {
            await vm.FilterStatusAsync(status);
        }
    }

    private void PosPackage_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string pkg && DataContext is MainReceptionViewModel vm)
        {
            vm.SelectPosPackage(pkg);
        }
    }

    private void PosMethod_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string method && DataContext is MainReceptionViewModel vm)
        {
            vm.SelectPosMethod(method);
        }
    }

    private void PosQuickAdd_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is string addStr && decimal.TryParse(addStr, out var addVal) && DataContext is MainReceptionViewModel vm)
        {
            vm.PosAmount += addVal;
        }
    }
}
