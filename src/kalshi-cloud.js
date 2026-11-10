import { feats, fit, predict, logit, LEARN_F, LEARN_NAME } from './learn.js';
import { SEED } from './learn-seed.js';
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
const PAPER_DEF = { startUsd: 1000, sizeUsd: 50, maxPerWindow: 9, minAsk: 0.9, dailyLossUsd: 250, coldDays: 30, coins: null, mixSame: 3, mixSameMax: 9, mixMaxPx: 0.95, mixVol: 0, mixSize: 'fixed', mixPct: 5, skipHours: [], giveBackPct: 0, giveBackMin: 25, dailyWinUsd: 0, bankDdPct: 0, ratchetAdd: 10, ratchetEvery: 200, paperFrom: 0 };
// MC 2026-11-08 coin list and starting bank are settable from the dashboard (plug-and-play edition); null coins = all nine
const COINS = SERIES.map(s => s.replace(/^KX|15M$/g, ''));
const BOUNDS = { sizeUsd: [5, 500], dailyLossUsd: [25, 2000], minAsk: [0.85, 0.98], coldDays: [0, 90], startUsd: [100, 1000000], mixSame: [1, 9], mixSameMax: [1, 9], mixMaxPx: [0.91, 1], mixVol: [0, 1], mixPct: [1, 10], giveBackPct: [0, 90], giveBackMin: [5, 1000], dailyWinUsd: [0, 5000], bankDdPct: [0, 50], ratchetAdd: [1, 100], ratchetEvery: [25, 5000] };
// MC 2026-11-08 the lab definitions live here so the paper book and the live gate can run any of them as the active playbook.
// filter(t) gets {px, win, z}: true take, false skip, null can't tell (no volatility reading). size(bank) only for sizing labs.
function mixDesc(K) { const p = [], sz = K.mixSize || 'fixed';
  const lo = K.mixSame ?? 3, hi = K.mixSameMax ?? 9; if (lo > 1 || hi < 9) p.push(hi < 9 ? (lo === hi ? `exactly ${lo} coins lead the same direction` : `${lo} to ${hi} coins lead the same direction`) : `at least ${lo} coins lead the same direction`);
  if ((K.mixMaxPx ?? 0.95) < 1) p.push(`under ${Math.round((K.mixMaxPx ?? 0.95) * 100)}¢`);
  if (K.mixVol) p.push('at least one expected move past the target');
  const size = sz === 'pct' ? `${K.mixPct ?? 5}% of the bank a trade` : sz === 'kelly' ? 'quarter Kelly sizing' : sz === 'ratchet' ? `$${K.sizeUsd} a trade plus $${K.ratchetAdd ?? 10} for every $${K.ratchetEvery ?? 200} of banked profit, back to $${K.sizeUsd} whenever the bank is under its high` : `$${K.sizeUsd} a trade`;
  return `${p.length ? 'Only trades ' + p.join(', ') : 'Every rule trade'}; ${size}. Built in Paper settings.`; }
