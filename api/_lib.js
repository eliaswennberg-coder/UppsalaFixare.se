// Gemensam kod för drift-appen (/admin). Filer som börjar med _ blir inte egna endpoints på Vercel.
import crypto from 'node:crypto';

// ---------- Lagring ----------
let store = null;

function memStore() {
  // Endast för lokal utveckling när ingen Redis finns.
  const g = globalThis.__ufMem || (globalThis.__ufMem = { h: {}, l: {}, k: {} });
  return {
    async hget(k, f) { return g.h[k]?.[f] ?? null; },
    async hset(k, obj) { g.h[k] = { ...(g.h[k] || {}), ...obj }; return 1; },
    async hgetall(k) { return g.h[k] ? { ...g.h[k] } : null; },
    async hdel(k, f) { if (g.h[k]) delete g.h[k][f]; return 1; },
    async get(k) { return g.k[k] ?? null; },
    async set(k, v) { g.k[k] = v; return 'OK'; },
    async incr(k) { g.k[k] = (g.k[k] || 0) + 1; return g.k[k]; },
    async expire() { return 1; },
    async lpush(k, v) { (g.l[k] ||= []).unshift(v); return g.l[k].length; },
    async lrange(k, a, b) { const l = g.l[k] || []; return l.slice(a, b < 0 ? l.length + b + 1 : b + 1); },
    async ltrim(k, a, b) { if (g.l[k]) g.l[k] = g.l[k].slice(a, b + 1); return 'OK'; },
    async lset(k, i, v) { if (g.l[k]) g.l[k][i] = v; return 'OK'; },
  };
}

export function hasRedis() {
  return !!((process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
    (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN));
}

export async function db() {
  if (store) return store;
  if (hasRedis()) {
    const { Redis } = await import('@upstash/redis');
    store = new Redis({
      url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  } else if (process.env.VERCEL) {
    throw new HttpError(500, 'Databasen är inte kopplad ännu (Upstash Redis i Vercel → Storage).');
  } else {
    store = memStore();
  }
  return store;
}

export const parse = (v) => {
  if (v == null) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return v; } }
  return v;
};

// ---------- HTTP ----------
export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      send(res, status, { error: e.message || 'Något gick fel' });
    }
  };
}

export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return {};
}

// ---------- Inloggning ----------
// TEAM_PINS = "Elias=1234,Viktor=5678"
export function team() {
  const out = {};
  for (const part of String(process.env.TEAM_PINS || '').split(',')) {
    const [name, pin] = part.split('=').map((s) => s && s.trim());
    if (name && pin) out[pin] = name;
  }
  if (!process.env.VERCEL && !Object.keys(out).length) out['0000'] = 'Test';
  return out;
}

function secret() {
  return crypto.createHash('sha256')
    .update('uf-drift|' + (process.env.TEAM_PINS || 'dev') + '|' + (process.env.ELKS_PASS || ''))
    .digest();
}

const sign = (s) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');

export function makeSession(name) {
  const payload = Buffer.from(JSON.stringify({ n: name, e: Date.now() + 30 * 864e5 })).toString('base64url');
  return payload + '.' + sign(payload);
}

function cookies(req) {
  const out = {};
  for (const c of String(req.headers.cookie || '').split(';')) {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(value, maxAge) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `uf_s=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function currentUser(req) {
  const raw = cookies(req).uf_s;
  if (!raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const good = sign(payload);
  if (good.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig))) return null;
  try {
    const { n, e } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() > e) return null;
    // Om personen tagits bort ur TEAM_PINS gäller inte inloggningen längre.
    if (!Object.values(team()).includes(n)) return null;
    return n;
  } catch { return null; }
}

export function requireUser(req) {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, 'Logga in');
  return u;
}

// ---------- Hjälpare ----------
export function normPhone(p) {
  let s = String(p || '').replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = '+' + s.slice(2);
  else if (s.startsWith('0')) s = '+46' + s.slice(1);
  else if (s.startsWith('46')) s = '+' + s;
  else if (!s.startsWith('+')) s = '+46' + s;
  return s;
}

const tz = 'Europe/Stockholm';
export const today = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(d);
export const clock = (d = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d);
export const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
export const newId = () => crypto.randomBytes(6).toString('base64url');

export const DEFAULT_SETTINGS = {
  templatePhoto: 'Hej {namn}! Nu är det klart hos dig på {adress} (kl {tid}). Bild bifogad. Ha en fin dag! /UppsalaFixaren',
  templateNoPhoto: 'Hej {namn}! Nu är det klart hos dig på {adress} (kl {tid}). Ha en fin dag! /UppsalaFixaren',
};

export async function settings() {
  const s = parse(await (await db()).get('settings')) || {};
  return { ...DEFAULT_SETTINGS, ...s };
}

export function fill(tpl, c, time) {
  const first = String(c.name || '').trim().split(/\s+/)[0] || '';
  return tpl.replaceAll('{namn}', first).replaceAll('{adress}', c.address || '').replaceAll('{tid}', time);
}

// ---------- 46elks ----------
export const elksReady = () => !!(process.env.ELKS_USER && process.env.ELKS_PASS && process.env.ELKS_FROM);

const env = (k) => String(process.env[k] || '').trim();

export function elksCheck() {
  const u = env('ELKS_USER'), p = env('ELKS_PASS');
  const issues = [];
  if (!u) issues.push('ELKS_USER saknas');
  else if (!/^u[0-9a-f]{20,}$/i.test(u)) issues.push(`ELKS_USER ser fel ut (ska börja med "u" följt av en lång kod, är ${u.length} tecken)`);
  if (!p) issues.push('ELKS_PASS saknas');
  else if (!/^[0-9A-F]{20,}$/i.test(p)) issues.push(`ELKS_PASS ser ovanligt ut (${p.length} tecken) – kontrollera att det är API-lösenordet, inte inloggningslösenordet`);
  return issues;
}

export async function elks(path, params, method = 'POST') {
  if (!env('ELKS_USER') || !env('ELKS_PASS')) return { skipped: 'Inga 46elks-nycklar inlagda' };
  const r = await fetch('https://api.46elks.com/a1/' + path, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(env('ELKS_USER') + ':' + env('ELKS_PASS')).toString('base64'),
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const text = await r.text();
  if (!r.ok) return { error: (text || r.statusText).slice(0, 300) };
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 300) }; }
}

export async function sendText(to, message) {
  if (!process.env.ELKS_FROM) return { skipped: 'ELKS_FROM saknas' };
  return elks('sms', { from: env('ELKS_FROM'), to: normPhone(to), message });
}

export async function sendMms(to, message, image) {
  if (!process.env.ELKS_FROM) return { skipped: 'ELKS_FROM saknas' };
  return elks('mms', { from: env('ELKS_FROM'), to: normPhone(to), message, image });
}

export function smsStatus(r) {
  if (r.skipped) return { status: 'skipped', note: r.skipped };
  if (r.error) return { status: 'error', note: r.error };
  return { status: 'sent', id: r.id, cost: r.cost };
}

// Hemlig del av webhook-adressen för svar, härledd från 46elks-lösenordet.
export const inboundKey = () =>
  crypto.createHmac('sha256', secret()).update('inbound').digest('base64url').slice(0, 20);
