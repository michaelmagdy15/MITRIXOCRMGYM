import express from 'express';
import {
  getDbForRequest,
  getTenantIdForRequest,
} from '../utils/tenantDb.js';
import { convertArabicNumerals } from '../utils/phoneUtils.js';

export type BroadcastChannel = 'whatsapp' | 'sms';
export type BroadcastAudience =
  | 'active_members'
  | 'all_members'
  | 'leads_only'
  | 'all_contacts'
  | 'custom_list';

export interface TenantMessagingConfig {
  accountSid: string;
  authToken: string;
  whatsappFrom: string; // e.g. "+2010..." or "whatsapp:+2010..." or "+14155238886"
  smsFrom: string; // e.g. "INZAN" (Alphanumeric) or "+1..."
  messagingServiceSid?: string; // Optional MG... SID
  contentSid?: string; // Optional HX... Twilio Content Template SID for WhatsApp utility/event templates
  brandName: string; // e.g. "INZAN Athletics"
  updatedAt?: string;
  updatedBy?: string;
}

export interface NormalizedRecipient {
  clientId: string;
  name: string;
  firstName: string;
  phone: string; // E.164 format e.g. +201094049666
  status: string;
  branch: string;
}

// Pricing constants for Egypt (+20) via Twilio (USD)
export const EGYPT_MESSAGING_RATES_USD = {
  whatsappUtility: 0.0086, // $0.005 Twilio + $0.0036 Meta Utility rate for Egypt
  whatsappMarketing: 0.0694, // $0.005 Twilio + $0.0644 Meta Marketing rate for Egypt
  twilioFeeOnly: 0.005, // $0.005 Twilio platform fee per message
  smsStandard: 0.3959, // Twilio international/alphanumeric SMS rate for Egypt
};

/**
 * Normalizes a raw phone number into strict E.164 format (+201XXXXXXXXX for Egypt)
 * and filters out invalid/dummy test numbers so broadcasts never waste credits.
 */
export function normalizeBroadcastPhone(rawPhone?: string | null): string | null {
  if (!rawPhone) return null;
  const western = convertArabicNumerals(String(rawPhone)).trim();
  let digits = western.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  let e164 = '';
  if (digits.length === 11 && digits.startsWith('01')) {
    e164 = `+2${digits}`;
  } else if (digits.length === 10 && digits.startsWith('1')) {
    e164 = `+20${digits}`;
  } else if (digits.length === 12 && digits.startsWith('201')) {
    e164 = `+${digits}`;
  } else if (digits.length >= 10 && digits.length <= 15 && !digits.startsWith('0')) {
    e164 = `+${digits}`;
  } else {
    return null;
  }

  // Validate Egyptian mobile prefix (+2010, +2011, +2012, +2015) when country code is +20
  if (e164.startsWith('+20')) {
    if (!/^\+201[0125]\d{8}$/.test(e164)) {
      return null;
    }
    // Reject obvious placeholder/repeated-digit test numbers (e.g., +201111111111, +201000000000)
    if (/^\+201[0125](\d)\1{7}$/.test(e164)) {
      return null;
    }
  }

  return e164;
}

/**
 * Formats the outgoing message so the recipient clearly sees the sender brand ("INZAN Athletics")
 * and personalizes {memberName} / {firstName} placeholders.
 */
export function formatBrandedMessage(params: {
  body: string;
  title?: string;
  brandName: string;
  channel: BroadcastChannel;
  recipientName?: string;
  includeBrandHeader?: boolean;
}): string {
  const {
    body,
    title,
    brandName,
    channel,
    recipientName = 'Member',
    includeBrandHeader = true,
  } = params;

  const cleanName = recipientName.trim() || 'Member';
  const firstName = cleanName.split(/\s+/)[0] || cleanName;

  const replacePlaceholders = (text: string) =>
    text
      .replace(/\{memberName\}/gi, cleanName)
      .replace(/\{name\}/gi, cleanName)
      .replace(/\{firstName\}/gi, firstName)
      .replace(/\{clubName\}/gi, brandName);

  const personalizedBody = replacePlaceholders(body.trim());
  const personalizedTitle = title ? replacePlaceholders(title.trim()) : '';

  const alreadyHasBrand = personalizedBody
    .toLowerCase()
    .includes(brandName.toLowerCase());

  if (channel === 'whatsapp') {
    const lines: string[] = [];
    if (includeBrandHeader && !alreadyHasBrand) {
      lines.push(`🏋️ *${brandName}*`);
      lines.push('');
    }
    if (personalizedTitle) {
      lines.push(`📢 *${personalizedTitle}*`);
      lines.push('');
    }
    lines.push(personalizedBody);
    return lines.join('\n');
  }

  // SMS formatting (concise to minimize segment count)
  const parts: string[] = [];
  if (includeBrandHeader && !alreadyHasBrand) {
    parts.push(`${brandName}:`);
  }
  if (personalizedTitle) {
    parts.push(`${personalizedTitle} -`);
  }
  parts.push(personalizedBody);
  return parts.join(' ');
}

