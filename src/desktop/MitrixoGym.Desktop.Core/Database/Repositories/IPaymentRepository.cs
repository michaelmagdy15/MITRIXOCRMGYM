using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Domain.Entities;

namespace MitrixoGym.Desktop.Core.Database.Repositories;

/// <summary>
/// Repository interface for payment transactions in local working set.
/// </summary>
public interface IPaymentRepository
{
    Task InsertPaymentAsync(PaymentEntity payment, SqliteConnection connection, SqliteTransaction? transaction = null, CancellationToken cancellationToken = default);
    Task<List<PaymentEntity>> GetRecentPaymentsAsync(string tenantId, int limit = 50, CancellationToken cancellationToken = default);
    Task<decimal> GetTodayRevenueAsync(string tenantId, CancellationToken cancellationToken = default);
}
