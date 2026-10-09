import { LoreCategory, LoreEntry } from '../types';
import { parseLoreContent } from './loreParser';
import { textContainsTag } from './loreTags';

export type WorldClassification = 'Frontier World' | 'Federation Homeworld' | 'Documented World';

export interface LoreWorld {
  id: string;
  name: string;
  classification: WorldClassification;
  aliases: string[];
  image?: string;
  description: string;
}

/**
 * Atlas worlds supported by the shipped canon corpus. Keep this registry factual
 * and deliberately sparse: unknown telemetry is better than invented telemetry.
 */
export const LORE_WORLDS: LoreWorld[] = [
  { id: 'eyeke', name: 'Eyeke', classification: 'Frontier World', aliases: ['Eyeke'], image: '/assets/iPS42_Eyeke.png', description: 'One of the six Trilium-bearing Frontier worlds documented by the Federation archive.' },
  { id: 'kavian', name: 'Kavian', classification: 'Frontier World', aliases: ['Kavian'], image: '/assets/iPS42_Kavian.png', description: 'One of the six Trilium-bearing Frontier worlds documented by the Federation archive.' },
  { id: 'magor', name: 'Magor', classification: 'Frontier World', aliases: ['Magor'], image: '/assets/iPS42_Magor.png', description: 'One of the six Trilium-bearing Frontier worlds documented by the Federation archive.' },
  { id: 'naron', name: 'Naron', classification: 'Frontier World', aliases: ['Naron'], image: '/assets/iPS42_Naron.png', description: 'Frontier world associated in the archive with the Water Barons, the Hydrarch, scarcity and Lake Nyari.' },
  { id: 'neri', name: 'Neri', classification: 'Frontier World', aliases: ['Neri'], image: '/assets/iPS42_Neri.png', description: 'One of the six Trilium-bearing Frontier worlds documented by the Federation archive.' },
  { id: 'veles', name: 'Veles', classification: 'Frontier World', aliases: ['Veles'], image: '/assets/iPS42_Veles.png', description: 'One of the six Trilium-bearing Frontier worlds documented by the Federation archive.' },
  { id: 'alta', name: 'Alta', classification: 'Federation Homeworld', aliases: ['Alta'], description: 'Homeworld of the Altans. Alta Prime is not treated as an alias: separate sources use that name differently.' },
  { id: 'khaur', name: 'Khaur', classification: 'Federation Homeworld', aliases: ['Khaur'], description: 'Homeworld associated with the Khaureds in the canon archive.' },
  { id: 'velgemmis', name: 'Velgemmis', classification: 'Federation Homeworld', aliases: ['Velgemmis'], description: 'Homeworld of the Elgem and the setting of the Five Tribes material.' },
  { id: 'lopat', name: 'Lopat', classification: 'Federation Homeworld', aliases: ['Lopat'], description: 'Lopati homeworld and the centre of the Arkhive, Cataclysm, Exodus and Resonance cycle.' },
  { id: 'earth', name: 'Earth', classification: 'Federation Homeworld', aliases: ['Earth'], description: 'Human homeworld documented throughout the Federation archive.' },
  { id: 'alfrheim', name: 'Alfrheim', classification: 'Documented World', aliases: ['Alfrheim'], description: 'Documented world in the Nordic lore cycle.' },
  { id: 'new-pleione', name: 'New Pleione', classification: 'Documented World', aliases: ['New Pleione'], description: 'Documented world in the Nordic lore cycle.' },
  { id: 'nyssari', name: 'Nyssari', classification: 'Documented World', aliases: ['Nyssari'], description: 'Documented planet encountered by the Lopati in the Harmonic Star cycle.' },
];

