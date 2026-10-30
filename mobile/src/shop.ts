import Constants from 'expo-constants';

/** The shop this app was built for. It comes from shops/<id>/shop.json through app.config.js (extra.shop). */
export interface ShopInfo {
  id: string;
  name: string;
  nameHi: string;
  tagline: string;
  taglineHi: string;
  scheme: string;
  theme: Partial<Record<string, string>>;
  firebaseWeb: Record<string, string> | null;
}

const extra = Constants.expoConfig?.extra?.shop as Partial<ShopInfo> | undefined;

export const shop: ShopInfo = {
  id: extra?.id ?? '',
  name: extra?.name ?? '',
  nameHi: extra?.nameHi || extra?.name || '',
  tagline: extra?.tagline ?? '',
  taglineHi: extra?.taglineHi || extra?.tagline || '',
  scheme: extra?.scheme ?? '',
  theme: extra?.theme ?? {},
  firebaseWeb: extra?.firebaseWeb ?? null,
};

/** The shop's logo (shops/<id>/assets/logo.png, resolved by metro.config.js). */
export const shopLogo = require('@shop/assets/logo.png');
