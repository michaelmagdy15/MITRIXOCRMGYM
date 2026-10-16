import { normalizeWhatsAppPhone } from './whatsappTemplates';

export interface InBodyScanRecord {
  id: string;
  memberId: string;
  date: string;
  weight: number; // kg
  bodyFat?: number; // PBF %
  muscleMass?: number; // SMM kg
  bodyFatMass?: number; // BFM kg
  bmi?: number; // kg/m2
  visceralFatLevel?: number; // 1 - 20
  bmr?: number; // Basal Metabolic Rate (kcal)
  totalBodyWater?: number; // L
  inbodyScore?: number; // 0 - 100
  waist?: number; // cm
  chest?: number; // cm
  arms?: number; // cm
  sheetUrl?: string;
  notes?: string;
  recordedBy?: string;
}

export interface ParsedInBodyFields {
  weight?: number;
  muscleMass?: number;
  bodyFat?: number;
  bodyFatMass?: number;
  bmi?: number;
  visceralFatLevel?: number;
  bmr?: number;
  totalBodyWater?: number;
  inbodyScore?: number;
}

/**
 * Extracts InBody 270 / 570 / 770 metrics from pasted OCR or summary text.
 */
export function parseInBodyTextReport(rawText: string): ParsedInBodyFields {
  const text = String(rawText || '');
  if (!text.trim()) return {};

  const extractNum = (patterns: RegExp[]): number | undefined => {
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m && m[1]) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) return val;
      }
    }
    return undefined;
  };

  const weight = extractNum([
    /(?:weight|wt|الوزن)(?:\s*\([^)]*\))?\s*[:=-]?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:kg)?/i,
    /(\d{2,3}(?:\.\d{1,2})?)\s*kg\s*(?:weight)/i,
  ]);

  const muscleMass = extractNum([
    /(?:skeletal\s*muscle\s*mass|smm|muscle\s*mass|العضلات)(?:\s*\([^)]*\))?\s*[:=-]?\s*(\d{1,3}(?:\.\d{1,2})?)/i,
  ]);

  const bodyFat = extractNum([
    /(?:percent\s*body\s*fat|pbf|body\s*fat\s*%|fat\s*%|نسبة\s*الدهون)(?:\s*\([^)]*\))?\s*[:=-]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%?/i,
  ]);

  const bodyFatMass = extractNum([
    /(?:body\s*fat\s*mass|bfm|fat\s*mass|كتلة\s*الدهون)(?:\s*\([^)]*\))?\s*[:=-]?\s*(\d{1,3}(?:\.\d{1,2})?)/i,
  ]);

  const bmi = extractNum([
    /(?:bmi|body\s*mass\s*index)(?:\s*\([^)]*\))?\s*[:=-]?\s*(\d{1,2}(?:\.\d{1,2})?)/i,
  ]);

  const visceralFatLevel = extractNum([
    /(?:visceral\s*fat(?:\s*level)?|vfl|الدهون\s*الحشوية)(?:\s*\([^)]*\))?\s*[:=-]?\s*(\d{1,2}(?:\.\d)?)/i,
  ]);

  const bmr = extractNum([
    /(?:basal\s*metabolic\s*rate|bmr|معدل\s*الحرق)(?:\s*\([^)]*\))?\s*[:=-]?\s*(\d{3,4})/i,
  ]);

  const totalBodyWater = extractNum([
    /(?:total\s*body\s*water|tbw)(?:\s*\([^)]*\))?\s*[:=-]?\s*(\d{2,3}(?:\.\d{1,2})?)/i,
  ]);

  const inbodyScore = extractNum([
    /(?:inbody\s*score|score|تقييم\s*انبودي)(?:\s*\([^)]*\))?\s*[:=-]?\s*(\d{2,3})\s*(?:\/\s*100|\s*points|\s*pts)?/i,
  ]);

  return {
    weight,
    muscleMass,
    bodyFat,
    bodyFatMass,
    bmi,
    visceralFatLevel,
    bmr,
    totalBodyWater,
    inbodyScore,
  };
}

export interface InBodyTransformationSummary {
  scanCount: number;
  latest: InBodyScanRecord | null;
  previous: InBodyScanRecord | null;
  baseline: InBodyScanRecord | null;
  vsPrevious: {
    weightDelta: number;
    muscleDelta: number;
    bodyFatDelta: number;
    scoreDelta: number;
  };
  vsBaseline: {
    weightDelta: number;
    muscleDelta: number;
    bodyFatDelta: number;
    scoreDelta: number;
  };
  coachingHeadline: string;
  coachingAlerts: string[];
}

/**
 * Computes transformation deltas (vs previous scan and vs first baseline scan) and coaching insights.
 */