const CANON_PRIMARY_WORLD_OVERRIDES: Record<string, string> = {
  canon_6: 'Alta', canon_7: 'Velgemmis', canon_8: 'Khaur', canon_10: 'Lopat', canon_11: 'Earth', canon_14: 'Khaur',
  canon_20: 'Lopat', canon_21: 'Lopat', canon_22: 'Lopat', canon_23: 'Lopat', canon_24: 'Lopat', canon_25: 'Lopat', canon_26: 'Lopat', canon_27: 'Lopat', canon_28: 'Lopat',
  canon_29: 'Lopat', canon_30: 'Lopat', canon_31: 'Lopat', canon_32: 'Lopat', canon_33: 'Lopat', canon_34: 'Lopat', canon_35: 'Lopat', canon_36: 'Lopat', canon_37: 'Lopat', canon_38: 'Lopat', canon_39: 'Lopat', canon_40: 'Lopat', canon_41: 'Lopat', canon_42: 'Lopat', canon_43: 'Lopat', canon_44: 'Lopat', canon_45: 'Lopat', canon_46: 'Lopat', canon_47: 'Lopat', canon_48: 'Lopat', canon_49: 'Lopat', canon_50: 'Lopat', canon_51: 'Lopat', canon_52: 'Lopat', canon_53: 'Lopat', canon_54: 'Lopat', canon_55: 'Lopat', canon_56: 'Lopat', canon_57: 'Lopat', canon_58: 'Lopat', canon_59: 'Lopat', canon_60: 'Lopat', canon_61: 'Lopat', canon_62: 'Lopat',
  canon_63: 'Nyssari', canon_64: 'Nyssari', canon_65: 'Nyssari', canon_66: 'Nyssari', canon_67: 'Nyssari',
  canon_78: 'Alta', canon_79: 'Alta', canon_80: 'Alta',
  canon_81: 'New Pleione', canon_82: 'New Pleione', canon_83: 'Alfrheim', canon_86: 'Eyeke', canon_87: 'Alta', canon_89: 'Khaur', canon_90: 'Neri', canon_91: 'Alta',
  canon_93: 'Naron', canon_94: 'Naron', canon_95: 'Naron', canon_96: 'Naron', canon_97: 'Naron', canon_98: 'Naron', canon_99: 'Naron', canon_100: 'Naron', canon_101: 'Naron', canon_102: 'Naron', canon_103: 'Naron',
  canon_104: 'Velgemmis', canon_105: 'Velgemmis', canon_106: 'Velgemmis', canon_107: 'Velgemmis', canon_108: 'Velgemmis',
};

const SPECIES_HOMEWORLD: Record<string, string> = {
  altan: 'Alta',
  altans: 'Alta',
  khaured: 'Khaur',
  khaureds: 'Khaur',
  elgem: 'Velgemmis',
  lopati: 'Lopat',
  humans: 'Earth',
  human: 'Earth',
};

const normalizeTitle = (title: string): string => String(title || '')
  .replace(/^\s*#{1,6}\s*/, '')
  .replace(/\*\*/g, '')
  .replace(/__/g, '')
  .replace(/`/g, '')
  .trim();

export const getWorldByName = (value?: string | null): LoreWorld | undefined => {
  if (!value) return undefined;
  const clean = value.trim().toLowerCase();
  return LORE_WORLDS.find(world => world.id === clean || world.name.toLowerCase() === clean || world.aliases.some(alias => alias.toLowerCase() === clean));
};

const mentionIndex = (text: string, world: LoreWorld): number => {
  let best = -1;
  for (const alias of world.aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, 'i').exec(text);
    if (match) {
      const index = match.index + match[1].length;
      if (best < 0 || index < best) best = index;
    }
  }
  return best;
};

export const getMentionedWorlds = (title: string, content: string): string[] => {
  const text = `${normalizeTitle(title)}\n${String(content || '')}`;
  return LORE_WORLDS
    .filter(world => mentionIndex(text, world) >= 0)
    .map(world => world.name);
};

export const inferPrimaryWorld = (entry: Pick<LoreEntry, 'id' | 'title' | 'content' | 'planet' | 'sourceUrl'>): { world?: string; confidence: LoreEntry['indexingConfidence'] } => {
  const explicit = getWorldByName(entry.planet);
  if (explicit) return { world: explicit.name, confidence: 'explicit' };

  const curated = CANON_PRIMARY_WORLD_OVERRIDES[entry.id];
  if (curated) return { world: curated, confidence: 'explicit' };

  const title = normalizeTitle(entry.title);
  const titleWorld = LORE_WORLDS.find(world => world.aliases.some(alias => textContainsTag(title, alias)));
  if (titleWorld) return { world: titleWorld.name, confidence: 'strong' };

  // Species whose homeworld is explicitly established can carry that index when
  // the species itself is the subject of the title. This is not applied to
  // Robotrons/Onoros/Nordics because their title does not establish one world.
  const titleLower = title.toLowerCase();
  for (const [species, homeworld] of Object.entries(SPECIES_HOMEWORLD)) {
    if (textContainsTag(titleLower, species)) return { world: homeworld, confidence: 'strong' };
  }

  const source = String(entry.sourceUrl || '');
  const sourceWorld = LORE_WORLDS.find(world => world.aliases.some(alias => textContainsTag(source.replace(/[-_]/g, ' '), alias)));
  if (sourceWorld) return { world: sourceWorld.name, confidence: 'strong' };

  // Species overview records with no established homeworld must not be filed
  // under a planet merely because that world appears in an anecdote. This was
  // the ROBOTRONS -> Naron failure in the old indexer.
  const speciesOverview = /\b(species|race|altans?|elgem|khaureds?|lopati|humans?|robotrons?|onoros|nordics?|hodlodytes)\b/i.test(title);
  if (!speciesOverview) {
    const opening = String(entry.content || '').slice(0, 1100);
    const strongCandidates = LORE_WORLDS.filter(world => world.aliases.some(alias => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patterns = [
        new RegExp(`\\b(?:planet|world)\\s+${escaped}\\b`, 'i'),
        new RegExp(`\\b${escaped}(?:'s|’s)\\b`, 'i'),
        new RegExp(`\\b${escaped}\\s+(?:is|was|became|remains|orbits|entered)\\b`, 'i'),
        new RegExp(`\\b(?:on|upon|across|within|beneath|above|around|at|to|from|of)\\s+(?:the\\s+(?:planet|world)\\s+)?${escaped}\\b`, 'i'),
      ];
      return patterns.some(pattern => pattern.test(opening));
    }));

    if (strongCandidates.length === 1) return { world: strongCandidates[0].name, confidence: 'strong' };
  }

  return { confidence: getMentionedWorlds(title, entry.content).length ? 'reference-only' : 'unassigned' };
};

