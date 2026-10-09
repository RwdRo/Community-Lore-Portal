import redirects from '../../server/data/legacy_source_redirects.json';
import archive from '../../server/data/source_archive.json';
import type {LoreEntry} from '../types';
export const SOURCE_STORIES = archive.stories as unknown as LoreEntry[];
export const SOURCE_REVISION = archive.source.commit;
export function sourceStoryForId(id:string){return SOURCE_STORIES.find(story=>story.id===id||story.legacyIds?.includes(id));}
export function sourceRecordId(id:string){return (redirects as Record<string,{id:string}>)[id]?.id||id;}
export function sourceTitleForId(id:string){return (redirects as Record<string,{title:string}>)[id]?.title||sourceStoryForId(id)?.title;}
