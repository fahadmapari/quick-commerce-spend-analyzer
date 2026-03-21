import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlatformId } from '@/types/platform';

type Listener = (nonce: number) => void;

const listenersMap = new Map<PlatformId, Set<Listener>>();

function getListeners(platform: PlatformId): Set<Listener> {
  if (!listenersMap.has(platform)) {
    listenersMap.set(platform, new Set());
  }
  return listenersMap.get(platform)!;
}

function nonceKey(platform: PlatformId): string {
  return `session_reset_nonce_v1_${platform}`;
}

async function readNonce(platform: PlatformId): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(nonceKey(platform));
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
}

export async function getSessionResetNonce(platform: PlatformId): Promise<number> {
  return readNonce(platform);
}

export async function requestSessionReset(platform: PlatformId): Promise<number> {
  const next = (await readNonce(platform)) + 1;
  await AsyncStorage.setItem(nonceKey(platform), String(next));
  getListeners(platform).forEach((listener) => listener(next));
  return next;
}

export function subscribeToSessionReset(platform: PlatformId, listener: Listener): () => void {
  const listeners = getListeners(platform);
  listeners.add(listener);
  return () => listeners.delete(listener);
}