function getDefaultBrandName(tenantId: string): string {
  if (tenantId === 'inzanathletics' || tenantId.toLowerCase().includes('inzan')) {
    return 'INZAN Athletics';
  }
  if (tenantId === 'strike' || tenantId.toLowerCase().includes('strike')) {
    return 'STRIKE Boxing Club';
  }
  return 'Gym Administration';
}

async function loadTenantMessagingConfig(
  db: FirebaseFirestore.Firestore,
  tenantId: string
): Promise<TenantMessagingConfig> {
  const defaultBrand = getDefaultBrandName(tenantId);
  const snap = await db.collection('secrets_config').doc('twilio').get();
  const data = snap.exists ? snap.data() || {} : {};

  return {
    accountSid: String(data.accountSid || process.env.TWILIO_ACCOUNT_SID || '').trim(),
    authToken: String(data.authToken || process.env.TWILIO_AUTH_TOKEN || '').trim(),
    whatsappFrom: String(
      data.whatsappFrom ||
        process.env.TWILIO_WHATSAPP_NUMBER ||
        process.env.TWILIO_FROM_NUMBER ||
        ''
    ).trim(),
    smsFrom: String(
      data.smsFrom ||
        process.env.TWILIO_SMS_FROM ||
        process.env.TWILIO_FROM_NUMBER ||
        (tenantId.includes('inzan') ? 'INZAN' : '')
    ).trim(),
    messagingServiceSid: String(
      data.messagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID || ''
    ).trim(),
    contentSid: String(data.contentSid || process.env.TWILIO_CONTENT_SID || '').trim(),
    brandName: String(data.brandName || defaultBrand).trim() || defaultBrand,
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy,
  };
}

function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 6) return '••••••';
  return `${'•'.repeat(Math.min(12, secret.length - 4))}${secret.slice(-4)}`;
}

/**
 * Sends a single WhatsApp or SMS message via Twilio REST API.
 */
