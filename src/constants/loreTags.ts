export const LORE_TAG_CATEGORIES = {
  PLANETS_FRONTIER: [
    "Eyeke", "Kavian", "Magor", "Naron", "Neri", "Veles"
  ],
  WORLDS_DOCUMENTED: [
    "Alta", "Khaur", "Velgemmis", "Lopat", "Earth", "Alfrheim", "New Pleione", "Nyssari"
  ],
  SPECIES: [
    "Altan", "Elgem", "Human", "Khaured", "Lopati", "Onoros", "Robotron", "Augments", "Nordic", "Hodlodytes"
  ],
  FACTIONS: [
    "The Federation", "Water Barons Guild", "Hydrarch", "Sandmasters"
  ],
  TECHNOLOGY: [
    "Trilium", "Triactor Technology", "Triactor Jack", "Data Core", "Biometal",
    "Arkhive", "Galactic Fireblade", "Sandmaster Spear", "Waxon", "Soul Sand", "Fire Marble"
  ]
} as const;

export const ALL_LORE_TAGS = Object.values(LORE_TAG_CATEGORIES).flat() as string[];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Match taxonomy terms as complete lexical units. This prevents collisions such
 * as `Khaur` being inferred from `Khaured` and keeps tagging evidence-based.
 */
export const textContainsTag = (text: string, tag: string): boolean => {
  if (!text || !tag) return false;
  const escaped = escapeRegExp(tag);
  const pattern = new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, 'i');
  return pattern.test(text);
};

export const getTagsFromText = (text: string): string[] => {
  if (!text) return [];
  return ALL_LORE_TAGS.filter(tag => textContainsTag(text, tag));
};
