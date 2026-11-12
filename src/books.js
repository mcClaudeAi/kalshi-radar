// Live books on Kalshi subaccounts.
//
// MC 2026-11-11 asked to run several live bankrolls side by side (four to start, no fixed number), each at up to $50 a trade, on
// subaccounts of one Kalshi account. Kalshi gives an account up to 63 numbered subaccounts, each with its own cash and positions,
// and lets an API key be locked to one of them: a locked key can trade only its subaccount and can't move money anywhere else.
//   - Adding a book uses the account's main key (the one the dashboard already has) to create the subaccount and generate a key
//     locked to it. Kalshi hands the private key over once; it goes straight into this worker's storage, encrypted, and is never
//     sent to the page. Linking an existing subaccount with a locked key pasted on the dashboard is the fallback.
//   - Money goes in and out with the main key (subaccount transfers stay inside the Kalshi account). The page asks for a hold.
//   - Each book has its own playbook, $ per trade (5 to 50), daily loss cap, cash floor and live switch, and its own trades.
//     Orders, balances and the move to the crypto shard all go through the book's own locked key.
//   - Paper settings that already govern the main live book (profit target, give-back, protect profit, bench, off hours) apply to
//     every book the same way, so a book differs from the main one only in what is set here.
// The main live book is left exactly as it was (its code is in kalshi-cloud.js); this file repeats its order logic per book
// rather than reshaping it, so nothing changes for the main book while this is new.

const enc = new TextEncoder(), dec = new TextDecoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = s => new Uint8Array(String(s).match(/../g).map(h => parseInt(h, 16)));
const B64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
export const BOOK_MAX = 50, BOOK_MIN = 5;
const LIMITS = { maxPerWindow: 9, maxPerDay: 150 };