export async function sendTwilioMessage(params: {
  accountSid: string;
  authToken: string;
  to: string; // E.164 e.g. +201094049666
  channel: BroadcastChannel;
  from: string;
  messagingServiceSid?: string;
  body: string;
  contentSid?: string;
  contentVariables?: Record<string, string>;
}): Promise<{ ok: boolean; sid?: string; status?: string; error?: string; errorCode?: number }> {
  const {
    accountSid,
    authToken,
    to,
    channel,
    from,
    messagingServiceSid,
    body,
    contentSid,
    contentVariables,
  } = params;

  if (!accountSid || !authToken) {
    return { ok: false, error: 'Missing Twilio Account SID or Auth Token.' };
  }

  const normalizedTo = normalizeBroadcastPhone(to);
  if (!normalizedTo) {
    return { ok: false, error: `Invalid destination phone number: ${to}` };
  }

  const formattedTo =
    channel === 'whatsapp'
      ? `whatsapp:${normalizedTo}`
      : normalizedTo;

  let formattedFrom = from.trim();
  if (channel === 'whatsapp' && formattedFrom && !formattedFrom.startsWith('whatsapp:')) {
    const cleanFrom = normalizeBroadcastPhone(formattedFrom) || formattedFrom;
    formattedFrom = `whatsapp:${cleanFrom}`;
  }

  const formParams = new URLSearchParams();
  formParams.set('To', formattedTo);

  if (messagingServiceSid && messagingServiceSid.startsWith('MG')) {
    formParams.set('MessagingServiceSid', messagingServiceSid);
    if (channel === 'whatsapp' && formattedFrom) {
      formParams.set('From', formattedFrom);
    }
  } else if (formattedFrom) {
    formParams.set('From', formattedFrom);
  } else {
    return {
      ok: false,
      error:
        channel === 'whatsapp'
          ? 'Missing WhatsApp Sender Number (e.g. +201... or Twilio WhatsApp sender).'
          : 'Missing SMS Sender ID or From Number.',
    };
  }

  if (channel === 'whatsapp' && contentSid && contentSid.startsWith('HX')) {
    formParams.set('ContentSid', contentSid);
    if (contentVariables && Object.keys(contentVariables).length > 0) {
      formParams.set('ContentVariables', JSON.stringify(contentVariables));
    }
  } else {
    formParams.set('Body', body);
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    accountSid
  )}/Messages.json`;
  const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: formParams.toString(),
    });

    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = Number(data?.code) || response.status;
      let friendlyHint = '';
      if (code === 63016) {
        friendlyHint =
          ' (Outside 24h window: Meta requires an approved Utility/Event Content Template SID starting with HX...)';
      } else if (code === 21608) {
        friendlyHint =
          ' (Twilio Trial Account: upgrade Twilio account or verify recipient number)';
      } else if (code === 63112) {
        friendlyHint =
          ' (Meta WABA disabled: connect a clean WhatsApp Business Account in Twilio Console)';
      }
      return {
        ok: false,
        errorCode: code,
        error: `${data?.message || `Twilio HTTP ${response.status}`}${friendlyHint}`,
      };
    }

    return {
      ok: true,
      sid: data.sid,
      status: data.status || 'queued',
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Network error connecting to Twilio API',
    };
  }
}

/**
 * Collects and deduplicates valid member/contact recipients from the tenant database.
 */
async function collectAudienceRecipients(
  db: FirebaseFirestore.Firestore,
  audience: BroadcastAudience,
  branchFilter?: string,
  customNumbersRaw?: string
): Promise<{
  recipients: NormalizedRecipient[];
  counts: {
    activeMembers: number;
    allMembers: number;
    leadsOnly: number;
    allContacts: number;
  };
}> {
  const snap = await db.collection('clients').get();

  const activeMap = new Map<string, NormalizedRecipient>();
  const allMembersMap = new Map<string, NormalizedRecipient>();
  const leadsMap = new Map<string, NormalizedRecipient>();
  const allContactsMap = new Map<string, NormalizedRecipient>();

  const normalizedBranchFilter =
    branchFilter && branchFilter !== 'ALL' ? branchFilter.trim().toLowerCase() : null;

  snap.forEach((docSnap) => {
    const d = docSnap.data();
    if (!d || d.isDeleted) return;

    if (normalizedBranchFilter) {
      const clientBranch = String(d.branch || d.homeBranch || '').trim().toLowerCase();
      if (clientBranch !== normalizedBranchFilter) return;
    }

    const phone =
      normalizeBroadcastPhone(d.phone) ||
      normalizeBroadcastPhone(d.normalized_phone) ||
      normalizeBroadcastPhone(d.backupPhone);
    if (!phone) return;

    const name = String(d.name || 'Member').trim() || 'Member';
    const firstName = name.split(/\s+/)[0] || 'Member';
    const status = String(d.status || 'Active').trim();
    const statusLower = status.toLowerCase();
    const branch = String(d.branch || d.homeBranch || 'MAIN').trim();

    const rec: NormalizedRecipient = {
      clientId: docSnap.id,
      name,
      firstName,
      phone,
      status,
      branch,
    };

    // Prioritize Active member records when deduplicating across the database
    const existingAll = allContactsMap.get(phone);
    if (!existingAll || statusLower === 'active') {
      allContactsMap.set(phone, rec);
    }

    if (statusLower === 'lead') {
      if (!leadsMap.has(phone)) {
        leadsMap.set(phone, rec);
      }
    } else {
      const existingMember = allMembersMap.get(phone);
      if (!existingMember || statusLower === 'active') {
        allMembersMap.set(phone, rec);
      }
      if (statusLower === 'active' || statusLower === 'nearly expired') {
        activeMap.set(phone, rec);
      }
    }
  });

  let selectedRecipients: NormalizedRecipient[] = [];
  if (audience === 'custom_list') {
    const customMap = new Map<string, NormalizedRecipient>();
    const rawTokens = String(customNumbersRaw || '')
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const token of rawTokens) {
      const p = normalizeBroadcastPhone(token);
      if (p && !customMap.has(p)) {
        const known = allContactsMap.get(p);
        customMap.set(
          p,
          known || {
            clientId: 'custom',
            name: 'Member',
            firstName: 'Member',
            phone: p,
            status: 'Custom',
            branch: 'ALL',
          }
        );
      }
    }
    selectedRecipients = Array.from(customMap.values());
  } else if (audience === 'active_members') {
    selectedRecipients = Array.from(activeMap.values());
  } else if (audience === 'all_members') {
    selectedRecipients = Array.from(allMembersMap.values());
  } else if (audience === 'leads_only') {
    selectedRecipients = Array.from(leadsMap.values());
  } else {
    selectedRecipients = Array.from(allContactsMap.values());
  }

  return {
    recipients: selectedRecipients,
    counts: {
      activeMembers: activeMap.size,
      allMembers: allMembersMap.size,
      leadsOnly: leadsMap.size,
      allContacts: allContactsMap.size,
    },
  };
}

export function createMessagingBroadcastRouter(
  requireAuthMiddleware: express.RequestHandler
): express.Router {
  const router = express.Router();

  const ensureAdminOrManager = async (
    req: express.Request,
    res: express.Response
  ): Promise<{ db: FirebaseFirestore.Firestore; tenantId: string; callerEmail: string; callerName: string } | null> => {
    const db = await getDbForRequest(req);
    const tenantId = await getTenantIdForRequest(req);
    const user = (req as any).user;
    if (!user?.uid) {
      res.status(401).json({ error: 'Unauthorized' });
      return null;
    }

    const callerEmail = String(user.email || '').toLowerCase();
    const isSuper = callerEmail === 'michaelmitry13@gmail.com';
    let role = String(user.role || '').toLowerCase();
    let callerName = String(user.name || user.email || 'Admin');

    if (!isSuper) {
      const userDoc = await db.collection('users').doc(user.uid).get();
      const userData = userDoc.data() || {};
      role = String(userData.role || role).toLowerCase();
      callerName = String(userData.name || callerName);
      const allowedRoles = ['admin', 'super_admin', 'crm_admin', 'manager', 'owner', 'sales_manager'];
      if (!allowedRoles.includes(role) && !userData.can_access_settings_and_history) {
        res.status(403).json({ error: 'Forbidden: Only administrators and managers can manage broadcasts.' });
        return null;
      }
    }

    return { db, tenantId, callerEmail, callerName };
  };

  /**
   * GET /api/messaging/config
   * Returns masked Twilio credentials, default sender branding, and live deduplicated audience counts + cost estimates.
   */
  router.get('/config', requireAuthMiddleware, async (req, res) => {
    try {
      const ctx = await ensureAdminOrManager(req, res);
      if (!ctx) return;

      const config = await loadTenantMessagingConfig(ctx.db, ctx.tenantId);
      const branchFilter = req.query.branch ? String(req.query.branch) : undefined;
      const { counts } = await collectAudienceRecipients(
        ctx.db,
        'active_members',
        branchFilter
      );

      return res.json({
        tenantId: ctx.tenantId,
        config: {
          accountSid: config.accountSid,
          hasAuthToken: Boolean(config.authToken),
          authTokenMasked: maskSecret(config.authToken),
          whatsappFrom: config.whatsappFrom,
          smsFrom: config.smsFrom,
          messagingServiceSid: config.messagingServiceSid || '',
          contentSid: config.contentSid || '',
          brandName: config.brandName,
          updatedAt: config.updatedAt || null,
          updatedBy: config.updatedBy || null,
        },
        audienceCounts: counts,
        pricingUsd: EGYPT_MESSAGING_RATES_USD,
      });
    } catch (err: any) {
      console.error('[API Messaging] Error loading config:', err);
      return res.status(500).json({ error: err.message || 'Failed to load messaging config' });
    }
  });

  /**
   * POST /api/messaging/config
   * Saves per-tenant Twilio credentials securely in secrets_config/twilio.
   */
  router.post('/config', requireAuthMiddleware, async (req, res) => {
    try {
      const ctx = await ensureAdminOrManager(req, res);
      if (!ctx) return;

      const existing = await loadTenantMessagingConfig(ctx.db, ctx.tenantId);
      const {
        accountSid,
        authToken,
        whatsappFrom,
        smsFrom,
        messagingServiceSid,
        contentSid,
        brandName,
      } = req.body || {};

      const nowIso = new Date().toISOString();
      const updatedConfig: TenantMessagingConfig = {
        accountSid:
          accountSid !== undefined ? String(accountSid).trim() : existing.accountSid,
        // Keep existing token if client didn't type a new one or sent the masked placeholder
        authToken:
          authToken && !String(authToken).includes('•')
            ? String(authToken).trim()
            : existing.authToken,
        whatsappFrom:
          whatsappFrom !== undefined ? String(whatsappFrom).trim() : existing.whatsappFrom,
        smsFrom: smsFrom !== undefined ? String(smsFrom).trim() : existing.smsFrom,
        messagingServiceSid:
          messagingServiceSid !== undefined
            ? String(messagingServiceSid).trim()
            : existing.messagingServiceSid,
        contentSid:
          contentSid !== undefined ? String(contentSid).trim() : existing.contentSid,
        brandName:
          brandName !== undefined && String(brandName).trim()
            ? String(brandName).trim()
            : existing.brandName,
        updatedAt: nowIso,
        updatedBy: ctx.callerEmail || ctx.callerName,
      };

      await ctx.db.collection('secrets_config').doc('twilio').set(updatedConfig, { merge: true });

      return res.json({
        success: true,
        config: {
          accountSid: updatedConfig.accountSid,
          hasAuthToken: Boolean(updatedConfig.authToken),
          authTokenMasked: maskSecret(updatedConfig.authToken),
          whatsappFrom: updatedConfig.whatsappFrom,
          smsFrom: updatedConfig.smsFrom,
          messagingServiceSid: updatedConfig.messagingServiceSid || '',
          contentSid: updatedConfig.contentSid || '',
          brandName: updatedConfig.brandName,
          updatedAt: updatedConfig.updatedAt,
          updatedBy: updatedConfig.updatedBy,
        },
      });
    } catch (err: any) {
      console.error('[API Messaging] Error saving config:', err);
      return res.status(500).json({ error: err.message || 'Failed to save messaging config' });
    }
  });

  /**
   * POST /api/messaging/test
   * Sends an immediate test WhatsApp or SMS message to a single phone number.
   */
  router.post('/test', requireAuthMiddleware, async (req, res) => {
    try {
      const ctx = await ensureAdminOrManager(req, res);
      if (!ctx) return;

      const saved = await loadTenantMessagingConfig(ctx.db, ctx.tenantId);
      const {
        to,
        message,
        title,
        channel = 'whatsapp',
        accountSid,
        authToken,
        whatsappFrom,
        smsFrom,
        messagingServiceSid,
        contentSid,
        brandName,
        useTemplate = false,
      } = req.body || {};

      if (!to) {
        return res.status(400).json({ error: 'Test phone number is required.' });
      }

      const effectiveSid = (accountSid || saved.accountSid || '').trim();
      const effectiveToken =
        authToken && !String(authToken).includes('•')
          ? String(authToken).trim()
          : saved.authToken;
      const effectiveBrand = (brandName || saved.brandName || getDefaultBrandName(ctx.tenantId)).trim();
      const effectiveChannel: BroadcastChannel = channel === 'sms' ? 'sms' : 'whatsapp';
      const effectiveFrom =
        effectiveChannel === 'whatsapp'
          ? (whatsappFrom ?? saved.whatsappFrom)
          : (smsFrom ?? saved.smsFrom);
      const effectiveMgSid = (messagingServiceSid ?? saved.messagingServiceSid) || '';
      const effectiveContentSid = useTemplate ? ((contentSid ?? saved.contentSid) || '') : '';

      const formattedBody = formatBrandedMessage({
        body: message || `This is a live test broadcast from ${effectiveBrand}.`,
        title,
        brandName: effectiveBrand,
        channel: effectiveChannel,
        recipientName: ctx.callerName || 'Member',
        includeBrandHeader: true,
      });

      const result = await sendTwilioMessage({
        accountSid: effectiveSid,
        authToken: effectiveToken,
        to: String(to),
        channel: effectiveChannel,
        from: effectiveFrom,
        messagingServiceSid: effectiveMgSid,
        body: formattedBody,
        contentSid: effectiveContentSid || undefined,
        contentVariables: effectiveContentSid
          ? {
              '1': ctx.callerName || 'Member',
              '2': (message || formattedBody).trim(),
            }
          : undefined,
      });

      if (!result.ok) {
        return res.status(400).json({
          success: false,
          error: result.error,
          errorCode: result.errorCode,
        });
      }

      return res.json({
        success: true,
        sid: result.sid,
        status: result.status,
        formattedPreview: formattedBody,
      });
    } catch (err: any) {
      console.error('[API Messaging] Error sending test message:', err);
      return res.status(500).json({ error: err.message || 'Failed to send test message' });
    }
  });

  /**
   * POST /api/messaging/broadcast
   * Executes (or dry-runs) a bulk WhatsApp or SMS broadcast to the selected member audience.
   */
  router.post('/broadcast', requireAuthMiddleware, async (req, res) => {
    try {
      const ctx = await ensureAdminOrManager(req, res);
      if (!ctx) return;

      const saved = await loadTenantMessagingConfig(ctx.db, ctx.tenantId);
      const {
        title = '',
        message = '',
        channel = 'whatsapp',
        audience = 'active_members',
        branch = 'ALL',
        customNumbers = '',
        useTemplate = false,
        contentSid: overrideContentSid,
        brandName: overrideBrandName,
        dryRun = false,
      } = req.body || {};

      if (!message || !String(message).trim()) {
        return res.status(400).json({ error: 'Broadcast message body is required.' });
      }

      const effectiveChannel: BroadcastChannel = channel === 'sms' ? 'sms' : 'whatsapp';
      const effectiveAudience: BroadcastAudience = [
        'active_members',
        'all_members',
        'leads_only',
        'all_contacts',
        'custom_list',
      ].includes(audience)
        ? audience
        : 'active_members';

      const effectiveBrand =
        (overrideBrandName || saved.brandName || getDefaultBrandName(ctx.tenantId)).trim();
      const effectiveContentSid = useTemplate
        ? (overrideContentSid ?? saved.contentSid ?? '').trim()
        : '';

      const { recipients } = await collectAudienceRecipients(
        ctx.db,
        effectiveAudience,
        branch,
        customNumbers
      );

      const unitRateUsd =
        effectiveChannel === 'whatsapp'
          ? EGYPT_MESSAGING_RATES_USD.whatsappUtility
          : EGYPT_MESSAGING_RATES_USD.smsStandard;
      const estimatedCostUsd = Number((recipients.length * unitRateUsd).toFixed(2));

      const sampleFormatted = formatBrandedMessage({
        body: String(message),
        title: String(title),
        brandName: effectiveBrand,
        channel: effectiveChannel,
        recipientName: recipients[0]?.name || 'Ahmed',
        includeBrandHeader: true,
      });

      if (dryRun) {
        return res.json({
          success: true,
          dryRun: true,
          recipientCount: recipients.length,
          estimatedCostUsd,
          sampleFormatted,
          sampleRecipients: recipients.slice(0, 10),
        });
      }

      if (!saved.accountSid || !saved.authToken) {
        return res.status(400).json({
          error:
            'Twilio credentials are not saved yet. Please enter your Twilio Account SID and Auth Token first.',
        });
      }

      const effectiveFromRaw =
        effectiveChannel === 'whatsapp' ? saved.whatsappFrom : saved.smsFrom;
      const fromSendersPool = String(effectiveFromRaw || '')
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (fromSendersPool.length === 0 && !saved.messagingServiceSid) {
        return res.status(400).json({
          error:
            effectiveChannel === 'whatsapp'
              ? 'WhatsApp Sender Number is required in Twilio configuration.'
              : 'SMS Sender ID / From Number is required in Twilio configuration.',
        });
      }

      if (recipients.length === 0) {
        return res.status(400).json({
          error: 'No valid phone numbers found for the selected audience.',
        });
      }

      // Send in controlled concurrent batches of 15 to respect Twilio API rate limits.
      // Supports multiple comma-separated WhatsApp Sender numbers (e.g. 3 portfolios × 250 = 750/day)
      // with automatic failover if a sender hits Meta Tier-0 limit (63018).
      const BATCH_SIZE = 15;
      let sentCount = 0;
      let failedCount = 0;
      const exhaustedSenders = new Set<string>();
      const errors: { phone: string; name: string; error: string }[] = [];

      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (r, batchIdx) => {
            const globalIdx = i + batchIdx;
            const personalizedBody = formatBrandedMessage({
              body: String(message),
              title: String(title),
              brandName: effectiveBrand,
              channel: effectiveChannel,
              recipientName: r.name,
              includeBrandHeader: true,
            });

            const activePool =
              fromSendersPool.filter((s) => !exhaustedSenders.has(s)).length > 0
                ? fromSendersPool.filter((s) => !exhaustedSenders.has(s))
                : fromSendersPool;

            // Assign ~245 recipients per sender number before moving to the next sender in the pool
            const primaryIdx =
              activePool.length > 0
                ? Math.min(Math.floor(globalIdx / 245), activePool.length - 1)
                : 0;
            const candidateSenders =
              activePool.length > 0
                ? [
                    activePool[primaryIdx],
                    ...activePool.filter((_, idx) => idx !== primaryIdx),
                  ]
                : [''];

            let lastRes: Awaited<ReturnType<typeof sendTwilioMessage>> | null = null;
            for (const senderFrom of candidateSenders) {
              const sendRes = await sendTwilioMessage({
                accountSid: saved.accountSid,
                authToken: saved.authToken,
                to: r.phone,
                channel: effectiveChannel,
                from: senderFrom || '',
                messagingServiceSid: saved.messagingServiceSid,
                body: personalizedBody,
                contentSid: effectiveContentSid || undefined,
                contentVariables: effectiveContentSid
                  ? {
                      '1': r.firstName || r.name || 'Member',
                      '2': String(message).trim(),
                    }
                  : undefined,
              });
              lastRes = sendRes;
              if (sendRes.ok) {
                break;
              }
              // If this sender hit Meta's 250-conversation portfolio limit (63018), mark it exhausted and failover
              if (sendRes.errorCode === 63018 && senderFrom) {
                exhaustedSenders.add(senderFrom);
                continue;
              }
              break;
            }

            return {
              recipient: r,
              sendRes: lastRes || { ok: false, error: 'No sender available' },
            };
          })
        );

        for (const item of results) {
          if (item.sendRes.ok) {
            sentCount++;
          } else {
            failedCount++;
            if (errors.length < 15) {
              errors.push({
                phone: item.recipient.phone,
                name: item.recipient.name,
                error: item.sendRes.error || 'Unknown error',
              });
            }
          }
        }

        // Brief 120ms pause between batches to avoid rate-limit spikes
        if (i + BATCH_SIZE < recipients.length) {
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
      }

      const nowIso = new Date().toISOString();
      const logRef = ctx.db.collection('broadcastLogs').doc();
      const logRecord = {
        id: logRef.id,
        tenantId: ctx.tenantId,
        channel: effectiveChannel,
        audience: effectiveAudience,
        branch: branch || 'ALL',
        brandName: effectiveBrand,
        title: String(title).trim(),
        message: String(message).trim(),
        usedTemplateSid: effectiveContentSid || null,
        totalRecipients: recipients.length,
        sentCount,
        failedCount,
        estimatedCostUsd,
        sampleErrors: errors,
        createdAt: nowIso,
        sentBy: ctx.callerEmail || ctx.callerName,
      };

      await logRef.set(logRecord);

      return res.json({
        success: true,
        broadcastId: logRef.id,
        totalRecipients: recipients.length,
        sentCount,
        failedCount,
        estimatedCostUsd,
        sampleErrors: errors,
      });
    } catch (err: any) {
      console.error('[API Messaging] Broadcast error:', err);
      return res.status(500).json({ error: err.message || 'Broadcast execution failed' });
    }
  });

  /**
   * GET /api/messaging/history
   * Returns the 20 most recent WhatsApp/SMS broadcast campaigns for this tenant.
   */
  router.get('/history', requireAuthMiddleware, async (req, res) => {
    try {
      const ctx = await ensureAdminOrManager(req, res);
      if (!ctx) return;

      const snap = await ctx.db
        .collection('broadcastLogs')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      const history = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.json({ history });
    } catch (err: any) {
      console.error('[API Messaging] History error:', err);
      return res.status(500).json({ error: err.message || 'Failed to load broadcast history' });
    }
  });

  return router;
}