export function computeInBodyTransformation(records: InBodyScanRecord[]): InBodyTransformationSummary {
  const sorted = [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const latest = sorted[0] || null;
  const previous = sorted[1] || null;
  const baseline = sorted.length > 0 ? sorted[sorted.length - 1]! : null;

  const diff = (a?: number, b?: number) =>
    typeof a === 'number' && typeof b === 'number' ? Number((a - b).toFixed(1)) : 0;

  const vsPrevious = {
    weightDelta: diff(latest?.weight, previous?.weight),
    muscleDelta: diff(latest?.muscleMass, previous?.muscleMass),
    bodyFatDelta: diff(latest?.bodyFat, previous?.bodyFat),
    scoreDelta: diff(latest?.inbodyScore, previous?.inbodyScore),
  };

  const vsBaseline = {
    weightDelta: diff(latest?.weight, baseline?.weight),
    muscleDelta: diff(latest?.muscleMass, baseline?.muscleMass),
    bodyFatDelta: diff(latest?.bodyFat, baseline?.bodyFat),
    scoreDelta: diff(latest?.inbodyScore, baseline?.inbodyScore),
  };

  let coachingHeadline = 'Log at least 2 InBody scans to unlock transformation analytics.';
  const coachingAlerts: string[] = [];

  if (latest) {
    if (latest.visceralFatLevel && latest.visceralFatLevel >= 10) {
      coachingAlerts.push(`Visceral Fat Level is ${latest.visceralFatLevel} (target < 10) — recommend Nutrition + HIIT.`);
    }
    if (previous) {
      if (vsPrevious.muscleDelta > 0 && vsPrevious.bodyFatDelta < 0) {
        coachingHeadline = `Elite Recomposition! +${vsPrevious.muscleDelta}kg Muscle & ${vsPrevious.bodyFatDelta}% Body Fat since last scan.`;
      } else if (vsPrevious.muscleDelta > 0) {
        coachingHeadline = `Hypertrophy Progress: +${vsPrevious.muscleDelta}kg Skeletal Muscle Mass gained.`;
      } else if (vsPrevious.bodyFatDelta < 0) {
        coachingHeadline = `Fat Loss Progress: ${vsPrevious.bodyFatDelta}% Body Fat reduction.`;
      } else {
        coachingHeadline = `Latest Scan: ${latest.weight}kg${latest.inbodyScore ? ` • InBody Score ${latest.inbodyScore}/100` : ''}`;
      }
    } else {
      coachingHeadline = `Baseline Scan Recorded: ${latest.weight}kg${latest.inbodyScore ? ` • InBody Score ${latest.inbodyScore}/100` : ''}`;
    }
  }

  return {
    scanCount: sorted.length,
    latest,
    previous,
    baseline,
    vsPrevious,
    vsBaseline,
    coachingHeadline,
    coachingAlerts,
  };
}

/**
 * Generates a 1-tap WhatsApp InBody Transformation Report for a member.
 */
export function buildWhatsAppInBodyReportUrl(params: {
  clientName: string;
  clientPhone?: string | null;
  summary: InBodyTransformationSummary;
  clubName?: string;
}): string | null {
  const phone = normalizeWhatsAppPhone(params.clientPhone);
  const latest = params.summary.latest;
  if (!phone || !latest) return null;

  const club = params.clubName || 'Inzan Athletics';
  const lines: string[] = [
    `📊 *${club} — InBody Transformation Report*`,
    ``,
    `Athlete: *${params.clientName}*`,
    `Scan Date: *${(latest.date || '').substring(0, 10)}*`,
    ``,
    `⚖️ *Weight:* ${latest.weight} kg${params.summary.vsPrevious.weightDelta ? ` (${params.summary.vsPrevious.weightDelta > 0 ? '+' : ''}${params.summary.vsPrevious.weightDelta} kg)` : ''}`,
  ];

  if (latest.muscleMass) {
    lines.push(
      `💪 *Skeletal Muscle Mass (SMM):* ${latest.muscleMass} kg${
        params.summary.vsPrevious.muscleDelta
          ? ` (${params.summary.vsPrevious.muscleDelta > 0 ? '+' : ''}${params.summary.vsPrevious.muscleDelta} kg)`
          : ''
      }`
    );
  }
  if (latest.bodyFat) {
    lines.push(
      `🔥 *Body Fat % (PBF):* ${latest.bodyFat}%${
        params.summary.vsPrevious.bodyFatDelta
          ? ` (${params.summary.vsPrevious.bodyFatDelta > 0 ? '+' : ''}${params.summary.vsPrevious.bodyFatDelta}%)`
          : ''
      }`
    );
  }
  if (latest.visceralFatLevel) {
    lines.push(`🫀 *Visceral Fat Level:* ${latest.visceralFatLevel}`);
  }
  if (latest.bmr) {
    lines.push(`⚡ *Basal Metabolic Rate (BMR):* ${latest.bmr} kcal/day`);
  }
  if (latest.inbodyScore) {
    lines.push(`🏆 *InBody Score:* ${latest.inbodyScore} / 100`);
  }

  lines.push(``, `💡 *Coach Summary:* ${params.summary.coachingHeadline}`, ``, `Keep pushing! 🚀`);

  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
}
