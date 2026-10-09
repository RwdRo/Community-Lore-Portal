import { LoreEntry } from '../types';
import { LORE_WORLDS, getWorldByName, getWorldRole } from './loreIndex';

export interface PlanetarySystem {
  id: string;
  name: string;
  classification: 'Frontier Sector' | 'Federation Homeworld' | 'Documented World';
  type: string;
  climate: string;
  gravity: string;
  atmosphere: string;
  dominantResource: string;
  governingFaction: string;
  residentSpecies: string[];
  coordinates: { ra: string; dec: string; distance: string; sectorGrid: string };
  image: string;
  description: string;
  keyLoreThemes: string[];
}

const UNKNOWN = 'Not specified in indexed canon';
const NO_COORDINATE = 'Not indexed';

const speciesByWorld: Record<string, string[]> = {
  Alta: ['Altans'],
  Khaur: ['Khaureds'],
  Velgemmis: ['Elgem'],
  Lopat: ['Lopati'],
  Earth: ['Humans'],
  Alfrheim: ['Nordics'],
  'New Pleione': ['Nordics'],
};

const classification = (value: string): PlanetarySystem['classification'] => {
  if (value === 'Frontier World') return 'Frontier Sector';
  if (value === 'Federation Homeworld') return 'Federation Homeworld';
  return 'Documented World';
};

export const PLANETARY_SYSTEMS: PlanetarySystem[] = LORE_WORLDS.map(world => ({
  id: world.id,
  name: world.name,
  classification: classification(world.classification),
  type: world.classification,
  climate: UNKNOWN,
  gravity: UNKNOWN,
  atmosphere: UNKNOWN,
  dominantResource: world.classification === 'Frontier World' ? 'Trilium-bearing world' : UNKNOWN,
  governingFaction: UNKNOWN,
  residentSpecies: speciesByWorld[world.name] || [],
  coordinates: {
    ra: NO_COORDINATE,
    dec: NO_COORDINATE,
    distance: NO_COORDINATE,
    sectorGrid: world.classification === 'Frontier World' ? 'Frontier' : 'Archive index'
  },
  image: world.image || '',
  description: world.description,
  keyLoreThemes: []
}));

export const getSystemById = (id: string): PlanetarySystem | undefined => {
  const world = getWorldByName(id);
  return world ? PLANETARY_SYSTEMS.find(system => system.id === world.id) : undefined;
};

/** Primary placement only. A mere mention is not enough to file a story under a world. */
export const isLoreForPlanet = (entry: LoreEntry, planetIdOrName: string): boolean => {
  return getWorldRole(entry, planetIdOrName) === 'primary';
};

export const isLoreReferenceForPlanet = (entry: LoreEntry, planetIdOrName: string): boolean => {
  return getWorldRole(entry, planetIdOrName) === 'reference';
};
