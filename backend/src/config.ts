import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Values pasted into a hosting dashboard often carry a trailing space or newline; trim them all.
/** Supabase's public root CA, shipped with the API so verification needs nothing but DATABASE_SSL_VERIFY=on. */
function bundledSupabaseCa() {
  const file = fileURLToPath(new URL('../certs/supabase-prod-ca-2021.crt', import.meta.url));
  if (!existsSync(file)) throw new Error('DATABASE_SSL_VERIFY=on but certs/supabase-prod-ca-2021.crt is missing');
  return readFileSync(file, 'utf8');
}

const env: Record<string, string | undefined> = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v?.trim()]));

/**
 * The shop this server runs for. Every shop has its own server and database; SHOP (or shops/default) picks its module
 * in shops/<id>/ for the name, colours and logo printed on invoices and notifications.
 */
function loadShop() {
  const shopsDir = fileURLToPath(new URL('../../shops/', import.meta.url));
  const defaultFile = shopsDir + 'default';
  const id = env.SHOP || (existsSync(defaultFile) ? readFileSync(defaultFile, 'utf8').trim() : '');
  const file = `${shopsDir}${id}/shop.json`;
  if (!id || !existsSync(file)) throw new Error(`SHOP must name a shop module in shops/ (got "${id}")`);
  const s = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const logo = `${shopsDir}${id}/assets/logo.png`;
  return {
    id,
    name: String(s.name ?? id),
    invoiceTagline: String(s.invoiceTagline ?? ''),
    primary: String(s.theme?.primary ?? '#0B5ED7'),
    navy: String(s.theme?.navy ?? '#0F2147'),
    logoPath: existsSync(logo) ? logo : null,
  };
}
export const config = {
  shop: loadShop(),
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT ?? 4000),
  databaseUrl: env.DATABASE_URL ?? '',
  /** How the login OTP is sent: 'sms' = our own code through the SMS gateway the admin configures (PearlSMS), 'twilio' = Twilio Verify, 'firebase' = Firebase phone auth. */
  authMode: (env.AUTH_MODE ?? 'firebase') as 'dev' | 'firebase' | 'twilio' | 'sms',
  jwtSecret: env.JWT_SECRET ?? '',
  firebaseProjectId: env.FIREBASE_PROJECT_ID ?? '',
  firebaseServiceAccount: env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '',
  bootstrapAdminPhones: (env.BOOTSTRAP_ADMIN_PHONES ?? '').split(',').map((p) => p.trim()).filter(Boolean),
  cloudinary: { cloudName: env.CLOUDINARY_CLOUD_NAME ?? '', apiKey: env.CLOUDINARY_API_KEY ?? '', apiSecret: env.CLOUDINARY_API_SECRET ?? '' },
  /** Twilio Verify sends and checks the SMS OTP when AUTH_MODE=twilio. */
  twilio: { accountSid: env.TWILIO_ACCOUNT_SID ?? '', authToken: env.TWILIO_AUTH_TOKEN ?? '', verifyServiceSid: env.TWILIO_VERIFY_SERVICE_SID ?? '' },
  razorpay: { keyId: env.RAZORPAY_KEY_ID ?? '', keySecret: env.RAZORPAY_KEY_SECRET ?? '', webhookSecret: env.RAZORPAY_WEBHOOK_SECRET ?? '' },
  /** Origins allowed to call the API from a browser (the web admin). The mobile apps send no Origin header and are not affected. */
  corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
  /** PEM text of the database's CA certificate. When set, the database connection is verified instead of merely encrypted. */
  databaseCa: (env.DATABASE_CA ?? '').replace(/\\n/g, '\n') || (env.DATABASE_SSL_VERIFY === 'on' ? bundledSupabaseCa() : ''),
  /** 'socket': the API is reachable only through the app's live connection (plus webhooks, health and file-download links). */
  socketOnly: env.API_TRANSPORT === 'socket',
  logRequests: env.LOG_REQUESTS ? env.LOG_REQUESTS === 'on' : env.NODE_ENV === 'production',
  minLeadMinutes: Number(env.MIN_LEAD_MINUTES ?? 60),
  quoteValidHours: Number(env.QUOTE_VALID_HOURS ?? 24),
};

if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
if (!config.jwtSecret || config.jwtSecret.length < 32) throw new Error('JWT_SECRET (32+ chars) is required');
if (config.isProd && config.authMode === 'dev') throw new Error('AUTH_MODE=dev is not allowed when NODE_ENV=production');
if (config.authMode === 'twilio' && !(config.twilio.accountSid && config.twilio.authToken && config.twilio.verifyServiceSid)) throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID are required when AUTH_MODE=twilio');
if (config.authMode === 'firebase' && !config.firebaseProjectId) throw new Error('FIREBASE_PROJECT_ID is required when AUTH_MODE=firebase');
