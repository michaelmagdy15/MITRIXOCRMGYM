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
        fetch(`${gatewayOrigin}/api/cron/membership-expiration`, {
          method: 'POST',
          headers: {
            'x-cron-secret': env.CRON_SECRET || '',
          },
        }).catch(() => {})
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
