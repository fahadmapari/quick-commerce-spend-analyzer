import { Platform } from 'react-native';

type GoogleMobileAdsModule = typeof import('react-native-google-mobile-ads');
type InterstitialAdInstance = ReturnType<GoogleMobileAdsModule['InterstitialAd']['createForAdRequest']>;

let adsModule: GoogleMobileAdsModule | null | undefined;
let mobileAdsInitPromise: Promise<unknown> | null = null;
let insightsInterstitial: InterstitialAdInstance | null = null;
let insightsInterstitialLoaded = false;
let insightsInterstitialShowing = false;

const supportedPlatform = Platform.OS === 'android' || Platform.OS === 'ios';

function getAdsModule() {
  if (!supportedPlatform) {
    return null;
  }

  if (adsModule !== undefined) {
    return adsModule;
  }

  try {
    adsModule = require('react-native-google-mobile-ads') as GoogleMobileAdsModule;
  } catch (error) {
    console.warn('Google Mobile Ads native module is unavailable. Build a dev/native client to test ads.', error);
    adsModule = null;
  }

  return adsModule;
}

function getInsightsInterstitialUnitId(module: GoogleMobileAdsModule) {
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

function prepareInsightsInterstitial(module: GoogleMobileAdsModule) {
  if (insightsInterstitial) {
    return insightsInterstitial;
  }

  const adUnitId = getInsightsInterstitialUnitId(module);
  if (!adUnitId) {
    return null;
  }

  const interstitial = module.InterstitialAd.createForAdRequest(adUnitId, {
    requestNonPersonalizedAdsOnly: true,
  });

  interstitial.addAdEventListener(module.AdEventType.LOADED, () => {
    insightsInterstitialLoaded = true;
  });

  interstitial.addAdEventListener(module.AdEventType.OPENED, () => {
    insightsInterstitialShowing = true;
  });

  interstitial.addAdEventListener(module.AdEventType.CLOSED, () => {
    insightsInterstitialLoaded = false;
    insightsInterstitialShowing = false;
    interstitial.load();
  });

  interstitial.addAdEventListener(module.AdEventType.ERROR, (error) => {
    insightsInterstitialLoaded = false;
    insightsInterstitialShowing = false;
    console.warn('Insights interstitial failed to load or show.', error);
  });

  insightsInterstitial = interstitial;
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
        prepareInsightsInterstitial(module);
      })
      .catch((error) => {
        mobileAdsInitPromise = null;
        throw error;
      });
  }

  await mobileAdsInitPromise;
}

export async function showInsightsInterstitialIfLoaded() {
  const module = getAdsModule();
  if (!module) {
    return false;
  }

  await initializeMobileAds();

  const interstitial = prepareInsightsInterstitial(module);
  if (!interstitial || !insightsInterstitialLoaded || insightsInterstitialShowing) {
    return false;
  }

  await interstitial.show();
  return true;
}
