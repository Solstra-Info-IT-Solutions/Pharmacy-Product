import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { shop } from './shop';

/**
 * The shop's Firebase *web app*, used by the website for push notifications (and for Firebase phone sign-in when the
 * server is not sending OTPs itself). It comes from shops/<id>/firebase-web.json. These values are public by design:
 * they identify the project, they do not grant access. EXPO_PUBLIC_FIREBASE_WEB_CONFIG can override them.
 */
const DEFAULT_CONFIG: Record<string, string> = shop.firebaseWeb ?? {};

function readConfig(): Record<string, string> {
  const raw = process.env.EXPO_PUBLIC_FIREBASE_WEB_CONFIG;
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.messagingSenderId && parsed.appId?.includes(':web:') ? parsed : { ...parsed, ...DEFAULT_CONFIG };
  } catch { return DEFAULT_CONFIG; }
}

export const firebaseWebConfig = readConfig();
export const firebaseWebApp = (): FirebaseApp => getApps()[0] ?? initializeApp(firebaseWebConfig);
