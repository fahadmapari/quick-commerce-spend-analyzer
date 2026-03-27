import { Platform } from 'react-native';
import { getGamificationState } from './storage';

type GoogleMobileAdsModule = typeof import('react-native-google-mobile-ads');
type InterstitialAdInstance = ReturnType<GoogleMobileAdsModule['InterstitialAd']['createForAdRequest']>;

let adsModule: GoogleMobileAdsModule | null | undefined;
let mobileAdsInitPromise: Promise<unknown> | null = null;
let appInterstitial: InterstitialAdInstance | null = null;
let appInterstitialLoaded = false;
let appInterstitialShowing = false;

const supportedPlatform = Platform.OS === 'android' || Platform.OS === 'ios';

function getAdsModule() {
  if (!supportedPlatform) {
    return null;
  }

  if (adsModule !== undefined) {
    return adsModule;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    adsModule = require('react-native-google-mobile-ads') as GoogleMobileAdsModule;
  } catch (error) {
    console.warn('Google Mobile Ads native module is unavailable. Build a dev/native client to test ads.', error);
    adsModule = null;
  }

  return adsModule;
}

function getInterstitialUnitId(module: GoogleMobileAdsModule) {
  if (__DEV__) {
    return module.TestIds.INTERSTITIAL;
  }

  const productionUnitId = Platform.select({
    android: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID_ANDROID,
    ios: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID_IOS,
    default: null,
  });

  return productionUnitId ?? module.TestIds.INTERSTITIAL;
}

function prepareInterstitial(module: GoogleMobileAdsModule) {
  if (appInterstitial) {
    return appInterstitial;
  }

  const adUnitId = getInterstitialUnitId(module);
  if (!adUnitId) {
    return null;
  }

  const interstitial = module.InterstitialAd.createForAdRequest(adUnitId, {
    requestNonPersonalizedAdsOnly: true,
  });

  interstitial.addAdEventListener(module.AdEventType.LOADED, () => {
    appInterstitialLoaded = true;
  });

  interstitial.addAdEventListener(module.AdEventType.OPENED, () => {
    appInterstitialShowing = true;
  });

  interstitial.addAdEventListener(module.AdEventType.CLOSED, () => {
    appInterstitialLoaded = false;
    appInterstitialShowing = false;
    interstitial.load();
  });

  interstitial.addAdEventListener(module.AdEventType.ERROR, (error) => {
    appInterstitialLoaded = false;
    appInterstitialShowing = false;
    console.warn('Interstitial ad failed to load or show.', error);
  });

  appInterstitial = interstitial;
  interstitial.load();

  return interstitial;
}

export async function initializeMobileAds() {
  const module = getAdsModule();
  if (!module) {
    return;
  }

  if (!mobileAdsInitPromise) {
    mobileAdsInitPromise = module
      .default()
      .initialize()
      .then(() => {
        prepareInterstitial(module);
      })
      .catch((error) => {
        mobileAdsInitPromise = null;
        throw error;
      });
  }

  await mobileAdsInitPromise;
}

export async function showInterstitialIfLoaded() {
  const module = getAdsModule();
  if (!module) {
    return false;
  }

  await initializeMobileAds();

  const interstitial = prepareInterstitial(module);
  if (!interstitial || !appInterstitialLoaded || appInterstitialShowing) {
    return false;
  }

  await interstitial.show();
  return true;
}

export async function showSyncInterstitialIfEligible() {
  const gamificationState = await getGamificationState();
  if (gamificationState.syncHistory.length === 0) {
    return false;
  }

  return showInterstitialIfLoaded();
}
