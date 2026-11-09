import PAGE from './page.html';
import { createKalshi } from './kalshi-cloud.js';
// Kalshi Radar, the plug-and-play edition of the Curve Radar Kalshi dashboard (Cloudflare Worker + one Durable Object).
//
// MC 2026-11-08 asked for a version someone else can run with nothing but a Cloudflare account and their own Kalshi key, with every
// setting on the page instead of in config files or terminal secrets. Differences from the personal dashboard:
//   - no view key or Telegram pairing. The first visit shows a setup screen: pick a passcode, a starting paper bank and a size.
//     Later visits sign in with the passcode. Sessions are a random token in an HttpOnly cookie; only its SHA-256 is stored.
//     Five wrong passcodes in 15 minutes lock sign-in for 15 minutes.
//   - the Kalshi key is pasted on the Connections page, tested against Kalshi (a balance read) before it is saved, then stored
//     encrypted (AES-GCM) in this object's storage. It is never sent back to the page; the page only sees "connected, key ending
//     xxxx". The encryption key is the ENC_KEY secret if one is set, otherwise a random key generated once and kept apart from the
//     ciphertext. Either way the data never leaves the owner's Cloudflare account.
//   - no PC bot, copy trading or memecoin pages. The engine (kalshi-cloud.js) is the same file the personal dashboard runs.
const SAVE_MS = 60000, SESS_DAYS = 90, PBKDF2_ITER = 100000;
const enc = new TextEncoder(), dec = new TextDecoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const J = (o, status = 200, h = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...h } });
const cookie = (req, k) => (req.headers.get('cookie') || '').split(/;\s*/).find(c => c.startsWith(k + '='))?.slice(k.length + 1) || '';
const same = (a, b) => { if (a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
const pemOk = p => /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+-----END [A-Z ]*PRIVATE KEY-----/.test(p);

async function hashPass(pass, saltHex) {
  const k = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: PBKDF2_ITER }, k, 256));
}

export class Store {
  constructor(state, env) {
    this.state = state; this.env = env; this.mem = {}; this.saved = {}; this.keysLoaded = false;
    // the engine reads the Kalshi key from this object; loadKeys() fills it from encrypted storage
    this.kenv = { KEY_HELP: 'Connect your Kalshi key on the Connections page first.' };
    this.K = createKalshi(state, this.kenv, (o, f) => this.keep(o, f));
  }
  async keep(obj, force = false) {
    Object.assign(this.mem, obj); const t = Date.now(), due = {};
    for (const [k, v] of Object.entries(obj)) if (force || !(t - (this.saved[k] || 0) < SAVE_MS)) { due[k] = v; this.saved[k] = t; }
    if (Object.keys(due).length) await this.state.storage.put(due);
  }
  async read(k) { if (k in this.mem) return this.mem[k]; const v = await this.state.storage.get(k); if (v != null) this.mem[k] = v; return v; }

