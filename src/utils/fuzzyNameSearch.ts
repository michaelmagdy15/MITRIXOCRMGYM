/**
 * Inzan Tenant CRM — Fault-Tolerant Fuzzy & Phonetic Name Search Engine
 *
 * Combines four complementary retrieval layers without destructive auto-correction:
 *   1. Exact & Normalized Token Matching (Unicode NFD + Arabic/Franco-Arabic normalization)
 *   2. Canonical Cultural Transliteration Equivalence (MENA / Arabic-to-English name mappings)
 *   3. Double Metaphone Phonetic Encoding (captures "Michael" vs "Mikael", "Carol" vs "Carole")
 *   4. Length-Bounded Damerau-Levenshtein Distance + Padded Trigram Dice Similarity
 *      with Consonant-Skeleton Guardrails (prevents "Jon" <-> "Joe" false positives)
 */

export type SearchMatchTier =
  | 'exact'
  | 'prefix_or_substring'
  | 'transliteration_or_phonetic'
  | 'fuzzy_edit_or_ngram'
  | 'none';

export interface FuzzyNameMatchResult {
  matched: boolean;
  /** Composite confidence score on a 0..100 scale. Cutoff threshold is 55. */
  score: number;
  tier: SearchMatchTier;
  /** Number of query tokens that matched candidate tokens. */
  matchedTokens: number;
  totalQueryTokens: number;
}

export interface SearchIndexDocumentTokens {
  normalizedFull: string;
  tokens: string[];
  canonicalTokens: string[];
  phoneticKeys: string[];
  trigrams: string[];
}

export const MINIMUM_CONFIDENCE_THRESHOLD = 55;

/**
 * Canonical MENA / Arabic-to-English transliteration equivalence groups.
 * Maps diverse valid spellings to a shared canonical root for Tier-3 phonetic/transliteration scoring,
 * while NEVER overwriting or auto-correcting the stored or searched string.
 */
const TRANSLITERATION_EQUIVALENCE_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ['mohamed', 'mohammed', 'muhammad', 'mohamad', 'muhamed', 'mohammad', 'muhammed', 'mhmd', 'محمد'],
  ['ahmed', 'ahmad', 'ahmd', 'احمد'],
  ['mahmoud', 'mahmood', 'mahmud', 'محمود'],
  ['mostafa', 'mustafa', 'moustafa', 'mostapha', 'مصطفى', 'مصطفي'],
  ['youssef', 'yousef', 'yusuf', 'yusef', 'youssif', 'yousuf', 'josef', 'يوسف'],
  ['abdelrahman', 'abdulrahman', 'abdalrahman', 'abdurrahman', 'عبدالرحمن'],
  ['abdelaziz', 'abdulaziz', 'abdalaziz', 'عبدالعزيز'],
  ['abdelhamid', 'abdulhamid', 'عبدالحميد'],
  ['abdelkader', 'abdulkader', 'abdelqader', 'عبدالقادر'],
  ['abdallah', 'abdullah', 'abdalla', 'عبدالله'],
  ['khaled', 'khalid', 'خالد'],
  ['tarek', 'tarik', 'tariq', 'طارق'],
  ['hassan', 'hasan', 'حسن'],
  ['hussein', 'hussain', 'hossein', 'husein', 'حسين'],
  ['omar', 'umar', 'عمر'],
  ['amr', 'amro', 'عمرو'],
  ['ali', 'aly', 'علي', 'على'],
  ['osama', 'oussama', 'usama', 'اسامه'],
  ['kareem', 'karim', 'كريم'],
  ['sherif', 'shareef', 'cherif', 'شريف'],
  ['hossam', 'hosam', 'hussam', 'حسام'],
  ['walid', 'waleed', 'وليد'],
  ['ziad', 'zeyad', 'ziyad', 'زياد'],
  ['eyad', 'iyad', 'اياد'],
  ['seif', 'saif', 'سيف'],
  ['marwan', 'marawan', 'مروان'],
  ['ibrahim', 'ebrahim', 'ابراهيم'],
  ['ismail', 'esmail', 'اسماعيل'],
  ['eslam', 'islam', 'اسلام'],
  ['ehab', 'ihab', 'ايهاب'],
  ['emad', 'imad', 'عماد'],
  ['habiba', 'habeeba', 'حبيبه'],
  ['farida', 'fareeda', 'فريده'],
  ['salma', 'selma', 'سلمى', 'سلمي'],
  ['mariam', 'maryam', 'meriam', 'miriam', 'مريم'],
  ['fatma', 'fatima', 'fatimah', 'فاطمه'],
  ['aisha', 'aysha', 'aicha', 'عائشه'],
  ['nour', 'noor', 'nur', 'نور'],
  ['nourhan', 'norhan', 'nurhan', 'نورهان'],
  ['yasmin', 'yasmine', 'yasmeen', 'jasmine', 'ياسمين'],
  ['zeina', 'zina', 'zayna', 'زينه'],
  ['layla', 'laila', 'leila', 'ليلى', 'ليلي'],
  ['sara', 'sarah', 'ساره'],
  ['hana', 'hanna', 'hannah', 'هنا'],
  ['michael', 'mikael', 'micheal', 'michal', 'mikhael', 'mykhailo', 'mikel', 'mikaeel', 'michell', 'micael', 'mikhal', 'mikaell', 'مايكل'],
  ['carol', 'carole', 'karol', 'caroll', 'karole', 'كارول'],
  ['catherine', 'katherine', 'kathryn', 'cathryn', 'katrine'],
  ['steven', 'stephen', 'stefan', 'stephan'],
  ['philip', 'phillip', 'filip', 'fillip'],
  ['jon', 'john', 'jonathan', 'johnathan'],
];

