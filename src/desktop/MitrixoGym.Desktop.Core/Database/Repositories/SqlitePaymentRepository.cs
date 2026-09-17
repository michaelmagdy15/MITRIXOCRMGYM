using Microsoft.Data.Sqlite;
using MitrixoGym.Desktop.Core.Domain.Entities;
using MitrixoGym.Desktop.Core.Domain.Enums;

namespace MitrixoGym.Desktop.Core.Database.Repositories;

/// <summary>
/// SQLite repository for payments and offline POS operations.
/// </summary>
public class SqlitePaymentRepository : IPaymentRepository
{
    private readonly ISqliteDatabaseContext _context;

    public SqlitePaymentRepository(ISqliteDatabaseContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    public async Task InsertPaymentAsync(PaymentEntity payment, SqliteConnection connection, SqliteTransaction? transaction = null, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(payment);
        ArgumentNullException.ThrowIfNull(connection);

        const string sql = @"
            INSERT INTO payments (
                id, tenant_id, client_id, client_name, amount, payment_method,
                package_name, date_utc, recorded_by_user_id, notes,
                server_version, server_updated_at, deleted_at, sync_state
            ) VALUES (
                @id, @tenantId, @clientId, @clientName, @amount, @method,
                @packageName, @dateUtc, @userId, @notes,
                @serverVersion, @serverUpdatedAt, @deletedAt, @syncState
            );
        ";

        using var cmd = connection.CreateCommand();
        if (transaction != null) cmd.Transaction = transaction;
        cmd.CommandText = sql;

        cmd.Parameters.AddWithValue("@id", payment.Id);
        cmd.Parameters.AddWithValue("@tenantId", payment.TenantId);
        cmd.Parameters.AddWithValue("@clientId", payment.ClientId);
        cmd.Parameters.AddWithValue("@clientName", (object?)payment.ClientName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@amount", payment.Amount);
        cmd.Parameters.AddWithValue("@method", payment.PaymentMethod);
        cmd.Parameters.AddWithValue("@packageName", (object?)payment.PackageName ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@dateUtc", payment.DateUtc.ToString("O"));
        cmd.Parameters.AddWithValue("@userId", payment.RecordedByUserId);
        cmd.Parameters.AddWithValue("@notes", (object?)payment.Notes ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@serverVersion", payment.ServerVersion);
        cmd.Parameters.AddWithValue("@serverUpdatedAt", payment.ServerUpdatedAt.HasValue ? payment.ServerUpdatedAt.Value.ToString("O") : DBNull.Value);
        cmd.Parameters.AddWithValue("@deletedAt", payment.DeletedAt.HasValue ? payment.DeletedAt.Value.ToString("O") : DBNull.Value);
        cmd.Parameters.AddWithValue("@syncState", payment.SyncState.ToString());

        await cmd.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<List<PaymentEntity>> GetRecentPaymentsAsync(string tenantId, int limit = 50, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        using var conn = await _context.CreateOpenConnectionAsync(cancellationToken);
        const string sql = @"
            SELECT id, tenant_id, client_id, client_name, amount, payment_method,
                   package_name, date_utc, recorded_by_user_id, notes,
                   server_version, server_updated_at, deleted_at, sync_state
            FROM payments
            WHERE tenant_id = @tenantId AND deleted_at IS NULL
            ORDER BY date_utc DESC
            LIMIT @limit;
        ";

        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        cmd.Parameters.AddWithValue("@limit", limit);

        var list = new List<PaymentEntity>();
        using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            list.Add(new PaymentEntity
            {
                Id = reader.GetString(0),
                TenantId = reader.GetString(1),
                ClientId = reader.GetString(2),
                ClientName = reader.IsDBNull(3) ? null : reader.GetString(3),
                Amount = (decimal)reader.GetDouble(4),
                PaymentMethod = reader.GetString(5),
                PackageName = reader.IsDBNull(6) ? null : reader.GetString(6),
                DateUtc = DateTimeOffset.Parse(reader.GetString(7)),
                RecordedByUserId = reader.GetString(8),
                Notes = reader.IsDBNull(9) ? null : reader.GetString(9),
                ServerVersion = reader.GetInt64(10),
                ServerUpdatedAt = reader.IsDBNull(11) ? null : DateTimeOffset.Parse(reader.GetString(11)),
                DeletedAt = reader.IsDBNull(12) ? null : DateTimeOffset.Parse(reader.GetString(12)),
                SyncState = Enum.TryParse<SyncState>(reader.GetString(13), out var state) ? state : SyncState.Synced
            });
        }
        return list;
    }

    public async Task<decimal> GetTodayRevenueAsync(string tenantId, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);

        using var conn = await _context.CreateOpenConnectionAsync(cancellationToken);
        var todayStart = DateTimeOffset.UtcNow.Date.ToString("O");

        const string sql = @"
            SELECT COALESCE(SUM(amount), 0)
            FROM payments
            WHERE tenant_id = @tenantId
              AND deleted_at IS NULL
              AND date_utc >= @todayStart;
        ";

        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        cmd.Parameters.AddWithValue("@tenantId", tenantId);
        cmd.Parameters.AddWithValue("@todayStart", todayStart);

        var result = await cmd.ExecuteScalarAsync(cancellationToken);
        if (result != null && double.TryParse(result.ToString(), out var sum))
        {
            return (decimal)sum;
        }
        return 0m;
    }
}
