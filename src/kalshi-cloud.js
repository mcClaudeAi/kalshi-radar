// MC 2026-11-07 Kalshi tracker moved off the PC (asked to run it somewhere other than his computer; Cloudflare picked over a $5 VPS).
// This is kalshi-paper.mjs + kalshi-live-lib.mjs + notify.js's kalshiView, rebuilt to run inside the dashboard's Durable Object:
//   - the worker's cron calls tick() every minute: read the 9 coins' open markets (scanner + live board), add a price point to every
//     open rule trade, settle anything closed over a minute ago, and recompute the Kalshi tab when a trade settled;
//   - a Durable Object alarm fires on the exact 10-minutes-left mark (:05, :20, :35, :50) and runs the entry: read each coin's
//     order book, record the leader, and (if live is on) place the live order. A cron alone can run late by some seconds, the alarm
//     doesn't, and the tick re-runs a missed mark up to a minute late as a backup (the PC version accepted 9.4-10.4 minutes left).
//   - trades and live orders are rows in this object's SQLite storage (kt, ko); settings are keys (kcfg paper settings, kctl the
//     live switch). Price paths are one point a minute (the PC took one every 5s) and are written with the trade when it settles.
//   - the dashboard's kalshiSet / kalshiLive commands are applied here straight away instead of waiting for the bot on the PC.
//   - live orders are signed here with the key stored as Cloudflare secrets (KALSHI_KEY_ID, KALSHI_PRIVATE_KEY); the key file never
//     leaves the PC otherwise. Same order rules as the PC version (IOC at the ask + 1c, cr-<ticker> ids, $25 / $300 / 9 / 150 limits).
// Only markets at 85c+ at the mark are kept (the lowest the minimum price setting allows), not every market like the PC log did.
// The 30-day bench counts only trades recorded here and imported from the PC log (the PC also read the July-November replay file,
// which is too big to bring along); the Nov 7 check found the bench cost money over Aug-Nov anyway, so cold days 0 is the advice.
// MC 2026-11-07 Labs (asked to run every new idea as its own section on the dashboard, live, without touching the paper book or
// live trading). Each lab is a separate paper account replayed from the same recorded trades: skip 95c+, only windows with 6+
// coins, margin-vs-volatility, size that follows the bank, and all filters together. The volatility lab needs the coin's price and
// how much it has been moving at the moment of entry, so entry() reads the last hour of 1-minute candles from Coinbase for each
// rule trade and keeps z = margin past the target / one expected 10-minute move. Imported PC trades have no z, so that lab starts
// with the first cloud trade; every lab reports its own start and is scored against the rule over the same trades.
const BASE = 'https://api.elections.kalshi.com/trade-api/v2', API = '/trade-api/v2';
const CBPID = { BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', XRP: 'XRP-USD', DOGE: 'DOGE-USD', HYPE: 'HYPE-USD', BNB: 'BNB-USD', ZEC: 'ZEC-USD', NEAR: 'NEAR-USD' };
const HOSTS = ['https://api.elections.kalshi.com', 'https://external-api.kalshi.com'];
const SERIES = ['KXBTC15M', 'KXETH15M', 'KXSOL15M', 'KXXRP15M', 'KXDOGE15M', 'KXHYPE15M', 'KXBNB15M', 'KXZEC15M', 'KXNEAR15M'];
const MIN_LEFT = 10, BOOK_N = 100, KEEP_ASK = 0.85, Q = 15 * 60000;
const HARD = { maxSize: 25, minBank: 300, maxPerWindow: 9, maxPerDay: 150 };
const XI = 2;   // the 15-minute crypto markets trade on exchange shard 2
const PAPER_DEF = { startUsd: 1000, sizeUsd: 50, maxPerWindow: 9, minAsk: 0.9, dailyLossUsd: 250, coldDays: 30, coins: null };
// MC 2026-11-08 coin list and starting bank are settable from the dashboard (plug-and-play edition); null coins = all nine
const COINS = SERIES.map(s => s.replace(/^KX|15M$/g, ''));
const BOUNDS = { sizeUsd: [5, 500], dailyLossUsd: [25, 2000], minAsk: [0.85, 0.98], coldDays: [0, 90], startUsd: [100, 1000000] };
// MC 2026-11-08 the lab definitions live here so the paper book and the live gate can run any of them as the active playbook.
// filter(t) gets {px, win, z}: true take, false skip, null can't tell (no volatility reading). size(bank) only for sizing labs.
function labDefs(K) {
  return [
    { id: 'rule', name: 'The rule', desc: `Every 90¢+ leader at 10 minutes left, $${K.sizeUsd} a trade.`, color: '#4FD1FF', filter: () => true },
    { id: 'no95', name: 'Skip 95¢ and up', desc: 'Only buys between 90¢ and 94¢. Over 4 months the 95¢+ trades made nothing but still lost the full stake in bad windows.', color: '#FFB347', filter: t => t.px < 0.95 },
    { id: 'six', name: '6 or more coins', desc: 'Only trades windows where at least 6 of the 9 coins qualify. Those windows won 96% in the replay with half the drawdown.', color: '#35E0A1', filter: t => t.win >= 6 },
    { id: 'vol', name: 'Margin vs volatility', desc: 'Skips when the coin is less than one expected 10-minute move past its target, judged by its last hour on Coinbase.', color: '#FF7AD9', filter: t => t.z == null ? null : t.z >= 1 },
    { id: 'pct', name: 'Size follows the bank', desc: `Stakes 5% of the bank instead of a fixed $${K.sizeUsd}, so bets shrink after losses and grow after wins.`, color: '#9B8CFF', filter: () => true, size: b => Math.max(5, Math.round(b * 0.05)) },
    { id: 'all', name: 'All filters together', desc: 'Skip 95¢+, 6 or more coins, and the volatility check, all at once.', color: '#C8F56A', filter: t => t.z == null ? null : (t.px < 0.95 && t.win >= 6 && t.z >= 1) },
  ];
}
const LAB_IDS = labDefs(PAPER_DEF).map(l => l.id);
// A playbook log is [{at, id, by}] in time order; the entry in force at a moment is the last one at or before it, else the rule.
const stratAt = (log, ms) => { let id = 'rule'; for (const e of log || []) { if (e.at <= ms) id = e.id; else break; } return id; };
const stratSince = (log, ms) => { let at = null; for (const e of log || []) { if (e.at <= ms) at = e.at; else break; } return at; };
const coin = s => String(s || '').replace(/^KX|15M$/g, '');
const fee = (p, n) => Math.ceil(0.07 * n * p * (1 - p) * 100 - 1e-9) / 100;
const num = x => { if (x == null) return null; const v = Number(x); if (!isFinite(v)) return null; return typeof x === 'string' && x.includes('.') ? v : Number.isInteger(v) && v > 1 ? v / 100 : v; };
const d4 = x => x == null ? null : +Number(x).toFixed(4);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const fHr = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false });
const etDay = t => fDay.format(t), etHour = t => +fHr.format(t) % 24;
const nextMark = t => Math.floor((t - 5 * 60000) / Q) * Q + Q + 5 * 60000;   // :05, :20, :35, :50 (10 minutes before each close)
const thin = p => !p || p.length <= 72 ? (p || null) : p.filter((x, i) => i % Math.ceil(p.length / 72) === 0 || i === p.length - 1);

