// MC 2026-11-10 push notifications for the home-screen app. Standard Web Push, no third party: the phone hands the page a
// subscription (an address at Apple, Google or Mozilla plus two keys), the dashboard stores it, and the worker posts encrypted
// messages to that address. Everything is done here with WebCrypto: VAPID (RFC 8292) to identify the sender, aes128gcm
// (RFC 8291 / 8188) to encrypt the body so the push service cannot read it. The signing key is made on first use and never
// leaves this account's storage. Subscriptions carry their own switches (paper and live; positions opened, wins, losses), so
// each device chooses what it hears about. A subscription the push service reports gone (404/410) is dropped.
const te = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const HOSTS = [/^web\.push\.apple\.com$/, /(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
export const PUSH_DEF = { paper: { open: true, win: true, loss: true }, live: { open: true, win: true, loss: true } };
const okEndpoint = e => { try { const u = new URL(e); return u.protocol === 'https:' && HOSTS.some(h => h.test(u.hostname)); } catch { return false; } };
// MC 2026-11-11 chat: messages from friends, one switch, on unless turned off
const cleanPrefs = p => { const o = {}; for (const b of ['paper', 'live']) { o[b] = {}; for (const k of ['open', 'win', 'loss']) o[b][k] = p?.[b]?.[k] === undefined ? PUSH_DEF[b][k] : p[b][k] === true; } o.chat = p?.chat !== false; return o; };

async function vapid(storage) {
  let v = await storage.get('pushvapid');
  if (!v) { const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']); v = { pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), jwk: await crypto.subtle.exportKey('jwk', kp.privateKey) }; await storage.put('pushvapid', v); }
  return v;
}
async function vapidAuth(v, endpoint, sub) {
  const aud = new URL(endpoint).origin, head = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))), body = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub })));
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}
const hkdf = async (salt, ikm, info, len) => new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8));
// RFC 8291: one record, padding delimiter 0x02, header = salt(16) | record size(4) | key id length(1) | sender public key(65)
export async function encrypt(sub, text) {
  const ua = unb64u(sub.p256dh), auth = unb64u(sub.auth), salt = crypto.getRandomValues(new Uint8Array(16));
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), as = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, secret, cat(te.encode('WebPush: info\0'), ua, as), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']), cat(te.encode(text), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([as.length]), as, ct);
}
async function sendOne(v, sub, msg, contact) {
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { authorization: await vapidAuth(v, sub.endpoint, contact), 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: String(msg.ttl || 900), urgency: 'high', ...(msg.tag ? { topic: String(msg.tag).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}) }, body: await encrypt(sub, JSON.stringify(msg)) });
  return r.status;
}
// events: [{ book: 'paper'|'live', kind: 'open'|'settle', win, loss, title, body, tag, url }]. Each device gets the ones its switches allow.
export async function pushSend(storage, events, contact) {
  if (!events?.length) return 0;
  contact = contact || (await storage.get('pushcontact')) || 'https://github.com/mcClaudeAi/kalshi-radar';
  const subs = (await storage.get('pushsubs')) || []; if (!subs.length) return 0;
  const v = await vapid(storage); let sent = 0; const dead = new Set();
  for (const s of subs) for (const e of events) {
    if (e.kind === 'chat') { if (s.prefs?.chat === false) continue; } else { const p = s.prefs?.[e.book] || {}; if (!(e.kind === 'open' ? p.open : ((e.win && p.win) || (e.loss && p.loss)))) continue; }
    try { const st = await sendOne(v, s, { title: e.title, body: e.body, tag: e.tag, url: e.url || '/' }, contact); if (st === 404 || st === 410) dead.add(s.endpoint); else if (st >= 200 && st < 300) sent++; else console.log('push ' + st); } catch (x) { console.log('push error ' + x.message); }
  }
  if (dead.size) await storage.put('pushsubs', subs.filter(s => !dead.has(s.endpoint)));
  return sent;
}
// the dashboard's side: one entry point for both workers. op: 'key' | 'get' | 'sub' | 'prefs' | 'unsub' | 'test'
export async function pushApi(storage, op, b = {}, contact) {
  const subs = (await storage.get('pushsubs')) || [], i = subs.findIndex(s => s.endpoint === b.endpoint);
  if (op === 'key') return { ok: true, key: (await vapid(storage)).pub, devices: subs.length };
  if (op === 'get') return { ok: true, on: i >= 0, prefs: i >= 0 ? subs[i].prefs : cleanPrefs(null), devices: subs.length };
  if (op === 'sub') {
    const k = b.keys || {}; if (!okEndpoint(b.endpoint) || !k.p256dh || !k.auth) return { ok: false, msg: 'That is not a push subscription this dashboard can use.' };
    const row = { endpoint: b.endpoint, p256dh: String(k.p256dh), auth: String(k.auth), prefs: cleanPrefs(b.prefs ?? (i >= 0 ? subs[i].prefs : null)), at: Date.now(), name: String(b.name || '').slice(0, 60) };
    if (i >= 0) subs[i] = row; else subs.push(row); await storage.put('pushsubs', subs.slice(-12));
    // the push services want a contact URL in the signed token; the dashboard's own address is the honest one
    if (/^https:\/\/[^/]+$/.test(String(b.origin || ''))) await storage.put('pushcontact', b.origin);
    return { ok: true, on: true, prefs: row.prefs, msg: 'Notifications are on for this device.' };
  }
  if (i < 0) return { ok: false, msg: 'Notifications are not on for this device.' };
  if (op === 'prefs') { subs[i].prefs = cleanPrefs(b.prefs); await storage.put('pushsubs', subs); return { ok: true, on: true, prefs: subs[i].prefs }; }
  if (op === 'unsub') { subs.splice(i, 1); await storage.put('pushsubs', subs); return { ok: true, on: false, msg: 'Notifications are off for this device.' }; }
  if (op === 'test') { const st = await sendOne(await vapid(storage), subs[i], { title: 'Notifications are on', body: 'This device will be told when positions open and when they settle, according to the switches you have set.', tag: 'test', url: '/' }, contact || (await storage.get('pushcontact')) || 'https://github.com/mcClaudeAi/kalshi-radar'); if (st === 404 || st === 410) { subs.splice(i, 1); await storage.put('pushsubs', subs); return { ok: false, msg: 'This device\'s subscription has expired. Turn notifications on again.' }; } return st >= 200 && st < 300 ? { ok: true, msg: 'Test sent. It should arrive within a few seconds.' } : { ok: false, msg: `The push service answered ${st}. Try again in a minute.` }; }
  return { ok: false, msg: 'Unknown request.' };
}
// the service worker, served at /sw.js by both workers
export const SW_JS = `// Kalshi Radar service worker: shows push notifications and opens the dashboard when one is tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => { let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: 'Kalshi Radar', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Kalshi Radar', { body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url || '/' } })); });
self.addEventListener('notificationclick', e => { e.notification.close(); const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => { for (const c of l) if ('focus' in c) return c.focus(); return self.clients.openWindow(url); })); });
`;
