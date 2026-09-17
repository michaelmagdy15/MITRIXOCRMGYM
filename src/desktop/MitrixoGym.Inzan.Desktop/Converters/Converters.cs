using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;

namespace MitrixoGym.Inzan.Desktop.Converters;

public class BoolToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var b = value is bool v && v;
        if (Invert) b = !b;
        return b ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

public class NullToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var isNull = value == null;
        if (value is string s) isNull = string.IsNullOrWhiteSpace(s);
        if (value is int i) isNull = i <= 0;
        if (value is System.Collections.ICollection coll) isNull = coll.Count == 0;

        var visible = Invert ? isNull : !isNull;
        return visible ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

public class MemberStatusToBrushConverter : IValueConverter
{
    private static readonly SolidColorBrush ActiveBrush = new((Color)ColorConverter.ConvertFromString("#22C55E"));
    private static readonly SolidColorBrush ExpiredBrush = new((Color)ColorConverter.ConvertFromString("#EF4444"));
    private static readonly SolidColorBrush HoldBrush = new((Color)ColorConverter.ConvertFromString("#F59E0B"));
    private static readonly SolidColorBrush LeadBrush = new((Color)ColorConverter.ConvertFromString("#3B82F6"));
    private static readonly SolidColorBrush DefaultBrush = new((Color)ColorConverter.ConvertFromString("#A1A1AA"));

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var status = value?.ToString();
        if (string.Equals(status, "Active", StringComparison.OrdinalIgnoreCase)) return ActiveBrush;
        if (string.Equals(status, "Expired", StringComparison.OrdinalIgnoreCase)) return ExpiredBrush;
        if (string.Equals(status, "Hold", StringComparison.OrdinalIgnoreCase)) return HoldBrush;
        if (string.Equals(status, "Lead", StringComparison.OrdinalIgnoreCase) || string.Equals(status, "Leads", StringComparison.OrdinalIgnoreCase)) return LeadBrush;
        return DefaultBrush;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}

public class SyncStatusToBrushConverter : IValueConverter
{
    private static readonly SolidColorBrush SyncedBrush = new((Color)ColorConverter.ConvertFromString("#10B981"));
    private static readonly SolidColorBrush PendingBrush = new((Color)ColorConverter.ConvertFromString("#F59E0B"));
    private static readonly SolidColorBrush FailedBrush = new((Color)ColorConverter.ConvertFromString("#EF4444"));
    private static readonly SolidColorBrush SyncingBrush = new((Color)ColorConverter.ConvertFromString("#3B82F6"));
    private static readonly SolidColorBrush OfflineBrush = new((Color)ColorConverter.ConvertFromString("#64748B"));

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var state = value?.ToString();
        return state switch
        {
            "Synced" => SyncedBrush,
            "Pending" => PendingBrush,
            "Failed" => FailedBrush,
            "Syncing" => SyncingBrush,
            "Offline" => OfflineBrush,
            _ => PendingBrush
        };
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
}
