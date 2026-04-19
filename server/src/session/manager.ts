import * as fs from 'fs';
import * as path from 'path';

const SESSION_DIR = path.join(process.cwd(), '.sessions');

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function sessionPath(platform: string, sessionId: string): string {
  // Sanitize to prevent path traversal
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(SESSION_DIR, `${safe(platform)}_${safe(sessionId)}.json`);
}

export function loadSession(platform: string, sessionId: string): object[] | null {
  const p = sessionPath(platform, sessionId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as object[];
  } catch {
    return null;
  }
}

export function saveSession(platform: string, sessionId: string, cookies: object[]): void {
  fs.writeFileSync(sessionPath(platform, sessionId), JSON.stringify(cookies, null, 2));
}

export function clearSession(platform: string, sessionId: string): void {
  const p = sessionPath(platform, sessionId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