const TRANSLITERATION_MAP: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const group of TRANSLITERATION_EQUIVALENCE_GROUPS) {
    const canonical = group[0]!;
    for (const variant of group) {
      map.set(variant, canonical);
    }
  }
  return map;
})();

/**
 * Normalizes Arabic script & Latin diacritics, collapses compound prefixes ("Abd El-Rahman" -> "abdelrahman"),
 * and strips punctuation while preserving alphanumeric and Arabic letters.
 */
export function normalizeSearchName(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw)
    .normalize('NFD')
    // Strip Latin combining diacritical marks
    .replace(/[\u0300-\u036f]/g, '')
    // Strip Arabic tashkeel / harakat and tatweel
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    // Unify Arabic Alef variants (أ إ آ ٱ -> ا)
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    // Unify Teh Marbuta (ة -> ه)
    .replace(/\u0629/g, '\u0647')
    // Unify Alef Maksura (ى -> ي)
    .replace(/\u0649/g, '\u064A')
    // Unify Hamza on Waw/Yeh
    .replace(/\u0624/g, '\u0648')
    .replace(/\u0626/g, '\u064A')
    .toLowerCase();

  // Coalesce common Arabic-English compound prefixes so "Abd El Rahman" and "Abdelrahman" align
  s = s
    .replace(/\babd[\s-]+(?:el|al|ul|ur|er)[\s-]+/g, 'abdel')
    .replace(/\b(?:el|al)[\s-]+([a-z]{3,})/g, 'el$1')
    .replace(/\b\u0639\u0628\u062F[\s-]+(\u0627\u0644)/g, '\u0639\u0628\u062F$1');

  // Replace hyphens, apostrophes, and punctuation with spaces, then collapse whitespace
  s = s
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return s;
}

/**
 * Splits a normalized name into distinct tokens.
 */
export function tokenizeSearchName(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

/**
 * Returns the canonical transliteration key for a token if known, or collapses
 * repeated vowels/consonants in transliterated names (e.g. "mikaeel" -> "mikael").
 */
export function getCanonicalTransliterationToken(token: string): string {
  const mapped = TRANSLITERATION_MAP.get(token);
  if (mapped) return mapped;

  // Normalize common vowel/consonant runs in Franco-Arabic / Latin transliterations
  const squeezed = token
    .replace(/aa+/g, 'a')
    .replace(/ee+/g, 'i')
    .replace(/oo+/g, 'u')
    .replace(/ou/g, 'u')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/ph/g, 'f')
    .replace(/([bcdfghjklmnpqrstvwxz])\1+/g, '$1');

  return TRANSLITERATION_MAP.get(squeezed) || squeezed;
}