function labDefs(K) {
  return [
    { id: 'rule', name: 'The rule', desc: `Every 90¢+ leader at 10 minutes left, $${K.sizeUsd} a trade.`, color: '#4FD1FF', filter: () => true },
    { id: 'no95', name: 'Skip 95¢ and up', desc: 'Only buys between 90¢ and 94¢. Over 4 months the 95¢+ trades made nothing but still lost the full stake in bad windows.', color: '#FFB347', filter: t => t.px < 0.95 },
    { id: 'six', name: '6 or more coins', desc: 'Only trades windows where at least 6 of the 9 coins qualify. Those windows won 96% in the replay with half the drawdown.', color: '#35E0A1', filter: t => t.win >= 6 },
    { id: 'vol', name: 'Margin vs volatility', desc: 'Skips when the coin is less than one expected 10-minute move past its target, judged by its last hour on Coinbase.', color: '#FF7AD9', filter: t => t.z == null ? null : t.z >= 1 },
    { id: 'pct', name: 'Size follows the bank', desc: `Stakes 5% of the bank instead of a fixed $${K.sizeUsd}, so bets shrink after losses and grow after wins.`, color: '#9B8CFF', filter: () => true, size: b => Math.max(5, Math.round(b * 0.05)) },
    // MC 2026-11-08 Kelly lab. Win chance per price band (90-91, 92-93, 94-95, 96-99c) comes only from trades already settled
    // before the entry, shrunk toward break-even by 40 make-believe break-even trades, so a thin or lucky band can't size up.
    // Kelly fraction f = (q - c) / (1 - c) with c = price plus fee per contract. Stake is a quarter of f times the bank, split
    // across the coins bought in the same window (they win and lose together), at most 5% of the bank, at least $5.
    // f at or below zero means no edge at that price, so it skips. Tried full Kelly first: 10%+ stakes at 92c, one bad window
    // would take a third of the bank.
    // MC 2026-11-09 Your mix: two filters at once, both set in Paper settings. Coins on the same side counts the coins in the
    // window whose leader is on this trade's side (YES or NO), not every coin that qualified, since a window split 3 YES and
    // 3 NO is not the same bet as 6 all one way. 100c as the price cap means no cap.
    // MC 2026-11-09 Your mix grew into a builder: any of the filters (same-side coins, price cap, volatility check) plus a
    // sizing choice (fixed, % of bank, quarter Kelly), so two playbooks can run as one. Was only same-side plus price cap,
    // which couldn't pair skip-95 with size-follows-the-bank. 1 coin and 100c turn those two filters off.
    { id: 'mix', name: 'Your mix', desc: mixDesc(K), color: '#FFD166',
      filter: t => { const sz = K.mixSize || 'fixed'; // MC 2026-11-09 upper bound too: 6+ coins agreeing is usually one market-wide move, so a range like 3 to 5 can be tested
        if (!(t.px < (K.mixMaxPx ?? 0.95)) || (t.same ?? 0) < (K.mixSame ?? 3) || (t.same ?? 0) > (K.mixSameMax ?? 9)) return false;
        if (K.mixVol && t.z == null) return null; if (K.mixVol && t.z < 1) return false;
        if (sz === 'kelly') return t.kf == null ? null : t.kf > 0; return true; },
      size: (K.mixSize || 'fixed') === 'fixed' ? undefined : (K.mixSize === 'kelly' ? (b, t) => Math.max(5, Math.min(b * 0.05, b * 0.25 * (t?.kf || 0) / Math.max(1, t?.win || 1)))
        // MC 2026-11-09 ratchet: the stake only steps up on banked profit at a new bank high, and drops back to the base size the
        // moment the bank is under its high. Wins compound slowly, a loss shrinks the bet at once. S carries the bank's high and start.
        : K.mixSize === 'ratchet' ? (b, t, S) => { const base = K.sizeUsd, hi = S?.peak ?? b, st = S?.start ?? K.startUsd; return b + 0.005 < hi ? base : base + (K.ratchetAdd ?? 10) * Math.max(0, Math.floor((hi - st) / (K.ratchetEvery ?? 200))); }
        : b => Math.max(5, Math.round(b * (K.mixPct ?? 5) / 100))) },
    { id: 'kelly', name: 'Kelly sizing', desc: 'Sizes each bet by the Kelly criterion from the win rate already seen at that price, at a quarter of Kelly, split across the coins in the window. Skips prices with no proven edge.', color: '#E5E7EB', filter: t => t.kf == null ? null : t.kf > 0, size: (b, t) => Math.max(5, Math.min(b * 0.05, b * 0.25 * (t?.kf || 0) / Math.max(1, t?.win || 1))) },
    // MC 2026-11-10 Beats the market: turns the volatility reading into a win probability (normal model, ten minutes to go with
    // the 60-second settlement average) and only buys when that probability beats Kalshi's price plus the fee plus 1 cent. The
    // volatility lab asks "far enough past the target?"; this asks "is the market underpricing it?", so the bar rises with the price.
    { id: 'vol2', name: 'Margin vs volatility v2', desc: 'Skips a coin that is less than one typical 10-minute move past its target at the trade check. The typical move is measured directly, from every 10-minute price change on Coinbase over the last 5 hours, instead of being scaled up from 1-minute moves (which overstated it and skipped trades that kept winning).', color: '#FF9EDB', filter: t => t.z10 == null ? null : t.z10 >= 1 },
    { id: 'edge', name: 'Beats the market', desc: 'Only buys when our win chance, from the coin\'s volatility and how far it is past the target, beats Kalshi\'s price plus the fee and a cent.', color: '#7CF5C8', filter: t => t.z == null ? null : winP(t.z) >= t.px + 0.07 * t.px * (1 - t.px) + 0.01 },
    { id: 'edge2', name: 'Beats the market v2', desc: 'Beats the market with two more checks: volatility is the larger of the last hour and the last 15 minutes, and a coin sliding back toward its target in the last 5 minutes has half that slide taken off its margin.', color: '#B9F27C', filter: t => t.z2 == null ? null : winP(t.z2) >= t.px + 0.07 * t.px * (1 - t.px) + 0.01 },
    // MC 2026-11-10 the self-learning playbook. pl is the model's win chance for this trade, frozen at the trade check from that
    // morning's fit (so it has never seen the trade it is judging). Same bar as Beats the market: price + fee + 1 cent.
    { id: 'learn', name: 'Learned', desc: 'Only buys when the self-learning model\'s win chance beats Kalshi\'s price plus the fee plus 1¢. The model refits every morning on every settled trade, starting from four months of history, and is only ever scored on trades it had not seen. See the Learning tab.', color: '#7CF0C8', filter: t => t.pl == null ? null : t.pl >= t.px + 0.07 * t.px * (1 - t.px) + 0.01 },
    { id: 'all', name: 'All filters together', desc: 'Skip 95¢+, 6 or more coins, and the volatility check, all at once.', color: '#C8F56A', filter: t => t.z == null ? null : (t.px < 0.95 && t.win >= 6 && t.z >= 1) },
  ];
}
const LAB_IDS = labDefs(PAPER_DEF).map(l => l.id);
// normal CDF (Abramowitz and Stegun 7.1.26 on erf) and the win chance from a z of margin over one 10-minute move; the 60-second
// settlement average trims the effective time to 10 - 2/3 minutes, hence the small scale-up
function Phi(z) { const x = Math.abs(z) / Math.SQRT2, t = 1 / (1 + 0.3275911 * x), e = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return z >= 0 ? 0.5 + e / 2 : 0.5 - e / 2; }
function winP(z) { return Phi(z * Math.sqrt(10 / (10 - 2 / 3))); }
const KB = p => p < 0.92 ? 0 : p < 0.94 ? 1 : p < 0.96 ? 2 : 3, K_PRIOR = 40;
const kNew = () => [[0, 0], [0, 0], [0, 0], [0, 0]];
const kAdd = (S, px, won) => { const b = S[KB(px)]; b[0]++; if (won) b[1]++; };
const kOf = (S, px) => { const b = S[KB(px)], c = px + 0.07 * px * (1 - px), q = (b[1] + K_PRIOR * c) / (b[0] + K_PRIOR); return { kq: +q.toFixed(4), kf: +((q - c) / (1 - c)).toFixed(4), kn: b[0] }; };
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
// MC 2026-11-10 self-learning: the seed is parsed on first use (not at load, to keep worker start-up cheap). Each row carries its
// ET day so "everything before this morning" is a string compare.
let seedRows = null;
function seedLoad() {
  if (seedRows) return seedRows;
  seedRows = SEED.rows.split(';').map(q => { const a = q.split(','), at = a[0] * 900000, px = a[1] / 1000; return { at, close: at + 600000, px, y: +a[2], x: [1, a[3] / 100, a[4] / 100, a[5] / 100, a[6] / 100, a[7] / 100], o: logit(Math.min(0.99, Math.max(0.5, px))), p: a[8] === '' ? null : a[8] / 1000, d: etDay(at + 600000) }; });
  return seedRows;
}
const needPx = px => px + 0.07 * px * (1 - px) + 0.01;
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
    const H = { accept: 'application/json', 'user-agent': 'curve-radar' };
    const r = await fetch(`https://api.exchange.coinbase.com/products/${pid}/candles?granularity=60&_=${Date.now()}`, { headers: H });
    if (!r.ok) return null;
    const all = (await r.json()).slice(0, 300).sort((a, b) => a[0] - b[0]);   // oldest first: [time, low, high, open, close, volume]
    const rows = all.slice(-61); if (rows.length < 20) return null;
    // MC 2026-11-10 an XRP trade read exactly 0.000% from its target while Kalshi had it at 92c and it finished 0.37% clear. The
    // target is the price at the window's open, so a margin of exactly zero is what a candle list five minutes behind looks like.
    // The request now asks for an uncached copy, the age of the newest candle is saved on the reading, and when it is more than
    // 2 minutes old the price comes from the live ticker instead (the candles still supply the volatility). If the ticker fails
    // too the reading is kept but marked stale, and the repair pass rebuilds it from history a few minutes later. Checked from
    // Actions the same evening: the plain candles URL came back 3 minutes behind, the same URL with a throwaway query was current.
    const age = Math.round(Date.now() / 1000 - rows[rows.length - 1][0]); let px = rows[rows.length - 1][4], src = 'candle';
    if (age > 120) { src = 'stale'; try { const t = await fetch(`https://api.exchange.coinbase.com/products/${pid}/ticker?_=${Date.now()}`, { headers: H }); const j = t.ok ? await t.json() : null; if (Number(j?.price) > 0) { px = Number(j.price); src = 'ticker'; } } catch { } }
    return volCalc(all, rows, px, strike, side, age, src);
  } catch { return null; }
}
// the arithmetic, shared by the live reading and the repair pass
function volCalc(all, rows, px, strike, side, age, src) {
    const rets = []; for (let i = 1; i < rows.length; i++) rets.push(Math.log(rows[i][4] / rows[i - 1][4]));
    const m = rets.reduce((a, b) => a + b, 0) / rets.length, sigma = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / rets.length);
    const margin = (side === 'yes' ? px - strike : strike - px) / strike, z = sigma > 0 ? margin / (sigma * Math.sqrt(10)) : null;
    // MC 2026-11-10 v2 reading for Beats the market v2. Volatility is the larger of the last hour and the last 15 minutes, so a
    // swing that just started counts at once (the hour lagged this morning's drop). Drift is the last 5 minutes' move on our side;
    // when it runs against us, half of it comes off the margin. Drift toward us earns nothing: minute-scale momentum is weak, and
    // crediting it would only loosen the bar.
    const r15 = rets.slice(-15), m15 = r15.reduce((a, b) => a + b, 0) / r15.length, sigma15 = Math.sqrt(r15.reduce((a, b) => a + (b - m15) ** 2, 0) / r15.length);
    const p5 = rows[Math.max(0, rows.length - 6)][4], drift = src === 'ticker' ? 0 : (side === 'yes' ? 1 : -1) * Math.log(px / p5), sig2 = Math.max(sigma, sigma15);
    const z2 = sig2 > 0 ? (margin + 0.5 * Math.min(0, drift)) / (sig2 * Math.sqrt(10)) : null;
    // MC 2026-11-10 v2 of the volatility check measures the 10-minute move directly: every 10-minute change in the last ~5 hours
    // of 1-minute closes (overlapping windows). Scaling the 1-minute spread by sqrt(10) overstated it, because 1-minute prices
    // jitter back and forth and most of that cancels over 10 minutes; the model read 15 to 20 points under Kalshi on trades that
    // kept winning. Needs at least 2 hours of candles, else no reading.
    let z10 = null, sigma10 = null; const k10 = []; for (let i = 10; i < all.length; i++) if (all[i][0] - all[i - 10][0] === 600) k10.push(Math.log(all[i][4] / all[i - 10][4]));
    if (k10.length >= 110) { sigma10 = Math.sqrt(k10.reduce((a, b) => a + b * b, 0) / k10.length); z10 = sigma10 > 0 ? +(margin / sigma10).toFixed(2) : null; }
    return { px, sigma: +sigma.toExponential(3), margin: +margin.toFixed(6), z: z == null ? null : +z.toFixed(2), sigma15: +sigma15.toExponential(3), drift: +drift.toFixed(6), z2: z2 == null ? null : +z2.toFixed(2), sigma10: sigma10 == null ? null : +sigma10.toExponential(3), z10, age, src };
}