  // ---------- encrypted key store ----------
  async aes() {
    let raw = this.env.ENC_KEY ? await crypto.subtle.digest('SHA-256', enc.encode(this.env.ENC_KEY)) : null;
    if (!raw) { let k = await this.state.storage.get('enck'); if (!k) { k = rand(32); await this.state.storage.put('enck', k); } raw = unhex(k); }
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async seal(obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.aes(), enc.encode(JSON.stringify(obj))); return { iv: hex(iv), ct: hex(ct) }; }
  async open(box) { const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unhex(box.iv) }, await this.aes(), unhex(box.ct)); return JSON.parse(dec.decode(pt)); }
  async loadKeys(force) {
    if (this.keysLoaded && !force) return;
    this.keysLoaded = true; delete this.kenv.KALSHI_KEY_ID; delete this.kenv.KALSHI_PRIVATE_KEY;
    const box = await this.state.storage.get('kconn'); if (!box) return;
    try { const k = await this.open(box.sealed); this.kenv.KALSHI_KEY_ID = k.id; this.kenv.KALSHI_PRIVATE_KEY = k.pem; } catch { this.connErr = 'The saved key could not be decrypted (was ENC_KEY changed?). Connect it again.'; }
  }

  // ---------- sessions ----------
  async auth() { return await this.state.storage.get('auth'); }
  async session(req) {
    const tok = cookie(req, 'ks'); if (!tok || tok.length !== 64) return null;
    const h = await sha(tok), s = await this.state.storage.get('sess:' + h);
    if (!s || Date.now() - s.at > SESS_DAYS * 86400000) return null;
    if (Date.now() - (s.seen || 0) > 3600000) { s.seen = Date.now(); await this.state.storage.put('sess:' + h, s); }
    return { ...s, h };
  }
  async newSession(name) {
    const tok = rand(32), h = await sha(tok);
    await this.state.storage.put('sess:' + h, { at: Date.now(), seen: Date.now(), name: String(name || 'Device').slice(0, 60) });
    return `ks=${tok}; Path=/; Max-Age=${SESS_DAYS * 86400}; HttpOnly; Secure; SameSite=Strict`;
  }
  async limited() { const f = (await this.state.storage.get('fails')) || { n: 0, at: 0 }; if (Date.now() - f.at > 15 * 60000) return { n: 0, at: Date.now() }; return f; }

  async alarm() { await this.loadKeys(); await this.K.alarm(); }

  async fetch(req) {
    const u = new URL(req.url), p = u.pathname, post = req.method === 'POST';
    if (p === '/k/tick') { await this.loadKeys(); await this.K.tick(); return new Response('ok'); }
    // state-changing calls must come from the page itself (SameSite=Strict cookie + this header, which a form post can't set)
    if (post && req.headers.get('x-cr') !== '1') return J({ ok: false, msg: 'bad request' }, 400);
    const body = post ? await req.json().catch(() => ({})) : {};
    const A = await this.auth();

    if (p === '/api/me') { const s = A ? await this.session(req) : null; return J({ setup: !!A, authed: !!s, control: !!s, device: s?.name || null, botPoll: Date.now(), edition: 'kalshi' }); }
    if (p === '/api/setup' && post) {
      if (A) return J({ ok: false, msg: 'This dashboard is already set up. Sign in instead.' }, 409);
      const pass = String(body.passcode || '');
      if (pass.length < 8) return J({ ok: false, msg: 'Use at least 8 characters for the passcode.' }, 400);
      const salt = rand(16); await this.state.storage.put('auth', { salt, hash: await hashPass(pass, salt), at: Date.now() });
      const a = {}; if (+body.startUsd > 0) a.startUsd = +body.startUsd; if (+body.sizeUsd > 0) a.sizeUsd = +body.sizeUsd; if (+body.dailyLossUsd > 0) a.dailyLossUsd = +body.dailyLossUsd;
      a.coldDays = 0;   // the bench cost money in the Aug-Nov replay; new dashboards start with it off
      try { await this.K.load(); await this.K.command('kalshiSet', a); } catch { }
      return J({ ok: true }, 200, { 'set-cookie': await this.newSession(body.name) });
    }
    if (p === '/api/login' && post) {
      if (!A) return J({ ok: false, msg: 'Set the dashboard up first.' }, 409);
      const f = await this.limited(); if (f.n >= 5) return J({ ok: false, msg: 'Too many wrong passcodes. Try again in 15 minutes.' }, 429);
      // forgot the passcode: the owner sets a RESET_PASSCODE secret in Cloudflare (12+ characters) and types it here. Sign-in and
      // sessions are cleared so the setup screen comes back; trades, settings and the Kalshi key are kept.
      const rp = String(this.env.RESET_PASSCODE || ''); if (rp.length >= 12 && same(String(body.passcode || ''), rp)) { const all = await this.state.storage.list({ prefix: 'sess:' }); await this.state.storage.delete(['auth', 'fails', ...all.keys()]); return J({ ok: true, reset: true }); }
      if (!same(await hashPass(String(body.passcode || ''), A.salt), A.hash)) { await this.state.storage.put('fails', { n: f.n + 1, at: f.at || Date.now() }); return J({ ok: false, msg: f.n >= 3 ? 'Wrong passcode. One more try before a 15-minute lock.' : 'Wrong passcode.' }, 401); }
      await this.state.storage.delete('fails');
      return J({ ok: true }, 200, { 'set-cookie': await this.newSession(body.name) });
    }

    // everything below needs a signed-in device
    const S = A ? await this.session(req) : null;
    if (!S) return J({ ok: false, msg: 'Sign in first.' }, 401);
    await this.loadKeys();

    if (p === '/api/logout' && post) {
      if (body.all) { const all = await this.state.storage.list({ prefix: 'sess:' }); await this.state.storage.delete([...all.keys()]); }
      else await this.state.storage.delete('sess:' + S.h);
      return J({ ok: true }, 200, { 'set-cookie': 'ks=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict' });
    }
    if (p === '/api/devices') { const all = await this.state.storage.list({ prefix: 'sess:' }); return J([...all.entries()].map(([k, v]) => ({ name: v.name, at: v.at, seen: v.seen, me: k === 'sess:' + S.h })).sort((a, b) => b.seen - a.seen)); }
    if (p === '/api/passcode' && post) {
      if (!same(await hashPass(String(body.current || ''), A.salt), A.hash)) return J({ ok: false, msg: 'The current passcode is wrong.' }, 401);
      const next = String(body.next || ''); if (next.length < 8) return J({ ok: false, msg: 'Use at least 8 characters.' }, 400);
      const salt = rand(16); await this.state.storage.put('auth', { salt, hash: await hashPass(next, salt), at: Date.now() });
      const all = await this.state.storage.list({ prefix: 'sess:' }); await this.state.storage.delete([...all.keys()].filter(k => k !== 'sess:' + S.h));
      return J({ ok: true, msg: 'Passcode changed. Other devices were signed out.' });
    }

    if (p === '/data') {
      let kv = await this.read('kview'); if (!kv) { await this.K.publish(false); kv = this.mem.kview; }
      return new Response(`{"lite":{"at":${Date.now()},"copyOff":true,"mode":"paper","edition":"kalshi"},"heavy":null,"kx":${kv || 'null'}}`, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    if (p === '/api/klive') { let h = await this.read('klive'); if (!h) { await this.K.publish(false); h = this.mem.klive; } return new Response(h || 'null', { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }); }
    if (p === '/api/cmd' && post) {
      const ok = ['kalshiSet', 'kalshiLive', 'kalshiStrat'].includes(body.type);
      let res; try { res = ok ? await this.K.command(body.type, body.args || {}) : { ok: false, msg: 'Not available in this edition.' }; } catch (e) { res = { ok: false, msg: e.message }; }
      const list = (await this.state.storage.get('cmds')) || [];
      const c = { id: rand(8), type: body.type, label: String(body.label || '').slice(0, 120), at: Date.now(), status: res.ok ? 'done' : 'failed', msg: String(res.msg || '').slice(0, 300), done: Date.now(), device: S.name };
      list.push(c); await this.state.storage.put('cmds', list.slice(-150)); return J(c);
    }
    if (p === '/api/cmds') return J(((await this.state.storage.get('cmds')) || []).slice(-60));

    // ---------- Kalshi connection ----------
    if (p === '/api/conn' && !post) {
      await this.K.load(); const box = await this.state.storage.get('kconn'), lv = this.K._t.liveView();
      return J({ connected: !!box && !!this.kenv.KALSHI_KEY_ID, keyEnd: box?.end || null, savedAt: box?.at || null, keyOk: lv.keyOk, bal: lv.bal, live: lv.on, err: this.connErr || lv.err || null });
    }
    if (p === '/api/conn' && post) {
      const id = String(body.keyId || '').trim().replace(/^["']|["']$/g, ''), pem = String(body.privateKey || '').trim();
      if (!/^[0-9a-f-]{20,64}$/i.test(id)) return J({ ok: false, msg: 'That Key ID does not look right. It is the long id Kalshi shows next to the key, like 1a2b3c4d-....' }, 400);
      if (!pemOk(pem)) return J({ ok: false, msg: 'The private key should be the whole file, from -----BEGIN ... PRIVATE KEY----- to -----END ... PRIVATE KEY-----.' }, 400);
      const old = { id: this.kenv.KALSHI_KEY_ID, pem: this.kenv.KALSHI_PRIVATE_KEY };
      this.kenv.KALSHI_KEY_ID = id; this.kenv.KALSHI_PRIVATE_KEY = pem;
      const t = await this.K.checkKeys();
      if (!t.ok || body.testOnly) { this.kenv.KALSHI_KEY_ID = old.id; this.kenv.KALSHI_PRIVATE_KEY = old.pem; if (!old.id) { delete this.kenv.KALSHI_KEY_ID; delete this.kenv.KALSHI_PRIVATE_KEY; } this.K.resetKey(); if (old.id) await this.K.checkKeys(); }
      if (!t.ok) return J({ ok: false, msg: `Kalshi did not accept that key: ${t.msg}` }, 400);
      if (body.testOnly) return J({ ok: true, bal: t.bal, msg: `Key works. Kalshi cash $${Number(t.bal).toFixed(2)}.` });
      await this.state.storage.put('kconn', { sealed: await this.seal({ id, pem }), end: id.slice(-4), at: Date.now() }); this.connErr = null;
      await this.K.publish(true);
      return J({ ok: true, bal: t.bal, msg: `Connected. Kalshi cash $${Number(t.bal).toFixed(2)}.` });
    }
    if (p === '/api/conn/delete' && post) {
      try { await this.K.command('kalshiLive', { enabled: false }); } catch { }
      await this.state.storage.delete('kconn'); await this.loadKeys(true); this.K.resetKey(); await this.K.publish(true);
      return J({ ok: true, msg: 'Kalshi key removed and live trading turned off. Paper keeps running.' });
    }
    return J({ ok: false, msg: 'not found' }, 404);
  }
}

const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' };
export default {
  async fetch(req, env) {
    const u = new URL(req.url), stub = env.STORE.get(env.STORE.idFromName('main'));
    if (u.pathname === '/' || u.pathname === '/index.html') return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SEC } });
    if (u.pathname === '/data' || u.pathname.startsWith('/api/')) return stub.fetch(req);
    if (u.pathname === '/favicon.ico') return new Response(null, { status: 204 });
    return new Response('Not found', { status: 404 });
  },
  async scheduled(ev, env, ctx) { const stub = env.STORE.get(env.STORE.idFromName('main')); ctx.waitUntil(stub.fetch('https://do/k/tick')); },
};