// PEM to PKCS#8 bytes; an RSA key in PKCS#1 ("BEGIN RSA PRIVATE KEY", what Kalshi's site hands out) is wrapped first
function pkcs8(pem) {
  const s = String(pem).replace(/\\n/g, '\n'), rsa1 = /BEGIN RSA PRIVATE KEY/.test(s), b = atob(s.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  if (!rsa1) return u;
  const len = n => n < 128 ? [n] : n < 256 ? [0x81, n] : n < 65536 ? [0x82, n >> 8, n & 255] : [0x83, n >> 16, (n >> 8) & 255, n & 255];
  const oct = [0x04, ...len(u.length), ...u], alg = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00], body = [0x02, 0x01, 0x00, ...alg, ...oct];
  return new Uint8Array([0x30, ...len(body.length), ...body]);
}
async function importPem(pem) {
  const der = pkcs8(pem);
  try { return { k: await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']), alg: { name: 'Ed25519' } }; }
  catch { return { k: await crypto.subtle.importKey('pkcs8', der, { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['sign']), alg: { name: 'RSA-PSS', saltLength: 32 } }; }
}

export function createBooks(D) {
  // D: { state, env, say, HOSTS, API, XI, coin, etDay, etHour, fee, stratAt, stratSince, mainReq, mainKeys, labName, cfg }
  const { state, env } = D, sql = state.storage.sql, kv = state.storage;
  sql.exec('CREATE TABLE IF NOT EXISTS kb (bid TEXT, tk TEXT, at INTEGER, j TEXT, PRIMARY KEY (bid, tk))');
  let list = null;                         // [{ id, name, sub, keyEnd, on, size, loss, floor, strat: [], at, sellAt, sellDone }]
  const L = {}, S = {}, K = {};            // per book: trades Map, state, imported key

  async function aes() {
    let raw = env.ENC_KEY ? await crypto.subtle.digest('SHA-256', enc.encode(env.ENC_KEY)) : null;
    if (!raw) { let k = await kv.get('enck'); if (!k) { k = hex(crypto.getRandomValues(new Uint8Array(32))); await kv.put('enck', k); } raw = unhex(k); }
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  const seal = async o => { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv: hex(iv), ct: hex(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(), enc.encode(JSON.stringify(o)))) }; };
  const open = async b => JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unhex(b.iv) }, await aes(), unhex(b.ct))));

  async function load() {
    if (list) return;
    list = (await kv.get('kbooks')) || [];
    for (const b of list) { L[b.id] = new Map(); S[b.id] = S[b.id] || { bal: null, balAt: 0, shard: {}, keyOk: null, err: null, errAt: 0, stopped: null, xferAt: 0, lastXfer: null, host: 0 }; }
    for (const r of sql.exec('SELECT bid, j FROM kb')) { try { const j = JSON.parse(r.j); (L[r.bid] = L[r.bid] || new Map()).set(j.tk, j); } catch { } }
  }
  const saveList = () => kv.put('kbooks', list);
  const saveRow = (b, x) => sql.exec('INSERT OR REPLACE INTO kb (bid, tk, at, j) VALUES (?, ?, ?, ?)', b.id, x.tk, x.at, JSON.stringify(x));
  const fail = (b, m) => { S[b.id].err = m; S[b.id].errAt = Date.now(); D.say(`BOOK ${b.name}: ${m}`); };
  const errOf = r => r?.j?.error?.message || r?.j?.message || r?.j?.error || r?.t || 'no answer';

  // signed request with the book's own locked key
  async function key(b) { if (K[b.id]) return K[b.id]; const box = await kv.get('kbk:' + b.id); if (!box) throw new Error('no key saved for this book'); const k = await open(box); K[b.id] = { id: k.id, ...(await importPem(k.pem)) }; return K[b.id]; }
  async function breq1(b, method, p, body) {
    const k = await key(b), s = S[b.id]; let last = null;
    for (let i = 0; i < D.HOSTS.length; i++) {
      const h = D.HOSTS[(s.host + i) % D.HOSTS.length], full = D.API + p, ts = String(Date.now());
      const sig = await crypto.subtle.sign(k.alg, k.k, enc.encode(ts + method + full.split('?')[0]));
      try {
        const r = await fetch(h + full, { method, headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), 'KALSHI-ACCESS-KEY': k.id, 'KALSHI-ACCESS-TIMESTAMP': ts, 'KALSHI-ACCESS-SIGNATURE': B64(sig) }, body: body ? JSON.stringify(body) : undefined });
        const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { }
        last = { ok: r.ok, status: r.status, j, t: t.slice(0, 300) };
        if (r.status === 404 && i < D.HOSTS.length - 1) continue;
        if (r.ok) s.host = (s.host + i) % D.HOSTS.length;
        return last;
      } catch (e) { last = { ok: false, status: 0, t: e.message }; }
    }
    return last;
  }
  async function breq(b, m, p, body) { for (let a = 0; a < 4; a++) { const r = await breq1(b, m, p, body); if (r?.status !== 429 || a === 3) return r; await new Promise(z => setTimeout(z, 700 * (a + 1))); } }

  const today = b => { const d = D.etDay(Date.now()); return [...L[b.id].values()].filter(x => D.etDay(x.at) === d); };
  const realized = l => l.reduce((a, x) => a + (x.pnl ?? 0), 0);
  async function balance(b, force) {
    const s = S[b.id]; if (Date.now() - s.balAt < (force ? 30000 : 60000)) return s.bal;
    const r = await breq(b, 'GET', '/portfolio/balance');
    if (r?.ok) { const j = r.j || {}; s.bal = j.balance_dollars != null ? +j.balance_dollars : j.balance != null ? j.balance / 100 : null; s.balAt = Date.now(); s.keyOk = true; s.shard = {}; for (const x of j.balance_breakdown || []) s.shard[x.exchange_index] = +x.balance; }
    else { s.keyOk = r?.status === 401 || r?.status === 403 ? false : s.keyOk; fail(b, `balance check failed: ${r?.status} ${errOf(r)}`); }
    return s.bal;
  }
  // the crypto markets trade on shard XI; keep about 12 trades' worth there, moved inside the book's own subaccount
  async function fund(b) {
    const s = S[b.id]; if (Date.now() - s.xferAt < 60000) return;
    const have = s.shard[D.XI] ?? 0, src = s.shard[0] ?? 0, want = Math.round(b.size * 12), low = b.size * 9;
    if (have >= low || src < 1) return; const amt = Math.min(src, want - have); if (amt < 1) return;
    s.xferAt = Date.now();
    const res = await breq(b, 'POST', '/portfolio/intra_exchange_instance_transfer', { source: 'event_contract', destination: 'event_contract', amount: Math.floor(amt * 100) * 100, source_exchange_shard: 0, destination_exchange_shard: D.XI, client_transfer_id: crypto.randomUUID() });
    if (!res?.ok) { fail(b, `could not move $${amt.toFixed(2)} to the crypto shard: ${res?.status} ${errOf(res)}`); return; }
    s.lastXfer = { at: Date.now(), amt: +amt.toFixed(2) }; s.balAt = 0; D.say(`BOOK ${b.name} moved $${amt.toFixed(2)} to the crypto shard`);
  }

  function skip(b, r, why) { if (L[b.id].has(r.ticker)) return; const x = { tk: r.ticker, coin: D.coin(r.series), side: r.side, at: Date.now(), close: r.close, paperPx: r.avgN || r.ask, skipped: why, strat: D.stratAt(b.strat, Date.now()) }; L[b.id].set(r.ticker, x); saveRow(b, x); S[b.id].stopped = why; }
  // the same checks and order as the main live book (kalshi-cloud.js onRule), with this book's size, loss cap and floor
  async function buy(b, r, lab, cfgP, bench) {
    const s = S[b.id], Lb = L[b.id]; if (Lb.has(r.ticker)) return;
    const cn = D.coin(r.series), t = today(b), why = (() => {
      if (bench.has(cn)) return `${cn} is benched (down over its last ${cfgP.coldDays} days)`;
      if (realized(t) <= -b.loss) return `daily loss cap hit (${realized(t).toFixed(2)})`;
      if (cfgP.dailyWinUsd > 0 && realized(t) >= cfgP.dailyWinUsd) return `daily profit target hit (+$${realized(t).toFixed(2)})`;
      if (cfgP.giveBackPct > 0) { let run = 0, pk = 0; for (const x of t.filter(x => x.pnl != null).sort((a, z) => a.at - z.at)) { run += x.pnl; pk = Math.max(pk, run); } if (pk >= (cfgP.giveBackMin ?? 25) && run <= pk * cfgP.giveBackPct / 100) return `give-back stop: today peaked at +$${pk.toFixed(2)}`; }
      if (t.filter(x => x.fill > 0).length >= LIMITS.maxPerDay) return 'daily order limit';
      { const cap = Math.min(LIMITS.maxPerWindow, cfgP.winCap ?? 9); if ([...Lb.values()].filter(x => x.close === r.close && x.fill > 0).length >= cap) return cap < LIMITS.maxPerWindow ? `window is full (${cap} a window, clearest first)` : 'window limit'; }
      return null; })();
    if (why) return skip(b, r, why);
    const bal = await balance(b, true); if (bal == null) { fail(b, `no order for ${r.ticker}: could not read the balance`); return; }
    if (bal < b.floor) return skip(b, r, `cash $${bal.toFixed(2)} is under the $${b.floor} floor`);
    s.stopped = null;
    let rS = null; if (lab?.size) { let run = 0, pk = 0; for (const x of [...Lb.values()].filter(x => x.pnl != null).sort((a, z) => a.at - z.at)) { run += x.pnl; pk = Math.max(pk, run); } rS = { peak: bal + (pk - run), start: bal - run }; }
    let size = lab?.size ? Math.min(b.size, BOOK_MAX, Math.max(BOOK_MIN, lab.size(bal, { kf: r.kf, win: r.win }, rS))) : b.size;
    if (cfgP.lockAt > 0) { const t2 = t.filter(x => x.pnl != null).sort((a, z) => a.at - z.at); let run = 0, pk = 0; for (const x of t2) { run += x.pnl; pk = Math.max(pk, run); }
      if (pk >= cfgP.lockAt) { const riding = [...Lb.values()].filter(x => x.close === r.close && x.fill > 0 && !x.result).reduce((a, x) => a + (x.cost || 0), 0), room = run - pk * (cfgP.lockKeep || 0) / 100 - riding; if (room < BOOK_MIN) return skip(b, r, `protecting today's profit: $${Math.max(0, room).toFixed(2)} of room left`); size = Math.min(size, room); } }
    if ((s.shard[D.XI] ?? 0) < size + 1) { s.xferAt = 0; await fund(b); }
    const maxPx = Math.min(0.99, +(r.ask + 0.01).toFixed(4)), n = Math.floor(size / maxPx); if (n < 1) return;
    const grid = p => (p < 0.1 || p >= 0.9) ? 0.001 : 0.01, down = p => +(Math.floor(p / grid(p) + 1e-9) * grid(p)).toFixed(4), up = p => +(Math.ceil(p / grid(p) - 1e-9) * grid(p)).toFixed(4);
    const cid = `cr${b.sub}-${r.ticker}`, body = r.side === 'yes'
      ? { ticker: r.ticker, side: 'bid', count: String(n), price: down(maxPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', client_order_id: cid }
      : { ticker: r.ticker, side: 'ask', count: String(n), price: up(1 - maxPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', client_order_id: cid };
    const row = { tk: r.ticker, coin: cn, side: r.side, at: Date.now(), close: r.close, paperPx: r.avgN || r.ask, ask: r.ask, want: n, limit: maxPx, size, fill: 0, strat: lab?.id || 'rule' };
    Lb.set(r.ticker, row); saveRow(b, row);
    const res = await breq(b, 'POST', '/portfolio/events/orders', body);
    if (!res?.ok) { row.err = `${res?.status} ${errOf(res)}`.slice(0, 200); saveRow(b, row); fail(b, `order ${r.ticker} refused: ${row.err}`); return; }
    const j = res.j?.order || res.j || {}, fill = +(j.fill_count ?? 0), avgYes = j.average_fill_price != null ? +j.average_fill_price : null, avgFee = j.average_fee_paid != null ? +j.average_fee_paid : 0;
    Object.assign(row, { id: j.order_id || null, fill, avgYes, px: avgYes == null ? null : +(r.side === 'yes' ? avgYes : 1 - avgYes).toFixed(4), fees: +(fill * avgFee).toFixed(4) });
    row.cost = row.px == null ? null : +(fill * row.px + row.fees).toFixed(2); saveRow(b, row);
    D.say(`BOOK ${b.name} ${r.ticker} ${r.side.toUpperCase()} ${fill}/${n} filled${row.px != null ? ` at ${(row.px * 100).toFixed(1)}c` : ''}`);
    if (row.cost) { if (s.bal != null) s.bal = +(s.bal - row.cost).toFixed(2); if (s.shard[D.XI] != null) s.shard[D.XI] = +(s.shard[D.XI] - row.cost).toFixed(2); }
  }
  async function sellAll(b) {
    for (const x of [...L[b.id].values()].filter(x => x.fill > 0 && !x.result && !x.sold && x.close > Date.now())) {
      const body = x.side === 'yes'
        ? { ticker: x.tk, side: 'ask', count: String(x.fill), price: '0.0010', time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', reduce_only: true, client_order_id: `crs${b.sub}-${x.tk}-${Date.now()}` }
        : { ticker: x.tk, side: 'bid', count: String(x.fill), price: '0.9990', time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', reduce_only: true, client_order_id: `crs${b.sub}-${x.tk}-${Date.now()}` };
      const res = await breq(b, 'POST', '/portfolio/events/orders', body);
      if (!res?.ok) { fail(b, `sell ${x.tk} refused: ${res?.status} ${errOf(res)}`); continue; }
      const j = res.j?.order || res.j || {}, f = +(j.fill_count ?? 0), avg = j.average_fill_price != null ? +j.average_fill_price : null, fe = j.average_fee_paid != null ? +j.average_fee_paid * f : 0;
      if (f > 0 && avg != null) { const px = +(x.side === 'yes' ? avg : 1 - avg).toFixed(4); x.sold = { at: Date.now(), fill: f, px }; x.pnl = +(f * px - fe - (x.cost ?? 0) * f / x.fill).toFixed(2); x.result = 'sold'; saveRow(b, x); D.say(`BOOK ${b.name} sold ${x.tk}`); }
    }
    S[b.id].balAt = 0;
  }

  // ---------- hooks from the engine ----------
  // gate(sid, r) -> { ok, why, lab } is the engine's own playbook check, the one the main live book uses
  async function onMark(hits, now, gate, cfgP, bench) {
    await load(); if (!hits.length) return;
    const offNow = (cfgP.skipHours || []).includes(D.etHour(now));
    for (const b of list) {
      if (!b.on) continue; const sid = D.stratAt(b.strat, now);
      for (const r of hits) {
        if (offNow) { skip(b, r, `off schedule (${D.etHour(now)}:00 ET hour)`); continue; }
        const g = gate(sid, r); if (!g.ok) { skip(b, r, g.why); continue; }
        try { await buy(b, r, g.lab, cfgP, bench); } catch (e) { fail(b, 'order error: ' + e.message); }
      }
    }
  }
  function onSettle(r) {
    if (!list) return;
    for (const b of list) { const x = L[b.id]?.get(r.ticker); if (!x || x.result || !(x.fill > 0) || x.sold) continue; x.result = r.result; x.won = r.result === x.side; x.pnl = +((x.won ? x.fill : 0) - (x.cost ?? 0)).toFixed(2); saveRow(b, x); S[b.id].balAt = 0; D.say(`BOOK ${b.name} settled ${r.ticker}: ${x.won ? 'won' : 'LOST'} ${x.pnl}`); }
  }
  async function upkeep(now) {
    await load();
    for (const b of list) {
      try {
        if (b.sellAt && b.sellAt > (b.sellDone || 0)) { b.sellDone = b.sellAt; await saveList(); await sellAll(b); }
        if (b.on || now - S[b.id].balAt > 5 * 60000) await balance(b);
        if (b.on && S[b.id].balAt) await fund(b);
      } catch (e) { fail(b, e.message); }
    }
  }
  function view() {
    if (!list) return [];
    return list.map(b => { const s = S[b.id], all = [...L[b.id].values()].sort((a, z) => z.at - a.at), t = today(b).filter(x => x.fill > 0), done = t.filter(x => x.result);
      return { id: b.id, name: b.name, sub: b.sub, keyEnd: b.keyEnd || null, made: b.made || 'linked', on: !!b.on, size: b.size, loss: b.loss, floor: b.floor, since: b.at || null,
        bal: s.bal, balAt: s.balAt || null, crypto: s.shard[D.XI] ?? null, keyOk: s.keyOk, err: s.err && Date.now() - s.errAt < 3600000 ? s.err : null, stopped: s.stopped, xfer: s.lastXfer,
        playbook: { id: D.stratAt(b.strat, Date.now()), since: D.stratSince(b.strat, Date.now()) },
        today: { n: done.length, won: done.filter(x => x.won).length, net: +realized(done).toFixed(2), open: t.filter(x => !x.result).length },
        total: { n: all.filter(x => x.result && x.fill > 0).length, won: all.filter(x => x.won && x.fill > 0).length, net: +realized(all.filter(x => x.fill > 0)).toFixed(2) },
        open: all.filter(x => x.fill > 0 && !x.result).map(x => ({ tk: x.tk, coin: x.coin, side: x.side, fill: x.fill, px: x.px, cost: x.cost, close: x.close })),
        hist: all.filter(x => x.fill > 0 && x.result).slice(0, 1500).map(x => [x.close, x.coin, x.side, x.px, x.fill, x.pnl, x.won ? 1 : 0]),
        recent: all.slice(0, 80).map(x => ({ tk: x.tk, coin: x.coin, side: x.side, at: x.at, close: x.close, want: x.want ?? null, fill: x.fill ?? 0, px: x.px ?? null, paperPx: x.paperPx, cost: x.cost ?? null, result: x.result || null, won: x.won ?? null, pnl: x.pnl ?? null, err: x.err || null, skipped: x.skipped || null })) }; });
  }

  // ---------- commands from the dashboard (signed-in, unlocked device only; the engine checks that) ----------
  async function command(a, labIds) {
    await load(); const op = a.op, b = list.find(x => x.id === a.id), nm = s => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 30);
    const fresh = (name, sub, made, end) => ({ id: hex(crypto.getRandomValues(new Uint8Array(6))), name, sub, made, keyEnd: end, on: false, size: 10, loss: 100, floor: 0, strat: [], at: Date.now(), sellAt: 0, sellDone: 0 });
    if (op === 'add') {
      if (!D.mainKeys()) return { ok: false, msg: 'Connect the main Kalshi key first. Books are made from it.' };
      const name = nm(a.name) || `Book ${list.length + 1}`; if (list.some(x => x.name.toLowerCase() === name.toLowerCase())) return { ok: false, msg: 'There is already a book with that name.' };
      const c = await D.mainReq('POST', '/portfolio/subaccounts', {});
      if (!c?.ok || !(c.j?.subaccount_number > 0)) return { ok: false, msg: `Kalshi would not create a subaccount: ${c?.status} ${errOf(c)}. Subaccounts need a Direct account on Kalshi's Advanced API tier or above.` };
      const sub = c.j.subaccount_number;
      const g = await D.mainReq('POST', '/api_keys/generate', { name: `Kalshi Radar ${name} (sub ${sub})`.slice(0, 60), key_type: 'ed25519', scopes: ['read', 'write'], subaccount: sub });
      if (!g?.ok || !g.j?.private_key) return { ok: false, msg: `Subaccount ${sub} was created, but Kalshi would not make a key for it: ${g?.status} ${errOf(g)}. You can make one on Kalshi locked to subaccount ${sub} and link it with "Link a subaccount".` };
      const bk = fresh(name, sub, 'auto', String(g.j.api_key_id).slice(-4));
      await kv.put('kbk:' + bk.id, await seal({ id: g.j.api_key_id, pem: g.j.private_key }));
      list.push(bk); L[bk.id] = new Map(); S[bk.id] = { bal: null, balAt: 0, shard: {}, keyOk: null, err: null, errAt: 0, stopped: null, xferAt: 0, lastXfer: null, host: 0 }; await saveList();
      try { await balance(bk, true); } catch { }
      D.say(`BOOK added ${name} on subaccount ${sub}`);
      return { ok: true, msg: `${name} is ready on subaccount ${sub}, with its own key. Move money in, pick its playbook and size, then turn it on.`, id: bk.id };
    }
    if (op === 'link') {
      const name = nm(a.name) || `Book ${list.length + 1}`, sub = Math.round(+a.sub), id = String(a.keyId || '').trim(), pem = String(a.pem || '').trim();
      if (!(sub >= 1 && sub <= 63)) return { ok: false, msg: 'Subaccount numbers run from 1 to 63.' };
      if (list.some(x => x.sub === sub)) return { ok: false, msg: `Subaccount ${sub} already has a book.` };
      if (!id || !/PRIVATE KEY/.test(pem)) return { ok: false, msg: 'Paste the key ID and the whole private key, including the BEGIN and END lines.' };
      const bk = fresh(name, sub, 'linked', id.slice(-4));
      try { K[bk.id] = { id, ...(await importPem(pem)) }; } catch { return { ok: false, msg: 'That private key could not be read. Paste it again, all of it.' }; }
      L[bk.id] = new Map(); S[bk.id] = { bal: null, balAt: 0, shard: {}, keyOk: null, err: null, errAt: 0, stopped: null, xferAt: 0, lastXfer: null, host: 0 };
      const bal = await balance(bk, true); if (bal == null) { delete K[bk.id]; delete L[bk.id]; delete S[bk.id]; return { ok: false, msg: 'Kalshi did not accept that key. Check it is locked to this subaccount and has trading access.' }; }
      await kv.put('kbk:' + bk.id, await seal({ id, pem })); list.push(bk); await saveList();
      return { ok: true, msg: `${name} is linked to subaccount ${sub}. Cash there: $${bal.toFixed(2)}.`, id: bk.id };
    }
    if (!b) return { ok: false, msg: 'No such book.' };
    if (op === 'set') {
      const ch = [];
      if (a.name != null) { const n = nm(a.name); if (n && n !== b.name) { if (list.some(x => x !== b && x.name.toLowerCase() === n.toLowerCase())) return { ok: false, msg: 'There is already a book with that name.' }; ch.push(`renamed to ${n}`); b.name = n; } }
      if (a.size != null && isFinite(+a.size)) { const v = Math.min(BOOK_MAX, Math.max(BOOK_MIN, Math.round(+a.size))); if (v !== b.size) { ch.push(`$${b.size} -> $${v} a trade`); b.size = v; } }
      if (a.loss != null && isFinite(+a.loss)) { const v = Math.min(1000, Math.max(10, Math.round(+a.loss))); if (v !== b.loss) { ch.push(`daily loss cap $${v}`); b.loss = v; } }
      if (a.floor != null && isFinite(+a.floor)) { const v = Math.min(100000, Math.max(0, Math.round(+a.floor))); if (v !== b.floor) { ch.push(`cash floor $${v}`); b.floor = v; } }
      if (a.on === true || a.on === false) { if (a.on && !(await kv.get('kbk:' + b.id))) return { ok: false, msg: 'This book has no key saved.' }; if (a.on !== b.on) { ch.push(a.on ? 'live ON' : 'live OFF'); b.on = a.on; if (a.on) b.onAt = Date.now(); } }
      if (a.strat != null) { const id = String(a.strat); if (!labIds.includes(id)) return { ok: false, msg: 'Unknown playbook.' }; if (D.stratAt(b.strat, Date.now()) !== id) { b.strat = [...(b.strat || []), { at: Date.now(), id, by: 'dashboard' }].slice(-60); ch.push(`playbook ${D.labName(id)}`); } }
      if (a.sellAll === true) { b.sellAt = Date.now(); ch.push('sell all open positions'); }
      if (!ch.length) return { ok: false, msg: 'Nothing changed.' };
      b.at = b.at || Date.now(); await saveList(); D.say(`BOOK ${b.name}: ${ch.join(', ')}`);
      if (a.sellAll === true) { b.sellDone = b.sellAt; await saveList(); try { await sellAll(b); } catch (e) { fail(b, 'sell-all error: ' + e.message); } }
      return { ok: true, msg: `${b.name}: ${ch.join(', ')}.` };
    }
    if (op === 'fund' || op === 'withdraw') {
      if (!D.mainKeys()) return { ok: false, msg: 'Money moves with the main Kalshi key, and it is not connected.' };
      let amt;
      if (op === 'withdraw') {
        // the book's money sits partly on the crypto shard; with nothing open, it is brought back to shard 0 (the book's own key)
        // first so all of it can move. While trades are open only shard 0 money moves.
        S[b.id].balAt = 0; await balance(b, true); const s = S[b.id], open = [...L[b.id].values()].some(x => x.fill > 0 && !x.result);
        const onX = s.shard[D.XI] ?? 0, want = a.amount === 'all' ? Infinity : +a.amount;
        if (!open && onX >= 0.01 && want > (s.shard[0] ?? 0) + 0.005) {
          const back = await breq(b, 'POST', '/portfolio/intra_exchange_instance_transfer', { source: 'event_contract', destination: 'event_contract', amount: Math.floor(onX * 100) * 100, source_exchange_shard: D.XI, destination_exchange_shard: 0, client_transfer_id: crypto.randomUUID() });
          if (!back?.ok) return { ok: false, msg: `Could not bring ${b.name}'s money back from the crypto shard: ${back?.status} ${errOf(back)}` };
          s.balAt = 0; await balance(b, true); }
        const free = s.shard[0] ?? 0; amt = Math.round((a.amount === 'all' ? free : Math.min(want, free + 0.005)) * 100);
        if (a.amount !== 'all' && want > free + 0.005) return { ok: false, msg: `Only $${free.toFixed(2)} is free to move out${open ? ' while trades are open' : ''}.` };
      } else amt = Math.round(+a.amount * 100);
      if (!(amt >= 100)) return { ok: false, msg: op === 'withdraw' && a.amount === 'all' ? 'There is less than $1 to move out.' : 'Move at least $1.' }; if (amt > 10000000) return { ok: false, msg: 'That is more than this screen moves at once.' };
      const res = await D.mainReq('POST', '/portfolio/subaccounts/transfer', { client_transfer_id: crypto.randomUUID(), from_subaccount: op === 'fund' ? 0 : b.sub, to_subaccount: op === 'fund' ? b.sub : 0, amount_cents: amt });
      if (!res?.ok) return { ok: false, msg: `Kalshi refused the transfer: ${res?.status} ${errOf(res)}` };
      S[b.id].balAt = 0; try { await balance(b, true); } catch { }
      D.say(`BOOK ${b.name}: ${op === 'fund' ? 'moved in' : 'moved out'} $${(amt / 100).toFixed(2)}`);
      return { ok: true, msg: `$${(amt / 100).toFixed(2)} moved ${op === 'fund' ? `from the main account to ${b.name}` : `from ${b.name} back to the main account`}.` };
    }
    if (op === 'remove') {
      if (b.on) return { ok: false, msg: 'Turn the book off first.' };
      if ([...L[b.id].values()].some(x => x.fill > 0 && !x.result)) return { ok: false, msg: 'This book still has open trades. Remove it after they settle.' };
      S[b.id].balAt = 0; await balance(b, true); const left = S[b.id].bal ?? 0;
      if (left >= 1 && !a.keepMoney) return { ok: false, msg: `${b.name} still holds $${left.toFixed(2)}. Move it out to the main account first.` };
      list = list.filter(x => x !== b); await saveList(); await kv.delete('kbk:' + b.id); delete K[b.id];
      sql.exec('DELETE FROM kb WHERE bid = ?', b.id); delete L[b.id]; delete S[b.id];
      D.say(`BOOK removed ${b.name} (subaccount ${b.sub})`);
      return { ok: true, msg: `${b.name} is removed from the dashboard.${left > 0.005 ? ` $${left.toFixed(2)} is still in subaccount ${b.sub} on Kalshi; add or link a book on it to move it back.` : ''} Its key still exists on Kalshi; you can delete it there.` };
    }
    return { ok: false, msg: 'Unknown book request.' };
  }
  const anyOn = () => !!list?.some(b => b.on);
  return { load, onMark, onSettle, upkeep, view, command, anyOn };
}
