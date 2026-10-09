import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export type State = { version: 1; accounts: Record<string, any>; sessions: Record<string, any>; documents: Record<string, Record<string, any>>; players: Record<string, any> };
const directory = path.resolve(process.env.APP_DATA_DIR || path.join(process.env.DATA_DIR || 'data', 'application'));
const filename = path.join(directory, 'application.json');
let state: State | undefined;
function load() {
  if (state) return state;
  fs.mkdirSync(directory, { recursive: true });
  const lock = path.join(directory, 'writer.lock');
  try {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    try { process.kill(pid, 0); throw new Error('Application store already has an active writer. Run one server per application directory.'); }
    catch (error: any) { if (error.code !== 'ESRCH') throw error; fs.unlinkSync(lock); }
  } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  const fd = fs.openSync(lock, 'wx'); fs.writeFileSync(fd, String(process.pid)); fs.closeSync(fd);
  process.once('exit', () => { try { fs.unlinkSync(lock); } catch {} });
  if (fs.existsSync(filename)) {
    const parsed = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (parsed.version !== 1 || !parsed.accounts || !parsed.documents || !parsed.players || !parsed.sessions) throw new Error('Application data is invalid. Restore a verified backup; refusing to erase user data.');
    state = parsed;
  } else state = { version: 1, accounts: {}, sessions: {}, documents: { users: {}, lore: {}, comments: {}, votes: {}, bounties: {}, activity: {} }, players: {} };
  return state!;
}
export function readApplication(): Readonly<State> { return load(); }
export function updateApplication<T>(change: (next: State) => T): T {
  const next: State = structuredClone(load());
  const result = change(next);
  const temporary = filename + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(next)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  try {
    if (fs.existsSync(filename)) fs.copyFileSync(filename, filename + '.bak');
    fs.renameSync(temporary, filename);
    state = next;
  } catch (error) { try { fs.unlinkSync(temporary); } catch {} throw error; }
  return result;
}