// MC 2026-11-10 the same reading rebuilt from Coinbase's history for a past trade check: candles up to the minute before `at`.
// Used to repair readings taken from a stale candle list, and to give older trades the 10-minute measure they never had.
async function volPast(c, strike, side, at) {
  const pid = CBPID[c]; if (!pid || !(strike > 0)) return null;
  const end = Math.floor(at / 60000) * 60 - 60, iso = t => new Date(t * 1000).toISOString();
  const r = await fetch(`https://api.exchange.coinbase.com/products/${pid}/candles?granularity=60&start=${iso(end - 299 * 60)}&end=${iso(end)}`, { headers: { accept: 'application/json', 'user-agent': 'curve-radar' } });
  if (!r.ok) throw new Error('coinbase ' + r.status);
  const all = (await r.json()).filter(k => k[0] <= end).sort((a, b) => a[0] - b[0]), rows = all.slice(-61);
  if (rows.length < 20 || end - rows[rows.length - 1][0] > 180) return null;
  return volCalc(all, rows, rows[rows.length - 1][4], strike, side, 0, 'history');
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
  // MC 2026-11-09 log lines also go to console so `wrangler tail` can confirm entries without the dashboard
  const say = s => { logs.push(`${new Date().toISOString().slice(11, 19)} ${s}`); if (logs.length > 60) logs.shift(); console.log('kx ' + s); };
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
      if (cfgP.dailyWinUsd > 0 && realized(t) >= cfgP.dailyWinUsd) return `daily profit target hit (+$${realized(t).toFixed(2)})`;
      // MC 2026-11-09 give-back and bank-drawdown stops on the live book too, from the paper settings
      if (cfgP.giveBackPct > 0) { let run = 0, pk = 0; for (const x of t.filter(x => x.pnl != null).sort((a, b) => a.at - b.at)) { run += x.pnl; pk = Math.max(pk, run); } if (pk >= (cfgP.giveBackMin ?? 25) && run <= pk * cfgP.giveBackPct / 100) return `give-back stop: today peaked at +$${pk.toFixed(2)}, now ${run >= 0 ? '+' : ''}$${run.toFixed(2)}`; }
      if (cfgP.bankDdPct > 0) { const xs = [...L.values()].filter(x => x.pnl != null).sort((a, b) => a.at - b.at), start = (st.bal ?? 0) - xs.reduce((a, x) => a + x.pnl, 0); let run = 0, ref = start, lastD = null; const tripped = {};
        for (const x of xs) { const d = etDay(x.at); if (lastD && lastD !== d && tripped[lastD]) ref = start + run; lastD = d; run += x.pnl; const cash = start + run; ref = Math.max(ref, cash); if (cash <= ref * (1 - cfgP.bankDdPct / 100)) tripped[d] = true; }
        if (lastD === etDay(Date.now()) && tripped[lastD]) return `bank drawdown stop: ${cfgP.bankDdPct}% under its high today`; }
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
    let rS = null; if (lab?.size) { let run = 0, pk = 0; for (const x of [...L.values()].filter(x => x.pnl != null).sort((a, b) => a.at - b.at)) { run += x.pnl; pk = Math.max(pk, run); } rS = { peak: bal + (pk - run), start: bal - run }; }
    const sizeUsd = lab?.size ? Math.min(c.sizeUsd, HARD.maxSize, Math.max(5, lab.size(bal, { kf: r.kf, win: r.win }, rS))) : c.sizeUsd;
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
    learnFill(now + 1);
    const c = ctl();
    if (c.enabled && hits.length) {
      const sid = stratAt(c.strat, now), lab = labDefs(cfgP).find(l => l.id === sid);
      let kS = null; if (sid === 'kelly' || (sid === 'mix' && cfgP.mixSize === 'kelly')) { kS = kNew(); for (const x of rec.values()) if (x.result && x.result !== 'void' && x.ask >= cfgP.minAsk && x.close <= now) kAdd(kS, x.avgN || x.ask, !!x.won); }
      // MC 2026-11-09 schedule: hours (ET, by entry time) picked as off in Paper settings are skipped live too
      const offNow = (cfgP.skipHours || []).includes(etHour(now));
      for (const r of hits) {
        if (offNow) { skipLive(r, `off schedule (${etHour(now)}:00 ET hour)`); continue; }
        if (kS) { r.kf = kOf(kS, r.avgN || r.ask).kf; r.win = hits.length; }
        const f = sid === 'rule' ? true : lab.filter({ px: r.avgN || r.ask, win: hits.length, same: hits.filter(h => h.side === r.side).length, z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, kf: r.kf ?? null, pl: r.lp ?? null });
        if (f === true) { try { await onRule(r, lab); } catch (e) { fail('order error: ' + e.message); } }
        else skipLive(r, `${lab.name}: ${f === null ? (sid === 'learn' ? 'no model reading' : 'no volatility reading') : sid === 'kelly' ? 'no edge at this price yet' : 'filtered out'}`);
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
    if (now - mk > 150000 && nextMark(now) - now > 90000) { try { await volRepair(now); } catch (e) { say('repair error: ' + e.message); } }
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
      open.push({ tk: r.ticker, coin: coin(r.series), side: r.side, px: +px.toFixed(4), ask: r.ask, n, cost: +(n * px + fee(px, n)).toFixed(2), at: r.at, close: r.close, strike: r.strike ?? null, title: r.title || null, yb: lp?.[1] ?? null, ya: lp?.[2] ?? null, last: lp?.[3] ?? null, path: r.path || [], z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, pl: r.lp ?? null });
    }
    return { at: scanAt || now, open, scan, size: K.sizeUsd, minAsk: K.minAsk, live: liveView(), where: 'cloud' };
  }
  async function publish(save) {
    const kl = JSON.stringify(kliveBody());
    if (viewDirty || !view || Date.now() - viewAt > 120000) { view = JSON.stringify(kalshiView()); viewDirty = false; viewAt = Date.now(); }
    await keep({ klive: kl, kview: view }, false);
  }

  // ---------- repair of stale volatility readings ----------
  // MC 2026-11-10 before 1.0.39 a reading could come from a Coinbase candle list minutes behind (an XRP trade read 0.000% from its
  // target with Kalshi at 92c). Those readings carry no age, so they are found by what they claimed: any un-aged reading whose
  // win chance sat 15 points or more under the price paid is rebuilt from Coinbase's history for that minute. If the rebuilt
  // margin differs by more than a third of a typical 10-minute move the reading is replaced (the old numbers are kept under
  // `was`), the Learned call is redone from that morning's fit, and every playbook re-judges the trade on the next view, paper
  // bank included. Readings that hold up are marked checked. A probe that evening showed the plain candles URL running about
  // 3 minutes behind as a matter of course, so after the suspects every other un-aged reading is rechecked the same way, newest
  // first, and older trades with no 10-minute measure get one (v2 and Learned then reach back as far as the readings do).
  // Eight a minute from the cron tick, kept away from the trade check, three tries each.
  let fixAt = 0;
  async function volRepair(now, max = 8) {
    if (now - fixAt < 50000) return; fixAt = now;
    const sus = [], none = [], old = [], rest = [];
    for (const r of rec.values()) { const v = r.vol;
      // no reading at all (Coinbase did not answer at the check): rebuild it from history, within the last week
      if (!v) { if (r.ask >= KEEP_ASK && r.strike > 0 && (r.vtry || 0) < 3 && r.at < now - 120000 && r.at > now - 7 * 86400000) none.push(r); continue; }
      if ( (v.age != null && v.src !== 'stale') || v.chk || v.fixed || (v.try || 0) >= 3 || !(r.strike > 0) || r.at > now - 120000) continue;
      const zz = v.z10 ?? v.z; if (v.src === 'stale' || (zz != null && winP(zz) < (r.avgN || r.ask) - 0.15)) sus.push(r); else if (v.z10 == null) old.push(r); else rest.push(r); }
    const todo = [...sus.sort((a, b) => b.at - a.at), ...none.sort((a, b) => b.at - a.at), ...rest.sort((a, b) => b.at - a.at), ...old.sort((a, b) => b.at - a.at)].slice(0, max); if (!todo.length) return;
    let fixed = 0;
    for (const r of todo) {
      const v = r.vol;
      try {
        const n = await volPast(coin(r.series), r.strike, r.side, r.at);
        if (!v) { if (n) { r.vol = { ...n, fixed: 1 }; delete r.lp; fixed++; } else r.vtry = (r.vtry || 0) + 1; saveRec(r); viewDirty = true; continue; }
        if (!n) { v.try = (v.try || 0) + 1; if (v.try >= 3) v.chk = 1; saveRec(r); continue; }
        const typ = n.sigma10 || n.sigma * Math.sqrt(10), moved = Math.abs(n.margin - v.margin) > typ / 3;
        if (moved) { r.vol = { ...n, fixed: 1, was: { px: v.px, margin: v.margin, z: v.z, z10: v.z10 ?? null } }; delete r.lp; fixed++; }
        else r.vol = { ...v, sigma15: v.sigma15 ?? n.sigma15, drift: v.drift ?? n.drift, z2: v.z2 ?? n.z2, sigma10: v.sigma10 ?? n.sigma10, z10: v.z10 ?? (n.sigma10 > 0 ? +(v.margin / n.sigma10).toFixed(2) : null), chk: 1 };
        saveRec(r); viewDirty = true;
      } catch (e) { if (v) v.try = (v.try || 0) + 1; else r.vtry = (r.vtry || 0) + 1; saveRec(r); break; }
    }
    if (fixed) { for (const k of Object.keys(LW)) delete LW[k]; say(`volatility readings: ${fixed} corrected from Coinbase history`); }
  }

  // ---------- self-learning ----------
  // MC 2026-11-10 one fit per ET day, on the seed plus every settled live rule trade from earlier days. Deterministic for a day,
  // so it is cached in memory and simply recomputed after a restart. A trade's prediction (r.lp) is frozen on its record at the
  // trade check and never rewritten, which is what makes the Learned record honest: every number on it was made before the
  // result existed. Records from before this shipped get the prediction that day's fit would have made (still earlier days only).
  // Live rows inside the seed's date range predict but do not train (the seed already has them).
  const LW = {};
  const learnSame = () => { const m = {}; for (const r of rec.values()) if (r.ask >= 0.9 && r.result !== 'void') m[r.close + r.side] = (m[r.close + r.side] || 0) + 1; return m; };
  const learnX = (r, same) => feats({ px: r.avgN || r.ask, z10: r.vol?.z10 ?? null, s10: r.vol?.sigma10, s15: r.vol?.sigma15, s1: r.vol?.sigma, drift: r.vol?.drift, same: Math.max(1, same[r.close + r.side] || 1) });
  function learnW(D) {
    if (LW[D]) return LW[D];
    const same = learnSame(), tr = seedLoad().filter(q => q.d < D);
    for (const r of rec.values()) { if (!(r.ask >= 0.9) || r.at <= SEED.end || !r.result || r.result === 'void' || etDay(r.close) >= D) continue; const x = learnX(r, same); if (x) tr.push({ x, o: logit(Math.min(0.99, Math.max(0.5, r.avgN || r.ask))), y: r.won ? 1 : 0 }); }
    return LW[D] = { w: fit(tr, SEED.lam), n: tr.length };
  }
  function learnFill(before) {
    let same = null;
    for (const r of rec.values()) {
      if (r.lp != null || r.at >= before || r.vol?.z10 == null) continue;
      same = same || learnSame(); const x = learnX(r, same); if (!x) continue;
      try { r.lp = +predict(learnW(etDay(r.close)).w, x, logit(Math.min(0.99, Math.max(0.5, r.avgN || r.ask)))).toFixed(4); saveRec(r); } catch (e) { say('learn error: ' + e.message); return; }
    }
  }
  // what the Learning tab shows: today's fit, how its past predictions lined up with what happened, and the Learned playbook
  // against the plain rule on trades it had not seen (four months of backfill, then live). Flat $ per trade, fee included.
  let seedAgg = null;
  function learnView(trades, K) {
    try {
      const D = etDay(Date.now()), m = learnW(D), size = K.sizeUsd, pnl = (px, y) => { const n = Math.floor(size / px); return (y ? n : 0) - n * px - fee(px, n); };
      const mk = () => ({ n: 0, won: 0, net: 0 }), add = (b, px, y) => { b.n++; if (y) b.won++; b.net += pnl(px, y); };
      const CB = [[0, 0.9], [0.9, 0.93], [0.93, 0.95], [0.95, 0.97], [0.97, 1.01]], calNew = () => CB.map(([lo, hi]) => ({ lo, hi, n: 0, said: 0, mkt: 0, act: 0 }));
      const calAdd = (c, p, px, y) => { const b = c.find(b => p >= b.lo && p < b.hi); if (b) { b.n++; b.said += p; b.mkt += px; b.act += y; } };
      const tally = () => ({ rule: mk(), learn: mk(), skip: mk(), months: {}, cal: calNew(), from: null, to: null });
      const put = (T, at, px, y, p) => { const take = p >= needPx(px), mo = etDay(at).slice(0, 7), M = T.months[mo] = T.months[mo] || { m: mo, rule: mk(), learn: mk() }; add(T.rule, px, y); add(M.rule, px, y); if (take) { add(T.learn, px, y); add(M.learn, px, y); } else add(T.skip, px, y); calAdd(T.cal, p, px, y); T.from = T.from ?? at; T.to = at; };
      if (!seedAgg || seedAgg.size !== size) { const T = tally(); for (const q of seedLoad()) if (q.p != null) put(T, q.at, q.px, q.y, q.p); seedAgg = { size, T }; }
      const live = tally(); for (const t of trades) if (t.done && t.pl != null && t.t > SEED.end && t.res !== 'void') put(live, t.t, t.px, t.won ? 1 : 0, t.pl);
      const fin = T => ({ rule: rnd(T.rule), learn: rnd(T.learn), skip: rnd(T.skip), from: T.from, to: T.to, months: Object.values(T.months).sort((a, b) => a.m < b.m ? -1 : 1).map(M => ({ m: M.m, rule: rnd(M.rule), learn: rnd(M.learn) })),
        cal: T.cal.filter(b => b.n).map(b => ({ lo: b.lo, hi: b.hi, n: b.n, said: +(b.said / b.n).toFixed(4), mkt: +(b.mkt / b.n).toFixed(4), act: +(b.act / b.n).toFixed(4) })) });
      const rnd = b => ({ n: b.n, won: b.won, net: +b.net.toFixed(2) });
      const today = trades.filter(t => etDay(t.close) === D && t.pl != null).slice(-40).reverse().map(t => ({ tk: t.tk, t: t.t, coin: t.coin, side: t.side, px: t.px, p: t.pl, need: +needPx(t.px).toFixed(4), take: t.pl >= needPx(t.px), done: t.done, won: t.won }));
      return { day: D, n: m.n, seedN: seedLoad().length, liveN: m.n - seedLoad().filter(q => q.d < D).length, w: LEARN_F.map((k, i) => ({ k, name: LEARN_NAME[k], v: m.w[i] })), size, hist: fin(seedAgg.T), live: fin(live), today };
    } catch (e) { return { err: e.message }; }
  }

  // ---------- the Kalshi tab (same shape as notify.js kalshiView) ----------
  function kalshiView() {
    learnFill(Date.now() - 90000);
    const K = cfgP, rows = [...rec.values()].sort((a, b) => a.at - b.at), sum = l => +l.reduce((a, t) => a + t.pnl, 0).toFixed(2);
    const H = [], net30 = (c, at) => { let x = 0, k = 0; for (const h of H) if (h.coin === c && h.close <= at && h.close > at - K.coldDays * 86400000) { x += h.pnl; k++; } return { x, k }; };
    const perWin = {}, dayNet = {}, dayPeak = {}, stopDay = {}, trades = [], labs0 = labDefs(K), winN = {};
    // MC 2026-11-08 the active playbook (K.strat log) filters and sizes the paper book from the moment it was switched on;
    // everything before that stays as the plain rule, so the history never gets rewritten by a switch.
    const sameN = {}; for (const r of rows) if (r.ask >= K.minAsk && r.result !== 'void') { winN[r.close] = (winN[r.close] || 0) + 1; sameN[r.close + r.side] = (sameN[r.close + r.side] || 0) + 1; }
    let bal = K.startUsd, peak = bal, maxDd = 0, open = 0, balU = K.startUsd; const eq = [[rows[0]?.at || Date.now(), bal]];
    const kS = kNew(), kQ = []; let kI = 0;
    // MC 2026-11-09 a paper run: "Start a new paper run" in Settings stamps paperFrom, and the bank, equity and the Home numbers
    // count only trades after it, from the starting bank again. Earlier trades stay in the log for Analytics, Trades and the labs,
    // marked run:false. Asked for because changing a rule and wanting a clean $1,000 test meant fudging the balance before.
    const runFrom = K.paperFrom || 0; let runOn = !runFrom, ddRef = null, ddLastDay = null;
    for (const r of rows) {
      if (!(r.ask >= K.minAsk) || r.result === 'void') continue;
      if (!runOn && r.at >= runFrom) { runOn = true; bal = K.startUsd; peak = bal; ddRef = bal; maxDd = 0; balU = K.startUsd; eq.length = 0; eq.push([runFrom, bal]); }
      const inRun = runOn;
      const w = r.close; perWin[w] = (perWin[w] || 0) + 1;
      // MC 2026-11-09 two more stops beside the daily loss cap, both for keeping profit already made. Give-back: once today's
      // profit has reached giveBackMin, stop for the day if it falls to giveBackPct of today's peak. Bank drawdown: stop for the
      // day once the bank is bankDdPct under its all-time high. Each stays on for the rest of that ET day once it trips.
      const dk = etDay(r.close); if (dayPeak[dk] == null) dayPeak[dk] = 0;
      const gb = K.giveBackPct > 0 && (stopDay[dk] === 'giveback' || (dayPeak[dk] >= (K.giveBackMin ?? 25) && (dayNet[dk] || 0) <= dayPeak[dk] * K.giveBackPct / 100));
      // MC 2026-11-09 the drawdown stop measures against its own reference high, not the all-time peak: the day after it trips
      // the reference resets to the bank as it stands, or a bank that fell under the line could never trade its way back (the
      // smoke test showed 13 trades in four months with the all-time peak as the line)
      if (ddRef == null) ddRef = bal; if (ddLastDay && ddLastDay !== dk && stopDay[ddLastDay] === 'bankdd') ddRef = bal; ddLastDay = dk; ddRef = Math.max(ddRef, bal);
      const bd = K.bankDdPct > 0 && (stopDay[dk] === 'bankdd' || bal <= ddRef * (1 - K.bankDdPct / 100));
      // MC 2026-11-10 daily profit lockout (request R-2): once the day is up by dailyWinUsd, the rest of the day is skipped
      const tw = K.dailyWinUsd > 0 && (dayNet[dk] || 0) >= K.dailyWinUsd;
      const haltWhy = K.dailyLossUsd > 0 && (dayNet[dk] || 0) <= -K.dailyLossUsd ? 'daily' : tw ? 'target' : gb ? 'giveback' : bd ? 'bankdd' : null, halted = !!haltWhy;
      if (haltWhy && haltWhy !== 'daily' && !stopDay[dk]) stopDay[dk] = haltWhy;
      const c30 = K.coldDays > 0 ? net30(coin(r.series), r.at) : { x: 0, k: 0 }, cold = K.coldDays > 0 && c30.x < 0;
      const px = r.avgN || r.ask, sid = stratAt(K.strat, r.at), lab = sid === 'rule' ? null : labs0.find(l => l.id === sid);
      while (kI < kQ.length && kQ[kI].close <= r.at) { kAdd(kS, kQ[kI].px, kQ[kI].won); kI++; }
      const ko = kOf(kS, px);
      const f = lab ? lab.filter({ px, win: winN[w], same: sameN[w + r.side], z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, kf: ko.kf, pl: r.lp ?? null }) : true, strat = f !== true ? sid : null;
      const sizeUsd = lab?.size ? lab.size(bal, { kf: ko.kf, win: winN[w] }, { peak, start: K.startUsd }) : K.sizeUsd;
      const off = (K.skipHours || []).includes(etHour(r.at)), capped = perWin[w] > K.maxPerWindow || halted || cold || off || !!strat, n = Math.floor(sizeUsd / px), cost = +(n * px + fee(px, n)).toFixed(2);
      const t = { tk: r.ticker, t: r.at, close: r.close, coin: coin(r.series), side: r.side, px: +px.toFixed(3), n, cost, capped, halted, haltWhy, off, run: inRun, done: !!r.result, won: !!r.won, pnl: null, strat, stratWhy: strat ? (f === null ? (sid === 'learn' ? 'no model reading' : 'no volatility reading') : sid === 'kelly' ? 'Kelly: no edge at this price yet' : lab.name) : null, book: sid,
        tk: r.ticker, left: r.left, ask: r.ask, ya: r.ya ?? null, na: r.na ?? null, dAsk: r.depthAtAsk ?? null, depth: r.depth ?? null, bookAvg: r.avgN != null, fee: fee(px, n),
        title: r.title || null, sub: r.sub || null, kq: ko.kq, kf: ko.kf, kn: ko.kn, strike: r.strike ?? null, final: r.final ?? null, res: r.result || null, cold, net30: +c30.x.toFixed(2), path: thin(r.path), z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, vpx: r.vol?.px ?? null, vmg: r.vol?.margin ?? null, vage: r.vol?.age ?? null, vsrc: r.vol?.src ?? null, vfix: r.vol?.fixed ? 1 : 0, vwas: r.vol?.was?.margin ?? null, vsg: r.vol?.sigma ?? null, vsg15: r.vol?.sigma15 ?? null, vdr: r.vol?.drift ?? null, z10: r.vol?.z10 ?? null, vsg10: r.vol?.sigma10 ?? null, pl: r.lp ?? null };
      if (r.result) { let i = kQ.length; while (i > kI && kQ[i - 1].close > r.close) i--; kQ.splice(i, 0, { close: r.close, px, won: !!r.won }); }
      if (r.result) { const n50 = Math.floor(50 / px); H.push({ coin: t.coin, close: r.close, pnl: (r.won ? n50 : 0) - n50 * px - fee(px, n50) }); const nr = Math.floor(K.sizeUsd / px); t.rulePnl = +((r.won ? nr : 0) - nr * px - fee(px, nr)).toFixed(2); }
      if (!capped && r.result) { t.pnl = +((r.won ? n : 0) - cost).toFixed(2); dayNet[dk] = (dayNet[dk] || 0) + t.pnl; dayPeak[dk] = Math.max(dayPeak[dk], dayNet[dk]); if (inRun) { bal += t.pnl; peak = Math.max(peak, bal); maxDd = Math.max(maxDd, peak - bal); eq.push([r.close, +bal.toFixed(2)]); } }
      if (r.result && inRun) balU += (r.won ? n : 0) - cost;
      if (!capped && !r.result) open += cost;
      trades.push(t);
    }
    const grpW = {}; for (const t of trades) { const g = t.close + t.side; grpW[g] = (grpW[g] || 0) + 1; } for (const t of trades) { t.same = grpW[t.close + t.side]; t.win = perWin[t.close]; }
    const labs = runLabs(trades, K);
    const doneAll = trades.filter(t => t.done && !t.capped), done = doneAll.filter(t => t.run), today = done.filter(t => etDay(t.close) === etDay(Date.now()));
    const byCoin = {}; for (const t of doneAll) { const b = byCoin[t.coin] = byCoin[t.coin] || { coin: t.coin, n: 0, won: 0, net: 0 }; b.n++; if (t.won) b.won++; b.net = +(b.net + t.pnl).toFixed(2); }
    const winLoss = {}; for (const t of done) { if (!t.won) winLoss[t.close] = (winLoss[t.close] || 0) + 1; }
    let streak = 0; for (let i = done.length - 1; i >= 0 && done[i].won; i--) streak++;
    const seen = rows.length, rule = rows.filter(r => r.ask >= K.minAsk).length, under = rows.filter(r => r.result && r.result !== 'void' && r.ask < K.minAsk);
    const step = Math.max(1, Math.ceil(eq.length / 240));
    const agg = (l, key) => { const o = {}; for (const t of l) { const k = key(t); if (k == null) continue; const b = o[k] = o[k] || { n: 0, won: 0, net: 0 }; b.n++; if (t.won) b.won++; b.net = +(b.net + t.pnl).toFixed(2); } return o; };
    // MC 2026-11-09 by entry hour now (was close hour) so it lines up with the schedule picker; uses every settled rule trade so
    // hours already switched off still show what they would have done
    const ruleDone = trades.filter(t => t.done && t.rulePnl != null).map(t => ({ ...t, pnl: t.rulePnl })), byHour = agg(ruleDone, t => etHour(t.t)), bySide = agg(doneAll, t => t.side), byPx = agg(doneAll, t => t.px < 0.92 ? '90-92' : t.px < 0.95 ? '92-95' : t.px < 0.97 ? '95-97' : '97-99'), bySame = agg(ruleDone, t => String(t.same));
    // MC 2026-11-09 the coins-lined-up card lumped 4 and up together, so there was no way to tell 4 from 6. Now exact counts,
    // plus "N or more" so a cutoff can be read straight off (with and without the 95c cap). Every settled rule trade, at the rule's own $ per trade, so the active playbook doesn't hide any.
    const allDone = ruleDone, sameMin = []; for (let k = 1; k <= 9; k++) { const at = l => { const x = l.filter(t => t.same >= k), w = x.filter(t => t.won).length; return { n: x.length, won: w, net: +x.reduce((a, t) => a + (t.rulePnl ?? t.pnl ?? 0), 0).toFixed(2) }; }; const a = at(allDone); if (!a.n) break; sameMin.push({ k, ...a, u95: at(allDone.filter(t => t.px < 0.95)) }); }
    const dayMap = {}; for (const t of trades) { if (t.capped && !t.halted) continue; const k = etDay(t.close); const d = dayMap[k] = dayMap[k] || { d: k, n: 0, won: 0, net: 0, low: 0, run: 0, halted: false, skipped: 0 }; if (t.halted) { d.halted = true; d.haltWhy = d.haltWhy || t.haltWhy || 'daily'; d.skipped++; continue; } if (!t.done) continue; d.n++; if (t.won) d.won++; d.run = +(d.run + t.pnl).toFixed(2); d.net = d.run; d.low = Math.min(d.low, d.run); }
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
      byHour, bySide, byPx, bySame, sameMin, daily, roll, breakEven, halves, checks, all, live: { at: scanAt, scan, live: liveView() }, keys, wr300: +(wr300 * 100).toFixed(1), worstDay, dd: +(peak - bal).toFixed(2),
      bounds: BOUNDS, coinsAll: COINS, cfg: K, balance: +bal.toFixed(2), net: +(bal - K.startUsd).toFixed(2), inPlay: +open.toFixed(2), maxDd: +maxDd.toFixed(2),
      n: done.length, won: done.filter(t => t.won).length, today: { n: today.length, won: today.filter(t => t.won).length, net: sum(today),
        // MC 2026-11-10 what the playbook passed on today and how those would have gone, so a filter can be judged at a glance
        ...(() => { const ps = trades.filter(t => t.strat && t.run && etDay(t.close) === etDay(Date.now())), pd = ps.filter(t => t.done); return { passed: ps.length, pWon: pd.filter(t => t.won).length, pLost: pd.filter(t => !t.won).length }; })() },
      avg: done.length ? +(sum(done) / done.length).toFixed(2) : 0, streak, uncappedNet: +(balU - K.startUsd).toFixed(2), capped: trades.filter(t => t.capped).length,
      runFrom: runFrom || null, runN: done.length, prevN: doneAll.length - done.length, worstWin: Math.max(0, ...Object.values(winLoss)), halts: trades.filter(t => t.halted).length, seen, rule, since: (runFrom ? (done[0]?.t || runFrom) : rows[0]?.at) || null, last: rows[rows.length - 1]?.at || null,
      under: { n: under.length, won: under.filter(r => r.won).length, c: under.length ? +(under.reduce((a, r) => a + (r.pnl1 || 0), 0) / under.length * 100).toFixed(2) : 0 },
      eq: eq.filter((x, i) => i % step === 0 || i === eq.length - 1), byCoin: Object.values(byCoin).sort((a, b) => b.net - a.net),
      cold: K.coldDays > 0 ? Object.fromEntries([...new Set(trades.map(t => t.coin))].map(c => [c, +net30(c, Date.now()).x.toFixed(2)])) : null, coldSkips: trades.filter(t => t.cold).length,
      volfix: (() => { let fixed = 0, left = 0; for (const r of rec.values()) { const v = r.vol; if (v?.fixed) fixed++; else if (v ? ((v.age == null || v.src === 'stale') && !v.chk && (v.try || 0) < 3) : (r.ask >= KEEP_ASK && r.strike > 0 && (r.vtry || 0) < 3 && r.at > Date.now() - 7 * 86400000)) left++; } return { fixed, left }; })(), learn: learnView(trades, K), pending: trades.filter(t => !t.done && !t.capped).slice(-12), recent: trades.filter(t => t.done || t.capped).slice(-60).reverse(), where: 'cloud', logs: logs.slice(-20), labs,
      playbook: { id: stratAt(K.strat, Date.now()), since: stratSince(K.strat, Date.now()), log: (K.strat || []).slice(-12), stratSkips: trades.filter(t => t.strat).length } };
  }

  // ---------- Labs: each idea as its own paper account over the same trades ----------
  // filter(t) returns true (take), false (skip) or null (can't tell yet: the lab starts at its first decidable trade and such
  // trades are left out of both the lab and its rule comparison). size(bank) returns the stake; the rule's own is fixed.
  function runLabs(trades, K) {
    const LABS = labDefs(K);
    const todayK = etDay(Date.now());
    const sim = (lab, from, baseline) => {
      let bank = K.startUsd, peak = bank, dd = 0, n = 0, won = 0, sk = 0, skNet = 0; const day = {}, dayPk = {}, stopD = {}, eq = [], td = { n: 0, won: 0, net: 0 }; let ddRef = bank, ddLast = null;
      for (const t of trades) {
        if (!t.done || t.close < from) continue;
        if (t.win > K.maxPerWindow || t.off) continue;
        const f = baseline ? true : lab.filter(t); if (f == null) continue;
        const dk = etDay(t.close);
        if (K.dailyLossUsd > 0 && (day[dk] || 0) <= -K.dailyLossUsd) continue;
        if (stopD[dk]) continue; if (dayPk[dk] == null) dayPk[dk] = 0;
        if (ddLast && ddLast !== dk && stopD[ddLast] === 'bankdd') ddRef = bank; ddLast = dk; ddRef = Math.max(ddRef, bank);
        if (K.dailyWinUsd > 0 && (day[dk] || 0) >= K.dailyWinUsd) continue;
        if (K.giveBackPct > 0 && dayPk[dk] >= (K.giveBackMin ?? 25) && (day[dk] || 0) <= dayPk[dk] * K.giveBackPct / 100) { stopD[dk] = 'giveback'; continue; }
        if (K.bankDdPct > 0 && bank <= ddRef * (1 - K.bankDdPct / 100)) { stopD[dk] = 'bankdd'; continue; }
        const size = lab.size && !baseline ? lab.size(bank, t, { peak, start: K.startUsd }) : K.sizeUsd, k = Math.floor(size / t.px), cost = k * t.px + fee(t.px, k), pnl = (t.won ? k : 0) - cost;
        if (!f) { sk++; skNet += t.rulePnl ?? t.pnl ?? 0; continue; }
        n++; if (t.won) won++; bank += pnl; day[dk] = (day[dk] || 0) + pnl; dayPk[dk] = Math.max(dayPk[dk], day[dk]); peak = Math.max(peak, bank); dd = Math.max(dd, peak - bank); eq.push([t.close, +bank.toFixed(2)]);
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
      for (const k of Object.keys(BOUNDS)) { if (a[k] == null || a[k] === '') continue; const v = Number(a[k]); if (!isFinite(v)) continue; const x = Math.min(BOUNDS[k][1], Math.max(BOUNDS[k][0], k === 'minAsk' || k === 'mixMaxPx' ? Math.round(v * 100) / 100 : Math.round(v))); if (x !== cfgP[k]) { out[k] = x; ch.push(`${k} ${cfgP[k]} -> ${x}`); } }
      if (Array.isArray(a.coins)) { const want = COINS.filter(x => a.coins.includes(x)); if (!want.length) return { ok: false, msg: 'Pick at least one coin.' }; const v = want.length === COINS.length ? null : want, cur = cfgP.coins || null; if (JSON.stringify(v) !== JSON.stringify(cur)) { out.coins = v; ch.push(`coins ${v ? v.join(', ') : 'all nine'}`); } }
      if (out.mixSame != null || out.mixSameMax != null) { const lo = out.mixSame ?? cfgP.mixSame ?? 3, hi = out.mixSameMax ?? cfgP.mixSameMax ?? 9; if (lo > hi) return { ok: false, msg: 'Coins on the same side: the most can\'t be below the least.' }; }
      if (['fixed', 'pct', 'kelly', 'ratchet'].includes(a.mixSize) && a.mixSize !== (cfgP.mixSize || 'fixed')) { out.mixSize = a.mixSize; ch.push(`mix sizing ${a.mixSize}`); }
      if (a.paperFrom != null) { const v = a.paperFrom === 0 ? 0 : Math.min(Date.now(), Math.max(0, +a.paperFrom || 0)); if (v !== (cfgP.paperFrom || 0)) { out.paperFrom = v; ch.push(v ? `new paper run from ${new Date(v).toISOString().slice(0, 16)}Z` : 'paper run covers everything again'); } }
      if (Array.isArray(a.skipHours)) { const v = [...new Set(a.skipHours.map(Number).filter(h => Number.isInteger(h) && h >= 0 && h < 24))].sort((x, y) => x - y); if (v.length === 24) return { ok: false, msg: 'Leave at least one hour on.' }; if (JSON.stringify(v) !== JSON.stringify(cfgP.skipHours || [])) { out.skipHours = v; ch.push(`off hours ${v.length ? v.join(', ') : 'none'}`); } }
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
  return { tick, alarm, entry, command, importRows, publish, load, status, checkKeys, resetKey, coins: COINS, _t: { volRepair, kalshiView, kliveBody, liveView, rec: () => rec, L: () => L, st, nextMark, onRule, sign, logs } };
}
