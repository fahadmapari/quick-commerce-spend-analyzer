import { PlatformId, PLATFORM_CONFIGS } from '@/types/platform';
import { PlatformProvider } from './types';
import { blinkitProvider } from './blinkit';
import { zeptoProvider } from './zepto';

const providers: Record<PlatformId, PlatformProvider> = {
  blinkit: blinkitProvider,
  zepto: zeptoProvider,
};

export function getProvider(id: PlatformId): PlatformProvider {
  return providers[id];
}

export { PLATFORM_CONFIGS };
export type { PlatformProvider } from './types';
