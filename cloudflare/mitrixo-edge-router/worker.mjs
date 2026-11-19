async function probeTarget(url, init = {}) {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - startedAt;
    let body = null;
    if (init.parseJson) {
      body = await res.json().catch(() => null);
    }
    return {
      ok: res.ok,
      status: res.status,
      latencyMs,
      body,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
      body: null,
    };
  }
}

async function runEdgeMonitor(env, gatewayOrigin, nowIso) {
  if (!env.QUOTA_BACKUPS) return;

  const [inzanGateway, inzanQuota, strikeProduction, vbtPortal, prevRaw] = await Promise.all([
    probeTarget(`${gatewayOrigin}/api/health`, {
      headers: { 'User-Agent': 'Mitrixo-Edge-Monitor/1.0' },
    }),
    probeTarget(`${gatewayOrigin}/api/quota/status`, {
      parseJson: true,
      headers: {
        'User-Agent': 'Mitrixo-Edge-Monitor/1.0',
        'x-tenant-id': 'inzanathletics',
      },
    }),
    probeTarget('https://strike-egy.com/api/health', {
      headers: { 'User-Agent': 'Mitrixo-Edge-Monitor/1.0' },
    }),
    probeTarget('https://vbt.mitrixo.com/', {
      method: 'HEAD',
      headers: { 'User-Agent': 'Mitrixo-Edge-Monitor/1.0' },
    }),
    env.QUOTA_BACKUPS.get('monitor:health:latest', 'json').catch(() => null),
  ]);

  const quotaState = inzanQuota.body?.status?.state || 'unknown';
  const readPercent = Number(inzanQuota.body?.status?.readPercent ?? 0);
  const reads = Number(inzanQuota.body?.status?.reads ?? 0);
  const readLimit = Number(inzanQuota.body?.status?.readLimit ?? 50000);
  const overallOk = Boolean(inzanGateway.ok && inzanQuota.ok && strikeProduction.ok && vbtPortal.ok);

  const prevHistory = Array.isArray(prevRaw?.history) ? prevRaw.history : [];
  const nextHistory = [
    ...prevHistory.slice(-23),
    {
      t: nowIso,
      ok: overallOk,
      inzanMs: inzanGateway.latencyMs,
      strikeMs: strikeProduction.latencyMs,
      vbtMs: vbtPortal.latencyMs,
      quotaState,
    },
  ];

  const report = {
    checkedAt: nowIso,
    overallOk,
    checks: {
      inzanGateway: {
        ok: inzanGateway.ok,
        status: inzanGateway.status,
        latencyMs: inzanGateway.latencyMs,
        ...(inzanGateway.error ? { error: inzanGateway.error } : {}),
      },
      inzanQuota: {
        ok: inzanQuota.ok,
        status: inzanQuota.status,
        latencyMs: inzanQuota.latencyMs,
        quotaState,
        readPercent,
        reads,
        readLimit,
        ...(inzanQuota.error ? { error: inzanQuota.error } : {}),
      },
      strikeProduction: {
        ok: strikeProduction.ok,
        status: strikeProduction.status,
        latencyMs: strikeProduction.latencyMs,
        ...(strikeProduction.error ? { error: strikeProduction.error } : {}),
      },
      vbtPortal: {
        ok: vbtPortal.ok,
        status: vbtPortal.status,
        latencyMs: vbtPortal.latencyMs,
        ...(vbtPortal.error ? { error: vbtPortal.error } : {}),
      },
    },
    history: nextHistory,
  };

  if (!overallOk || (quotaState !== 'normal' && quotaState !== 'unknown')) {
    console.warn(
      '[EDGE-MONITOR-ALERT]',
      JSON.stringify({ checkedAt: nowIso, overallOk, quotaState, checks: report.checks })
    );
  }

  await env.QUOTA_BACKUPS.put('monitor:health:latest', JSON.stringify(report));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const gatewayOrigin = env.GATEWAY_ORIGIN || 'https://mitrixo-gateway.onrender.com';
    const targetUrl = `${gatewayOrigin}${url.pathname}${url.search}`;

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('x-forwarded-host', url.hostname);
    if (env.PROXY_SHARED_SECRET) {
      headers.set('x-proxy-secret', env.PROXY_SHARED_SECRET);
    }
    const tenantId = url.hostname.toLowerCase().startsWith('vbt.') ? 'vbt' : 'inzanathletics';
    headers.set('x-tenant-id', tenantId);

    const init = {
      method: request.method,
      headers,
      redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    return fetch(targetUrl, init);
  },

  async scheduled(event, env, ctx) {
    const gatewayOrigin = env.GATEWAY_ORIGIN || 'https://mitrixo-gateway.onrender.com';

    if (event.cron === '01 22 * * *') {
      ctx.waitUntil(
        Promise.allSettled([
          fetch(`${gatewayOrigin}/api/cron/membership-expiration`, {
            method: 'POST',
            headers: {
              'x-cron-secret': env.CRON_SECRET || '',
            },
          }),
          fetch(`${gatewayOrigin}/api/cron/nightly-backup`, {
            method: 'POST',
            headers: {
              'x-cron-secret': env.CRON_SECRET || '',
            },
          }),
        ]).catch(() => {})
      );
      return;
    }

    const dt = new Date(event.scheduledTime);
    const utcHour = dt.getUTCHours();
    const utcMin = dt.getUTCMinutes();
    const utcDay = dt.getUTCDay();

    // Cairo active gym window: 6:00 AM - 1:00 AM Cairo (04:00 - 22:59 UTC) = ~589h/mo,
    // leaving 161h/mo buffer inside Render's 750h/mo free workspace limit.
    if (utcHour >= 4 && utcHour < 23) {
      ctx.waitUntil(
        fetch(`${gatewayOrigin}/api/health`, {
          headers: { 'User-Agent': 'Mitrixo-Edge-KeepWarm/1.0' },
        }).catch(() => {})
      );
      if (utcMin % 10 === 0) {
        ctx.waitUntil(runEdgeMonitor(env, gatewayOrigin, dt.toISOString()).catch(() => {}));
      }
      if (utcMin % 20 === 0) {
        ctx.waitUntil(
          fetch(`${gatewayOrigin}/api/cron/no-show-check`, {
            method: 'POST',
            headers: {
              'x-cron-secret': env.CRON_SECRET || '',
            },
          }).catch(() => {})
        );
      }
      if (utcMin % 30 === 0) {
        ctx.waitUntil(
          fetch(`${gatewayOrigin}/api/cron/class-reminders`, {
            method: 'POST',
            headers: {
              'x-cron-secret': env.CRON_SECRET || '',
            },
          }).catch(() => {})
        );
      }
    }

    if (
      env.SUPABASE_URL &&
      env.SUPABASE_SERVICE_ROLE_KEY &&
      (utcDay === 0 || utcDay === 3) &&
      utcHour === 6 &&
      utcMin === 0
    ) {
      ctx.waitUntil(
        fetch(`${env.SUPABASE_URL}/rest/v1/keepalive`, {
          method: 'POST',
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({ id: 1, pinged_at: dt.toISOString() }),
        }).catch(() => {})
      );
    }
  },
};
