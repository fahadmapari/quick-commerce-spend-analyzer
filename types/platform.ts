export type PlatformId = 'blinkit' | 'zepto';

export interface PlatformConfig {
  id: PlatformId;
  displayName: string;
  url: string;
  cookieDomain: string;
  color: string;
  icon: string;
}

export const PLATFORM_CONFIGS: Record<PlatformId, PlatformConfig> = {
  blinkit: {
    id: 'blinkit',
    displayName: 'Blinkit',
    url: 'https://blinkit.com',
    cookieDomain: '.blinkit.com',
    color: '#f8c724',
    icon: 'flash',
  },
  zepto: {
    id: 'zepto',
    displayName: 'Zepto',
    url: 'https://www.zeptonow.com',
    cookieDomain: '.zeptonow.com',
    color: '#7b2ff2',
    icon: 'rocket',
  },
};

export const ALL_PLATFORMS: PlatformId[] = ['blinkit', 'zepto'];
