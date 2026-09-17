namespace MitrixoGym.Desktop.Core.Domain.Entities;

/// <summary>
/// Locally cached gym class schedule or timetable entry.
/// </summary>
public class ClassScheduleEntity : SyncableEntity
{
    /// <summary>
    /// Class title / discipline (e.g. Boxing Fundamentals, Muay Thai, Strength).
    /// </summary>
    public required string Title { get; set; }

    /// <summary>
    /// Coach or instructor name.
    /// </summary>
    public string? InstructorName { get; set; }

    /// <summary>
    /// Start time string (e.g. "18:00" or "06:00 PM").
    /// </summary>
    public string? StartTime { get; set; }

    /// <summary>
    /// End time string (e.g. "19:00" or "07:00 PM").
    /// </summary>
    public string? EndTime { get; set; }

    /// <summary>
    /// Day of the week (e.g. Sunday, Monday, etc.).
    /// </summary>
    public string? DayOfWeek { get; set; }

    /// <summary>
    /// Branch / studio name.
    /// </summary>
    public string? Branch { get; set; }

    /// <summary>
    /// Maximum attendee capacity.
    /// </summary>
    public int Capacity { get; set; } = 20;

    /// <summary>
    /// Number of attendees currently booked.
    /// </summary>
    public int BookedCount { get; set; } = 0;
}
