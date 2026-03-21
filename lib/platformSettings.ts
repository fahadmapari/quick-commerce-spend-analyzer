import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlatformId } from '@/types/platform';

const SETTINGS_KEY = 'platform_settings_v1';

interface PlatformSettings {
  selectedPlatforms: PlatformId[];
  hasCompletedInitialSelection: boolean;
}

function defaultSettings(): PlatformSettings {
  return {
    selectedPlatforms: [],
    hasCompletedInitialSelection: false,
  };
}

async function load(): Promise<PlatformSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    return JSON.parse(raw) as PlatformSettings;
  } catch {
    return defaultSettings();
  }
}

async function save(settings: PlatformSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function getSelectedPlatforms(): Promise<PlatformId[]> {
  const s = await load();
  return s.selectedPlatforms;
}

export async function setSelectedPlatforms(platforms: PlatformId[]): Promise<void> {
  const s = await load();
  s.selectedPlatforms = platforms;
  await save(s);
}

export async function hasCompletedPlatformSelection(): Promise<boolean> {
  const s = await load();
  return s.hasCompletedInitialSelection;
}

export async function markPlatformSelectionComplete(platforms: PlatformId[]): Promise<void> {
  await save({
    selectedPlatforms: platforms,
    hasCompletedInitialSelection: true,
  });
}