/**
 * Generates primary and secondary phonetic keys (Double Metaphone inspired,
 * tuned for English + European + Arabic-transliterated personal names).
 *
 * Examples:
 *   "Michael", "Mikael", "Micheal", "Mikhael", "Mykhailo" -> ["MKL", "MKL"]
 *   "Carol", "Carole", "Karol", "Caroll"                  -> ["KRL", "KRL"]
 *   "Jon", "John"                                         -> ["JN", "JN"]
 *   "Joe"                                                 -> ["J", "J"]
 */
export function computePhoneticKeys(token: string): [string, string] {
  if (!token) return ['', ''];

  // If token is in Arabic script, transliterate consonant skeleton to phonetic key
  if (/[\u0600-\u06FF]/.test(token)) {
    const arabicSkeleton = token
      .replace(/\u0627/g, '') // drop medial/initial alef vowel carrier
      .replace(/[\u0648\u064A]/g, ''); // drop long vowels waw/yeh for skeleton
    return [arabicSkeleton || token, arabicSkeleton || token];
  }

  let w = token.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return ['', ''];

  // Handle initial silent/special clusters
  w = w
    .replace(/^kn|^gn|^pn|^wr|^ps/, (m) => m.slice(1))
    .replace(/^wh/, 'w')
    .replace(/^x/, 's');

  // Drop silent trailing 'e' on words of length >= 4 (so "Carole" -> "Carol", "abdel" unaffected)
  if (w.length >= 4 && w.endsWith('e') && !/[aeiou]e$/.test(w)) {
    w = w.slice(0, -1);
  }

  // Normalize multi-character phonetic clusters before stripping vowels
  let primary = w
    .replace(/tch/g, 'X')
    .replace(/sh|sch/g, 'X')
    .replace(/ch/g, 'K') // In names like Michael, Michal, Christina -> K
    .replace(/ck|cq/g, 'K')
    .replace(/kh/g, 'K')
    .replace(/gh/g, 'K')
    .replace(/ph/g, 'F')
    .replace(/th/g, '0')
    .replace(/dg[eiy]/g, 'J')
    .replace(/c(?=[eiy])/g, 'S')
    .replace(/c/g, 'K')
    .replace(/q/g, 'K')
    .replace(/x/g, 'KS')
    .replace(/z/g, 'S')
    .replace(/v/g, 'F')
    .replace(/y/g, 'I');

  // Secondary variant treats "ch" as 'X' (for Sean/Shawn/Charlotte) and "g"+e/i/y as 'J'
  let secondary = w
    .replace(/tch|sh|sch|ch/g, 'X')
    .replace(/ck|cq|kh|gh/g, 'K')
    .replace(/ph/g, 'F')
    .replace(/th/g, '0')
    .replace(/g(?=[eiy])/g, 'J')
    .replace(/c(?=[eiy])/g, 'S')
    .replace(/c|q/g, 'K')
    .replace(/x/g, 'KS')
    .replace(/z/g, 'S')
    .replace(/v/g, 'F')
    .replace(/y/g, 'I');

  const buildCode = (str: string): string => {
    const upper = str.toUpperCase();
    let out = '';
    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i]!;
      if (i === 0) {
        // Keep initial vowel marker as 'A' or initial consonant
        if ('AEIOU'.includes(ch)) {
          out += 'A';
        } else {
          out += ch;
        }
        continue;
      }
      // Skip vowels after first character
      if ('AEIOU'.includes(ch)) continue;
      // Skip 'H' and 'W' unless followed by a vowel or part of an already-mapped cluster
      if (ch === 'H' || ch === 'W') continue;
      // Collapse adjacent duplicate phonetic symbols (e.g., "Caroll" -> "KRL")
      if (out[out.length - 1] !== ch) {
        out += ch;
      }
    }
    return out.slice(0, 6);
  };

  return [buildCode(primary), buildCode(secondary)];
}

