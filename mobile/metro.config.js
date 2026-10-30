const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { activeShopId, SHOPS_DIR } = require('../tools/shops.cjs');

const config = getDefaultConfig(__dirname);

// `@shop/...` is the active shop's module folder (shops/<id>/), e.g. require('@shop/assets/logo.png').
// After switching SHOP, start Metro with --clear so no bundle from the previous shop is reused.
const shopDir = path.join(SHOPS_DIR, activeShopId());
config.watchFolders = [...(config.watchFolders ?? []), SHOPS_DIR];

// Animations were removed from the app: every `react-native-reanimated` import resolves to an inert stand-in.
const noMotion = path.resolve(__dirname, 'src', 'noMotion.tsx');
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-reanimated') return { type: 'sourceFile', filePath: noMotion };
  if (moduleName.startsWith('@shop/')) return context.resolveRequest(context, path.join(shopDir, moduleName.slice('@shop/'.length)), platform);
  return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
