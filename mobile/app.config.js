const { activeShopId, readShop, shopFile } = require('../tools/shops.cjs');

/**
 * Extends app.json with the shop this build is for (shops/<id>/, chosen by SHOP or shops/default; see shops/README.md).
 * Name, ids, icons, splash, theme and Firebase files all come from the shop module, so no code changes per shop.
 * Firebase native config is added only when the shop has its Firebase files, so a new shop still builds in dev-auth mode.
 */
module.exports = ({ config }) => {
  const id = activeShopId();
  const shop = readShop(id);
  const asset = (name) => `../shops/${id}/${name}`;
  const hasAndroid = !!shopFile(id, 'google-services.json');
  const hasIos = !!shopFile(id, 'GoogleService-Info.plist');
  const webConfig = shopFile(id, 'firebase-web.json');

  const plugins = [
    ...(config.plugins ?? []),
    ['expo-splash-screen', { backgroundColor: shop.splashBackground, image: asset('assets/splash-icon.png') }],
    ['expo-location', { locationWhenInUsePermission: `Allow ${shop.name} to use your location to help fill a delivery address.` }],
    ['expo-image-picker', {
      photosPermission: `Allow ${shop.name} to access your photos to attach a prescription.`,
      cameraPermission: `Allow ${shop.name} to use the camera to photograph a prescription.`,
    }],
  ];
  if (hasAndroid || hasIos) {
    plugins.push('@react-native-firebase/app', '@react-native-firebase/auth', '@react-native-firebase/messaging', '@react-native-firebase/crashlytics');
  }
  // One entry for both platforms. Android never allows plain-HTTP traffic in a built app; iOS needs static frameworks for Firebase.
  // ENABLE_R8=true (the "hardened" EAS profile) shrinks and obfuscates the native code. The rules keep what Razorpay needs by reflection.
  const r8 = process.env.ENABLE_R8 === 'true';
  const razorpayRules = ['-keepattributes *Annotation*', '-dontwarn com.razorpay.**', '-keep class com.razorpay.** {*;}', '-optimizations !method/inlining/*', '-keepclasseswithmembers class * { public void onPayment*(...); }'].join('\n');
  plugins.push(['expo-build-properties', {
    android: { usesCleartextTraffic: false, ...(r8 ? { enableProguardInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true, extraProguardRules: razorpayRules } : {}) },
    ...(hasAndroid || hasIos ? { ios: { useFrameworks: 'static' } } : {}),
  }]);

  return {
    ...config,
    name: shop.name,
    slug: shop.expo.slug,
    ...(shop.expo.owner ? { owner: shop.expo.owner } : {}),
    version: shop.app.version,
    scheme: shop.app.scheme,
    icon: asset('assets/icon.png'),
    splash: { ...config.splash, image: asset('assets/splash-icon.png'), backgroundColor: shop.splashBackground },
    plugins,
    ios: {
      ...config.ios,
      ...(shop.app.iosBundleId ? { bundleIdentifier: shop.app.iosBundleId } : {}),
      ...(hasIos ? { googleServicesFile: asset('GoogleService-Info.plist') } : {}),
    },
    android: {
      ...config.android,
      package: shop.app.androidPackage,
      adaptiveIcon: { foregroundImage: asset('assets/adaptive-icon.png'), backgroundColor: shop.splashBackground },
      ...(hasAndroid ? { googleServicesFile: asset('google-services.json') } : {}),
    },
    web: { ...config.web, ...(shopFile(id, 'assets/favicon.png') ? { favicon: asset('assets/favicon.png') } : {}) },
    extra: {
      ...config.extra,
      ...(shop.expo.projectId ? { eas: { projectId: shop.expo.projectId } } : {}),
      apiUrl: process.env.EXPO_PUBLIC_API_URL || shop.apiUrl,
      // Read at runtime by src/shop.ts.
      shop: {
        id,
        name: shop.name,
        nameHi: shop.nameHi,
        tagline: shop.tagline,
        taglineHi: shop.taglineHi,
        scheme: shop.app.scheme,
        theme: shop.theme,
        firebaseWeb: webConfig ? JSON.parse(require('fs').readFileSync(webConfig, 'utf8')) : null,
      },
    },
  };
};