/**
 * Extracts the consonant skeleton of a token (used as a guardrail on short names
 * so "Jon" [jn] and "Joe" [j] cannot false-positive via single-character edit distance).
 */
export function extractConsonantSkeleton(token: string): string {
  if (!token) return '';
  const lower = token.toLowerCase();
  let out = '';
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i]!;
    if ('aeiouy'.includes(ch)) continue;
    // 'h' in "john" is silent after 'j'/'o' before 'n', normalize 'kh'/'ph'/'sh'/'ch'
    if (ch === 'h' && i > 0 && 'jAEIOUaeiou'.includes(lower[i - 1]!)) continue;
    if (out[out.length - 1] !== ch) {
      out += ch;
    }
  }
  return out;
}

/**
 * Optimal String Alignment / Damerau-Levenshtein Distance.
 * Counts minimum insertions, deletions, substitutions, and adjacent transpositions
 * (so "Micheal" <-> "Michael" has distance 1, not 2).
 */
export function damerauLevenshteinDistance(a: string, b: string, maxOffset = 4): number {
  if (a === b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxOffset) return maxOffset + 1;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const dp: number[][] = Array.from({ length: lenA + 1 }, () => new Array<number>(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i++) dp[i]![0] = i;
  for (let j = 0; j <= lenB; j++) dp[0]![j] = j;

  for (let i = 1; i <= lenA; i++) {
    let rowMin = maxOffset + 1;
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        dp[i - 1]![j]! + 1,      // deletion
        dp[i]![j - 1]! + 1,      // insertion
        dp[i - 1]![j - 1]! + cost // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, dp[i - 2]![j - 2]! + 1); // adjacent transposition
      }
      dp[i]![j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxOffset) return maxOffset + 1;
  }

  return dp[lenA]![lenB]!;
}

/**
 * Dynamic length-relative maximum edit distance:
 *   - Length 1..3 ("Jo", "Jon", "Joe", "Ali"): 0 (fuzzy edit disabled; must match exact, prefix, or phonetic!)
 *   - Length 4..5 ("Carol", "Carole", "Sara"): 1
 *   - Length 6..11 ("Michael", "Mikael", "Micheal"): 2
 *   - Length >= 12 ("Abdelrahman"): 3
 */
export function getMaxAllowedEditDistance(minTokenLength: number): number {
  if (minTokenLength <= 3) return 0;
  if (minTokenLength <= 5) return 1;
  if (minTokenLength <= 11) return 2;
  return 3;
}

/**
 * Generates boundary-padded character trigrams (`$$a`, `$ab`, `abc`, `bc$`) for partial/ngram matching.
 */
