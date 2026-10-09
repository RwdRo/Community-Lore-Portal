import assert from 'node:assert/strict';
import { CANONICAL_LORE_DATABASE } from '../src/constants/canonicalLore';
import { normalizeLoreEntry } from '../src/constants/loreIndex';
import type { LoreEntry } from '../src/types';

const byId = new Map(CANONICAL_LORE_DATABASE.map((entry) => [entry.id, normalizeLoreEntry(entry)]));
const get = (id: string): LoreEntry => {
  const entry = byId.get(id);
  assert.ok(entry, `missing fixture ${id}`);
  return entry;
};

// Species pages use their established homeworld without being renamed by body headings.
assert.equal(get('canon_6').title, 'ALTANS');
assert.equal(get('canon_6').category, 'Species');
assert.equal(get('canon_6').primaryWorld, 'Alta');
assert.equal(get('canon_7').category, 'Species');
assert.equal(get('canon_7').primaryWorld, 'Velgemmis');
assert.equal(get('canon_8').primaryWorld, 'Khaur');

// ROBOTRONS mentions Naron in an anecdote but is not a Naron planetary record.
assert.equal(get('canon_12').category, 'Species');
assert.equal(get('canon_12').primaryWorld, undefined);
assert.ok(get('canon_12').mentionedWorlds?.includes('Naron'));
assert.ok(!get('canon_12').tags.includes('Naron')); // reference-only mention is not a placement tag

// Known narrative cycles are indexed to their actual primary settings.
assert.equal(get('canon_63').primaryWorld, 'Nyssari');
assert.equal(get('canon_81').primaryWorld, 'New Pleione');
assert.equal(get('canon_83').primaryWorld, 'Alfrheim');
assert.equal(get('canon_86').primaryWorld, 'Eyeke');
assert.equal(get('canon_89').primaryWorld, 'Khaur');
assert.equal(get('canon_90').primaryWorld, 'Neri');
assert.equal(get('canon_93').primaryWorld, 'Naron');
assert.equal(get('canon_104').primaryWorld, 'Velgemmis');
assert.equal(get('canon_104').title, 'The Elgem Species');

// Entire narratives are indexed; references after character 5,000 must still exist.
const longBody = `${'quiet archive text '.repeat(340)}\nMuch later the transmission reaches Naron and Lake Nyari.`;
const longFixture: LoreEntry = {
  id: 'fixture_long',
  title: 'Late Reference Fixture',
  content: longBody,
  authorId: 'test',
  authorName: 'test',
  type: 'canon',
  status: 'active',
  category: 'General',
  tags: [],
  createdAt: { seconds: 0 },
  voteCount: 0,
};
const normalizedLong = normalizeLoreEntry(longFixture);
assert.ok(normalizedLong.mentionedWorlds?.includes('Naron'));
assert.ok(!normalizedLong.tags.includes('Naron')); // reference-only world stays out of primary tags

// Lexical matching must not confuse a species name with a similarly named world.
const khauredFixture: LoreEntry = {
  ...longFixture,
  id: 'fixture_khaured',
  title: 'KHAUREDS',
  content: 'The Khaureds are a Federation species. This overview does not establish its scene on Khaur.',
};
const normalizedKhaured = normalizeLoreEntry(khauredFixture);
assert.equal(normalizedKhaured.category, 'Species');
assert.equal(normalizedKhaured.primaryWorld, 'Khaur'); // established species homeworld, not substring matching

console.log(`Lore index fixtures passed (${CANONICAL_LORE_DATABASE.length} canonical records normalized).`);
