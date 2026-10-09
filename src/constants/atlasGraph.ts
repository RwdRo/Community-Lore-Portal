import { LoreEntry } from '../types';
import { LORE_WORLDS, getWorldByName } from './loreIndex';

export interface AtlasGraphEntity {
  name: string;
  type: string;
  category?: string;
}

export interface AtlasGraphRelationship {
  subject: string;
  predicate: string;
  object: string;
}

export interface AtlasGraphData {
  entities: AtlasGraphEntity[];
  relationships: AtlasGraphRelationship[];
}

const SUPPORTED_ENTITY_TYPES = new Set(['species', 'factions', 'technology']);

const normalizeEntityType = (value?: string): string => {
  const type = String(value || '').toLowerCase();
  if (type.includes('planet') || type.includes('world')) return 'planets';
  if (type.includes('specie')) return 'species';
  if (type.includes('faction')) return 'factions';
  if (type.includes('tech') || type.includes('weapon') || type.includes('tool')) return 'technology';
  return 'general';
};

const canonicalWorldName = (value?: string): string | undefined => getWorldByName(value)?.name;

/**
 * Build the interactive atlas from normalized archive records.
 *
 * Important distinction:
 * - parsed lore relationships are canon-text relationships;
 * - `indexed_with` and `cross_reference` are archive/index relationships.
 *
 * The latter describe how Loreworks indexes records. They do not invent an
 * in-universe trade route, treaty, wormhole or other fictional connection.
 */
export const buildAtlasGraph = (lore: LoreEntry[]): AtlasGraphData => {
  const entityMap = new Map<string, AtlasGraphEntity>();
  const relationMap = new Map<string, AtlasGraphRelationship>();

  const addEntity = (entity: AtlasGraphEntity) => {
    const name = String(entity.name || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    const existing = entityMap.get(key);
    if (!existing || (existing.type === 'general' && entity.type !== 'general')) {
      entityMap.set(key, { ...entity, name });
    }
  };

  const addRelationship = (subjectValue?: string, predicateValue?: string, objectValue?: string) => {
    const subject = String(subjectValue || '').trim();
    const object = String(objectValue || '').trim();
    const predicate = String(predicateValue || '').trim().replace(/\s+/g, '_').toLowerCase();
    if (!subject || !object || !predicate || subject.toLowerCase() === object.toLowerCase()) return;
    const subjectEntity = entityMap.get(subject.toLowerCase());
    const objectEntity = entityMap.get(object.toLowerCase());
    if (!subjectEntity || !objectEntity) return;
    const canonicalSubject = subjectEntity.name;
    const canonicalObject = objectEntity.name;
    const key = `${canonicalSubject.toLowerCase()}|${predicate}|${canonicalObject.toLowerCase()}`;
    relationMap.set(key, { subject: canonicalSubject, predicate, object: canonicalObject });
  };

  // The atlas always retains the documented world layer so the star-map shape
  // does not collapse merely because one data source is temporarily offline.
  for (const world of LORE_WORLDS) {
    addEntity({ name: world.name, type: 'planets', category: world.classification });
  }

  // First pass: collect named non-world entities from the indexed corpus.
  for (const entry of lore) {
    if (entry.status === 'rejected') continue;
    for (const raw of entry.entities || []) {
      const world = canonicalWorldName(raw.name);
      if (world) {
        addEntity({ name: world, type: 'planets', category: raw.category });
        continue;
      }
      const type = normalizeEntityType(raw.type);
      if (!SUPPORTED_ENTITY_TYPES.has(type)) continue;
      addEntity({ name: raw.name, type, category: raw.category });
    }
  }

  // Second pass: add only evidence-backed relationships.
  for (const entry of lore) {
    if (entry.status === 'rejected') continue;
    const primaryWorld = canonicalWorldName(entry.primaryWorld || entry.planet);

    // Exact relationships extracted from narrative sentences.
    for (const relation of entry.relationships || []) {
      const subject = canonicalWorldName(relation.subject) || relation.subject;
      const object = canonicalWorldName(relation.object) || relation.object;
      addRelationship(subject, relation.predicate, object);
    }

    // Index relation: a named entity occurs in a record primarily indexed to a
    // world. This is deliberately labelled as archive metadata, not canon lore.
    if (primaryWorld) {
      for (const raw of entry.entities || []) {
        const type = normalizeEntityType(raw.type);
        if (!SUPPORTED_ENTITY_TYPES.has(type)) continue;
        if (canonicalWorldName(raw.name)) continue;
        addRelationship(raw.name, 'indexed_with', primaryWorld);
      }

      // A primary-world record that explicitly references another documented
      // world creates an archive cross-reference between those world nodes.
      for (const mentioned of entry.mentionedWorlds || []) {
        const mentionedWorld = canonicalWorldName(mentioned);
        if (!mentionedWorld || mentionedWorld === primaryWorld) continue;
        addRelationship(primaryWorld, 'cross_reference', mentionedWorld);
      }
    }
  }

  return {
    entities: Array.from(entityMap.values()),
    relationships: Array.from(relationMap.values()),
  };
};
