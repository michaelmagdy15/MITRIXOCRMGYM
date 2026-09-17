namespace MitrixoGym.Desktop.Core.Domain.Entities;

/// <summary>
/// Locally recorded or synchronized payment transaction.
/// </summary>
public class PaymentEntity : SyncableEntity
{
    /// <summary>
    /// ID of the member / client who paid.
    /// </summary>
    public required string ClientId { get; set; }

    /// <summary>
    /// Denormalized member name.
    /// </summary>
    public string? ClientName { get; set; }

    /// <summary>
    /// Amount paid in local currency (EGP).
    /// </summary>
    public decimal Amount { get; set; }

    /// <summary>
    /// Payment method: Cash, Card, Instapay, Bank Transfer.
    /// </summary>
    public string PaymentMethod { get; set; } = "Cash";

    /// <summary>
    /// Package or service purchased.
    /// </summary>
    public string? PackageName { get; set; }

    /// <summary>
    /// Date and time of payment.
    /// </summary>
    public DateTimeOffset DateUtc { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Staff member who registered the payment.
    /// </summary>
    public required string RecordedByUserId { get; set; }

    /// <summary>
    /// Optional transaction or invoice notes.
    /// </summary>
    public string? Notes { get; set; }
}