export function generatePaddedTrigrams(token: string): string[] {
  if (!token) return [];
  const padded = `$$${token}$`;
  const trigrams: string[] = [];
  for (let i = 0; i <= padded.length - 3; i++) {
    trigrams.push(padded.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * Computes Sørensen–Dice similarity (0..1) between two tokens' padded trigrams.
 */
export function trigramDiceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const triA = generatePaddedTrigrams(a);
  const triB = generatePaddedTrigrams(b);
  if (triA.length === 0 || triB.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const t of triA) {
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  let intersection = 0;
  for (const t of triB) {
    const c = counts.get(t) || 0;
    if (c > 0) {
      intersection++;
      counts.set(t, c - 1);
    }
  }
  return (2 * intersection) / (triA.length + triB.length);
}

/**
 * Scores a single query token against a single candidate token using our 4-tier hierarchy:
 *   Tier 1 (95-100): Exact token match
 *   Tier 2 (85-94):  Prefix match (length >= 2) or substring match (length >= 3)
 *   Tier 3 (72-84):  Canonical transliteration match or Double Metaphone phonetic match
 *   Tier 4 (55-71):  Length-bounded Damerau-Levenshtein + Trigram Dice match
 */
export function scoreSingleTokenPair(
  queryToken: string,
  candidateToken: string
): { score: number; tier: SearchMatchTier } {
  if (!queryToken || !candidateToken) {
    return { score: 0, tier: 'none' };
  }

  // Tier 1: Exact token match
  if (queryToken === candidateToken) {
    return { score: 100, tier: 'exact' };
  }

  // Tier 2: Prefix match (e.g. live typeahead "Mich" -> "Michael" or "Carol" -> "Carole")
  if (candidateToken.startsWith(queryToken) && queryToken.length >= 2) {
    const ratio = queryToken.length / candidateToken.length;
    // "Carol" (5) prefix of "Carole" (6) gets 93; "Mi" (2) prefix of "Michael" (7) gets 88
    return {
      score: Math.round(87 + Math.min(7, ratio * 7)),
      tier: 'prefix_or_substring',
    };
  }

  // Reverse prefix only when candidate is a 1-char-shorter variant of a 4+ char query
  // (e.g., user typed "Carole" and record is "Carol")
  if (
    queryToken.startsWith(candidateToken) &&
    candidateToken.length >= 4 &&
    queryToken.length - candidateToken.length === 1
  ) {
    return { score: 86, tier: 'prefix_or_substring' };
  }

  // Tier 2b: Contiguous substring match for tokens >= 3 chars
  if (queryToken.length >= 3 && candidateToken.includes(queryToken)) {
    return { score: 85, tier: 'prefix_or_substring' };
  }

  // Tier 3a: Canonical cultural/Arabic transliteration equivalence
  const canonQuery = getCanonicalTransliterationToken(queryToken);
  const canonCand = getCanonicalTransliterationToken(candidateToken);
  if (canonQuery && canonQuery === canonCand) {
    return { score: 84, tier: 'transliteration_or_phonetic' };
  }

  // Tier 3b: Double Metaphone phonetic match
  // Require both tokens to be >= 3 chars so 1-2 char fragments don't phonetically collide
  if (queryToken.length >= 3 && candidateToken.length >= 3) {
    const [qPrim, qSec] = computePhoneticKeys(queryToken);
    const [cPrim, cSec] = computePhoneticKeys(candidateToken);
    const phoneticHit =
      (qPrim.length >= 2 && (qPrim === cPrim || qPrim === cSec)) ||
      (qSec.length >= 2 && (qSec === cPrim || qSec === cSec));

    if (phoneticHit) {
      // Guardrail against distant phonetic collisions (e.g., "Michael" [MKL] vs "McCall" [MKL]):
      // Check Damerau-Levenshtein distance and trigram Dice similarity
      const dist = damerauLevenshteinDistance(queryToken, candidateToken, 4);
      const dice = trigramDiceSimilarity(queryToken, candidateToken);
      const sameFirstSound = qPrim[0] === cPrim[0];

      if (sameFirstSound && (dist <= 3 || dice >= 0.3)) {
        const phoneticScore = Math.max(72, Math.min(82, 82 - dist * 2 + Math.round(dice * 4)));
        return { score: phoneticScore, tier: 'transliteration_or_phonetic' };
      }
    }
  }

  // Tier 4: Bounded Damerau-Levenshtein + N-Gram Similarity
  const minLen = Math.min(queryToken.length, candidateToken.length);
  const maxLen = Math.max(queryToken.length, candidateToken.length);
  const maxAllowedDist = getMaxAllowedEditDistance(minLen);

  // Critical Edge-Case Guardrail: Short names (<= 3 chars like "Jon" vs "Joe") have maxAllowedDist = 0,
  // so they NEVER enter fuzzy substitution unless they already matched phonetically ("Jon" <-> "John").
  if (maxAllowedDist > 0 && maxLen - minLen <= maxAllowedDist) {
    const dist = damerauLevenshteinDistance(queryToken, candidateToken, maxAllowedDist);
    if (dist <= maxAllowedDist) {
      const dice = trigramDiceSimilarity(queryToken, candidateToken);
      const skelQ = extractConsonantSkeleton(queryToken);
      const skelC = extractConsonantSkeleton(candidateToken);
      const skelDist = damerauLevenshteinDistance(skelQ, skelC, 2);

      // For 4-letter names (e.g. "Sara" vs "Tara" or "Mark" vs "Mary"), require both:
      // - matching first letter, AND
      // - identical consonant skeleton (or length >= 5 where 1 consonant typo like "Micharl" is allowed)
      const firstCharMatches = queryToken[0] === candidateToken[0];
      if (minLen <= 4 && (!firstCharMatches || skelQ !== skelC)) {
        return { score: 0, tier: 'none' };
      }
      // For 5+ letter tokens, prevent multi-consonant drift unless trigram overlap is strong
      if (skelDist > 1 && dice < 0.45) {
        return { score: 0, tier: 'none' };
      }

      if (dice >= 0.30 || dist === 1) {
        const baseFuzzy = dist === 1 ? 68 : dist === 2 ? 61 : 56;
        const bonus = Math.round(dice * 5) + (firstCharMatches ? 2 : 0);
        return {
          score: Math.min(71, Math.max(MINIMUM_CONFIDENCE_THRESHOLD, baseFuzzy + bonus - 2)),
          tier: 'fuzzy_edit_or_ngram',
        };
      }
    }
  }

  return { score: 0, tier: 'none' };
}

/**
 * Evaluates a candidate record's name against a user's raw search query.
 * Does NOT auto-correct the user's input — returns a deterministic confidence score and match tier
 * so all spelling variations of a name ("Michael", "Mikael", "Micheal", etc.) are retrieved and ranked.
 */
export function scoreNameMatch(
  candidateName: string | null | undefined,
  rawQuery: string | null | undefined
): FuzzyNameMatchResult {
  const normCandidate = normalizeSearchName(candidateName);
  const normQuery = normalizeSearchName(rawQuery);

  if (!normCandidate || !normQuery) {
    return { matched: false, score: 0, tier: 'none', matchedTokens: 0, totalQueryTokens: 0 };
  }

  // Fast Path 1: Full normalized exact match
  if (normCandidate === normQuery) {
    const tokens = tokenizeSearchName(normQuery);
    return {
      matched: true,
      score: 100,
      tier: 'exact',
      matchedTokens: tokens.length,
      totalQueryTokens: tokens.length,
    };
  }

  // Fast Path 2: Full normalized prefix match
  if (normCandidate.startsWith(normQuery) && normQuery.length >= 2) {
    const tokens = tokenizeSearchName(normQuery);
    return {
      matched: true,
      score: 94,
      tier: 'prefix_or_substring',
      matchedTokens: tokens.length,
      totalQueryTokens: tokens.length,
    };
  }

  // Fast Path 3: Contiguous normalized substring match
  if (normQuery.length >= 3 && normCandidate.includes(normQuery)) {
    const tokens = tokenizeSearchName(normQuery);
    return {
      matched: true,
      score: 89,
      tier: 'prefix_or_substring',
      matchedTokens: tokens.length,
      totalQueryTokens: tokens.length,
    };
  }

  const queryTokens = tokenizeSearchName(normQuery);
  const candidateTokens = tokenizeSearchName(normCandidate);

  if (queryTokens.length === 0 || candidateTokens.length === 0) {
    return { matched: false, score: 0, tier: 'none', matchedTokens: 0, totalQueryTokens: 0 };
  }

  // Also check coalesced compound forms (e.g., query "abdelrahman" vs candidate tokens ["abd", "el", "rahman"])
  const joinedCandidate = candidateTokens.join('');
  const joinedQuery = queryTokens.join('');
  if (joinedQuery.length >= 5 && joinedCandidate.includes(joinedQuery)) {
    return {
      matched: true,
      score: 88,
      tier: 'prefix_or_substring',
      matchedTokens: queryTokens.length,
      totalQueryTokens: queryTokens.length,
    };
  }

  // Greedy best-first assignment of queryTokens -> candidateTokens without reusing a candidate token
  const usedCandidateIndices = new Set<number>();
  let totalScore = 0;
  let matchedCount = 0;
  let lowestTierRank = 0;

  const tierRankMap: Record<SearchMatchTier, number> = {
    exact: 4,
    prefix_or_substring: 3,
    transliteration_or_phonetic: 2,
    fuzzy_edit_or_ngram: 1,
    none: 0,
  };
  const rankToTier: Record<number, SearchMatchTier> = {
    4: 'exact',
    3: 'prefix_or_substring',
    2: 'transliteration_or_phonetic',
    1: 'fuzzy_edit_or_ngram',
    0: 'none',
  };

  for (const qToken of queryTokens) {
    let bestScore = 0;
    let bestTier: SearchMatchTier = 'none';
    let bestCandIdx = -1;

    for (let cIdx = 0; cIdx < candidateTokens.length; cIdx++) {
      if (usedCandidateIndices.has(cIdx)) continue;
      const res = scoreSingleTokenPair(qToken, candidateTokens[cIdx]!);
      // Slight positional preference if query token index matches candidate token index (e.g. first name)
      const positionalTieBreaker = cIdx === 0 && queryTokens[0] === qToken ? 0.5 : 0;
      if (res.score + positionalTieBreaker > bestScore) {
        bestScore = res.score;
        bestTier = res.tier;
        bestCandIdx = cIdx;
      }
    }

    if (bestCandIdx !== -1 && bestScore >= MINIMUM_CONFIDENCE_THRESHOLD) {
      usedCandidateIndices.add(bestCandIdx);
      matchedCount++;
      totalScore += bestScore;
      const r = tierRankMap[bestTier];
      if (lowestTierRank === 0 || r < lowestTierRank) {
        lowestTierRank = r;
      }
    }
  }

  // Require all query tokens to match for 1-2 word queries, or at least ceil(0.75 * N) for 3+ word queries
  const requiredMatches =
    queryTokens.length <= 2 ? queryTokens.length : Math.ceil(queryTokens.length * 0.75);

  if (matchedCount < requiredMatches) {
    return {
      matched: false,
      score: 0,
      tier: 'none',
      matchedTokens: matchedCount,
      totalQueryTokens: queryTokens.length,
    };
  }

  const averageScore = Math.round(totalScore / matchedCount);
  // If all tokens matched exactly (e.g. "Michael Mitry" against "Michael Ashraf Mitry"), cap at 96
  const finalScore =
    lowestTierRank === 4 && candidateTokens.length > queryTokens.length
      ? Math.min(96, averageScore)
      : averageScore;

  if (finalScore < MINIMUM_CONFIDENCE_THRESHOLD) {
    return {
      matched: false,
      score: 0,
      tier: 'none',
      matchedTokens: matchedCount,
      totalQueryTokens: queryTokens.length,
    };
  }

  return {
    matched: true,
    score: finalScore,
    tier: rankToTier[lowestTierRank] || 'fuzzy_edit_or_ngram',
    matchedTokens: matchedCount,
    totalQueryTokens: queryTokens.length,
  };
}

/**
 * Boolean helper for drop-in replacement of `name.toLowerCase().includes(term)`.
 */
export function matchesFuzzyNameSearch(
  candidateName: string | null | undefined,
  rawQuery: string | null | undefined
): boolean {
  return scoreNameMatch(candidateName, rawQuery).matched;
}

/**
 * Builds deterministic search index tokens (`_searchTokens`, `_phoneticKeys`, `_trigrams`)
 * for persisting on Firestore member documents (`db-inzanathletics` / multi-tenant isolation)
 * so server-side `array-contains-any` queries can retrieve candidate buckets in O(1) index hops
 * before applying fine-grained `scoreNameMatch` ranking.
 */
export function buildFirestoreSearchIndexTokens(name: string | null | undefined): SearchIndexDocumentTokens {
  const normalizedFull = normalizeSearchName(name);
  const tokens = tokenizeSearchName(normalizedFull);
  const canonicalSet = new Set<string>();
  const phoneticSet = new Set<string>();
  const trigramSet = new Set<string>();

  for (const token of tokens) {
    canonicalSet.add(getCanonicalTransliterationToken(token));
    const [p1, p2] = computePhoneticKeys(token);
    if (p1) phoneticSet.add(p1);
    if (p2) phoneticSet.add(p2);
    for (const tri of generatePaddedTrigrams(token)) {
      trigramSet.add(tri);
    }
  }

  return {
    normalizedFull,
    tokens,
    canonicalTokens: Array.from(canonicalSet),
    phoneticKeys: Array.from(phoneticSet),
    trigrams: Array.from(trigramSet),
  };
}