async function get(p) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(BASE + p, { headers: { accept: 'application/json' } }); if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue; } return r.ok ? await r.json() : null; }
    catch { await sleep(800 * (i + 1)); }
  }
  return null;
}
const detail = m => { if (!m) return {}; const o = {}; if (m.title) o.title = String(m.title).slice(0, 120); const sub = m.yes_sub_title || m.subtitle; if (sub) o.sub = String(sub).slice(0, 120);
  const k = m.custom_strike?.floor_strike ?? m.floor_strike ?? m.cap_strike ?? m.functional_strike; if (k != null && k !== '') o.strike = Number(k); if (m.strike_type || m.custom_strike?.strike_type) o.strikeType = m.strike_type || m.custom_strike.strike_type; return o; };
const fin = m => { const v = m?.expiration_value ?? m?.settlement_value_dollars ?? null; return v == null || v === '' ? null : (isFinite(Number(v)) ? Number(v) : String(v)); };
function book(ob) {
  const o = ob?.orderbook_fp || ob?.orderbook || {};
  const side = k => (o[k + '_dollars'] || o[k] || []).map(([p, q]) => [num(p), Number(q)]).filter(([p, q]) => p > 0 && q > 0);
  const yesBids = side('yes'), noBids = side('no'), asks = bids => bids.map(([p, q]) => [+(1 - p).toFixed(4), q]).sort((a, b) => a[0] - b[0]);
  return { yesAsks: asks(noBids), noAsks: asks(yesBids) };
}
function walk(asks, n) { let left = n, cost = 0; for (const [p, q] of asks) { const t = Math.min(left, q); cost += t * p; left -= t; if (!left) break; } return left ? null : cost / n; }
// the coin's price now and its 1-minute volatility over the last hour (Coinbase), for the margin-vs-volatility lab
async function volAt(c, strike, side) {
  const pid = CBPID[c]; if (!pid || !(strike > 0)) return null;
  try {
    const r = await fetch(`https://api.exchange.coinbase.com/products/${pid}/candles?granularity=60`, { headers: { accept: 'application/json', 'user-agent': 'curve-radar' } });
    if (!r.ok) return null;
    const rows = (await r.json()).slice(0, 61).sort((a, b) => a[0] - b[0]);   // oldest first: [time, low, high, open, close, volume]
    if (rows.length < 20) return null;
    const px = rows[rows.length - 1][4], rets = []; for (let i = 1; i < rows.length; i++) rets.push(Math.log(rows[i][4] / rows[i - 1][4]));
    const m = rets.reduce((a, b) => a + b, 0) / rets.length, sigma = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / rets.length);
    const margin = (side === 'yes' ? px - strike : strike - px) / strike, z = sigma > 0 ? margin / (sigma * Math.sqrt(10)) : null;
    return { px, sigma: +sigma.toExponential(3), margin: +margin.toFixed(6), z: z == null ? null : +z.toFixed(2) };
  } catch { return null; }
}

// ---------- request signing (WebCrypto) ----------
function pemDer(pem) { const b = String(pem).replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''); const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };

