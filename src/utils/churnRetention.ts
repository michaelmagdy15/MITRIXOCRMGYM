import type { Attendance, Client, Payment } from '../types';
import { normalizeWhatsAppPhone } from './whatsappTemplates';

export type ChurnRiskType = 'INACTIVE_14_DAYS' | 'EXPIRING_7_DAYS' | 'OVERDUE_BALANCE';

export interface ChurnRiskMemberItem {
  member: Client;
  riskType: ChurnRiskType;
  daysSinceLastVisit: number | null;
  daysUntilExpiry: number | null;
  unpaidAmount: number;
  urgencyScore: number; // higher = more urgent
}

/**
 * Scans active members to identify:
 * 1. Members who haven't checked in for >= 14 days ("We Miss You" churn risk)
 * 2. Members whose package expires within <= 7 days ("Renewal Radar")
 * 3. Members with remaining unpaid balance ("Installment Collection Radar")
 */
export function computeChurnRiskMembers(
  clients: Client[],
  attendances: Attendance[],
  payments: Payment[],
  now: Date = new Date()
): ChurnRiskMemberItem[] {
  const lastVisitByClient = new Map<string, number>();
  for (const att of attendances) {
    if (!att.clientId || !att.date) continue;
    const ms = new Date(att.date).getTime();
    if (!isNaN(ms)) {
      const prev = lastVisitByClient.get(att.clientId) || 0;
      if (ms > prev) lastVisitByClient.set(att.clientId, ms);
    }
  }

  const unpaidByClient = new Map<string, number>();
  for (const p of payments) {
    if (p.deleted_at || p.status === 'refunded') continue;
    const rem = Math.max(0, Number(p.amount || 0) - Number(p.amount_paid ?? p.amount ?? 0));
    if (rem > 0) {
      unpaidByClient.set(p.clientId, (unpaidByClient.get(p.clientId) || 0) + rem);
    }
  }

  const results: ChurnRiskMemberItem[] = [];
  const nowMs = now.getTime();
  const dayMs = 1000 * 60 * 60 * 24;

  for (const client of clients) {
    if (client.isDeleted || client.status === 'Lead') continue;

    const lastVisitMs = lastVisitByClient.get(client.id);
    const daysSinceLastVisit = lastVisitMs
      ? Math.max(0, Math.floor((nowMs - lastVisitMs) / dayMs))
      : null;

    const activePkg = (client.packages || []).find((p) => p.status === 'Active');
    const expiryStr = activePkg?.endDate || client.membershipExpiry;
    let daysUntilExpiry: number | null = null;
    if (expiryStr) {
      const expMs = new Date(expiryStr).getTime();
      if (!isNaN(expMs)) {
        daysUntilExpiry = Math.ceil((expMs - nowMs) / dayMs);
      }
    }

    const unpaidAmount = unpaidByClient.get(client.id) || 0;

    if (client.status === 'Active' && daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= 7) {
      results.push({
        member: client,
        riskType: 'EXPIRING_7_DAYS',
        daysSinceLastVisit,
        daysUntilExpiry,
        unpaidAmount,
        urgencyScore: 90 - daysUntilExpiry,
      });
    } else if (client.status === 'Active' && daysSinceLastVisit !== null && daysSinceLastVisit >= 14) {
      results.push({
        member: client,
        riskType: 'INACTIVE_14_DAYS',
        daysSinceLastVisit,
        daysUntilExpiry,
        unpaidAmount,
        urgencyScore: Math.min(85, 50 + daysSinceLastVisit),
      });
    } else if (unpaidAmount > 0) {
      results.push({
        member: client,
        riskType: 'OVERDUE_BALANCE',
        daysSinceLastVisit,
        daysUntilExpiry,
        unpaidAmount,
        urgencyScore: 75,
      });
    }
  }

  return results.sort((a, b) => b.urgencyScore - a.urgencyScore);
}

/**
 * Builds a 1-tap Bilingual (English or Arabic) WhatsApp outreach URL for a churn-risk member.
 */
export function buildWhatsAppRetentionOutreachUrl(params: {
  item: ChurnRiskMemberItem;
  clubName?: string;
  lang?: 'en' | 'ar';
}): string | null {
  const defaultClub = (typeof window !== 'undefined' && window.location.hostname.toLowerCase().includes('strike')) ? 'STRIKE' : 'Inzan Athletics';
  const { item, clubName = defaultClub, lang = 'en' } = params;
  const phone = normalizeWhatsAppPhone(item.member.phone);
  if (!phone) return null;

  const name = item.member.name;
  let text = '';

  if (lang === 'ar') {
    if (item.riskType === 'INACTIVE_14_DAYS') {
      text = `أهلاً بك يا *${name}* 👋\n\nافتقدناك في *${clubName}*! لاحظنا عدم حضورك منذ *${item.daysSinceLastVisit} يوم*.\nننتظرك هذا الأسبوع لمواصلة تمرينك وتحقيق أهدافك الرياضية 💪🔥`;
    } else if (item.riskType === 'EXPIRING_7_DAYS') {
      text = `أهلاً بك يا *${name}* 👋\n\nتذكير ودي من *${clubName}*: باقتك الحالية تنتهي خلال *${item.daysUntilExpiry} أيام*.\nيمكنك التجديد الآن عن طريق *InstaPay* أو في الاستقبال للحفاظ على استمرارية تمرينك! 💪`;
    } else {
      text = `أهلاً بك يا *${name}* 👋\n\nتذكير ودي من إدارة *${clubName}* بوجود دفعة مستحقة بقيمة *${item.unpaidAmount.toLocaleString()} ج.م*.\nيمكنك السداد عبر *InstaPay* أو في الاستقبال. شكراً لك! 🙏`;
    }
  } else {
    if (item.riskType === 'INACTIVE_14_DAYS') {
      text = `Hey *${name}* 👋\n\nWe miss seeing you at *${clubName}*! It's been *${item.daysSinceLastVisit} days* since your last check-in.\nBook your next session or drop in this week — your coaches are ready for you! 💪🔥`;
    } else if (item.riskType === 'EXPIRING_7_DAYS') {
      text = `Hi *${name}* 👋\n\nFriendly heads-up from *${clubName}*: your membership expires in *${item.daysUntilExpiry} day${item.daysUntilExpiry === 1 ? '' : 's'}*.\nReply here to renew via *InstaPay* or visit reception to keep your streak alive! 🔥`;
    } else {
      text = `Hello *${name}* 👋\n\nFriendly reminder from *${clubName}* regarding your remaining installment balance of *${item.unpaidAmount.toLocaleString()} EGP*.\nYou can settle it easily via *InstaPay* or at reception. Thank you! 🙏`;
    }
  }

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
