import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  scoreNameMatch,
  matchesFuzzyNameSearch,
  computePhoneticKeys,
  damerauLevenshteinDistance,
  buildFirestoreSearchIndexTokens,
} from './fuzzyNameSearch';

describe('Inzan Tenant CRM — Fuzzy & Phonetic Name Search Architecture', () => {
  describe('Phase 1 & Critical Constraint: 10 Variations of "Michael" retrieved via an 11th variation without destructive auto-correction', () => {
    const tenMichaelRecords = [
      'Michael Mansour',
      'Mikael Mansour',
      'Micheal Mansour',
      'Michal Mansour',
      'Mikhael Mansour',
      'Mykhailo Mansour',
      'Mikel Mansour',
      'Mikaeel Mansour',
      'Michell Mansour',
      'Micael Mansour',
    ];

    it('retrieves all 10 stored variations of "Michael" when searching an 11th variation ("Mikhal" or "Mikaell")', () => {
      const eleventhVariationQuery = 'Mikhal';
      const matchedRecords = tenMichaelRecords
        .map((name) => ({ name, result: scoreNameMatch(name, eleventhVariationQuery) }))
        .filter((item) => item.result.matched);

      assert.strictEqual(matchedRecords.length, 10);
      for (const item of matchedRecords) {
        assert.ok(item.result.score >= 55, `Expected ${item.name} score >= 55, got ${item.result.score}`);
      }
    });

    it('ranks exact match highest, followed by prefix/substring, followed by phonetic, followed by fuzzy edit distance', () => {
      const exact = scoreNameMatch('Michael', 'Michael');
      const prefix = scoreNameMatch('Michael', 'Micha');
      const phonetic = scoreNameMatch('Mikael', 'Michael');
      const fuzzyTypo = scoreNameMatch('Micharl', 'Michael'); // keyboard typo 'r' instead of 'e' -> edit distance 1

      assert.strictEqual(exact.score, 100);
      assert.strictEqual(exact.tier, 'exact');

      assert.ok(prefix.score > phonetic.score);
      assert.strictEqual(prefix.tier, 'prefix_or_substring');

      assert.ok(phonetic.score > fuzzyTypo.score);
      assert.strictEqual(phonetic.tier, 'transliteration_or_phonetic');

      assert.strictEqual(fuzzyTypo.matched, true);
      assert.strictEqual(fuzzyTypo.tier, 'fuzzy_edit_or_ngram');
      assert.ok(fuzzyTypo.score >= 55);
    });
  });

  describe('Carol / Carole & Minor Spelling Deviations', () => {
    it('matches "Carol" when searching "Carole" and vice-versa (trailing silent e)', () => {
      const carolFromCarole = scoreNameMatch('Carol Ibrahim', 'Carole');
      const caroleFromCarol = scoreNameMatch('Carole Ibrahim', 'Carol');
      const karolFromCarol = scoreNameMatch('Karol Ibrahim', 'Carol');
      const carollFromCarol = scoreNameMatch('Caroll Ibrahim', 'Carol');

      assert.strictEqual(carolFromCarole.matched, true);
      assert.strictEqual(caroleFromCarol.matched, true);
      assert.strictEqual(karolFromCarol.matched, true);
      assert.strictEqual(carollFromCarol.matched, true);
    });
  });

  describe('Phase 3: Edge Cases & False Positive Guardrails', () => {
    it('does NOT match genuinely different short names ("Jon" vs "Joe", "May" vs "Max", "Sam" vs "Sal")', () => {
      assert.strictEqual(matchesFuzzyNameSearch('Joe Hassan', 'Jon'), false);
      assert.strictEqual(matchesFuzzyNameSearch('Jon Hassan', 'Joe'), false);
      assert.strictEqual(matchesFuzzyNameSearch('Max Adel', 'May'), false);
      assert.strictEqual(matchesFuzzyNameSearch('Salma Ali', 'Sam'), false);
    });

    it('DOES match phonetically equivalent short names ("Jon" vs "John", "Ali" vs "Aly")', () => {
      assert.strictEqual(matchesFuzzyNameSearch('John Kamel', 'Jon'), true);
      assert.strictEqual(matchesFuzzyNameSearch('Jon Kamel', 'John'), true);
      assert.strictEqual(matchesFuzzyNameSearch('Aly Mahmoud', 'Ali'), true);
    });

    it('does NOT match 4-letter names with divergent consonant skeletons ("Mark" vs "Mary", "Sara" vs "Tara")', () => {
      assert.strictEqual(matchesFuzzyNameSearch('Mary Girgis', 'Mark'), false);
      assert.strictEqual(matchesFuzzyNameSearch('Tara Nabil', 'Sara'), false);
    });

    it('handles multi-word names and Arabic-to-English cultural transliterations seamlessly', () => {
      assert.strictEqual(matchesFuzzyNameSearch('Mohammed Abd El-Rahman', 'Mohamed Abdelrahman'), true);
      assert.strictEqual(matchesFuzzyNameSearch('Mohamed Abdelrahman', 'Muhammad Abd Al Rahman'), true);
      assert.strictEqual(matchesFuzzyNameSearch('Youssef El-Sayed', 'Yusuf Elsayed'), true);
      assert.strictEqual(matchesFuzzyNameSearch('Mostafa Khaled', 'Mustafa Khalid'), true);
      assert.strictEqual(matchesFuzzyNameSearch('أحمد عبدالرحمن', 'احمد عبد الرحمن'), true);
    });

    it('handles adjacent character transpositions via Damerau-Levenshtein ("Micheal" <-> "Michael") as distance 1', () => {
      assert.strictEqual(damerauLevenshteinDistance('michael', 'micheal'), 1);
    });
  });

  describe('Firestore Multi-Tenant Search Index Token Generation', () => {
    it('generates normalized tokens, canonical transliterations, phonetic keys, and padded trigrams', () => {
      const idx = buildFirestoreSearchIndexTokens('Mohammed Abd El-Rahman');
      assert.strictEqual(idx.normalizedFull, 'mohammed abdelrahman');
      assert.ok(idx.canonicalTokens.includes('mohamed'));
      assert.ok(idx.canonicalTokens.includes('abdelrahman'));
      assert.ok(idx.phoneticKeys.length > 0);
      assert.ok(idx.trigrams.includes('$$m'));
      assert.ok(idx.trigrams.includes('moh'));
    });

    it('produces identical primary phonetic keys for "Michael", "Mikael", and "Micheal"', () => {
      const [m1] = computePhoneticKeys('Michael');
      const [m2] = computePhoneticKeys('Mikael');
      const [m3] = computePhoneticKeys('Micheal');
      assert.strictEqual(m1, 'MKL');
      assert.strictEqual(m2, 'MKL');
      assert.strictEqual(m3, 'MKL');
    });
  });
});