export function createKalshi(state, env, keep) {
  const sql = state.storage.sql, kv = state.storage;
  sql.exec('CREATE TABLE IF NOT EXISTS kt (tk TEXT PRIMARY KEY, close INTEGER, j TEXT)');
  sql.exec('CREATE TABLE IF NOT EXISTS ko (tk TEXT PRIMARY KEY, at INTEGER, j TEXT)');
  let rec = null, L = null, cfgP = null, ctlL = null, scan = [], scanAt = 0, view = null, viewDirty = true, viewAt = 0;
  const st = { bal: null, balAt: 0, lastErr: null, errAt: 0, host: 0, sellAllDone: 0, stopped: null, keyOk: null, shard: {}, xferAt: 0, lastXfer: null, lastMark: 0 };
  const logs = [];
  const say = s => { logs.push(`${new Date().toISOString().slice(11, 19)} ${s}`); if (logs.length > 60) logs.shift(); };
  async function load() {
    if (rec) return;
    rec = new Map(); for (const r of sql.exec('SELECT j FROM kt')) { try { const j = JSON.parse(r.j); rec.set(j.ticker, j); } catch {} }
    L = new Map(); for (const r of sql.exec('SELECT j FROM ko')) { try { const j = JSON.parse(r.j); L.set(j.tk, j); } catch {} }
    cfgP = { ...PAPER_DEF, ...((await kv.get('kcfg')) || {}) };
    ctlL = { enabled: false, sizeUsd: 10, dailyLossUsd: 100, sellAllAt: 0, ...((await kv.get('kctl')) || {}) };
    const s = (await kv.get('kst')) || {}; st.sellAllDone = s.sellAllDone || 0;
  }
  const saveRec = r => sql.exec('INSERT OR REPLACE INTO kt (tk, close, j) VALUES (?, ?, ?)', r.ticker, r.close, JSON.stringify(r));
  const saveL = x => sql.exec('INSERT OR REPLACE INTO ko (tk, at, j) VALUES (?, ?, ?)', x.tk, x.at, JSON.stringify(x));
  const ctl = () => ({ enabled: ctlL.enabled === true, sizeUsd: Math.min(HARD.maxSize, Math.max(5, +ctlL.sizeUsd || 10)), dailyLossUsd: Math.max(10, +ctlL.dailyLossUsd || 100), sellAllAt: +ctlL.sellAllAt || 0, at: ctlL.at || 0, minBank: ctlL.minBank ?? HARD.minBank, strat: Array.isArray(ctlL.strat) ? ctlL.strat : [] });

  // ---------- signed requests ----------
  let KEY = null;
  const activeSeries = () => cfgP?.coins?.length ? SERIES.filter(s => cfgP.coins.includes(coin(s))) : SERIES;
  const hasKeys = () => !!(env.KALSHI_KEY_ID && env.KALSHI_PRIVATE_KEY);
  async function key() {
    if (KEY) return KEY;
    if (!hasKeys()) throw new Error(env.KEY_HELP ? 'no Kalshi key connected' : 'no Kalshi key set in Cloudflare (KALSHI_KEY_ID, KALSHI_PRIVATE_KEY)');
    const der = pemDer(env.KALSHI_PRIVATE_KEY);
    try { KEY = { k: await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']), alg: { name: 'Ed25519' } }; }
    catch { KEY = { k: await crypto.subtle.importKey('pkcs8', der, { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['sign']), alg: { name: 'RSA-PSS', saltLength: 32 } }; }
    return KEY;
  }
  async function sign(method, p) {
    const k = await key(), ts = String(Date.now());
    const sig = await crypto.subtle.sign(k.alg, k.k, new TextEncoder().encode(ts + method + p.split('?')[0]));
    return { 'KALSHI-ACCESS-KEY': String(env.KALSHI_KEY_ID).trim().replace(/^["']|["']$/g, ''), 'KALSHI-ACCESS-TIMESTAMP': ts, 'KALSHI-ACCESS-SIGNATURE': b64(sig) };
  }
  async function kreq1(method, p, body) {
    let last = null;
    for (let i = 0; i < HOSTS.length; i++) {
      const h = HOSTS[(st.host + i) % HOSTS.length], full = API + p;
      try {
        const r = await fetch(h + full, { method, headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...(await sign(method, full)) }, body: body ? JSON.stringify(body) : undefined });
        const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
        last = { ok: r.ok, status: r.status, j, t: t.slice(0, 300) };
        if (r.status === 404 && i < HOSTS.length - 1) continue;
        if (r.ok) st.host = (st.host + i) % HOSTS.length;
        return last;
      } catch (e) { last = { ok: false, status: 0, t: e.message }; }
    }
    return last;
  }
  async function kreq(method, p, body) { for (let a = 0; a < 4; a++) { const r = await kreq1(method, p, body); if (r?.status !== 429 || a === 3) return r; await sleep(700 * (a + 1)); } }
  const errOf = r => r?.j?.error?.message || r?.j?.message || r?.j?.error || r?.t || 'no answer';
  const fail = m => { st.lastErr = m; st.errAt = Date.now(); say('LIVE ' + m); };

  // ---------- bench: a coin sits out while its rule trades over the last cold days netted below zero ($50 a trade) ----------
  function coldSet(at) {
    const days = cfgP.coldDays; if (!(days > 0)) return new Set();
    const cut = at - days * 86400000, net = {};
    for (const r of rec.values()) { if (!r.result || r.result === 'void' || !(r.ask >= 0.9) || r.close <= cut || r.close > at) continue; const px = r.avgN || r.ask, n = Math.floor(50 / px); const c = coin(r.series); net[c] = (net[c] || 0) + (r.won ? n : 0) - n * px - fee(px, n); }
    return new Set(Object.entries(net).filter(([, v]) => v < 0).map(([k]) => k));
  }

  // ---------- live account ----------
  const todayL = () => { const d = etDay(Date.now()); return [...L.values()].filter(x => etDay(x.at) === d); };
  const realized = l => l.reduce((a, x) => a + (x.pnl ?? 0), 0);
  async function balance(force) {
    if (Date.now() - st.balAt < (force ? 30000 : 60000)) return st.bal;
    const r = await kreq('GET', '/portfolio/balance');
    if (r?.ok) { const j = r.j || {}; st.bal = j.balance_dollars != null ? +j.balance_dollars : j.balance != null ? j.balance / 100 : null; st.balAt = Date.now(); st.keyOk = true; st.shard = {}; for (const b of j.balance_breakdown || []) st.shard[b.exchange_index] = +b.balance; }
    else { st.keyOk = r?.status === 401 ? false : st.keyOk; fail(`balance check failed: ${r?.status} ${errOf(r)}`); }
    return st.bal;
  }
  async function fund(c) {
    if (Date.now() - st.xferAt < 60000) return;
    const have = st.shard[XI] ?? 0, src = st.shard[0] ?? 0, want = Math.round(c.sizeUsd * 12), low = c.sizeUsd * 9;
    if (have >= low || src < 1) return;
    const amt = Math.min(src, want - have); if (amt < 1) return;
    st.xferAt = Date.now();
    const res = await kreq('POST', '/portfolio/intra_exchange_instance_transfer', { source: 'event_contract', destination: 'event_contract', amount: Math.floor(amt * 100) * 100, source_exchange_shard: 0, destination_exchange_shard: XI, client_transfer_id: crypto.randomUUID() });
    if (!res?.ok) { fail(`could not move $${amt.toFixed(2)} to the crypto shard: ${res?.status} ${errOf(res)}`); return; }
    st.lastXfer = { at: Date.now(), amt: +amt.toFixed(2) }; st.balAt = 0; say(`LIVE moved $${amt.toFixed(2)} to the crypto shard`);
  }
  function skipLive(r, why) {
    if (L.has(r.ticker)) return;
    const x = { tk: r.ticker, coin: coin(r.series), side: r.side, at: Date.now(), close: r.close, paperPx: r.avgN || r.ask, skipped: why, strat: stratAt(ctl().strat, Date.now()) }; L.set(r.ticker, x); saveL(x); say(`LIVE skip ${r.ticker}: ${why}`);
  }
  async function onRule(r, lab = null) {
    const c = ctl(); if (!c.enabled || L.has(r.ticker)) return;
    const cn = coin(r.series), why = (() => {
      if (coldSet(Date.now()).has(cn)) return `${cn} is benched (down over its last ${cfgP.coldDays} days)`;
      const t = todayL(); if (realized(t) <= -c.dailyLossUsd) return `daily loss cap hit (${realized(t).toFixed(2)})`;
      if (t.filter(x => x.fill > 0).length >= HARD.maxPerDay) return 'daily order limit';
      if ([...L.values()].filter(x => x.close === r.close && x.fill > 0).length >= HARD.maxPerWindow) return 'window limit';
      return null; })();
    const skip = s => { st.stopped = s; const x = { tk: r.ticker, coin: cn, side: r.side, at: Date.now(), close: r.close, paperPx: r.avgN || r.ask, skipped: s }; L.set(r.ticker, x); saveL(x); say(`LIVE skip ${r.ticker}: ${s}`); };
    if (why) return skip(why);
    const bal = await balance(true);
    if (bal == null) { fail(`no order for ${r.ticker}: could not read the balance`); return; }
    const floor = c.minBank ?? HARD.minBank; if (bal < floor) return skip(`cash $${bal.toFixed(2)} is under the $${floor} floor`);
    st.stopped = null;
    // MC 2026-11-08 a sizing playbook (5% of the Kalshi cash) stays inside the $5 to $25 live band and the saved size is its ceiling
    const sizeUsd = lab?.size ? Math.min(c.sizeUsd, HARD.maxSize, Math.max(5, lab.size(bal))) : c.sizeUsd;
    if ((st.shard[XI] ?? 0) < sizeUsd + 1) { st.xferAt = 0; await fund(c); }
    const maxPx = Math.min(0.99, +(r.ask + 0.01).toFixed(4)), n = Math.floor(sizeUsd / maxPx);
    if (n < 1) return;
    const grid = p => (p < 0.1 || p >= 0.9) ? 0.001 : 0.01, down = p => +(Math.floor(p / grid(p) + 1e-9) * grid(p)).toFixed(4), up = p => +(Math.ceil(p / grid(p) - 1e-9) * grid(p)).toFixed(4);
    const body = r.side === 'yes'
      ? { ticker: r.ticker, side: 'bid', count: String(n), price: down(maxPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', client_order_id: `cr-${r.ticker}` }
      : { ticker: r.ticker, side: 'ask', count: String(n), price: up(1 - maxPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', client_order_id: `cr-${r.ticker}` };
    const row = { tk: r.ticker, coin: cn, side: r.side, at: Date.now(), close: r.close, paperPx: r.avgN || r.ask, ask: r.ask, want: n, limit: maxPx, size: sizeUsd, fill: 0, strat: lab?.id || 'rule' };
    L.set(r.ticker, row); saveL(row);
    const res = await kreq('POST', '/portfolio/events/orders', body);
    if (!res?.ok) { row.err = `${res?.status} ${errOf(res)}`.slice(0, 200); saveL(row); fail(`order ${r.ticker} refused: ${row.err}`); return; }
    const j = res.j?.order || res.j || {}, fill = +(j.fill_count ?? 0), avgYes = j.average_fill_price != null ? +j.average_fill_price : null, avgFee = j.average_fee_paid != null ? +j.average_fee_paid : 0;
    Object.assign(row, { id: j.order_id || null, fill, avgYes, px: avgYes == null ? null : +(r.side === 'yes' ? avgYes : 1 - avgYes).toFixed(4), fees: +(fill * avgFee).toFixed(4) });
    row.cost = row.px == null ? null : +(fill * row.px + row.fees).toFixed(2);
    saveL(row); say(`LIVE ${r.ticker} ${r.side.toUpperCase()} ${fill}/${n} filled${row.px != null ? ` at ${(row.px * 100).toFixed(1)}c` : ''}`);
    if (row.cost) { if (st.bal != null) st.bal = +(st.bal - row.cost).toFixed(2); if (st.shard[XI] != null) st.shard[XI] = +(st.shard[XI] - row.cost).toFixed(2); }
  }
  function onSettle(r) {
    const x = L.get(r.ticker); if (!x || x.result || !(x.fill > 0) || x.sold) return;
    x.result = r.result; x.won = r.result === x.side; x.pnl = +((x.won ? x.fill : 0) - (x.cost ?? 0)).toFixed(2); saveL(x); st.balAt = 0;
    say(`LIVE settled ${r.ticker}: ${x.won ? 'won' : 'LOST'} ${x.pnl >= 0 ? '+' : ''}$${x.pnl}`);
  }
  async function sellAll() {
    for (const x of [...L.values()].filter(x => x.fill > 0 && !x.result && !x.sold && x.close > Date.now())) {
      const body = x.side === 'yes'
        ? { ticker: x.tk, side: 'ask', count: String(x.fill), price: '0.0010', time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', reduce_only: true, client_order_id: `crs-${x.tk}-${Date.now()}` }
        : { ticker: x.tk, side: 'bid', count: String(x.fill), price: '0.9990', time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', reduce_only: true, client_order_id: `crs-${x.tk}-${Date.now()}` };
      const res = await kreq('POST', '/portfolio/events/orders', body);
      if (!res?.ok) { fail(`sell ${x.tk} refused: ${res?.status} ${errOf(res)}`); continue; }
      const j = res.j?.order || res.j || {}, f = +(j.fill_count ?? 0), avg = j.average_fill_price != null ? +j.average_fill_price : null, fe = j.average_fee_paid != null ? +j.average_fee_paid * f : 0;
      if (f > 0 && avg != null) { const px = +(x.side === 'yes' ? avg : 1 - avg).toFixed(4); x.sold = { at: Date.now(), fill: f, px }; x.pnl = +(f * px - fe - (x.cost ?? 0) * f / x.fill).toFixed(2); x.result = 'sold'; saveL(x); say(`LIVE sold ${x.tk}: ${f} at ${(px * 100).toFixed(1)}c`); }
      else fail(`sell ${x.tk}: nothing filled`);
    }
    st.balAt = 0;
  }
  // MC 2026-11-07 150 recent live orders (was 40) so the dashboard day filter can page back through them
  function liveView() {
    const c = ctl(), t = todayL().filter(x => x.fill > 0), done = t.filter(x => x.result), all = [...L.values()].sort((a, b) => b.at - a.at);
    return { on: c.enabled, size: c.sizeUsd, dailyLossUsd: c.dailyLossUsd, since: c.at || null, keys: hasKeys(), keyOk: st.keyOk, bal: st.bal, balAt: st.balAt || null, shard: st.shard, crypto: st.shard[XI] ?? null, xfer: st.lastXfer, err: st.lastErr && Date.now() - st.errAt < 3600000 ? st.lastErr : null, stopped: st.stopped,
      hard: { ...HARD, minBank: c.minBank }, today: { n: done.length, won: done.filter(x => x.won).length, net: +realized(done).toFixed(2), open: t.filter(x => !x.result).length }, bench: [...coldSet(Date.now())], where: 'cloud',
      total: { n: all.filter(x => x.result && x.fill > 0).length, net: +realized(all.filter(x => x.fill > 0)).toFixed(2) },
      open: all.filter(x => x.fill > 0 && !x.result).map(x => ({ tk: x.tk, coin: x.coin, side: x.side, fill: x.fill, px: x.px, cost: x.cost, paperPx: x.paperPx, close: x.close, at: x.at })),
      // MC 2026-11-08 every settled live trade in the paper history's compact shape, for the dashboard's Live analytics tab
      hist: all.filter(x => x.fill > 0 && x.result).slice(0, 2000).map(x => [x.close, x.coin, x.side, x.px, x.fill, x.pnl, x.won ? 1 : 0]),
      recent: all.slice(0, 150).map(x => ({ tk: x.tk, coin: x.coin, side: x.side, at: x.at, close: x.close, want: x.want ?? null, fill: x.fill ?? 0, px: x.px ?? null, paperPx: x.paperPx, cost: x.cost ?? null, result: x.result || null, won: x.won ?? null, pnl: x.pnl ?? null, err: x.err || null, skipped: x.skipped || null, sold: !!x.sold, strat: x.strat || null })),
      playbook: { id: stratAt(c.strat, Date.now()), since: stratSince(c.strat, Date.now()), log: (c.strat || []).slice(-12) } };
  }

  // ---------- the rule: record the leader at the 10-minute mark ----------
  let entryBusy = false;
  async function entry(now = Date.now()) {
    await load();
    if (entryBusy) return 0; entryBusy = true; st.lastMark = now;   // the alarm and the minute tick can't both run one mark
    let n = 0; const hits = [];
    try {
    for (const s of activeSeries()) {
      const j = await get(`/markets?series_ticker=${s}&status=open&limit=6`);
      for (const m of j?.markets || []) {
        const close = Date.parse(m.close_time), left = (close - now) / 60000;
        if (rec.has(m.ticker) || left > MIN_LEFT + 0.4 || left < MIN_LEFT - 1) continue;
        const b = book(await get(`/markets/${m.ticker}/orderbook`));
        const ya = b.yesAsks[0]?.[0], na = b.noAsks[0]?.[0]; if (ya == null || na == null) continue;
        const side = ya >= na ? 'yes' : 'no', asks = side === 'yes' ? b.yesAsks : b.noAsks, ask = asks[0][0];
        if (ask < KEEP_ASK) continue;
        const avgN = walk(asks, BOOK_N);
        const r = { ticker: m.ticker, series: s, at: now, close, left: +left.toFixed(2), side, ask, depthAtAsk: asks[0][1], avgN: avgN == null ? null : +avgN.toFixed(4), ...detail(m), ya, na, depth: asks.reduce((a, x) => a + x[1], 0), src: 'cloud' };
        rec.set(m.ticker, r); saveRec(r); n++;
        if (ask >= KEEP_ASK) { const v = await volAt(coin(s), r.strike, side); if (v) { r.vol = v; saveRec(r); } }
        if (ask >= cfgP.minAsk) { say(`${m.ticker} ${side.toUpperCase()} at ${Math.round(ask * 100)}c <- rule`); hits.push(r); }
      }
    }
    // MC 2026-11-08 live orders go after the scan so the active playbook can see the whole window (how many coins qualified,
    // each coin's volatility reading). Was: order per coin inside the loop under the plain rule.
    const c = ctl();
    if (c.enabled && hits.length) {
      const sid = stratAt(c.strat, now), lab = labDefs(cfgP).find(l => l.id === sid);
      for (const r of hits) {
        const f = sid === 'rule' ? true : lab.filter({ px: r.avgN || r.ask, win: hits.length, z: r.vol?.z ?? null });
        if (f === true) { try { await onRule(r, lab); } catch (e) { fail('order error: ' + e.message); } }
        else skipLive(r, `${lab.name}: ${f === null ? 'no volatility reading' : 'filtered out'}`);
      }
    }
    } finally { entryBusy = false; }
    if (n) viewDirty = true;
    return n;
  }

  // ---------- every minute: scanner, price paths, settlement ----------
  async function tick() {
    await load();
    const now = Date.now(), K = cfgP, out = [];
    // a missed mark (alarm didn't fire) is caught here up to a minute late
    const mk = nextMark(now) - Q; if (now - mk < 60000 && st.lastMark < mk) await entry(now);
    for (const s of activeSeries()) {
      const j = await get(`/markets?series_ticker=${s}&status=open&limit=6`);
      const ms = (j?.markets || []).map(m => ({ m, o: Date.parse(m.open_time), c: Date.parse(m.close_time) })).filter(x => x.c > now).sort((a, b) => a.c - b.c);
      const cur = ms.find(x => x.o <= now) || ms[0], nxt = ms.find(x => x.c > (cur?.c || now));
      if (!cur) continue;
      const m = cur.m, yb = d4(num(m.yes_bid_dollars ?? m.yes_bid)), ya = d4(num(m.yes_ask_dollars ?? m.yes_ask)), last = d4(num(m.last_price_dollars ?? m.last_price));
      const na = yb == null ? null : +(1 - yb).toFixed(4), det = detail(m), leader = ya == null || na == null ? null : ya >= na ? 'yes' : 'no', lask = leader === 'yes' ? ya : leader === 'no' ? na : null;
      out.push({ coin: coin(s), tk: m.ticker, open: cur.o, close: cur.c, strike: det.strike ?? null, yb, ya, last, leader, lask, next: nxt ? { tk: nxt.m.ticker, open: nxt.o, close: nxt.c } : null, taken: rec.has(m.ticker) ? (rec.get(m.ticker).ask >= K.minAsk ? 'rule' : 'skip') : null });
      const r = rec.get(m.ticker);
      if (r && !r.result && r.ask >= K.minAsk) { r.path = r.path || []; r.path.push([Math.round(now / 1000), yb, ya, last]); if (r.path.length > 40) r.path.splice(0, r.path.length - 40); }
    }
    scan = out; scanAt = now;
    await settleSome(now, false);
    // live account upkeep
    const c = ctl();
    if (c.sellAllAt && c.sellAllAt > st.sellAllDone) { st.sellAllDone = c.sellAllAt; await kv.put('kst', { sellAllDone: st.sellAllDone }); say('LIVE sell-all requested'); try { await sellAll(); } catch (e) { fail('sell-all error: ' + e.message); } }
    if (hasKeys() && (c.enabled || now - st.balAt > 5 * 60000)) { try { await balance(); } catch (e) { fail(e.message); } }
    if (c.enabled && st.balAt) { try { await fund(c); } catch (e) { fail('funding error: ' + e.message); } }
    const a = await state.storage.getAlarm(), want = nextAlarm(now); if (!a || a < now || a > want) await state.storage.setAlarm(want);
    await publish(true);
  }
  // MC 2026-11-08 settlement was only checked on the 1-minute cron and only once a market had been closed a full minute, so a
  // trade sat at 0:00 for 1 to 3 minutes before the totals moved. Now the alarm also wakes 15 seconds after each close with an
  // open trade and retries every 20 seconds until Kalshi posts the result (up to 10 minutes, then the cron keeps trying).
  // quick=true only looks at our trades closed in the last 10 minutes.
  async function settleSome(now, quick) {
    let k = 0, any = false;
    for (const r of rec.values()) {
      if (r.result || now < r.close + (quick ? 15000 : 60000)) continue;
      if (quick && (!(r.ask >= cfgP.minAsk) || now > r.close + 600000)) continue;
      if (++k > 12) break;
      const j = await get(`/markets/${r.ticker}`), res = j?.market?.result;
      if (res !== 'yes' && res !== 'no') { if (now > r.close + 6 * 3600000) { r.result = 'void'; saveRec(r); viewDirty = true; } continue; }
      r.result = res; r.won = res === r.side; Object.assign(r, detail(j.market), { final: fin(j.market) });
      r.pnl1 = +((r.won ? 1 : 0) - r.ask - fee(r.ask, 1)).toFixed(4);
      r.pnlN = r.avgN == null ? null : +((r.won ? 1 : 0) - r.avgN - fee(r.avgN, BOOK_N) / BOOK_N).toFixed(4);
      r.path = thin(r.path); saveRec(r); viewDirty = true;
      if (r.ask >= cfgP.minAsk) say(`settled ${r.ticker}: ${r.won ? 'won' : 'LOST'}`);
      try { onSettle(r); } catch (e) { fail('settle error: ' + e.message); }
      any = true;
    }
    if (any) { st.balAt = 0; }
    return any;
  }
  // the next wake: the next 10-minute mark, or sooner when one of our trades just closed or is still waiting on its result
  function nextAlarm(now) {
    let t = nextMark(now + 1000);
    for (const r of rec.values()) {
      if (r.result || !(r.ask >= cfgP.minAsk) || now > r.close + 600000) continue;
      t = Math.min(t, now < r.close + 15000 ? r.close + 15000 : now + 20000);
    }
    return t;
  }
  async function alarm() {
    await load();
    const now = Date.now(), mk = nextMark(now) - Q;
    if (now - mk < 60000 && st.lastMark < mk) { try { await entry(now); } catch (e) { say('entry error: ' + e.message); } }
    let moved = false; try { moved = await settleSome(now, true); } catch (e) { say('quick settle error: ' + e.message); }
    if (moved && hasKeys()) { try { await balance(); } catch (e) { fail(e.message); } }
    await state.storage.setAlarm(nextAlarm(now));
    await publish(true);
  }

  // ---------- what the page reads ----------
  function kliveBody() {
    const now = Date.now(), K = cfgP, open = [];
    for (const r of rec.values()) {
      if (r.result || !(r.ask >= K.minAsk) || now > r.close + 300000) continue;   // MC 2026-11-08 keep a closed trade on the board until it settles (was dropped after 90s)
      const px = r.avgN || r.ask, n = Math.floor(K.sizeUsd / px), lp = r.path?.at(-1);
      open.push({ tk: r.ticker, coin: coin(r.series), side: r.side, px: +px.toFixed(4), ask: r.ask, n, cost: +(n * px + fee(px, n)).toFixed(2), at: r.at, close: r.close, strike: r.strike ?? null, title: r.title || null, yb: lp?.[1] ?? null, ya: lp?.[2] ?? null, last: lp?.[3] ?? null, path: r.path || [] });
    }
    return { at: scanAt || now, open, scan, size: K.sizeUsd, minAsk: K.minAsk, live: liveView(), where: 'cloud' };
  }
  async function publish(save) {
    const kl = JSON.stringify(kliveBody());
    if (viewDirty || !view || Date.now() - viewAt > 120000) { view = JSON.stringify(kalshiView()); viewDirty = false; viewAt = Date.now(); }
    await keep({ klive: kl, kview: view }, false);
  }

  // ---------- the Kalshi tab (same shape as notify.js kalshiView) ----------
  function kalshiView() {
    const K = cfgP, rows = [...rec.values()].sort((a, b) => a.at - b.at), sum = l => +l.reduce((a, t) => a + t.pnl, 0).toFixed(2);
    const H = [], net30 = (c, at) => { let x = 0, k = 0; for (const h of H) if (h.coin === c && h.close <= at && h.close > at - K.coldDays * 86400000) { x += h.pnl; k++; } return { x, k }; };
    const perWin = {}, dayNet = {}, trades = [], labs0 = labDefs(K), winN = {};
    // MC 2026-11-08 the active playbook (K.strat log) filters and sizes the paper book from the moment it was switched on;
    // everything before that stays as the plain rule, so the history never gets rewritten by a switch.
    for (const r of rows) if (r.ask >= K.minAsk && r.result !== 'void') winN[r.close] = (winN[r.close] || 0) + 1;
    let bal = K.startUsd, peak = bal, maxDd = 0, open = 0, balU = K.startUsd; const eq = [[rows[0]?.at || Date.now(), bal]];
    for (const r of rows) {
      if (!(r.ask >= K.minAsk) || r.result === 'void') continue;
      const w = r.close; perWin[w] = (perWin[w] || 0) + 1;
      const dk = etDay(r.close), halted = K.dailyLossUsd > 0 && (dayNet[dk] || 0) <= -K.dailyLossUsd;
      const c30 = K.coldDays > 0 ? net30(coin(r.series), r.at) : { x: 0, k: 0 }, cold = K.coldDays > 0 && c30.x < 0;
      const px = r.avgN || r.ask, sid = stratAt(K.strat, r.at), lab = sid === 'rule' ? null : labs0.find(l => l.id === sid);
      const f = lab ? lab.filter({ px, win: winN[w], z: r.vol?.z ?? null }) : true, strat = f !== true ? sid : null;
      const sizeUsd = lab?.size ? lab.size(bal) : K.sizeUsd;
      const capped = perWin[w] > K.maxPerWindow || halted || cold || !!strat, n = Math.floor(sizeUsd / px), cost = +(n * px + fee(px, n)).toFixed(2);
      const t = { t: r.at, close: r.close, coin: coin(r.series), side: r.side, px: +px.toFixed(3), n, cost, capped, halted, done: !!r.result, won: !!r.won, pnl: null, strat, stratWhy: strat ? (f === null ? 'no volatility reading' : lab.name) : null, book: sid,
        tk: r.ticker, left: r.left, ask: r.ask, ya: r.ya ?? null, na: r.na ?? null, dAsk: r.depthAtAsk ?? null, depth: r.depth ?? null, bookAvg: r.avgN != null, fee: fee(px, n),
        title: r.title || null, sub: r.sub || null, strike: r.strike ?? null, final: r.final ?? null, res: r.result || null, cold, net30: +c30.x.toFixed(2), path: thin(r.path), z: r.vol?.z ?? null, vpx: r.vol?.px ?? null };
      if (r.result) { const n50 = Math.floor(50 / px); H.push({ coin: t.coin, close: r.close, pnl: (r.won ? n50 : 0) - n50 * px - fee(px, n50) }); const nr = Math.floor(K.sizeUsd / px); t.rulePnl = +((r.won ? nr : 0) - nr * px - fee(px, nr)).toFixed(2); }
      if (!capped && r.result) { t.pnl = +((r.won ? n : 0) - cost).toFixed(2); bal += t.pnl; dayNet[dk] = (dayNet[dk] || 0) + t.pnl; peak = Math.max(peak, bal); maxDd = Math.max(maxDd, peak - bal); eq.push([r.close, +bal.toFixed(2)]); }
      if (r.result) balU += (r.won ? n : 0) - cost;
      if (!capped && !r.result) open += cost;
      trades.push(t);
    }
    const grpW = {}; for (const t of trades) { const g = t.close + t.side; grpW[g] = (grpW[g] || 0) + 1; } for (const t of trades) { t.same = grpW[t.close + t.side]; t.win = perWin[t.close]; }
    const labs = runLabs(trades, K);
    const done = trades.filter(t => t.done && !t.capped), today = done.filter(t => etDay(t.close) === etDay(Date.now()));
    const byCoin = {}; for (const t of done) { const b = byCoin[t.coin] = byCoin[t.coin] || { coin: t.coin, n: 0, won: 0, net: 0 }; b.n++; if (t.won) b.won++; b.net = +(b.net + t.pnl).toFixed(2); }
    const winLoss = {}; for (const t of done) { if (!t.won) winLoss[t.close] = (winLoss[t.close] || 0) + 1; }
    let streak = 0; for (let i = done.length - 1; i >= 0 && done[i].won; i--) streak++;
    const seen = rows.length, rule = rows.filter(r => r.ask >= K.minAsk).length, under = rows.filter(r => r.result && r.result !== 'void' && r.ask < K.minAsk);
    const step = Math.max(1, Math.ceil(eq.length / 240));
    const agg = (l, key) => { const o = {}; for (const t of l) { const k = key(t); if (k == null) continue; const b = o[k] = o[k] || { n: 0, won: 0, net: 0 }; b.n++; if (t.won) b.won++; b.net = +(b.net + t.pnl).toFixed(2); } return o; };
    const byHour = agg(done, t => etHour(t.close)), bySide = agg(done, t => t.side), byPx = agg(done, t => t.px < 0.92 ? '90-92' : t.px < 0.95 ? '92-95' : t.px < 0.97 ? '95-97' : '97-99'), bySame = agg(done, t => t.same >= 4 ? '4+' : String(t.same));
    const dayMap = {}; for (const t of trades) { if (t.capped && !t.halted) continue; const k = etDay(t.close); const d = dayMap[k] = dayMap[k] || { d: k, n: 0, won: 0, net: 0, low: 0, run: 0, halted: false, skipped: 0 }; if (t.halted) { d.halted = true; d.skipped++; continue; } if (!t.done) continue; d.n++; if (t.won) d.won++; d.run = +(d.run + t.pnl).toFixed(2); d.net = d.run; d.low = Math.min(d.low, d.run); }
    const daily = Object.values(dayMap).sort((a, b) => a.d < b.d ? -1 : 1).slice(-21).map(({ run, ...d }) => d);
    const roll = []; for (let i = 0; i < done.length; i++) { if (i % 5 && i !== done.length - 1) continue; const w = done.slice(Math.max(0, i - 99), i + 1); roll.push([done[i].close, +(w.filter(t => t.won).length / w.length).toFixed(4)]); }
    const breakEven = done.length ? +(done.reduce((a, t) => a + t.cost / t.n, 0) / done.length).toFixed(4) : 0.93;
    const h2 = done.length >> 1, halves = { a: { n: h2, net: sum(done.slice(0, h2)) }, b: { n: done.length - h2, net: sum(done.slice(h2)) } };
    const last300 = done.slice(-300), wr300 = last300.length ? last300.filter(t => t.won).length / last300.length : 0;
    const worstDay = daily.length ? Math.min(...daily.map(d => d.low)) : 0, stopsWeek = daily.slice(-7).filter(d => d.halted).length;
    const firstT = done[0]?.close || Date.now(), daysOn = (Date.now() - firstT) / 86400000, keys = hasKeys();
    const checks = [
      { k: 'n', label: '300 paper trades', val: done.length, target: 300, pct: Math.min(1, done.length / 300), ok: done.length >= 300, note: `${done.length} so far` },
      { k: 'wr', label: `Win rate ${Math.round((breakEven + 0.015) * 1000) / 10}%+ over the last 300`, val: +(wr300 * 100).toFixed(1), target: +((breakEven + 0.015) * 100).toFixed(1), pct: last300.length ? Math.min(1, Math.max(0, (wr300 - 0.85) / (breakEven + 0.015 - 0.85))) : 0, ok: last300.length >= 100 && wr300 >= breakEven + 0.015, note: `break-even is ${(breakEven * 100).toFixed(1)}%; the margin above it is the whole edge` },
      { k: 'halves', label: 'Profit in both halves', val: halves.a.net > 0 && halves.b.net > 0 ? 1 : 0, target: 1, pct: (halves.a.net > 0 ? .5 : 0) + (halves.b.net > 0 ? .5 : 0), ok: done.length >= 100 && halves.a.net > 0 && halves.b.net > 0, note: `first half ${halves.a.net < 0 ? '-' : '+'}$${Math.abs(halves.a.net).toFixed(0)}, second ${halves.b.net < 0 ? '-' : '+'}$${Math.abs(halves.b.net).toFixed(0)}` },
      { k: 'days', label: '14 days of live paper', val: +daysOn.toFixed(1), target: 14, pct: Math.min(1, daysOn / 14), ok: daysOn >= 14, note: `${daysOn.toFixed(1)} days, including ${daily.filter(d => d.net < 0).length} losing day${daily.filter(d => d.net < 0).length === 1 ? '' : 's'}` },
      { k: 'stop', label: 'Daily stop hit at most once a week', val: stopsWeek, target: 1, pct: stopsWeek <= 1 ? 1 : 0, ok: stopsWeek <= 1, note: stopsWeek ? `${stopsWeek} stop${stopsWeek === 1 ? '' : 's'} in the last 7 days` : 'not hit in the last 7 days' },
      { k: 'keys', label: env.KEY_HELP ? 'Kalshi API key connected' : 'Kalshi API key in Cloudflare', val: keys ? 1 : 0, target: 1, pct: keys ? 1 : 0, ok: keys, note: env.KEY_HELP ? (keys ? 'saved on the Connections page' : 'add it on the Connections page') : (keys ? 'set as Cloudflare secrets' : 'run set-kalshi-secrets.bat on the PC once') },
    ];
    const all = done.slice(-2000).map(t => [t.close, t.coin, t.side, t.px, t.n, t.pnl, t.won ? 1 : 0]);
    return {
      byHour, bySide, byPx, bySame, daily, roll, breakEven, halves, checks, all, live: { at: scanAt, scan, live: liveView() }, keys, wr300: +(wr300 * 100).toFixed(1), worstDay, dd: +(peak - bal).toFixed(2),
      bounds: BOUNDS, coinsAll: COINS, cfg: K, balance: +bal.toFixed(2), net: +(bal - K.startUsd).toFixed(2), inPlay: +open.toFixed(2), maxDd: +maxDd.toFixed(2),
      n: done.length, won: done.filter(t => t.won).length, today: { n: today.length, won: today.filter(t => t.won).length, net: sum(today) },
      avg: done.length ? +(sum(done) / done.length).toFixed(2) : 0, streak, uncappedNet: +(balU - K.startUsd).toFixed(2), capped: trades.filter(t => t.capped).length,
      worstWin: Math.max(0, ...Object.values(winLoss)), halts: trades.filter(t => t.halted).length, seen, rule, since: rows[0]?.at || null, last: rows[rows.length - 1]?.at || null,
      under: { n: under.length, won: under.filter(r => r.won).length, c: under.length ? +(under.reduce((a, r) => a + (r.pnl1 || 0), 0) / under.length * 100).toFixed(2) : 0 },
      eq: eq.filter((x, i) => i % step === 0 || i === eq.length - 1), byCoin: Object.values(byCoin).sort((a, b) => b.net - a.net),
      cold: K.coldDays > 0 ? Object.fromEntries([...new Set(trades.map(t => t.coin))].map(c => [c, +net30(c, Date.now()).x.toFixed(2)])) : null, coldSkips: trades.filter(t => t.cold).length,
      pending: trades.filter(t => !t.done && !t.capped).slice(-12), recent: trades.filter(t => t.done || t.capped).slice(-60).reverse(), where: 'cloud', logs: logs.slice(-20), labs,
      playbook: { id: stratAt(K.strat, Date.now()), since: stratSince(K.strat, Date.now()), log: (K.strat || []).slice(-12), stratSkips: trades.filter(t => t.strat).length } };
  }

  // ---------- Labs: each idea as its own paper account over the same trades ----------
  // filter(t) returns true (take), false (skip) or null (can't tell yet: the lab starts at its first decidable trade and such
  // trades are left out of both the lab and its rule comparison). size(bank) returns the stake; the rule's own is fixed.
  function runLabs(trades, K) {
    const LABS = labDefs(K);
    const todayK = etDay(Date.now());
    const sim = (lab, from, baseline) => {
      let bank = K.startUsd, peak = bank, dd = 0, n = 0, won = 0, sk = 0, skNet = 0; const day = {}, eq = [], td = { n: 0, won: 0, net: 0 };
      for (const t of trades) {
        if (!t.done || t.close < from) continue;
        if (t.win > K.maxPerWindow) continue;
        const f = baseline ? true : lab.filter(t); if (f == null) continue;
        const dk = etDay(t.close);
        if (K.dailyLossUsd > 0 && (day[dk] || 0) <= -K.dailyLossUsd) continue;
        const size = lab.size && !baseline ? lab.size(bank) : K.sizeUsd, k = Math.floor(size / t.px), cost = k * t.px + fee(t.px, k), pnl = (t.won ? k : 0) - cost;
        if (!f) { sk++; skNet += t.rulePnl ?? t.pnl ?? 0; continue; }
        n++; if (t.won) won++; bank += pnl; day[dk] = (day[dk] || 0) + pnl; peak = Math.max(peak, bank); dd = Math.max(dd, peak - bank); eq.push([t.close, +bank.toFixed(2)]);
        if (dk === todayK) { td.n++; if (t.won) td.won++; td.net += pnl; }
      }
      const step = Math.max(1, Math.ceil(eq.length / 120));
      return { n, won, net: +(bank - K.startUsd).toFixed(2), dd: +dd.toFixed(2), today: { n: td.n, won: td.won, net: +td.net.toFixed(2) }, skipped: { n: sk, net: +skNet.toFixed(2) }, eq: eq.filter((x, i) => i % step === 0 || i === eq.length - 1) };
    };
    return LABS.map(lab => {
      const first = trades.find(t => t.done && t.win <= K.maxPerWindow && lab.filter(t) != null);
      if (!first) return { id: lab.id, name: lab.name, desc: lab.desc, color: lab.color, since: null, n: 0, won: 0, net: 0, dd: 0, today: { n: 0, won: 0, net: 0 }, skipped: { n: 0, net: 0 }, eq: [], base: null, delta: null };
      const r = sim(lab, first.close, false), b = lab.id === 'rule' ? null : sim(lab, first.close, true);
      return { id: lab.id, name: lab.name, desc: lab.desc, color: lab.color, since: first.close, ...r, base: b ? { n: b.n, won: b.won, net: b.net, dd: b.dd, today: b.today } : null, delta: b ? +(r.net - b.net).toFixed(2) : null };
    });
  }

  // ---------- dashboard commands, applied here ----------
  async function command(type, a) {
    await load();
    if (type === 'kalshiSet') {
      const out = {}, ch = [];
      for (const k of Object.keys(BOUNDS)) { if (a[k] == null || a[k] === '') continue; const v = Number(a[k]); if (!isFinite(v)) continue; const x = Math.min(BOUNDS[k][1], Math.max(BOUNDS[k][0], k === 'minAsk' ? Math.round(v * 100) / 100 : Math.round(v))); if (x !== cfgP[k]) { out[k] = x; ch.push(`${k} ${cfgP[k]} -> ${x}`); } }
      if (Array.isArray(a.coins)) { const want = COINS.filter(x => a.coins.includes(x)); if (!want.length) return { ok: false, msg: 'Pick at least one coin.' }; const v = want.length === COINS.length ? null : want, cur = cfgP.coins || null; if (JSON.stringify(v) !== JSON.stringify(cur)) { out.coins = v; ch.push(`coins ${v ? v.join(', ') : 'all nine'}`); } }
      if (!ch.length) return { ok: false, msg: 'Nothing changed.' };
      cfgP = { ...cfgP, ...out }; await kv.put('kcfg', cfgP); viewDirty = true; await publish(true);
      return { ok: true, msg: `Kalshi settings saved: ${ch.join(', ')}.` };
    }
    if (type === 'kalshiLive') {
      const next = { ...ctlL }, ch = [];
      if (a.enabled === true || a.enabled === false) { if (next.enabled !== a.enabled) ch.push(a.enabled ? 'live trading ON' : 'live trading OFF'); next.enabled = a.enabled; }
      if (a.sizeUsd != null && isFinite(+a.sizeUsd)) { const v = Math.min(25, Math.max(5, Math.round(+a.sizeUsd))); if (v !== next.sizeUsd) ch.push(`size $${next.sizeUsd} -> $${v}`); next.sizeUsd = v; }
      if (a.dailyLossUsd != null && isFinite(+a.dailyLossUsd)) { const v = Math.min(500, Math.max(10, Math.round(+a.dailyLossUsd))); if (v !== next.dailyLossUsd) ch.push(`daily loss cap $${next.dailyLossUsd} -> $${v}`); next.dailyLossUsd = v; }
      if (a.minBank != null && isFinite(+a.minBank)) { const v = Math.min(100000, Math.max(0, Math.round(+a.minBank))); if (v !== (next.minBank ?? HARD.minBank)) ch.push(`cash floor $${next.minBank ?? HARD.minBank} -> $${v}`); next.minBank = v; }
      if (a.sellAll === true) { next.sellAllAt = Date.now(); ch.push('sell all open live positions'); }
      if (!ch.length) return { ok: false, msg: 'Nothing changed.' };
      if (next.enabled && !hasKeys()) return { ok: false, msg: env.KEY_HELP || 'The Kalshi key is not set in Cloudflare yet. Run set-kalshi-secrets.bat on the PC once, then try again.' };
      next.at = Date.now(); next.by = 'dashboard'; ctlL = next; await kv.put('kctl', ctlL); say('LIVE ' + ch.join(', '));
      if (a.sellAll === true) { st.sellAllDone = next.sellAllAt; await kv.put('kst', { sellAllDone: st.sellAllDone }); try { await sellAll(); } catch (e) { fail('sell-all error: ' + e.message); } }
      await publish(true);
      return { ok: true, msg: `Kalshi live: ${ch.join(', ')}. Applied in the cloud right away.` };
    }
    if (type === 'kalshiStrat') {
      // MC 2026-11-08 switch the paper book or the live gate to a lab (or back to the rule), logged with a timestamp so the
      // books apply it from now on and the history before it stays as it was.
      const id = String(a.id || 'rule'), book = a.book === 'live' ? 'live' : 'paper';
      if (!LAB_IDS.includes(id)) return { ok: false, msg: 'Unknown playbook.' };
      const name = labDefs(cfgP).find(l => l.id === id).name, now = Date.now();
      if (book === 'paper') {
        if (stratAt(cfgP.strat, now) === id) return { ok: false, msg: `Paper already runs ${name}.` };
        cfgP = { ...cfgP, strat: [...(cfgP.strat || []), { at: now, id, by: 'dashboard' }].slice(-60) }; await kv.put('kcfg', cfgP);
      } else {
        if (stratAt(ctlL.strat, now) === id) return { ok: false, msg: `Live already runs ${name}.` };
        ctlL = { ...ctlL, strat: [...(ctlL.strat || []), { at: now, id, by: 'dashboard' }].slice(-60), at: now, by: 'dashboard' }; await kv.put('kctl', ctlL);
      }
      say(`${book.toUpperCase()} playbook -> ${name}`); viewDirty = true; await publish(true);
      return { ok: true, msg: `${book === 'paper' ? 'Paper' : 'Live'} now runs ${name} from the next 10-minute mark.` };
    }
    return { ok: false, msg: 'Unknown Kalshi command.' };
  }

  // ---------- one-time import of the PC's history ----------
  async function importRows(b) {
    await load();
    let p = 0, o = 0;
    for (const r of b.paper || []) { if (!r?.ticker || !(r.ask >= KEEP_ASK) || rec.has(r.ticker)) continue; r.path = thin(r.path); rec.set(r.ticker, r); saveRec(r); p++; }
    for (const x of b.orders || []) { if (!x?.tk || L.has(x.tk)) continue; L.set(x.tk, x); saveL(x); o++; }
    if (b.cfg && !(await kv.get('kcfg'))) { const c = {}; for (const k of Object.keys(PAPER_DEF)) if (b.cfg[k] != null && isFinite(+b.cfg[k])) c[k] = +b.cfg[k]; cfgP = { ...PAPER_DEF, ...c }; await kv.put('kcfg', cfgP); }
    if (b.ctl && !(await kv.get('kctl'))) { ctlL = { enabled: false, sizeUsd: Math.min(25, Math.max(5, +b.ctl.sizeUsd || 10)), dailyLossUsd: Math.min(500, Math.max(10, +b.ctl.dailyLossUsd || 100)), sellAllAt: 0, at: Date.now(), by: 'import' }; await kv.put('kctl', ctlL); }
    viewDirty = true; await publish(true);
    return { ok: true, paper: p, orders: o, total: rec.size, live: L.size };
  }

  async function status() {
    await load();
    const open = [...rec.values()].filter(r => !r.result).length;
    return { now: Date.now(), scanAt, scanCoins: scan.length, alarm: await state.storage.getAlarm(), lastMark: st.lastMark, rows: rec.size, openRows: open, liveOrders: L.size, cfg: cfgP, live: { on: ctlL.enabled, size: ctlL.sizeUsd, keys: hasKeys(), keyOk: st.keyOk, bal: st.bal, err: st.lastErr }, logs: logs.slice(-25) };
  }
  // MC 2026-11-08 used by the plug-and-play edition's Connections page: drop the cached key after a change, and test a key by reading
  // the balance with it. The caller swaps env's key fields; nothing here stores the key.
  async function checkKeys() { KEY = null; st.keyOk = null; st.bal = null; st.balAt = 0; st.lastErr = null; viewDirty = true; try { const b = await balance(true); return b == null ? { ok: false, msg: st.lastErr || 'Kalshi did not return a balance.' } : { ok: true, bal: b }; } catch (e) { return { ok: false, msg: e.message }; } }
  function resetKey() { KEY = null; st.keyOk = null; st.bal = null; st.balAt = 0; viewDirty = true; }
  return { tick, alarm, entry, command, importRows, publish, load, status, checkKeys, resetKey, coins: COINS, _t: { kalshiView, kliveBody, liveView, rec: () => rec, L: () => L, st, nextMark, onRule, sign, logs } };
}
