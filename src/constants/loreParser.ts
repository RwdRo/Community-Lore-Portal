import { LORE_TAG_CATEGORIES, textContainsTag } from './loreTags';

export interface LoreEntity {
  name: string;
  type: string;
  category: string;
}

export interface LoreRelationship {
  subject: string;
  predicate: string;
  object: string;
}

export interface LoreEvent {
  name: string;
  date?: string;
  description: string;
}

export interface ParsedLore {
  entities: LoreEntity[];
  relationships: LoreRelationship[];
  events: LoreEvent[];
  tags: string[];
}

const stripMarkupForIndexing = (value: string): string => {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/[`*_>#~|]/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const entityTypeForCategory = (category: string): string => {
  if (category.startsWith('PLANETS') || category.startsWith('WORLDS')) return 'planets';
  if (category === 'SPECIES') return 'species';
  if (category === 'FACTIONS') return 'factions';
  if (category === 'TECHNOLOGY') return 'technology';
  return 'general';
};

const RELATIONSHIP_PATTERNS = [
  { regex: /\b(.{1,80}?)\s+(?:is native to|are native to|originated on|comes from|came from)\s+(.{1,80})\b/i, predicate: 'native_to' },
  { regex: /\b(.{1,80}?)\s+(?:is part of|belongs to|joined)\s+(.{1,80})\b/i, predicate: 'belongs_to' },
  { regex: /\b(.{1,80}?)\s+(?:is located on|was located on|is found on)\s+(.{1,80})\b/i, predicate: 'located_on' },
];

export const parseLoreContent = (content: string): ParsedLore => {
  if (!content) return { entities: [], relationships: [], events: [], tags: [] };

  // Index the complete narrative. Earlier builds silently ignored everything
  // after character 5,000 which made long-form lore effectively invisible.
  const cleanText = stripMarkupForIndexing(content);
  const tags: string[] = [];
  const entities: LoreEntity[] = [];

  Object.entries(LORE_TAG_CATEGORIES).forEach(([category, tagList]) => {
    for (const tag of tagList) {
      if (!textContainsTag(cleanText, tag) && !(category === 'SPECIES' && textContainsTag(cleanText, tag + 's'))) continue;
      tags.push(tag);
      entities.push({
        name: tag,
        type: entityTypeForCategory(category),
        category: category.replace(/_/g, ' ')
      });
    }
  });

  // Relationships are intentionally conservative. A relationship is emitted
  // only when both sides contain already-indexed named entities in the same
  // sentence. Generic "X is Y" parsing caused large amounts of false graph data.
  const relationships: LoreRelationship[] = [];
  const sentences = cleanText.split(/(?<=[.!?])\s+/).filter(Boolean);
  for (const sentence of sentences) {
    if (sentence.length < 10 || sentence.length > 260) continue;
    for (const pattern of RELATIONSHIP_PATTERNS) {
      const match = sentence.match(pattern.regex);
      if (!match) continue;
      const subjectEntity = entities.find(e => textContainsTag(match[1], e.name));
      const objectEntity = entities.find(e => textContainsTag(match[2], e.name));
      if (!subjectEntity || !objectEntity || subjectEntity.name === objectEntity.name) continue;
      relationships.push({ subject: subjectEntity.name, predicate: pattern.predicate, object: objectEntity.name });
    }
  }

  const events: LoreEvent[] = [];
  const eventPatterns = [
    /\b(\d{1,4}(?:,\d{3})?\s+Years?\s+Ago)\b\s*[–—:-]?\s*([^.!?]{4,160})/gi,
    /\b(First Encounters?|The Cataclysm|The Exodus|The Great Expansion)\b\s*[–—:-]?\s*([^.!?]{4,160})/gi,
  ];
  for (const regex of eventPatterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(cleanText)) !== null && events.length < 12) {
      events.push({ name: match[1].trim(), description: (match[2] || match[1]).trim() });
    }
    if (events.length >= 12) break;
  }

  const unique = <T>(items: T[]) => Array.from(new Map(items.map(item => [JSON.stringify(item), item])).values());
  return {
    entities: unique(entities),
    relationships: unique(relationships),
    events: unique(events),
    tags: Array.from(new Set(tags))
  };
};