const titleHasAny = (title: string, terms: string[]) => terms.some(term => textContainsTag(title, term));

export const inferLoreCategory = (titleValue: string, content: string, primaryWorld?: string): LoreCategory => {
  const title = normalizeTitle(titleValue);
  const titleNamesWorld = LORE_WORLDS.some(world => world.aliases.some(alias => textContainsTag(title, alias)));

  // A named world in the title is the strongest archive-level subject signal.
  if (titleNamesWorld) return 'Planets';
  if (/\bhistory\b|\bhistorical\b|\btimeline\b|\borigins?\b|\bcataclysm\b|\bexodus\b|\blegacy\b|\baftermath\b|\bechoes of the past\b/i.test(title)) return 'History';
  if (titleHasAny(title, ['Altan', 'Altans', 'Elgem', 'Khaured', 'Khaureds', 'Lopati', 'Human', 'Humans', 'Robotron', 'Robotrons', 'Onoros', 'Nordic', 'Nordics', 'Hodlodytes']) || /\bspecies\b|\bprimary races\b/i.test(title)) return 'Species';
  if (/\btrilium\b|\btriactor\b|\btechnology\b|\bweaponsmith/i.test(title)) return 'Technology';
  if (/\bfactions?\b|\balliance\b|\bguild\b|\bgovernance\b|\bcouncil\b|\bsyndicate\b|\bfederation\b/i.test(title)) return 'Factions';

  const opening = String(content || '').slice(0, 700).toLowerCase();
  if (/\bthe .* species\b|\bnative .* species\b/.test(opening)) return 'Species';
  if (/\bhistory of\b|\byears ago\b/.test(opening)) return 'History';
  if (primaryWorld && /\bplanet\b|\bworld\b/.test(opening)) return 'Planets';
  return 'General';
};

export const normalizeLoreEntry = (entry: LoreEntry): LoreEntry => {
  const title = normalizeTitle(entry.title);
  const parsed = parseLoreContent(`${title}\n\n${entry.content || ''}`);
  const primary = inferPrimaryWorld({ ...entry, title });
  const mentionedWorlds = getMentionedWorlds(title, entry.content || '');
  const category = inferLoreCategory(title, entry.content || '', primary.world);

  // World placement is not a generic keyword tag. Remove world mentions from
  // parser tags, then add only the primary setting. Cross-references remain in
  // mentionedWorlds so a passing reference cannot pollute planet tag filters.
  const worldTerms = new Set(
    LORE_WORLDS.flatMap(world => [world.name, ...world.aliases]).map(value => value.toLowerCase())
  );
  const nonWorldTags = parsed.tags.filter(tag => !worldTerms.has(tag.toLowerCase()));
  const tags = Array.from(new Set([
    ...nonWorldTags,
    ...(primary.world ? [primary.world] : []),
  ]));

  return {
    ...entry,
    title,
    category,
    tags,
    entities: parsed.entities,
    relationships: parsed.relationships,
    events: parsed.events,
    planet: primary.world,
    primaryWorld: primary.world,
    mentionedWorlds,
    indexingConfidence: primary.confidence,
  };
};

export const getWorldRole = (entry: LoreEntry, worldValue: string): 'primary' | 'reference' | 'none' => {
  const world = getWorldByName(worldValue);
  if (!world) return 'none';
  if (entry.primaryWorld === world.name || entry.planet === world.name) return 'primary';
  if ((entry.mentionedWorlds || []).includes(world.name)) return 'reference';
  return 'none';
};
