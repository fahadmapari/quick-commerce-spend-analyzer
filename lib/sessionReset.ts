import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_RESET_NONCE_KEY = 'blinkit_session_reset_nonce_v1';

type Listener = (nonce: number) => void;

const listeners = new Set<Listener>();

async function readNonce(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_RESET_NONCE_KEY);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
}

export async function getBlinkitSessionResetNonce(): Promise<number> {
  return readNonce();
}

export async function requestBlinkitSessionReset(): Promise<number> {
  const next = (await readNonce()) + 1;
  await AsyncStorage.setItem(SESSION_RESET_NONCE_KEY, String(next));
  listeners.forEach((listener) => listener(next));
  return next;
}

export function subscribeToBlinkitSessionReset(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
