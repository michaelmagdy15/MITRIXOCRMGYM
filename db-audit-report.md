# Database Performance Audit Report

Generated at 2026-07-13T18:14:14.143Z

## Query: SELECT * FROM clients WHERE status != 'Lead' LIMIT 100

```sql
SELECT * FROM clients WHERE status != 'Lead' LIMIT 100
```

```
planning time: 504µs
execution time: 13ms
distribution: local
vectorized: true
plan type: generic, reused
rows decoded from KV: 200 (461 KiB, 3 gRPC calls)
cumulative time spent in KV: 10ms
maximum memory usage: 1.5 MiB
DistSQL network usage: 0 B (0 messages)
regions: aws-eu-central-1
sql cpu time: 2ms
estimated RUs consumed: 489.5060264508296
isolation level: serializable
priority: normal
quality of service: regular

• index join (streamer)
│ sql nodes: n1
│ kv nodes: n39
│ regions: aws-eu-central-1
│ actual row count: 100
│ KV time: 9ms
│ KV rows decoded: 100
│ KV bytes read: 456 KiB
│ KV gRPC calls: 2
│ estimated max memory allocated: 1.4 MiB
│ estimated max sql temp disk usage: 0 B
│ sql cpu time: 1ms
│ estimated row count: 100
│ table: clients@clients_pkey
│
└── • scan
      sql nodes: n1
      kv nodes: n39
      regions: aws-eu-central-1
      actual row count: 100
      KV time: 2ms
      KV rows decoded: 100
      KV bytes read: 4.7 KiB
      KV gRPC calls: 1
      estimated max memory allocated: 20 KiB
      sql cpu time: 84µs
      estimated row count: 100 (0.34% of the table; stats collected 1 day ago; using stats forecast for 15 hours ago)
      table: clients@idx_clients_status
      spans: [ - /'Lead') [/e'Lead\x00' - ]
      limit: 100
```

## Query: SELECT * FROM payments WHERE created_at::timestamptz > '2023-01-01'::timestamptz LIMIT 100

```sql
SELECT * FROM payments WHERE created_at::timestamptz > '2023-01-01'::timestamptz LIMIT 100
```

```
planning time: 540µs
execution time: 4ms
distribution: local
vectorized: true
plan type: custom
rows decoded from KV: 301 (96 KiB, 1 gRPC calls)
cumulative time spent in KV: 3ms
maximum memory usage: 340 KiB
DistSQL network usage: 0 B (0 messages)
regions: aws-eu-central-1
sql cpu time: 927µs
estimated RUs consumed: 37.4794921875
isolation level: serializable
priority: normal
quality of service: regular

• limit
│ count: 100
│
└── • filter
    │ sql nodes: n1
    │ regions: aws-eu-central-1
    │ actual row count: 100
    │ execution time: 392µs
    │ sql cpu time: 392µs
    │ estimated row count: 4,942
    │ filter: created_at::TIMESTAMPTZ > '2023-01-01 00:00:00+00'
    │
    └── • scan
          sql nodes: n1
          kv nodes: n39
          regions: aws-eu-central-1
          actual row count: 301
          KV time: 3ms
          KV rows decoded: 301
          KV bytes read: 96 KiB
          KV gRPC calls: 1
          estimated max memory allocated: 320 KiB
          sql cpu time: 535µs
          estimated row count: 301 - 14,825 (100% of the table; stats collected 1 day ago; using stats forecast for 15 hours ago)
          table: payments@payments_pkey
          spans: FULL SCAN (SOFT LIMIT)
```

## Query: SELECT * FROM coaches WHERE active = true LIMIT 50

```sql
SELECT * FROM coaches WHERE active = true LIMIT 50
```

```
planning time: 10ms
execution time: 2ms
distribution: local
vectorized: true
plan type: custom
rows decoded from KV: 1 (104 B, 1 gRPC calls)
cumulative time spent in KV: 2ms
maximum memory usage: 20 KiB
DistSQL network usage: 0 B (0 messages)
regions: aws-eu-central-1
sql cpu time: 22µs
estimated RUs consumed: 3.4145649078421987
isolation level: serializable
priority: normal
quality of service: regular

• limit
│ count: 50
│
└── • filter
    │ sql nodes: n1
    │ regions: aws-eu-central-1
    │ actual row count: 1
    │ execution time: 4µs
    │ sql cpu time: 4µs
    │ estimated row count: 1
    │ filter: active
    │
    └── • scan
          sql nodes: n1
          kv nodes: n39
          regions: aws-eu-central-1
          actual row count: 1
          KV time: 2ms
          KV rows decoded: 1
          KV bytes read: 104 B
          KV gRPC calls: 1
          estimated max memory allocated: 20 KiB
          sql cpu time: 18µs
          estimated row count: 1 (100% of the table; stats collected 3 hours ago)
          table: coaches@coaches_pkey
          spans: FULL SCAN
```

## Query: SELECT * FROM attendance WHERE date > '2023-01-01' LIMIT 100

```sql
SELECT * FROM attendance WHERE date > '2023-01-01' LIMIT 100
```

```
planning time: 14ms
execution time: 5ms
distribution: local
vectorized: true
plan type: custom
rows decoded from KV: 200 (14 KiB, 2 gRPC calls)
cumulative time spent in KV: 5ms
maximum memory usage: 193 KiB
DistSQL network usage: 0 B (0 messages)
regions: aws-eu-central-1
sql cpu time: 199µs
estimated RUs consumed: 21.69140625
isolation level: serializable
priority: normal
quality of service: regular

• index join (streamer)
│ sql nodes: n1
│ kv nodes: n41
│ regions: aws-eu-central-1
│ actual row count: 100
│ KV time: 2ms
│ KV rows decoded: 100
│ KV bytes read: 6.9 KiB
│ KV gRPC calls: 1
│ estimated max memory allocated: 160 KiB
│ estimated max sql temp disk usage: 0 B
│ sql cpu time: 168µs
│ estimated row count: 100
│ table: attendance@attendance_pkey
│
└── • scan
      sql nodes: n1
      kv nodes: n39
      regions: aws-eu-central-1
      actual row count: 100
      KV time: 3ms
      KV rows decoded: 100
      KV bytes read: 6.5 KiB
      KV gRPC calls: 1
      estimated max memory allocated: 20 KiB
      sql cpu time: 31µs
      estimated row count: 100 (0.05% of the table; stats collected 3 hours ago; using stats forecast for 7 hours in the future)
      table: attendance@idx_attendance_date
      spans: [/e'2023-01-01\x00' - ]
      limit: 100
```

