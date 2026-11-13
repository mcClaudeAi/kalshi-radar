import { feats, fit, predict, logit, LEARN_F, LEARN_NAME } from './learn.js';
import { createBooks } from './books.js';
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
const L2_LO = 0.9099, L2_HI = 0.9501, L2_MIN_LEFT = 4;   // second look: price band and the last minute it may buy
// MC 2026-11-11 live cap raised from $25 to $50 a trade (asked, for the subaccount books at $50); the floor and limits are unchanged
const HARD = { maxSize: 50, minBank: 300, maxPerWindow: 9, maxPerDay: 150 };
const XI = 2;   // the 15-minute crypto markets trade on exchange shard 2
const PAPER_DEF = { startUsd: 1000, sizeUsd: 50, maxPerWindow: 9, minAsk: 0.9, maxAsk: 0.99, dailyLossUsd: 250, coldDays: 30, coins: null, mixSame: 3, mixSameMax: 9, mixMaxPx: 0.95, mixVol: 0, mixSize: 'fixed', mixPct: 5, skipHours: [], giveBackPct: 0, giveBackMin: 25, dailyWinUsd: 0, bankDdPct: 0, ratchetAdd: 10, ratchetEvery: 200, paperFrom: 0, lockAt: 0, lockKeep: 0, trendExit: 0, trendKeep: 50, winCap: 9 };
// MC 2026-11-08 coin list and starting bank are settable from the dashboard (plug-and-play edition); null coins = all nine
const COINS = SERIES.map(s => s.replace(/^KX|15M$/g, ''));
const BOUNDS = { sizeUsd: [5, 500], dailyLossUsd: [25, 2000], minAsk: [0.85, 0.98], maxAsk: [0.86, 0.99], coldDays: [0, 90], startUsd: [100, 1000000], mixSame: [1, 9], mixSameMax: [1, 9], mixMaxPx: [0.91, 1], mixVol: [0, 1], mixPct: [1, 10], giveBackPct: [0, 90], giveBackMin: [5, 1000], dailyWinUsd: [0, 5000], bankDdPct: [0, 50], ratchetAdd: [1, 100], ratchetEvery: [25, 5000], lockAt: [0, 5000], lockKeep: [0, 90], trendExit: [0, 1], trendKeep: [5, 95], winCap: [1, 9] };
// MC 2026-11-08 the lab definitions live here so the paper book and the live gate can run any of them as the active playbook.
// filter(t) gets {px, win, z}: true take, false skip, null can't tell (no volatility reading). size(bank) only for sizing labs.
function mixDesc(K) { const p = [], sz = K.mixSize || 'fixed';
  const lo = K.mixSame ?? 3, hi = K.mixSameMax ?? 9; if (lo > 1 || hi < 9) p.push(hi < 9 ? (lo === hi ? `exactly ${lo} coins lead the same direction` : `${lo} to ${hi} coins lead the same direction`) : `at least ${lo} coins lead the same direction`);
  if ((K.mixMaxPx ?? 0.95) < 1) p.push(`under ${Math.round((K.mixMaxPx ?? 0.95) * 100)}¢`);
  if (K.mixVol) p.push('at least one expected move past the target');
  const size = sz === 'pct' ? `${K.mixPct ?? 5}% of the bank a trade` : sz === 'kelly' ? 'quarter Kelly sizing' : sz === 'ratchet' ? `$${K.sizeUsd} a trade plus $${K.ratchetAdd ?? 10} for every $${K.ratchetEvery ?? 200} of banked profit, back to $${K.sizeUsd} whenever the bank is under its high` : `$${K.sizeUsd} a trade`;
  return `${p.length ? 'Only trades ' + p.join(', ') : 'Every rule trade'}; ${size}. Built in Paper settings.`; }
// MC 2026-11-10 colors re-picked as one set once there were fifteen playbooks: three pinks sat next to each other on the Labs
// chart. Each hue is now used once (sky, orange, sea green, hot pink, royal blue, tan, grey, purple, mint, olive, yellow, red,
// pale pink, lavender, dim grey). The Backtest page uses the same ones.
function labDefs(K) {
  return [
    { id: 'rule', name: 'The rule', desc: `Every 90¢+ leader at 10 minutes left, $${K.sizeUsd} a trade.`, color: '#4CC9F0', filter: () => true },
    { id: 'no95', name: 'Skip 95¢ and up', desc: 'Only buys between 90¢ and 94¢. Over 4 months the 95¢+ trades made nothing but still lost the full stake in bad windows.', color: '#F8961E', filter: t => t.px < 0.95 },
    { id: 'six', name: '6 or more coins', desc: 'Only trades windows where at least 6 of the 9 coins qualify. Those windows won 96% in the replay with half the drawdown.', color: '#43AA8B', filter: t => t.win >= 6 },
    { id: 'vol', name: 'Margin vs volatility', desc: 'Skips when the coin is less than one expected 10-minute move past its target, judged by its last hour on Coinbase.', color: '#F72585', filter: t => t.z == null ? null : t.z >= 1 },
    { id: 'pct', name: 'Size follows the bank', desc: `Stakes 5% of the bank instead of a fixed $${K.sizeUsd}, so bets shrink after losses and grow after wins.`, color: '#4361EE', filter: () => true, size: b => Math.max(5, Math.round(b * 0.05)) },
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
    { id: 'mix', name: 'Your mix', desc: mixDesc(K), color: '#D4A373',
      filter: t => { const sz = K.mixSize || 'fixed'; // MC 2026-11-09 upper bound too: 6+ coins agreeing is usually one market-wide move, so a range like 3 to 5 can be tested
        if (!(t.px < (K.mixMaxPx ?? 0.95)) || (t.same ?? 0) < (K.mixSame ?? 3) || (t.same ?? 0) > (K.mixSameMax ?? 9)) return false;
        if (K.mixVol && t.z == null) return null; if (K.mixVol && t.z < 1) return false;
        if (sz === 'kelly') return t.kf == null ? null : t.kf > 0; return true; },
      size: (K.mixSize || 'fixed') === 'fixed' ? undefined : (K.mixSize === 'kelly' ? (b, t) => Math.max(5, Math.min(b * 0.05, b * 0.25 * (t?.kf || 0) / Math.max(1, t?.win || 1)))
        // MC 2026-11-09 ratchet: the stake only steps up on banked profit at a new bank high, and drops back to the base size the
        // moment the bank is under its high. Wins compound slowly, a loss shrinks the bet at once. S carries the bank's high and start.
        : K.mixSize === 'ratchet' ? (b, t, S) => { const base = K.sizeUsd, hi = S?.peak ?? b, st = S?.start ?? K.startUsd; return b + 0.005 < hi ? base : base + (K.ratchetAdd ?? 10) * Math.max(0, Math.floor((hi - st) / (K.ratchetEvery ?? 200))); }
        : b => Math.max(5, Math.round(b * (K.mixPct ?? 5) / 100))) },
    { id: 'kelly', name: 'Kelly sizing', desc: 'Sizes each bet by the Kelly criterion from the win rate already seen at that price, at a quarter of Kelly, split across the coins in the window. Skips prices with no proven edge.', color: '#ADB5BD', filter: t => t.kf == null ? null : t.kf > 0, size: (b, t) => Math.max(5, Math.min(b * 0.05, b * 0.25 * (t?.kf || 0) / Math.max(1, t?.win || 1))) },
    // MC 2026-11-10 Beats the market: turns the volatility reading into a win probability (normal model, ten minutes to go with
    // the 60-second settlement average) and only buys when that probability beats Kalshi's price plus the fee plus 1 cent. The
    // volatility lab asks "far enough past the target?"; this asks "is the market underpricing it?", so the bar rises with the price.
    { id: 'vol2', name: 'Margin vs volatility v2', desc: 'Skips a coin that is less than one typical 10-minute move past its target at the trade check. The typical move is measured directly, from every 10-minute price change on Coinbase over the last 5 hours, instead of being scaled up from 1-minute moves (which overstated it and skipped trades that kept winning).', color: '#9D4EDD', filter: t => t.z10 == null ? null : t.z10 >= 1 },
    { id: 'edge', name: 'Beats the market', desc: 'Only buys when our win chance, from the coin\'s volatility and how far it is past the target, beats Kalshi\'s price plus the fee and a cent.', color: '#06D6A0', filter: t => t.z == null ? null : winP(t.z) >= t.px + 0.07 * t.px * (1 - t.px) + 0.01 },
    { id: 'edge2', name: 'Beats the market v2', desc: 'Beats the market with two more checks: volatility is the larger of the last hour and the last 15 minutes, and a coin sliding back toward its target in the last 5 minutes has half that slide taken off its margin.', color: '#90BE6D', filter: t => t.z2 == null ? null : winP(t.z2) >= t.px + 0.07 * t.px * (1 - t.px) + 0.01 },
    // MC 2026-11-10 Margin vs volatility with the 95c cap, as one named playbook. It existed only as a Backtest row and as a
    // Your mix recipe (volatility on, cap 95, then switch the playbook to Your mix), which was three steps and easy to half do.
    // In the four-month backtest it gave the most profit per dollar of worst drop of anything tested.
    { id: 'mv95', name: 'Margin vs volatility, under 95¢', desc: 'Margin vs volatility, and it also skips anything priced 95¢ or more. Those contracts pay the least for the same risk. In the four-month backtest this kept nearly all of the profit with a smaller worst drop and no losing month.', color: '#FFD60A', filter: t => t.z == null ? null : t.z >= 1 && t.px < 0.95 },
    // MC 2026-11-12 the four-month research put the price cap at 96c, not 95c: 95.0 to 95.9c still paid after fees once the
    // volatility check passed, and only 96c and up lost. Added beside the 95c playbook instead of changing it, so nobody's
    // live playbook changes under them. $41.60 a day at $50 a trade in the history against $33 for the plain rule.
    { id: 'mv96', name: 'Margin vs volatility, under 96¢', desc: 'Margin vs volatility, and it also skips anything priced 96¢ or more. In the four-month history the 95¢ trades still paid after fees once the coin was clear of its target, and only 96¢ and up lost. The most profit per trade of the playbooks tested: about 40% fewer trades than the plain rule and more profit.', color: '#F4A261', filter: t => t.z == null ? null : t.z >= 1 && t.px < 0.96 },
    // MC 2026-11-10 asked for a rule that is green every day. None exists in the history: of 251 candidate rules with enough trades,
    // none had a second half without a red day, because one loss costs about 15 wins. This is the steadiest that held up when
    // it was picked on the first two months and checked on the last two: at least two typical moves past the target on both
    // measures. 91% green days on the half it was picked on, 89% on the half it had not seen, about 7 trades a day, and roughly
    // a fifth of Margin vs volatility's profit. Steadier, smaller; not safe.
    { id: 'two', name: 'Two moves clear', desc: 'Only buys when the coin is at least two normal 10-minute moves past its target on both volatility measures, twice the bar Margin vs volatility uses. Far fewer trades (about 7 a day) and far fewer losing days: about 9 days in 10 finished green in the four-month history. It earns much less in total. It still has losing days.', color: '#E63946', filter: t => t.z == null || t.z10 == null ? null : t.z >= 2 && t.z10 >= 2 },
    // MC 2026-11-10 second look. Every coin used to get one look, at 10 minutes left; one that qualified a minute or three later
    // (DOGE at 7:37 PM: under 90c at the mark, 92c with a clear lead soon after) was never considered. This playbook is Margin
    // vs volatility at the mark, plus: each minute after it, down to 4 minutes left, a coin it does not already hold is bought
    // the first time its leader is priced 91c to 95c and is at least one typical 10-minute move past the target on a current
    // price. One entry per market. Paper and Labs only for now: live still places orders at the mark only. There is no history
    // to backtest this on (the four-month data has one snapshot per trade), so Labs is the test.
    { id: 'look2', name: 'Margin vs volatility + second look', late: true, desc: 'Margin vs volatility at the 10-minute mark, plus a second look: every minute after that, until 4 minutes are left, it buys a coin it does not already hold the first time the leader is priced 91¢ to 95¢ and is at least one normal 10-minute move past its target. Paper and Labs only; live still trades at the mark only.', color: '#FFB3C6', filter: t => t.late ? (t.bTaken ? null : true) : t.z == null ? null : t.z >= 1 },
    // MC 2026-11-10 the self-learning playbook. pl is the model's win chance for this trade, frozen at the trade check from that
    // morning's fit (so it has never seen the trade it is judging). Same bar as Beats the market: price + fee + 1 cent.
    { id: 'learn', name: 'Learned', desc: 'Only buys when the self-learning model\'s win chance beats Kalshi\'s price plus the fee plus 1¢. The model refits every morning on every settled trade, starting from four months of history, and is only ever scored on trades it had not seen. See the Learning tab.', color: '#E0AAFF', filter: t => t.pl == null ? null : t.pl >= t.px + 0.07 * t.px * (1 - t.px) + 0.01 },
    // MC 2026-11-11 buys at minute 10 instead of at the mark, and only when the 5-to-10 trend line is with the bet or flat. Labs
    // only (m10Only): it runs on its own minute-10 prices, never on the mark's trades, and can't be picked for paper or live.
    { id: 'tr10', name: 'Wait for the trend', m10Only: true, desc: `Skips the 10-minutes-left buy. At 5 minutes left it buys the leader if it costs ${Math.round((K.minAsk ?? 0.9) * 100)}¢ to 98¢ and the trend line from minute 5 to minute 10 runs with the bet or is flat. Higher prices than the mark, so smaller wins; the question is whether fewer losses make up for it.`, color: '#E9C46A', filter: t => !!t.m10 && t.px >= K.minAsk && t.px <= 0.98 && t.dir >= 0 },
    { id: 'all', name: 'All filters together', desc: 'Skip 95¢+, 6 or more coins, and the volatility check, all at once.', color: '#6C757D', filter: t => t.z == null ? null : (t.px < 0.95 && t.win >= 6 && t.z >= 1) },
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
// the bids for each side, best first: what our contracts would sell for right now
function bids(ob) { const o = ob?.orderbook_fp || ob?.orderbook || {}, side = k => (o[k + '_dollars'] || o[k] || []).map(([p, q]) => [num(p), Number(q)]).filter(([p, q]) => p > 0 && q > 0).sort((a, b) => b[0] - a[0]); return { yes: side('yes'), no: side('no') }; }
function walk(asks, n) { let left = n, cost = 0; for (const [p, q] of asks) { const t = Math.min(left, q); cost += t * p; left -= t; if (!left) break; } return left ? null : cost / n; }
// the coin's price now and its 1-minute volatility over the last hour (Coinbase), for the margin-vs-volatility lab
// MC 2026-11-10 where prices come from, after a night of chasing it. The exchange API (api.exchange.coinbase.com) limits requests
// by address, and a Cloudflare worker shares its address with everyone else's: the worker's log showed "429 Public rate limit
// exceeded" on the uncached candle list and on the ticker at trade check after trade check. Its cached candle list did answer,
// but 2 to 6 minutes behind, which is how an XRP trade read 0.000% from its target. Coinbase's Advanced Trade market endpoints
// (api.coinbase.com) carry the same candles, answered every time in the same log, and are current. So: candles from Advanced
// Trade; if that fails, the old cached list. If the newest candle is still over 2 minutes old, the price is asked of the
// Advanced Trade product, the consumer spot price and the exchange ticker in turn. If nothing current answers, the reading is
// kept, marked stale, and rebuilt from history by the repair pass. Every step that fails is logged with its status.
const CBH = { accept: 'application/json', 'user-agent': 'curve-radar' };
async function advCandles(pid, s, e) {
  const r = await fetch(`https://api.coinbase.com/api/v3/brokerage/market/products/${pid}/candles?start=${s}&end=${e}&granularity=ONE_MINUTE`, { headers: CBH });
  if (!r.ok) { const err = new Error('coinbase adv ' + r.status); err.status = r.status; throw err; }
  return ((await r.json()).candles || []).map(k => [+k.start, +k.low, +k.high, +k.open, +k.close, +k.volume]).filter(k => k[4] > 0);
}
async function volAt(c, strike, side) {
  const pid = CBPID[c]; if (!pid || !(strike > 0)) return null;
  try {
    const now = Math.floor(Date.now() / 1000); let all = null, from = 'adv';
    try { all = await advCandles(pid, now - 299 * 60, now); } catch (e) { console.log(`vol ${c}: ${e.message}`); }
    if (!all || all.length < 20) { from = 'exchange'; const r = await fetch(`https://api.exchange.coinbase.com/products/${pid}/candles?granularity=60`, { headers: CBH }); if (!r.ok) { console.log(`vol ${c}: exchange list ${r.status}`); return null; } all = (await r.json()).slice(0, 300); }
    all.sort((a, b) => a[0] - b[0]);   // oldest first: [time, low, high, open, close, volume]
    const rows = all.slice(-61); if (rows.length < 20) { console.log(`vol ${c}: only ${rows.length} candles`); return null; }
    const age = Math.round(Date.now() / 1000 - rows[rows.length - 1][0]); let px = rows[rows.length - 1][4], src = 'candle';
    if (age > 120) { src = 'stale';
      for (const [name, url, pick] of [['adv', `https://api.coinbase.com/api/v3/brokerage/market/products/${pid}`, j => j?.price], ['spot', `https://api.coinbase.com/v2/prices/${pid}/spot`, j => j?.data?.amount], ['ticker', `https://api.exchange.coinbase.com/products/${pid}/ticker`, j => j?.price]]) {
        try { const t = await fetch(url, { headers: CBH }); if (!t.ok) { console.log(`vol ${c}: ${name} ${t.status}`); continue; } const v = Number(pick(await t.json())); if (v > 0) { px = v; src = name; break; } } catch (e) { console.log(`vol ${c}: ${name} threw`); } } }
    const out = volCalc(all, rows, px, strike, side, age, src); console.log(`vol ${c}: ok ${from} age ${age}s ${src} z ${out.z} z10 ${out.z10}`); return out;
  } catch (e) { console.log(`vol ${c}: error ${e.message}`); return null; }
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
    const p5 = rows[Math.max(0, rows.length - 6)][4], drift = src !== 'candle' && src !== 'history' ? 0 : (side === 'yes' ? 1 : -1) * Math.log(px / p5), sig2 = Math.max(sigma, sigma15);
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
let CCB = 4;      // Coinbase requests the repair may still make this minute
const CC = {};   // coin -> { m: Map(second -> close), got: [[from, to]] } candles already pulled for the repair, kept in memory
async function volPast(c, strike, side, at) {
  const pid = CBPID[c]; if (!pid || !(strike > 0)) return null;
  const end = Math.floor(at / 60000) * 60 - 60, from = end - 299 * 60, K = CC[c] || (CC[c] = { m: new Map(), got: [] });
  // MC 2026-11-10 one request per reading got the repair rate-limited (429) within minutes. Trades of one coin sit 15 minutes
  // apart and each needs the 5 hours before it, so the windows overlap almost entirely: fetch only the stretch not already held,
  // 300 minutes at a time working backwards. About one request per 19 readings instead of one each.
  for (let guard = 0; guard < 3; guard++) {
    let need = null; for (let t = end; t >= from; t -= 60) if (!K.got.some(g => t >= g[0] && t <= g[1])) { need = t; break; }
    if (need == null) break;
    if (CCB <= 0) { const e = new Error('budget'); e.status = 'budget'; throw e; } CCB--;
    const s0 = need - 299 * 60;
    for (const k of await advCandles(pid, s0, need)) K.m.set(k[0], k[4]); K.got.push([s0, need]);
  }
  const all = []; for (let t = from; t <= end; t += 60) { const v = K.m.get(t); if (v != null) all.push([t, v, v, v, v, 0]); }
  const rows = all.slice(-61);
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
  sql.exec('CREATE TABLE IF NOT EXISTS k2 (tk TEXT PRIMARY KEY, close INTEGER, j TEXT)');   // second-look entries, kept apart from the mark records so nothing else counts them
  sql.exec('CREATE TABLE IF NOT EXISTS k3 (tk TEXT PRIMARY KEY, close INTEGER, j TEXT)');   // every coin's price and trend at minute 10, for the Wait for the trend lab
  let rec2 = new Map(), rec3 = new Map();
  let rec = null, L = null, cfgP = null, ctlL = null, scan = [], scanAt = 0, view = null, viewDirty = true, viewAt = 0;
  const st = { bal: null, balAt: 0, lastErr: null, errAt: 0, host: 0, sellAllDone: 0, stopped: null, keyOk: null, shard: {}, xferAt: 0, lastXfer: null, lastMark: 0 };
  const logs = [];
  // MC 2026-11-09 log lines also go to console so `wrangler tail` can confirm entries without the dashboard
  const say = s => { logs.push(`${new Date().toISOString().slice(11, 19)} ${s}`); if (logs.length > 60) logs.shift(); console.log('kx ' + s); };
  async function load() {
    if (rec) return;
    rec = loadT('kt'); rec2 = loadT('k2'); rec3 = loadT('k3');
    L = new Map(); for (const r of sql.exec('SELECT j FROM ko')) { try { const j = JSON.parse(r.j); L.set(j.tk, j); } catch {} }
    cfgP = { ...PAPER_DEF, ...((await kv.get('kcfg')) || {}) };
    ctlL = { enabled: false, sizeUsd: 10, dailyLossUsd: 100, sellAllAt: 0, ...((await kv.get('kctl')) || {}) };
    apiV = (await kv.get('kapi')) || null;
    const s = (await kv.get('kst')) || {}; st.sellAllDone = s.sellAllDone || 0;
    await books.load();
  }
  // MC 2026-11-12 the dashboard went down: "Exceeded allowed rows read in Durable Objects free tier" (5 million a day). Cloudflare
  // drops this object from memory seconds after each minute's tick when nobody has the page open, so nearly every tick started
  // cold and read every row of kt, k2 and k3 again. A few thousand rows times 1,440 ticks crossed the limit once the log was
  // about five days long. Records now live one row each only while their window is recent. Once a 6-hour block is two hours
  // past, its records are packed into one row of kp, and blocks older than two days are merged into one row a day. A cold
  // start reads a few hundred rows instead of everything. A packed record that changes later (a late settle, a share kept
  // worked out afterwards) rewrites its one pack row.
  sql.exec('CREATE TABLE IF NOT EXISTS kp (t TEXT, b TEXT, j TEXT, PRIMARY KEY (t, b))');
  const H6 = 6 * 3600000, DAY = 86400000, TBL = ['kt', 'k2', 'k3'];
  const where = { kt: new Map(), k2: new Map(), k3: new Map() }, packs = { kt: new Map(), k2: new Map(), k3: new Map() };   // ticker -> pack id, pack id -> tickers
  const mapOf = t => t === 'kt' ? rec : t === 'k2' ? rec2 : rec3;
  function loadT(t) {
    const m = new Map(); where[t].clear(); packs[t].clear();
    for (const r of sql.exec('SELECT b, j FROM kp WHERE t = ?', t)) { let a = []; try { a = JSON.parse(r.j); } catch {} const set = new Set(); packs[t].set(r.b, set);
      for (const j of a) { const was = where[t].get(j.ticker); if (was != null) packs[t].get(was)?.delete(j.ticker); m.set(j.ticker, j); where[t].set(j.ticker, r.b); set.add(j.ticker); } }
    // a single row is always newer than the packed copy
    for (const r of sql.exec(`SELECT j FROM ${t}`)) { try { const j = JSON.parse(r.j), was = where[t].get(j.ticker); if (was != null) { packs[t].get(was)?.delete(j.ticker); where[t].delete(j.ticker); } m.set(j.ticker, j); } catch {} }
    return m;
  }
  function writePack(t, id) {
    const set = packs[t].get(id), m = mapOf(t), a = set ? [...set].map(k => m.get(k)).filter(Boolean) : [];
    if (!a.length) { sql.exec('DELETE FROM kp WHERE t = ? AND b = ?', t, id); packs[t].delete(id); return; }
    sql.exec('INSERT OR REPLACE INTO kp (t, b, j) VALUES (?, ?, ?)', t, id, JSON.stringify(a));
  }
  const saveT = (t, r) => { const id = where[t].get(r.ticker); if (id != null) writePack(t, id); else sql.exec(`INSERT OR REPLACE INTO ${t} (tk, close, j) VALUES (?, ?, ?)`, r.ticker, r.close, JSON.stringify(r)); };
  // remove records for good (the caller has already taken them out of the map)
  function dropT(t, keys) { const dirty = new Set(); for (const k of keys) { const id = where[t].get(k); if (id == null) sql.exec(`DELETE FROM ${t} WHERE tk = ?`, k); else { packs[t].get(id)?.delete(k); where[t].delete(k); dirty.add(id); } } for (const id of dirty) writePack(t, id); }
  function compact(now) {
    for (const t of TBL) { const m = mapOf(t), seal = Math.floor((now - 2 * 3600000) / H6), byB = {};
      for (const [k, r] of m) { if (where[t].has(k)) continue; const b = Math.floor(r.close / H6); if (b < seal) (byB[b] = byB[b] || []).push(k); }
      for (const [b, ks] of Object.entries(byB)) { const id = 'h' + b, set = packs[t].get(id) || new Set(); packs[t].set(id, set); for (const k of ks) { set.add(k); where[t].set(k, id); } writePack(t, id); for (const k of ks) sql.exec(`DELETE FROM ${t} WHERE tk = ?`, k); }
      const dSeal = Math.floor((now - 2 * DAY) / DAY), byD = {};
      for (const id of packs[t].keys()) if (id[0] === 'h') { const d = Math.floor(+id.slice(1) * H6 / DAY); if (d < dSeal) (byD[d] = byD[d] || []).push(id); }
      for (const [d, ids] of Object.entries(byD)) { const did = 'd' + d, set = new Set(packs[t].get(did) || []); for (const id of ids) for (const k of packs[t].get(id)) set.add(k);
        if (set.size > 1200) continue;   // a row holds 2 MB at most; a day is under 900 records, so this only guards against the odd case
        packs[t].set(did, set); for (const k of set) where[t].set(k, did); writePack(t, did); for (const id of ids) { sql.exec('DELETE FROM kp WHERE t = ? AND b = ?', t, id); packs[t].delete(id); } }
    }
  }
  const saveRec = r => saveT('kt', r), saveRec2 = r => saveT('k2', r), saveRec3 = r => saveT('k3', r);
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
  // MC 2026-11-11 live books on subaccounts (books.js): each with its own locked key, made and funded with the main key
  const books = createBooks({ state, env, say, HOSTS, API, XI, coin, etDay, etHour, fee, stratAt, stratSince, mainReq: (m, p, b) => kreq(m, p, b), mainKeys: () => hasKeys(), labName: id => labDefs(cfgP).find(l => l.id === id)?.name || id });
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
      // MC 2026-11-12 winCap: the most trades one window may take, clearest first (hits arrive sorted). Coins that line up on one
      // side lose together; at three a window the worst day in the history fell by a third for about a tenth of the profit.
      { const cap = Math.min(HARD.maxPerWindow, cfgP.winCap ?? 9); if ([...L.values()].filter(x => x.close === r.close && x.fill > 0).length >= cap) return cap < HARD.maxPerWindow ? `window is full (${cap} a window, clearest first)` : 'window limit'; }
      return null; })();
    const skip = s => { st.stopped = s; const x = { tk: r.ticker, coin: cn, side: r.side, at: Date.now(), close: r.close, paperPx: r.avgN || r.ask, skipped: s }; L.set(r.ticker, x); saveL(x); say(`LIVE skip ${r.ticker}: ${s}`); };
    if (why) return skip(why);
    const bal = await balance(true);
    if (bal == null) { fail(`no order for ${r.ticker}: could not read the balance`); return; }
    const floor = c.minBank ?? HARD.minBank; if (bal < floor) return skip(`cash $${bal.toFixed(2)} is under the $${floor} floor`);
    st.stopped = null;
    // MC 2026-11-08 a sizing playbook (5% of the Kalshi cash) stays inside the $5 to HARD.maxSize live band and the saved size is its ceiling
    let rS = null; if (lab?.size) { let run = 0, pk = 0; for (const x of [...L.values()].filter(x => x.pnl != null).sort((a, b) => a.at - b.at)) { run += x.pnl; pk = Math.max(pk, run); } rS = { peak: bal + (pk - run), start: bal - run }; }
    let sizeUsd = lab?.size ? Math.min(c.sizeUsd, HARD.maxSize, Math.max(5, lab.size(bal, { kf: r.kf, win: r.win }, rS))) : c.sizeUsd;
    // MC 2026-11-10 protect today's profit on the live book too: today's settled live result and its high, less what this window
    // already has riding. Under the $5 minimum order it skips.
    if (cfgP.lockAt > 0) { const t2 = todayL().filter(x => x.pnl != null).sort((a, b) => a.at - b.at); let run = 0, pk = 0; for (const x of t2) { run += x.pnl; pk = Math.max(pk, run); }
      if (pk >= cfgP.lockAt) { const riding = [...L.values()].filter(x => x.close === r.close && x.fill > 0 && !x.result).reduce((a, x) => a + (x.cost || 0), 0), room = run - pk * (cfgP.lockKeep || 0) / 100 - riding;
        if (room < 5) return skip(`protecting today's profit: $${Math.max(0, room).toFixed(2)} of room left`); sizeUsd = Math.min(sizeUsd, room); } }
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
  let apiV = null;
  function liveView() {
    const c = ctl(), t = todayL().filter(x => x.fill > 0), done = t.filter(x => x.result), all = [...L.values()].sort((a, b) => b.at - a.at);
    return { on: c.enabled, size: c.sizeUsd, dailyLossUsd: c.dailyLossUsd, since: c.at || null, keys: hasKeys(), keyOk: st.keyOk, bal: st.bal, balAt: st.balAt || null, shard: st.shard, crypto: st.shard[XI] ?? null, xfer: st.lastXfer, err: st.lastErr && Date.now() - st.errAt < 3600000 ? st.lastErr : null, stopped: st.stopped,
      hard: { ...HARD, minBank: c.minBank }, today: { n: done.length, won: done.filter(x => x.won).length, net: +realized(done).toFixed(2), open: t.filter(x => !x.result).length }, bench: [...coldSet(Date.now())], where: 'cloud',
      total: { n: all.filter(x => x.result && x.fill > 0).length, net: +realized(all.filter(x => x.fill > 0)).toFixed(2) },
      open: all.filter(x => x.fill > 0 && !x.result).map(x => ({ tk: x.tk, coin: x.coin, side: x.side, fill: x.fill, px: x.px, cost: x.cost, paperPx: x.paperPx, close: x.close, at: x.at })),
      // MC 2026-11-08 every settled live trade in the paper history's compact shape, for the dashboard's Live analytics tab
      hist: all.filter(x => x.fill > 0 && x.result).slice(0, 2000).map(x => [x.close, x.coin, x.side, x.px, x.fill, x.pnl, x.won ? 1 : 0]),
      recent: all.slice(0, 150).map(x => ({ tk: x.tk, coin: x.coin, side: x.side, at: x.at, close: x.close, want: x.want ?? null, fill: x.fill ?? 0, px: x.px ?? null, paperPx: x.paperPx, cost: x.cost ?? null, result: x.result || null, won: x.won ?? null, pnl: x.pnl ?? null, err: x.err || null, skipped: x.skipped || null, sold: !!x.sold, strat: x.strat || null })),
      playbook: { id: stratAt(c.strat, Date.now()), since: stratSince(c.strat, Date.now()), log: (c.strat || []).slice(-12) }, books: books.view(), api: apiV };
  }

  // ---------- the rule: record the leader at the 10-minute mark ----------
  let entryBusy = false;
  async function entry(now = Date.now()) {
    await load();
    if (entryBusy) return 0; entryBusy = true; st.lastMark = now;   // the alarm and the minute tick can't both run one mark
    let n = 0; const hits = [];
    try {
    // MC 2026-11-13 the scan at the mark ran one coin after another: the market list, the order book and the Coinbase candles
    // for each of nine coins in turn, so the last coin was read several seconds after the first and every live order waited
    // for all of it. The coins are now read side by side and saved in the usual order once all are in; the orders go out
    // the moment the slowest coin answers. The time it took is logged as "entry".
    const t0 = Date.now();
    const scanOne = async s => {
      const got = [], j = await get(`/markets?series_ticker=${s}&status=open&limit=6`);
      for (const m of j?.markets || []) {
        const close = Date.parse(m.close_time), left = (close - now) / 60000;
        if (rec.has(m.ticker) || left > MIN_LEFT + 0.4 || left < MIN_LEFT - 1) continue;
        const b = book(await get(`/markets/${m.ticker}/orderbook`));
        const ya = b.yesAsks[0]?.[0], na = b.noAsks[0]?.[0]; if (ya == null || na == null) continue;
        const side = ya >= na ? 'yes' : 'no', asks = side === 'yes' ? b.yesAsks : b.noAsks, ask = asks[0][0];
        if (ask < KEEP_ASK) continue;
        const avgN = walk(asks, BOOK_N);
        // MC 2026-11-12 what 250 and 500 contracts would cost at the mark, logged beside the 100-contract price. The backtests
        // assume every order fills near the quote; before the live size goes past $50 a trade we need to know which coins have
        // the book for it. null = the book did not hold that many.
        const dp = n => { const a = walk(asks, n); return a == null ? null : +a.toFixed(4); };
        const r = { a250: dp(250), a500: dp(500), ticker: m.ticker, series: s, at: now, close, left: +left.toFixed(2), side, ask, depthAtAsk: asks[0][1], avgN: avgN == null ? null : +avgN.toFixed(4), ...detail(m), ya, na, depth: asks.reduce((a, x) => a + x[1], 0), src: 'cloud' };
        const v = await volAt(coin(s), r.strike, side); if (v) r.vol = v;
        got.push(r);
      }
      return got;
    };
    const all = await Promise.all(activeSeries().map(s => scanOne(s).catch(e => { say(`scan ${s} error: ${e.message}`); return []; })));
    for (const r of all.flat()) {
      if (rec.has(r.ticker)) continue;
      rec.set(r.ticker, r); saveRec(r); n++;
      // MC 2026-11-13 request 9: a maximum price beside the minimum, so a price band can be tried without changing a playbook
      if (r.ask >= cfgP.minAsk && r.ask <= (cfgP.maxAsk ?? 0.99) + 1e-9) { say(`${r.ticker} ${r.side.toUpperCase()} at ${Math.round(r.ask * 100)}c <- rule`); hits.push(r); }
    }
    console.log(`entry ${n} coins read in ${Date.now() - t0}ms, ${hits.length} for the rule, ${Math.round((Date.now() - (nextMark(now) - Q)) / 100) / 10}s after the mark`);
    // MC 2026-11-08 live orders go after the scan so the active playbook can see the whole window (how many coins qualified,
    // each coin's volatility reading). Was: order per coin inside the loop under the plain rule.
    learnFill(now + 1);
    // the playbook check for one hit, shared by the main live book and the subaccount books
    let kS0 = null; const kState = () => { if (!kS0) { kS0 = kNew(); for (const x of rec.values()) if (x.result && x.result !== 'void' && x.ask >= cfgP.minAsk && x.close <= now) kAdd(kS0, x.avgN || x.ask, !!x.won); } return kS0; };
    const gate = (sid, r) => { const lab = labDefs(cfgP).find(l => l.id === sid); if (!lab || lab.m10Only) return { ok: false, why: 'playbook not available live' };
      if (sid === 'kelly' || (sid === 'mix' && cfgP.mixSize === 'kelly')) { r.kf = kOf(kState(), r.avgN || r.ask).kf; r.win = hits.length; }
      const f = sid === 'rule' ? true : lab.filter({ px: r.avgN || r.ask, win: hits.length, same: hits.filter(h => h.side === r.side).length, z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, kf: r.kf ?? null, pl: r.lp ?? null });
      return f === true ? { ok: true, lab } : { ok: false, why: `${lab.name}: ${f === null ? (sid === 'learn' ? 'no model reading' : 'no volatility reading') : sid === 'kelly' ? 'no edge at this price yet' : 'filtered out'}` }; };
    const c = ctl();
    if (c.enabled && hits.length) {
      const sid = stratAt(c.strat, now), lab = labDefs(cfgP).find(l => l.id === sid);
      let kS = null; if (sid === 'kelly' || (sid === 'mix' && cfgP.mixSize === 'kelly')) { kS = kNew(); for (const x of rec.values()) if (x.result && x.result !== 'void' && x.ask >= cfgP.minAsk && x.close <= now) kAdd(kS, x.avgN || x.ask, !!x.won); }
      // MC 2026-11-09 schedule: hours (ET, by entry time) picked as off in Paper settings are skipped live too
      const offNow = (cfgP.skipHours || []).includes(etHour(now));
      hits.sort((a, b) => (b.vol?.z ?? -9) - (a.vol?.z ?? -9));   // clearest first, so profit protection gives them the room
      for (const r of hits) {
        if (offNow) { skipLive(r, `off schedule (${etHour(now)}:00 ET hour)`); continue; }
        if (kS) { r.kf = kOf(kS, r.avgN || r.ask).kf; r.win = hits.length; }
        const f = sid === 'rule' ? true : lab.filter({ px: r.avgN || r.ask, win: hits.length, same: hits.filter(h => h.side === r.side).length, z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, kf: r.kf ?? null, pl: r.lp ?? null });
        if (f === true) { try { await onRule(r, lab); } catch (e) { fail('order error: ' + e.message); } }
        else skipLive(r, `${lab.name}: ${f === null ? (sid === 'learn' ? 'no model reading' : 'no volatility reading') : sid === 'kelly' ? 'no edge at this price yet' : 'filtered out'}`);
      }
    }
    if (hits.length) { hits.sort((a, b) => (b.vol?.z ?? -9) - (a.vol?.z ?? -9)); try { await books.onMark(hits, now, gate, cfgP, coldSet(now)); } catch (e) { say('books error: ' + e.message); } }
    } finally { entryBusy = false; }
    if (n) viewDirty = true;
    return n;
  }

  // ---------- every minute: scanner, price paths, settlement ----------
  async function tick() {
    await load();
    const now = Date.now(), K = cfgP, out = [];
    try { compact(now); } catch (e) { console.log('compact: ' + e.message); }
    try { await gapWatch(now); } catch (e) { console.log('gap watch: ' + e.message); }
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
    if (now - mk > 150000 && nextMark(now) - now > 90000) { try { await gapFill(now); } catch (e) { say('gap fill error: ' + e.message); } try { await volRepair(now); } catch (e) { say('repair error: ' + e.message); } }
    await settleSome(now, false);
    try { await trendCheck(now); } catch (e) { say('trend check error: ' + e.message); }
    try { await minute10(now, out); } catch (e) { say('minute 10 error: ' + e.message); }
    try { await keepFill(now); } catch (e) { say('share fill error: ' + e.message); }
    try { await settle3(now); } catch (e) { say('minute 10 settle error: ' + e.message); }
    // MC 2026-11-10 was also gated on st.lastMark >= mk, which lives in memory: the object is dropped from memory between
    // minutes often enough that the second look never ran once in its first three windows. The clock alone decides now.
    if (now - mk > 70000) { try { await secondLook(now, out); } catch (e) { say('second look error: ' + e.message); } }
    try { await settle2(now); } catch (e) { say('second look settle error: ' + e.message); }
    // live account upkeep
    const c = ctl();
    if (c.sellAllAt && c.sellAllAt > st.sellAllDone) { st.sellAllDone = c.sellAllAt; await kv.put('kst', { sellAllDone: st.sellAllDone }); say('LIVE sell-all requested'); try { await sellAll(); } catch (e) { fail('sell-all error: ' + e.message); } }
    if (hasKeys() && (c.enabled || now - st.balAt > 5 * 60000)) { try { await balance(); } catch (e) { fail(e.message); } }
    if (c.enabled && st.balAt) { try { await fund(c); } catch (e) { fail('funding error: ' + e.message); } }
    try { await books.upkeep(now); } catch (e) { say('books upkeep error: ' + e.message); }
    const a = await state.storage.getAlarm(), want = nextAlarm(now); if (!a || a < now || a > want) await state.storage.setAlarm(want);
    await publish(true);
  }
  // MC 2026-11-08 settlement was only checked on the 1-minute cron and only once a market had been closed a full minute, so a
  // trade sat at 0:00 for 1 to 3 minutes before the totals moved. Now the alarm also wakes 15 seconds after each close with an
  // open trade and retries every 20 seconds until Kalshi posts the result (up to 10 minutes, then the cron keeps trying).
  // quick=true only looks at our trades closed in the last 10 minutes.
  // MC 2026-11-12 the dashboard was down from about 2:40 PM to 8 PM (Cloudflare's daily read limit) and every trade check in
  // between was missed. Kalshi keeps a minute-by-minute price history for each market, so a missed check can be rebuilt: the
  // quote at the 10-minutes-left mark, then the result. gapWatch notes when the tracker has been off for more than 20 minutes
  // (a heartbeat saved each tick), gapFill rebuilds one missed window a minute, away from the live trade check. Rebuilt rows
  // are marked src 'fill'. They carry the quoted price only, no order-book depth, so they are left out of Room in the book,
  // and the volatility reading comes from the usual repair pass. The first run with this code looks back two days for windows
  // with nothing recorded at all, which is how today's gap gets picked up.
  let gaps = null, beat = null, gapAt = 0, dayLogAt = 0;
  async function gapWatch(now) {
    if (gaps == null) { gaps = (await kv.get('kgaps')) || []; beat = (await kv.get('kbeat2')) ?? null;
      if (beat == null) { gaps = []; const have = new Set(); let first = Infinity; for (const m of [rec, rec3]) for (const r of m.values()) { have.add(r.close); if (r.close < first) first = r.close; }
        let run = null; for (let w = Math.ceil(Math.max(now - 48 * 3600000, first) / Q) * Q; w <= now - Q; w += Q) { if (!have.has(w)) { if (!run) run = [w - 601000, 0]; run[1] = w - 599000; } else if (run) { gaps.push(run); run = null; } } if (run) gaps.push(run);
        gaps = gaps.filter(g => g[1] - g[0] >= Q); if (gaps.length) { await kv.put('kgaps', gaps); say(`found ${gaps.length} stretch${gaps.length === 1 ? '' : 'es'} with no trade checks in the last two days; filling them in`); } } }
    if (beat != null && now - beat > 20 * 60000) { gaps.push([beat, now]); await kv.put('kgaps', gaps); say(`tracker was off for ${Math.round((now - beat) / 60000)} minutes; filling in the trade checks it missed`); }
    beat = now; await kv.put('kbeat2', now);
  }
  const cpx = o => o == null ? null : o.close_dollars != null ? +o.close_dollars : o.close != null ? o.close / 100 : null;
  async function gapFill(now) {
    if (!gaps || !gaps.length || now - gapAt < 50000) return; gapAt = now;
    // longest stretch first: a real outage runs for hours, a quiet spell where no coin reached 85c is two or three windows
    const g = gaps.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a)), w = Math.ceil((g[0] + 600000) / Q) * Q;   // the first window whose trade check fell inside the gap
    if (w - 600000 > g[1] || w < now - 7 * 86400000) { gaps.splice(gaps.indexOf(g), 1); await kv.put('kgaps', gaps); return; }
    if (w > now) return;
    let n = 0; const why = { nomkt: 0, had: 0, nocandle: 0, noquote: 0, low: 0 }; let smp = '';
    for (const s of activeSeries()) {
      // MC 2026-11-12 the first version asked without a status and Kalshi sent back an empty list for every coin, so the first
      // few windows were passed over with nothing added (the heartbeat key was renamed to make the look-back run again).
      const c = w / 1000; let j = await get(`/markets?series_ticker=${s}&status=settled&min_close_ts=${c - 5}&max_close_ts=${c + 5}&limit=5`);
      if (!(j?.markets || []).length) j = await get(`/markets?series_ticker=${s}&status=closed&min_close_ts=${c - 5}&max_close_ts=${c + 5}&limit=5`);
      const m = (j?.markets || []).find(x => Date.parse(x.close_time) === w); if (!m) { why.nomkt++; if (!smp) smp = 'list ' + JSON.stringify((j?.markets || []).map(x => x.close_time)).slice(0, 120); continue; } if (rec.has(m.ticker)) { why.had++; continue; }
      const t = c - 600, k = await get(`/series/${s}/markets/${m.ticker}/candlesticks?start_ts=${t - 180}&end_ts=${t + 60}&period_interval=1`);
      const cd = (k?.candlesticks || []).filter(x => x.end_period_ts <= t).pop(); if (!cd) { why.nocandle++; if (!smp) smp = 'candles ' + JSON.stringify(k).slice(0, 200); continue; }
      const ya = cpx(cd.yes_ask), yb = cpx(cd.yes_bid); if (!(ya > 0 && ya < 1) || !(yb > 0 && yb < 1)) { why.noquote++; if (!smp) smp = 'quote ' + JSON.stringify(cd).slice(0, 260); continue; }
      const na = +(1 - yb).toFixed(4), side = ya >= na ? 'yes' : 'no', ask = side === 'yes' ? ya : na; if (ask < KEEP_ASK) { why.low++; continue; }
      const r = { ticker: m.ticker, series: s, at: w - 600000, close: w, left: 10, side, ask, depthAtAsk: null, avgN: null, ...detail(m), ya, na, src: 'fill' };
      if (m.result === 'yes' || m.result === 'no') { r.result = m.result; r.won = m.result === side; r.final = fin(m); }
      rec.set(m.ticker, r); saveRec(r); n++;
    }
    if (why.nomkt === activeSeries().length && w > now - 6 * 3600000) { console.log(`gapfill ${new Date(w).toISOString()} no markets listed yet ${smp}`); return; }
    g[0] = w - 599000; await kv.put('kgaps', gaps); viewDirty = true;
    say(`filled in the ${new Date(w - 600000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET trade check: ${n} coin${n === 1 ? '' : 's'} at 85c or more`);
    console.log(`gapfill ${new Date(w).toISOString()} added ${n} ${JSON.stringify(why)} ${smp}`);
  }
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
      try { books.onSettle(r); } catch (e) { say('books settle error: ' + e.message); }
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
    if (stratAt(K.strat, now) === 'look2') for (const r of rec2.values()) {
      if (r.result || now > r.close + 300000 || baseTaken(r.ticker)) continue;
      const px = r.avgN || r.ask, n = Math.floor(K.sizeUsd / px), lp = rec.get(r.ticker)?.path?.at(-1), i = open.findIndex(o => o.tk === r.ticker), o = { late: 1, left: r.left, tk: r.ticker, coin: coin(r.series), side: r.side, px: +px.toFixed(4), ask: r.ask, n, cost: +(n * px + fee(px, n)).toFixed(2), at: r.at, close: r.close, strike: r.strike ?? null, title: r.title || null, yb: lp?.[1] ?? null, ya: lp?.[2] ?? null, last: lp?.[3] ?? null, path: rec.get(r.ticker)?.path || [], z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, pl: null };
      if (i >= 0) open[i] = o; else open.push(o);
    }
    return { at: scanAt || now, open, scan, size: K.sizeUsd, minAsk: K.minAsk, live: liveView(), where: 'cloud' };
  }
  async function publish(save) {
    const kl = JSON.stringify(kliveBody());
    if (viewDirty || !view || Date.now() - viewAt > 120000) { view = JSON.stringify(kalshiView()); viewDirty = false; viewAt = Date.now(); }
    await keep({ klive: kl, kview: view }, false);
  }

  // ---------- notifications ----------
  // MC 2026-11-10 what the phone is told. One message per 15-minute window per account, never one per coin: nine buzzes in a
  // second is noise. "Positions opened" goes out once the window's entries are in. "Settled" waits until every position in the
  // window has its result (or 4 minutes after the close), so the message carries the whole window: how many won, the net, each
  // coin, then the day and the bank. Each trade is marked once it has been reported, and the marks live in storage because
  // memory does not last between minutes. Nothing older than the lookback is sent, so turning notifications on does not replay
  // the day. The worker decides which devices get which message; this only writes them. Wording is plain and exact on purpose.
  let pnT = null, pnBank = null;
  async function events(now = Date.now()) {
    await load(); if (!pnT) kalshiView();
    const seen = (await kv.get('kpn')) || {}, out = [], K = cfgP; let ch = false;
    const mark = k => { seen[k] = now; ch = true; }, usd = v => '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), sg = v => (v < 0 ? '\u2212' : '+') + usd(v);
    const c1 = px => (px * 100).toFixed(1) + '\u00a2', sd = x => x === 'yes' ? 'Yes' : 'No', tm = t => new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET';
    const join = l => l.length > 6 ? l.slice(0, 6).join('  \u00b7  ') + `  \u00b7  and ${l.length - 6} more` : l.join('  \u00b7  '), D = etDay(now);
    const build = (book, label, opens, wins, key, rows, dayNet, bankLine, pbName) => {
      const byW = {}; for (const x of rows) (byW[x.close] = byW[x.close] || []).push(x);
      for (const [cl, w] of Object.entries(byW)) { const close = +cl;
        const o = w.filter(x => !seen[key + 'o' + x.id] && now - x.at < 12 * 60000 && now < close + 60000);
        if (o.length) { const cost = o.reduce((a, x) => a + x.cost, 0); o.forEach(x => mark(key + 'o' + x.id));
          out.push({ book, kind: 'open', tag: key + 'o' + close, url: '/', title: o.length === 1 ? `${label}: position opened` : `${label}: ${o.length} positions opened`,
            body: (o.length === 1 ? `${o[0].coin} ${sd(o[0].side)}, ${o[0].n} contracts at ${c1(o[0].px)}${o[0].late ? ' (second look)' : ''}` : join(o.map(x => `${x.coin} ${sd(x.side)} ${c1(x.px)}`))) + `\nCommitted ${usd(cost)}. Settles ${tm(close)}.` + (pbName ? `\nPlaybook: ${pbName}.` : '') }); }
        const d = w.filter(x => x.done && !seen[key + 's' + x.id] && now - close < 40 * 60000), all = w.every(x => x.done);
        if (d.length && (all || now > close + 4 * 60000)) { const net = d.reduce((a, x) => a + x.pnl, 0), nw = d.filter(x => x.won).length, nl = d.length - nw; d.forEach(x => mark(key + 's' + x.id));
          out.push({ book, kind: 'settle', win: nw > 0, loss: nl > 0, tag: key + 's' + close, url: '/',
            title: d.length === 1 ? `${label}: ${d[0].coin} ${sd(d[0].side)} ${d[0].won ? 'won' : 'lost'}, ${sg(net)}` : nl === 0 ? `${label}: ${nw} of ${nw} won, ${sg(net)}` : nw === 0 ? `${label}: ${nl} of ${nl} lost, ${sg(net)}` : `${label}: ${nw} won, ${nl} lost, ${sg(net)}`,
            body: (d.length === 1 ? `${d[0].n} contracts at ${c1(d[0].px)}, settled ${tm(close)}.` : join(d.slice().sort((a, b) => a.pnl - b.pnl).map(x => `${x.coin} ${sg(x.pnl)}`))) + `\nToday ${sg(dayNet)}. ${bankLine}` }); } }
    };
    // paper: the active playbook's own trades in the current run
    const pt = (pnT || []).filter(t => !t.capped && t.run && now - t.t < 60 * 60000).map(t => ({ id: t.tk, at: t.t, close: t.close, coin: t.coin, side: t.side, px: t.px, n: t.n, cost: t.cost, done: t.done, won: t.won, pnl: t.pnl ?? 0, late: t.late }));
    if (pt.length) { const today = (pnT || []).filter(t => t.done && !t.capped && t.run && etDay(t.close) === D).reduce((a, t) => a + (t.pnl || 0), 0), sid = stratAt(K.strat, now), nm = sid === 'rule' ? 'The rule' : (labDefs(K).find(l => l.id === sid)?.name || null);
      build('paper', 'Paper account', 0, 0, 'p', pt, today, `Bank ${usd(pnBank ?? K.startUsd)}.`, nm); }
    // live: orders that filled, and their results
    const lt = [...L.values()].filter(x => x.fill > 0 && x.px != null && now - x.at < 60 * 60000).map(x => ({ id: x.tk, at: x.at, close: x.close, coin: x.coin, side: x.side, px: x.px, n: x.fill, cost: x.cost ?? x.fill * x.px, done: !!x.result, won: !!x.won, pnl: x.pnl ?? 0 }));
    if (lt.length) { const today = [...L.values()].filter(x => x.result && x.fill > 0 && etDay(x.close) === D).reduce((a, x) => a + (x.pnl || 0), 0), sid = stratAt(ctl().strat, now), nm = sid === 'rule' ? 'The rule' : (labDefs(K).find(l => l.id === sid)?.name || null);
      build('live', 'Live account', 0, 0, 'l', lt, today, st.bal != null ? `Kalshi balance ${usd(st.bal)}.` : '', nm); }
    if (ch) { for (const k of Object.keys(seen)) if (now - seen[k] > 6 * 3600000) delete seen[k]; await kv.put('kpn', seen); }
    return out;
  }

  // ---------- cash out on a turning trend (Steven's request) ----------
  // MC 2026-11-11 at the 10-minute mark of each window (5 minutes left) every trade the rule took gets the trend line the replay
  // draws: a straight line fitted to Coinbase's 1-minute closes from minute 5 to minute 10, signed so + is toward our side, flat
  // inside 0.02% of the target. When it runs against us, the price the contracts would sell for right then is read off Kalshi's
  // order book (the average over 100 contracts, the same depth the buys use) and saved on the trade. Every trade is checked
  // whether the setting is on or not, so the Labs page can show what cashing out would have done against holding. With
  // trendExit on, the paper book books those trades at the sale price, fee included. Paper only: live keeps holding.
  // Second-look entries are left out (most are bought after minute 10). Tried and dropped: a projection to the close; the owner
  // wants the straight 5-to-10 line first and to refine the projection later.
  // the least-squares slope of Coinbase's 1-minute closes from minute 5 to minute 10 of a window, per second; kept a few windows so
  // the cash-out check and the minute-10 prices share one candle request per coin
  const slopes = new Map(), leads = new Map();
  // MC 2026-11-11 Steven (request 5): the slope alone doesn't say whether to cash out; what matters is how much of the lead is
  // left at minute 10. Share of the lead kept = (price at minute 10 - target) / (high from minute 5 to 10 - target) for a YES,
  // mirrored with the low for a NO. His example: high 0.067722, minute 10 0.067497, target 0.067325 gives 43%. The high, low and
  // minute-10 price are the same 1-minute closes the trend line is fitted to. Under the target at minute 10 counts as 0, and so
  // does never having been past it; the share never goes above 1.
  const keepOf = (L, side, strike) => { if (!L || !(strike > 0)) return null; const lead = side === 'yes' ? L.p10 - strike : strike - L.p10, best = side === 'yes' ? L.hi - strike : strike - L.lo; return best > 0 ? +Math.max(0, Math.min(1, lead / best)).toFixed(3) : 0; };
  async function slopeOf(c, closeMs) {
    const key = c + ':' + closeMs; if (slopes.has(key)) return slopes.get(key);
    const close = closeMs / 1000, x0 = close - 900, pid = CBPID[c]; if (!pid) return null;
    let pts = []; try { pts = (await advCandles(pid, x0 + 240, x0 + 600)).map(k => [k[0] + 60, k[4]]).filter(p => p[0] >= x0 + 300 && p[0] <= x0 + 600); } catch (e) { console.log(`trend ${c}: ${e.message}`); return null; }
    if (pts.length < 3) { console.log(`trend ${c}: only ${pts.length} points`); return null; }
    // MC 2026-11-12 request 7: Coinbase sends these candles newest first, so the last point was the minute-5 close, not minute 10.
    // The slope did not care, but the share of the lead kept did: with the trend against the bet, minute 5 is the best price of
    // the stretch, so every such trade read as 100% kept and cash out never sold. Oldest first from here on.
    pts.sort((a, b) => a[0] - b[0]);
    const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n; let sxx = 0, sxy = 0; for (const p of pts) { sxx += (p[0] - mx) ** 2; sxy += (p[0] - mx) * (p[1] - my); }
    const slope = sxx ? sxy / sxx : 0; slopes.set(key, slope); for (const k of slopes.keys()) if (+k.split(':')[1] < closeMs - 2 * Q) { slopes.delete(k); leads.delete(k); }
    const ys = pts.map(p => p[1]); leads.set(key, { hi: Math.max(...ys), lo: Math.min(...ys), p10: ys[ys.length - 1] });
    return slope;
  }
  // MC 2026-11-11 trend checks made before the share-of-the-lead rule have no share saved, so those trades could not be scored
  // under it (they just read as held). The minute prices for those windows are still on Coinbase, so this works the share out
  // after the fact, a few per minute, and the paper book, Labs and the cash-out panel re-score themselves. Three tries each.
  // MC 2026-11-12 request 7: shares saved before the candle order fix (keepV under 2) were read off the wrong minute, so they are
  // worked out again the same way, the fresh ones first.
  const KEEP_V = 2;
  async function keepFill(now) {
    let n = 0;
    const due = [...rec.values()].filter(r => { const x = r.exit; return x && (x.keep == null || (x.keepV || 0) < KEEP_V) && (x.keepTry || 0) < 3 && r.strike > 0 && r.close <= now - 60000; }).sort((a, b) => b.close - a.close);
    for (const r of due) { const x = r.exit; if (++n > 8) break;
      const c = coin(r.series), key = c + ':' + r.close; if (!leads.has(key)) { slopes.delete(key); try { await slopeOf(c, r.close); } catch { } }
      const L = leads.get(key); if (!L) { x.keepTry = (x.keepTry || 0) + 1; saveRec(r); continue; }
      x.keep = keepOf(L, r.side, r.strike); x.keepV = KEEP_V; saveRec(r); viewDirty = true; }
    if (n) console.log(`trend share filled for ${Math.min(n, 8)} earlier checks`);
  }
  async function trendCheck(now) {
    const due = [...rec.values()].filter(r => !r.exit && r.ask >= KEEP_ASK && r.strike > 0 && r.result !== 'void' && r.close - now <= 330000 && r.close - now >= 200000);
    if (!due.length) return;
    const byCoin = {}; for (const r of due) (byCoin[coin(r.series)] = byCoin[coin(r.series)] || []).push(r);
    for (const [c, list] of Object.entries(byCoin)) {
      const slope = await slopeOf(c, list[0].close); if (slope == null) continue;
      for (const r of list) {
        const pct = slope * 300 / r.strike * 100 * (r.side === 'yes' ? 1 : -1), dir = Math.abs(pct) < 0.02 ? 0 : pct > 0 ? 1 : -1, x = { at: now, pct: +pct.toFixed(4), dir, keep: keepOf(leads.get(c + ':' + r.close), r.side, r.strike), keepV: KEEP_V };
        if (dir < 0) { try { const b = bids(await get(`/markets/${r.ticker}/orderbook`)), mine = r.side === 'yes' ? b.yes : b.no; if (mine.length) { x.best = mine[0][0]; const avg = walk(mine, BOOK_N); x.px = +(avg ?? mine[0][0]).toFixed(4); x.depth = mine.reduce((a, q) => a + q[1], 0); } } catch (e) { console.log(`trend ${r.ticker}: book ${e.message}`); } }
        r.exit = x; saveRec(r); viewDirty = true;
        console.log(`trend ${c} ${r.side} ${pct >= 0 ? '+' : ''}${pct.toFixed(3)}% ${dir > 0 ? 'with' : dir < 0 ? 'against, bid ' + (x.px != null ? (x.px * 100).toFixed(1) + 'c' : 'none') : 'flat'}${x.keep != null ? ` kept ${Math.round(x.keep * 100)}%` : ''}`);
      }
    }
  }
  // what cashing out would have done against holding, on every settled rule trade that was checked, at the saved size
  function trendStats(K) {
    const S = { keep: K.trendKeep ?? 50, since: null, n: 0, with: { n: 0, won: 0 }, flat: { n: 0, won: 0 }, mild: { n: 0, won: 0 }, against: { n: 0, heldWon: 0, holdNet: 0, cashNet: 0, noBid: 0 } };
    for (const r of rec.values()) { const x = r.exit; if (!x || !r.result || r.result === 'void' || !(r.ask >= K.minAsk)) continue; S.n++; S.since = S.since == null ? r.close : Math.min(S.since, r.close);
      if (x.dir > 0) { S.with.n++; if (r.won) S.with.won++; } else if (x.dir === 0) { S.flat.n++; if (r.won) S.flat.won++; } else if (!(x.keep != null && x.keep * 100 < S.keep)) { S.mild.n++; if (r.won) S.mild.won++; }
      else { const a = S.against, px = r.avgN || r.ask, k = Math.floor(K.sizeUsd / px), cost = k * px + fee(px, k); a.n++; if (r.won) a.heldWon++; a.holdNet += (r.won ? k : 0) - cost; if (x.px == null) { a.noBid++; a.cashNet += (r.won ? k : 0) - cost; } else a.cashNet += k * x.px - fee(x.px, k) - cost; } }
    S.against.holdNet = +S.against.holdNet.toFixed(2); S.against.cashNet = +S.against.cashNet.toFixed(2); return S;
  }

  // ---------- second look ----------
  const baseTaken = tk => { const b = rec.get(tk); return !!(b && b.ask >= cfgP.minAsk && b.result !== 'void' && b.vol?.z >= 1); };
  // MC 2026-11-10 asked the same evening: "9 coins passed this round, did the recheck take them?" There was nowhere to see it.
  // Each minute's verdict per coin is now kept (the latest one per market, last few windows) and shown on the Labs page: bought,
  // or the reason it was not (price outside 91c to 95c, not far enough past the target, no current price).
  let l2log = null;
  async function secondLook(now, out) {
    if (!l2log) l2log = (await kv.get('kl2')) || {};
    let n = 0, touched = false; const note = (o, side, ask, left, why, took) => { l2log[o.tk] = { coin: o.coin, close: o.close, side, ask, left: +left.toFixed(1), why, took: !!took, at: now }; touched = true; };
    for (const o of out) {
      const left = (o.close - now) / 60000; if (left > MIN_LEFT - 1 || left < L2_MIN_LEFT) continue;
      if (rec2.has(o.tk)) continue;
      if (baseTaken(o.tk)) { note(o, rec.get(o.tk).side, rec.get(o.tk).ask, left, 'held', false); continue; }
      if (!(o.strike > 0) || o.lask == null) continue;
      if (!(o.lask >= L2_LO && o.lask <= L2_HI)) { note(o, o.leader, o.lask, left, o.lask > L2_HI ? 'over' : 'under', false); continue; }
      if (++n > 4) break;   // at most four coins a minute: each costs an order book and a price
      const b = book(await get(`/markets/${o.tk}/orderbook`)), ya = b.yesAsks[0]?.[0], na = b.noAsks[0]?.[0]; if (ya == null || na == null) continue;
      const side = ya >= na ? 'yes' : 'no', asks = side === 'yes' ? b.yesAsks : b.noAsks, ask = asks[0][0]; if (!(ask >= L2_LO && ask <= L2_HI)) { note(o, side, ask, left, ask > L2_HI ? 'over' : 'under', false); continue; }
      const v = await volAt(o.coin, o.strike, side); console.log(`look2 ${o.coin} ${side} ${Math.round(ask * 100)}c ${left.toFixed(1)} min left: ${!v ? 'no reading' : v.src === 'stale' ? 'stale price' : v.z + ' moves clear'}`);
      if (!v || v.src === 'stale') { note(o, side, ask, left, 'noprice', false); continue; }
      if (!(v.z >= 1)) { note(o, side, ask, left, 'close:' + v.z, false); continue; }
      const avgN = walk(asks, BOOK_N), series = activeSeries().find(x => coin(x) === o.coin) || rec.get(o.tk)?.series;
      const r = { ticker: o.tk, late: 1, series, at: now, close: o.close, left: +left.toFixed(2), side, ask, depthAtAsk: asks[0][1], avgN: avgN == null ? null : +avgN.toFixed(4), strike: o.strike, title: rec.get(o.tk)?.title || null, ya, na, depth: asks.reduce((a, x) => a + x[1], 0), vol: v, src: 'cloud' };
      rec2.set(o.tk, r); saveRec2(r); viewDirty = true; note(o, side, ask, left, 'bought:' + v.z, true); say(`${o.tk} ${side.toUpperCase()} at ${Math.round(ask * 100)}c <- second look, ${left.toFixed(1)} min left`);
    }
    const inWin = out.filter(o => { const l = (o.close - now) / 60000; return l <= MIN_LEFT - 1 && l >= L2_MIN_LEFT; }); if (inWin.length) console.log(`look2 minute: ${inWin.length} coins, prices ${inWin.map(o => o.coin + ' ' + (o.lask == null ? '-' : Math.round(o.lask * 100))).join(', ')}; read ${n}`);
    if (touched) { for (const k of Object.keys(l2log)) if (l2log[k].close < now - 4 * Q) delete l2log[k]; await kv.put('kl2', l2log); viewDirty = true; }
  }
  // MC 2026-11-11 asked whether the trend line could decide the buy itself. It can't at the 10-minutes-left mark: the line runs
  // from minute 5 to minute 10, after that buy. So this tests buying later instead: at minute 10 (5 minutes left), every coin's
  // leader is priced from Kalshi's order book (the average over 100 contracts, same as every buy) next to its trend line, whether
  // or not anything was bought at the mark. The Wait for the trend lab buys the ones priced at least the minimum price and at most
  // 98c whose line runs with the bet or is flat, and settles them like second-look entries. Nothing is bought for real or on
  // paper; it is Labs only, so there is something to judge it on. Higher prices at minute 10 mean smaller wins, which is the
  // question it answers. Up to 9 order books a window, one per coin.
  async function minute10(now, out) {
    for (const o of out) {
      const left = o.close - now; if (left > 330000 || left < 200000 || rec3.has(o.tk) || !(o.strike > 0)) continue;
      const slope = await slopeOf(o.coin, o.close); if (slope == null) continue;
      let b; try { b = book(await get(`/markets/${o.tk}/orderbook`)); } catch (e) { console.log(`m10 ${o.coin}: ${e.message}`); continue; }
      const ya = b.yesAsks[0]?.[0], na = b.noAsks[0]?.[0]; if (ya == null || na == null) continue;
      const side = ya >= na ? 'yes' : 'no', asks = side === 'yes' ? b.yesAsks : b.noAsks, ask = asks[0][0], avgN = walk(asks, BOOK_N);
      const pct = slope * 300 / o.strike * 100 * (side === 'yes' ? 1 : -1), dir = Math.abs(pct) < 0.02 ? 0 : pct > 0 ? 1 : -1, m = rec.get(o.tk);
      const r = { ticker: o.tk, m10: 1, series: activeSeries().find(x => coin(x) === o.coin) || m?.series, at: now, close: o.close, side, ask, avgN: avgN == null ? null : +avgN.toFixed(4), ya, na, strike: o.strike, pct: +pct.toFixed(4), dir, mark: m ? { side: m.side, ask: m.ask } : null };
      rec3.set(o.tk, r); saveRec3(r); viewDirty = true;
      console.log(`m10 ${o.coin} ${side} ${Math.round(ask * 100)}c trend ${pct >= 0 ? '+' : ''}${pct.toFixed(3)}% ${dir > 0 ? 'with' : dir < 0 ? 'against' : 'flat'}`);
    }
    { const old = []; for (const [k, r] of rec3) if (r.close < now - 21 * 86400000) old.push(k); if (old.length) { for (const k of old) rec3.delete(k); dropT('k3', old); } }
  }
  async function settle3(now) {
    let k = 0;
    for (const r of rec3.values()) {
      if (r.result || now < r.close + 60000) continue;
      const b = rec.get(r.ticker) || rec2.get(r.ticker); let res = b?.result;
      if (!res) { if (++k > 6) break; const j = await get(`/markets/${r.ticker}`); res = j?.market?.result; }
      if (res !== 'yes' && res !== 'no') { if (res === 'void' || now > r.close + 6 * 3600000) { r.result = 'void'; saveRec3(r); viewDirty = true; } continue; }
      r.result = res; r.won = res === r.side; saveRec3(r); viewDirty = true;
    }
  }
  async function settle2(now) {
    let k = 0;
    for (const r of rec2.values()) {
      if (r.result || now < r.close + 60000) continue;
      const b = rec.get(r.ticker); let res = b?.result, fin0 = b?.final;
      if (!res) { if (++k > 6) break; const j = await get(`/markets/${r.ticker}`); res = j?.market?.result; if (j?.market) fin0 = fin(j.market); }
      if (res !== 'yes' && res !== 'no') { if (res === 'void' || now > r.close + 6 * 3600000) { r.result = 'void'; saveRec2(r); viewDirty = true; } continue; }
      r.result = res; r.won = res === r.side; r.final = fin0 ?? null; saveRec2(r); viewDirty = true; say(`settled ${r.ticker} (second look): ${r.won ? 'won' : 'LOST'}`);
    }
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
  // Up to forty a minute from the cron tick (most need no request now), five minutes off after a 429 without using up a try, kept away from the trade check, three tries each.
  let fixAt = 0;
  async function volRepair(now, max = 40) {
    if (now - fixAt < 50000) return; fixAt = now;
    const sus = [], none = [], old = [], rest = [];
    for (const r of rec.values()) { const v = r.vol;
      // no reading at all (Coinbase did not answer at the check): rebuild it from history, within the last week
      if (!v) { if (r.ask >= KEEP_ASK && r.strike > 0 && (r.vrt || 0) < 3 && r.at < now - 120000 && r.at > now - 7 * 86400000) none.push(r); continue; }
      if ( (v.age != null && v.src !== 'stale') || v.chk || v.fixed || (v.rt || 0) >= 3 || !(r.strike > 0) || r.at > now - 120000) continue;
      const zz = v.z10 ?? v.z; if (v.src === 'stale' || (zz != null && winP(zz) < (r.avgN || r.ask) - 0.15)) sus.push(r); else if (v.z10 == null) old.push(r); else rest.push(r); }
    const todo = [...sus.sort((a, b) => b.at - a.at), ...none.sort((a, b) => b.at - a.at), ...rest.sort((a, b) => b.at - a.at), ...old.sort((a, b) => b.at - a.at)].slice(0, max); if (!todo.length) return;
    let fixed = 0; CCB = 4;
    for (const r of todo) {
      const v = r.vol;
      try {
        const n = await volPast(coin(r.series), r.strike, r.side, r.at);
        if (!v) { if (n) { r.vol = { ...n, fixed: 1 }; delete r.lp; fixed++; } else r.vrt = (r.vrt || 0) + 1; saveRec(r); viewDirty = true; continue; }
        if (!n) { v.rt = (v.rt || 0) + 1; if (v.rt >= 3) v.chk = 1; saveRec(r); continue; }
        const typ = n.sigma10 || n.sigma * Math.sqrt(10), moved = Math.abs(n.margin - v.margin) > typ / 3;
        if (moved) { r.vol = { ...n, fixed: 1, was: { px: v.px, margin: v.margin, z: v.z, z10: v.z10 ?? null } }; delete r.lp; fixed++; }
        else r.vol = { ...v, sigma15: v.sigma15 ?? n.sigma15, drift: v.drift ?? n.drift, z2: v.z2 ?? n.z2, sigma10: v.sigma10 ?? n.sigma10, z10: v.z10 ?? (n.sigma10 > 0 ? +(v.margin / n.sigma10).toFixed(2) : null), chk: 1 };
        saveRec(r); viewDirty = true;
      } catch (e) { if (e.status === 'budget') break; console.log(`repair ${r.ticker}: ${e.message}`); if (e.status === 429) fixAt = now + 5 * 60000; else { if (v) v.rt = (v.rt || 0) + 1; else r.vrt = (r.vrt || 0) + 1; saveRec(r); } break; }
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
    // MC 2026-11-10 within a window the clearest coins come first (most moves past the target), so when profit protection limits
    // how much a window may stake, it is the strongest trades that get the room
    const byClear = (a, b) => a.at - b.at || ((b.vol?.z ?? -9) - (a.vol?.z ?? -9));
    const K = cfgP, rows = [...rec.values()].sort(byClear), sum = l => +l.reduce((a, t) => a + t.pnl, 0).toFixed(2);
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
    // MC 2026-11-10 second-look entries join the paper book only while "Margin vs volatility + second look" is the playbook, in
    // time order with the mark trades. They never count toward the window tallies, the cold-coin history, Kelly or the rule's
    // own analytics, and one whose market the mark trade already holds is dropped.
    const lates = [...rec2.values()].filter(r => r.result !== 'void' && stratAt(K.strat, r.at) === 'look2' && !baseTaken(r.ticker));
    const rowsAll = lates.length ? [...rows, ...lates].sort(byClear) : rows, lockRem = {}, wSnap = {}, tookW = {}, ifW = {}, wCap = K.winCap ?? 9;
    for (const r of rowsAll) {
      const late = !!r.late;
      if (!(r.ask >= K.minAsk) && !late || r.result === 'void') continue;
      if (!late && r.ask > (K.maxAsk ?? 0.99) + 1e-9) continue;
      // MC 2026-11-11 the run's first day starts from zero too. The daily stops used to count the whole ET day, including trades
      // from before the run, so a run started at 2:59 PM after a morning down $160 was stopped the moment it began once the loss
      // stop was lowered to $150 (and saving re-books the whole log, so the owner's Nov 10 run lost every trade overnight).
      if (!runOn && r.at >= runFrom) { runOn = true; bal = K.startUsd; peak = bal; ddRef = bal; maxDd = 0; balU = K.startUsd; eq.length = 0; eq.push([runFrom, bal]); const d0 = etDay(runFrom); dayNet[d0] = 0; dayPeak[d0] = 0; delete stopDay[d0]; for (const k of Object.keys(wSnap)) if (+k > runFrom) delete wSnap[k]; }
      const inRun = runOn;
      const w = r.close; if (!late) perWin[w] = (perWin[w] || 0) + 1;
      // MC 2026-11-09 two more stops beside the daily loss cap, both for keeping profit already made. Give-back: once today's
      // profit has reached giveBackMin, stop for the day if it falls to giveBackPct of today's peak. Bank drawdown: stop for the
      // day once the bank is bankDdPct under its all-time high. Each stays on for the rest of that ET day once it trips.
      const dk = etDay(r.close); if (dayPeak[dk] == null) dayPeak[dk] = 0;
      // MC 2026-11-11 every stop reads the day as it stood when the window opened. All of a window's coins are bought at the same
      // moment, before any of them settles, but the book used to apply the day's result coin by coin, so a stop could skip the
      // third coin because the first two lost: knowledge the real tracker never has. It flattered tight stops in the backtests.
      const ws = wSnap[w] || (wSnap[w] = { net: dayNet[dk] || 0, peak: dayPeak[dk], bal });
      const gb = K.giveBackPct > 0 && (stopDay[dk] === 'giveback' || (ws.peak >= (K.giveBackMin ?? 25) && ws.net <= ws.peak * K.giveBackPct / 100));
      // MC 2026-11-09 the drawdown stop measures against its own reference high, not the all-time peak: the day after it trips
      // the reference resets to the bank as it stands, or a bank that fell under the line could never trade its way back (the
      // smoke test showed 13 trades in four months with the all-time peak as the line)
      if (ddRef == null) ddRef = bal; if (ddLastDay && ddLastDay !== dk && stopDay[ddLastDay] === 'bankdd') ddRef = bal; ddLastDay = dk; ddRef = Math.max(ddRef, bal);
      const bd = K.bankDdPct > 0 && (stopDay[dk] === 'bankdd' || ws.bal <= ddRef * (1 - K.bankDdPct / 100));
      // MC 2026-11-10 daily profit lockout (request R-2): once the day is up by dailyWinUsd, the rest of the day is skipped
      const tw = K.dailyWinUsd > 0 && ws.net >= K.dailyWinUsd;
      const haltWhy = K.dailyLossUsd > 0 && ws.net <= -K.dailyLossUsd ? 'daily' : tw ? 'target' : gb ? 'giveback' : bd ? 'bankdd' : null, halted = !!haltWhy;
      if (haltWhy && haltWhy !== 'daily' && !stopDay[dk]) stopDay[dk] = haltWhy;
      const c30 = K.coldDays > 0 ? net30(coin(r.series), r.at) : { x: 0, k: 0 }, cold = K.coldDays > 0 && c30.x < 0;
      const px = r.avgN || r.ask, sid = stratAt(K.strat, r.at), lab = sid === 'rule' ? null : labs0.find(l => l.id === sid);
      while (kI < kQ.length && kQ[kI].close <= r.at) { kAdd(kS, kQ[kI].px, kQ[kI].won); kI++; }
      const ko = kOf(kS, px);
      const f = late ? true : lab ? lab.filter({ px, win: winN[w], same: sameN[w + r.side], z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, kf: ko.kf, pl: r.lp ?? null }) : true, strat = f !== true ? sid : null;
      const sizeUsd = lab?.size ? lab.size(bal, { kf: ko.kf, win: winN[w] }, { peak, start: K.startUsd }) : K.sizeUsd;
      const off = (K.skipHours || []).includes(etHour(r.at)), capped0 = (!late && perWin[w] > K.maxPerWindow) || halted || (cold && !late) || off || !!strat;
      // MC 2026-11-10 protect today's profit (Steven's request). Once the day's high reaches lockAt, a window may stake no more than
      // today's profit minus lockKeep% of the day's high, so the worst a window can do is take the day back to that floor (keep 0:
      // back to even). The budget is fixed when the window's first trade comes up and shared across its coins, clearest first; a
      // coin that does not fit in full is bought smaller, and one that cannot buy a single contract is skipped. Tested on the
      // four-month history with a $200 target, starting at $100 and keeping 0%: more green days on every playbook; more profit on
      // Margin vs volatility and v2, much less on the plain rule (it stakes many coins a window and runs out of budget). Off by default.
      let lockCut = false, szUse = sizeUsd;
      if (K.lockAt > 0 && !capped0) { if (lockRem[w] == null) lockRem[w] = ws.peak >= K.lockAt ? ws.net - ws.peak * (K.lockKeep || 0) / 100 : Infinity; if (lockRem[w] < px + fee(px, 1)) lockCut = true; else szUse = Math.min(sizeUsd, lockRem[w]); }
      const wcap = !late && !capped0 && !lockCut && (tookW[w] || 0) >= wCap; if (!late && !capped0 && !lockCut && !wcap) tookW[w] = (tookW[w] || 0) + 1;
      // MC 2026-11-12 asked to see what a day would have come to if trading had gone on past a stop (daily loss, profit target,
      // give-back, bank drawdown, protect profit). A trade skipped only because of a stop is scored as if it had been taken, at
      // full size, if the playbook, schedule, bench and window cap would all have let it through. Nothing else changes: the bank
      // and the day's total still stop where the stop stopped them.
      const stopSk = !late && (halted || lockCut) && !strat && !off && !cold && !(perWin[w] > K.maxPerWindow) && (tookW[w] || 0) + (ifW[w] || 0) < wCap; if (stopSk) ifW[w] = (ifW[w] || 0) + 1;
      const capped = capped0 || lockCut || wcap, n = Math.floor(szUse / px), cost = +(n * px + fee(px, n)).toFixed(2);
      if (!capped && isFinite(lockRem[w] ?? Infinity)) lockRem[w] -= cost;
      const t = { stopSk: stopSk ? 1 : 0, wcap: wcap ? 1 : 0, lock: lockCut ? 1 : 0, lockSz: !capped && szUse < sizeUsd ? +szUse.toFixed(2) : null, late: late ? 1 : 0, mk: r.ticker, tk: late ? r.ticker + ':2' : r.ticker, t: r.at, close: r.close, coin: coin(r.series), side: r.side, px: +px.toFixed(3), n, cost, capped, halted, haltWhy, off, run: inRun, done: !!r.result, won: !!r.won, pnl: null, strat, stratWhy: strat ? (f === null ? (sid === 'learn' ? 'no model reading' : 'no volatility reading') : sid === 'kelly' ? 'Kelly: no edge at this price yet' : lab.name) : null, book: sid,
        left: r.left, ask: r.ask, ya: r.ya ?? null, na: r.na ?? null, dAsk: r.depthAtAsk ?? null, depth: r.depth ?? null, bookAvg: r.avgN != null, fee: fee(px, n),
        title: r.title || null, sub: r.sub || null, kq: ko.kq, kf: ko.kf, kn: ko.kn, strike: r.strike ?? null, final: r.final ?? null, res: r.result || null, cold, net30: +c30.x.toFixed(2), path: thin(late ? rec.get(r.ticker)?.path : r.path), z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, vpx: r.vol?.px ?? null, vmg: r.vol?.margin ?? null, vage: r.vol?.age ?? null, vsrc: r.vol?.src ?? null, vfix: r.vol?.fixed ? 1 : 0, vwas: r.vol?.was?.margin ?? null, vsg: r.vol?.sigma ?? null, vsg15: r.vol?.sigma15 ?? null, vdr: r.vol?.drift ?? null, z10: r.vol?.z10 ?? null, vsg10: r.vol?.sigma10 ?? null, pl: r.lp ?? null };
      if (r.result && !late) { let i = kQ.length; while (i > kI && kQ[i - 1].close > r.close) i--; kQ.splice(i, 0, { close: r.close, px, won: !!r.won }); }
      if (stopSk && r.result) { const nf = Math.floor(sizeUsd / px); t.ifPnl = +((r.won ? nf : 0) - nf * px - fee(px, nf)).toFixed(2); }
      if (r.result && !late) { const n50 = Math.floor(50 / px); H.push({ coin: t.coin, close: r.close, pnl: (r.won ? n50 : 0) - n50 * px - fee(px, n50) }); const nr = Math.floor(K.sizeUsd / px); t.rulePnl = +((r.won ? nr : 0) - nr * px - fee(px, nr)).toFixed(2); }
      // MC 2026-11-11 Steven (request 5): sell only when the line runs against the bet AND less than trendKeep percent of the lead
      // is left at minute 10 (see keepOf). Replaces the "past 0.15%" slope test from this morning, which sold trades that still
      // held most of their lead. Checks recorded before this have no share saved and are held.
      const steep = r.exit?.dir < 0 && r.exit.keep != null && r.exit.keep * 100 < (K.trendKeep ?? 50);
      const cashed = !!(K.trendExit && !late && steep && r.exit.px != null && r.at < r.exit.at);
      if (cashed) { t.cashed = 1; t.exitPx = r.exit.px; t.exitPct = r.exit.pct; t.heldWon = r.result ? !!r.won : null; t.done = true; t.won = n * r.exit.px - fee(r.exit.px, n) - cost > 0; }
      if (r.exit) { t.trend = r.exit.dir; t.trendPct = r.exit.pct; t.keep = r.exit.keep ?? null; }
      // MC 2026-11-11 the Labs cash-out switch needs every trade's sale price whether or not the setting is on, plus how it would
      // have ended if held, so each playbook can be replayed both ways. xPx is set only when the trend turned against the bet
      // after the buy; fin and hw are the settled result untouched by a paper cash-out.
      t.xPx = !late && steep && r.exit.px != null && r.at < r.exit.at ? r.exit.px : null; t.fin = !!r.result; t.hw = !!r.won;
      if (!capped && (r.result || cashed)) { t.pnl = +(cashed ? n * r.exit.px - fee(r.exit.px, n) - cost : (r.won ? n : 0) - cost).toFixed(2); dayNet[dk] = (dayNet[dk] || 0) + t.pnl; dayPeak[dk] = Math.max(dayPeak[dk], dayNet[dk]); if (inRun) { bal += t.pnl; peak = Math.max(peak, bal); maxDd = Math.max(maxDd, peak - bal); eq.push([r.close, +bal.toFixed(2)]); } }
      if (r.result && inRun) balU += (r.won ? n : 0) - cost;
      if (!capped && !r.result) open += cost;
      trades.push(t);
    }
    const grpW = {}; for (const t of trades) { if (t.late) continue; const g = t.close + t.side; grpW[g] = (grpW[g] || 0) + 1; } for (const t of trades) { t.same = grpW[t.close + t.side] || 1; t.win = perWin[t.close] || 1; }
    // every second-look entry as a bare trade for the Labs line, whichever playbook the paper book is on
    const lateT = [...rec2.values()].filter(r => r.result !== 'void').map(r => { const px = r.avgN || r.ask; return { late: 1, bTaken: baseTaken(r.ticker), tk: r.ticker, t: r.at, close: r.close, coin: coin(r.series), side: r.side, px: +px.toFixed(3), done: !!r.result, won: !!r.won, z: r.vol?.z ?? null, win: 1, same: 1, off: (K.skipHours || []).includes(etHour(r.at)) }; });
    const m10T = [...rec3.values()].filter(r => r.result !== 'void').map(r => ({ m10: 1, tk: r.ticker + ':10', t: r.at, close: r.close, coin: coin(r.series), side: r.side, px: +(r.avgN || r.ask).toFixed(3), done: !!r.result, won: !!r.won, dir: r.dir, pct: r.pct, z: null, win: 1, same: 1, off: (K.skipHours || []).includes(etHour(r.at)) }));
    const labs = runLabs(trades, K, lateT, m10T);
    pnT = trades; pnBank = bal;
    const doneAll = trades.filter(t => t.done && !t.capped), done = doneAll.filter(t => t.run), today = done.filter(t => etDay(t.close) === etDay(Date.now()));
    // MC 2026-11-12 today's taken paper trades in the worker log every 10 minutes, so a day's total can be checked from the tail
    // without the dashboard (the paper day went to -$65 after the outage fill-in and needed checking)
    if (Date.now() - dayLogAt > 600000) { dayLogAt = Date.now(); console.log('daylog ' + JSON.stringify({ cap: K.winCap, strat: K.strat?.at?.(-1) ?? K.strat, net: sum(today), n: today.length, t: today.map(t => [t.tk.replace(/^KX|15M-\d+/g, ''), t.side[0], t.px, t.won ? 1 : 0, t.pnl, rec.get(t.mk)?.src === 'fill' ? 'F' : '', rec.get(t.mk)?.vol?.z ?? null, new Date(t.close).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })]) })); }
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
    const dayMap = {}; for (const t of trades) { if (t.capped && !t.halted && t.ifPnl == null) continue; const k = etDay(t.close); const d = dayMap[k] = dayMap[k] || { d: k, n: 0, won: 0, net: 0, low: 0, run: 0, halted: false, skipped: 0, stopN: 0, stopNet: 0 }; if (t.ifPnl != null && t.run) { d.stopN++; d.stopNet = +(d.stopNet + t.ifPnl).toFixed(2); } if (t.capped && !t.halted) continue; if (t.halted) { d.halted = true; d.haltWhy = d.haltWhy || t.haltWhy || 'daily'; d.skipped++; continue; } if (!t.done) continue; d.n++; if (t.won) d.won++; d.run = +(d.run + t.pnl).toFixed(2); d.net = d.run; d.low = Math.min(d.low, d.run); }
    const daily = Object.values(dayMap).sort((a, b) => a.d < b.d ? -1 : 1).slice(-21).map(({ run, ...d }) => ({ ...d, ifNet: d.stopN ? +(d.net + d.stopNet).toFixed(2) : null }));
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
    // MC 2026-11-11 Analytics gets every paper trade, not just the current run, each flagged with whether it is in the run.
    // Settings always said earlier trades stay in Analytics, but this sent the run only, so starting a new run emptied the
    // daily P&L and the calendar of every day before it.
    const all = doneAll.slice(-4000).map(t => [t.close, t.coin, t.side, t.px, t.n, t.pnl, t.won ? 1 : 0, t.run ? 1 : 0]);
    return {
      byHour, bySide, byPx, bySame, sameMin, daily, roll, breakEven, halves, checks, all, live: { at: scanAt, scan, live: liveView() }, keys, wr300: +(wr300 * 100).toFixed(1), worstDay, dd: +(peak - bal).toFixed(2),
      bounds: BOUNDS, coinsAll: COINS, cfg: K, balance: +bal.toFixed(2), net: +(bal - K.startUsd).toFixed(2), inPlay: +open.toFixed(2), maxDd: +maxDd.toFixed(2),
      n: done.length, won: done.filter(t => t.won).length, today: { n: today.length, won: today.filter(t => t.won).length, net: sum(today),
        // MC 2026-11-10 what the playbook passed on today and how those would have gone, so a filter can be judged at a glance
        ...(() => { const ps = trades.filter(t => t.strat && t.run && etDay(t.close) === etDay(Date.now())), pd = ps.filter(t => t.done); return { passed: ps.length, pWon: pd.filter(t => t.won).length, pLost: pd.filter(t => !t.won).length }; })(),
        ...(() => { const sk = trades.filter(t => t.ifPnl != null && t.run && etDay(t.close) === etDay(Date.now())); if (!sk.length) return {}; const x = +sk.reduce((a, t) => a + t.ifPnl, 0).toFixed(2); return { stop: { n: sk.length, won: sk.filter(t => t.ifPnl > 0).length, net: x, ifNet: +(sum(today) + x).toFixed(2) } }; })() },
      avg: done.length ? +(sum(done) / done.length).toFixed(2) : 0, streak, uncappedNet: +(balU - K.startUsd).toFixed(2), capped: trades.filter(t => t.capped).length,
      runFrom: runFrom || null, runN: done.length, prevN: doneAll.length - done.length, worstWin: Math.max(0, ...Object.values(winLoss)), halts: trades.filter(t => t.halted).length, seen, rule, since: (runFrom ? (done[0]?.t || runFrom) : rows[0]?.at) || null, last: rows[rows.length - 1]?.at || null,
      under: { n: under.length, won: under.filter(r => r.won).length, c: under.length ? +(under.reduce((a, r) => a + (r.pnl1 || 0), 0) / under.length * 100).toFixed(2) : 0 },
      eq: eq.filter((x, i) => i % step === 0 || i === eq.length - 1), byCoin: Object.values(byCoin).sort((a, b) => b.net - a.net), room: roomOf(rows, K),
      cold: K.coldDays > 0 ? Object.fromEntries([...new Set(trades.map(t => t.coin))].map(c => [c, +net30(c, Date.now()).x.toFixed(2)])) : null, coldSkips: trades.filter(t => t.cold).length,
      look2: Object.entries(l2log || {}).map(([tk, x]) => ({ tk, ...x, res: rec2.get(tk)?.result || rec.get(tk)?.result || null, won: rec2.get(tk)?.result ? !!rec2.get(tk).won : null, final: rec.get(tk)?.result ? (rec.get(tk).result === x.side) : null })).sort((a, b) => b.close - a.close || (a.coin < b.coin ? -1 : 1)), trendx: trendStats(K), volfix: (() => { let fixed = 0, left = 0; for (const r of rec.values()) { const v = r.vol; if (v?.fixed) fixed++; else if (v ? ((v.age == null || v.src === 'stale') && !v.chk && (v.rt || 0) < 3) : (r.ask >= KEEP_ASK && r.strike > 0 && (r.vrt || 0) < 3 && r.at > Date.now() - 7 * 86400000)) left++; } return { fixed, left }; })(), learn: learnView(trades, K), pending: trades.filter(t => !t.done && !t.capped).slice(-12), recent: trades.filter(t => t.done || t.capped).slice(-60).reverse(), where: 'cloud', logs: logs.slice(-20), labs,
      playbook: { id: stratAt(K.strat, Date.now()), since: stratSince(K.strat, Date.now()), log: (K.strat || []).slice(-12), stratSkips: trades.filter(t => t.strat).length } };
  }

  // ---------- Labs: each idea as its own paper account over the same trades ----------
  // filter(t) returns true (take), false (skip) or null (can't tell yet: the lab starts at its first decidable trade and such
  // trades are left out of both the lab and its rule comparison). size(bank) returns the stake; the rule's own is fixed.
  // MC 2026-11-12 room in the book, per coin, over the last 30 days of qualifying marks: contracts resting at the best price
  // (median), and what 100, 250 and 500 contracts cost over that price in cents. ok = share of marks where the book held that
  // many at all. The 250 and 500 columns count only marks logged since those sizes were recorded.
  function roomOf(rows, K) {
    const cut = Date.now() - 30 * 86400000, by = {};
    for (const r of rows) { if (!(r.ask >= K.minAsk) || r.at < cut || r.result === 'void' || r.src === 'fill') continue; const b = by[coin(r.series)] || (by[coin(r.series)] = { coin: coin(r.series), d: [], s: { 100: [0, 0, 0], 250: [0, 0, 0], 500: [0, 0, 0] } });
      if (r.depthAtAsk != null) b.d.push(r.depthAtAsk);
      for (const [n, a] of [[100, r.avgN], [250, r.a250], [500, r.a500]]) { if (a === undefined) continue; const x = b.s[n]; x[0]++; if (a != null) { x[1]++; x[2] += (a - r.ask) * 100; } } }
    return Object.values(by).map(b => { b.d.sort((x, y) => x - y); const o = { coin: b.coin, n: b.d.length, med: b.d.length ? Math.round(b.d[b.d.length >> 1]) : null };
      for (const n of [100, 250, 500]) { const x = b.s[n]; o['n' + n] = x[0]; o['ok' + n] = x[0] ? +(x[1] / x[0]).toFixed(3) : null; o['c' + n] = x[1] ? +(x[2] / x[1]).toFixed(2) : null; } return o; }).sort((a, b) => (b.med ?? 0) - (a.med ?? 0));
  }
  function runLabs(tradesIn, K, lateT = [], m10T = []) {
    const LABS = labDefs(K), plain = tradesIn.filter(t => !t.late), withLate = lateT.length ? [...plain, ...lateT].sort((a, b) => a.t - b.t) : plain;
    const todayK = etDay(Date.now());
    // MC 2026-11-11 cash, when set, sells every trade whose trend turned against it at the minute-10 bid (the Cash out when the
    // trend turns setting) and holds the rest; unset, every trade is held to settlement. Either way the result does not depend on
    // what the paper setting is, so the Labs switch shows both before the setting goes on.
    const sim = (lab, from, baseline, cash = false) => {
      let bank = K.startUsd, peak = bank, dd = 0, n = 0, won = 0, sk = 0, skNet = 0; const day = {}, dayPk = {}, stopD = {}, eq = [], td = { n: 0, won: 0, net: 0 }, lockR = {}, wS = {}, tw = {}, wCap = K.winCap ?? 9; let ddRef = bank, ddLast = null;
      const trades = lab.m10Only && !baseline ? m10T : lab.late && !baseline ? withLate : plain;
      for (const t of trades) {
        const cx = cash && !t.late && t.xPx != null, held = t.hw ?? t.won;
        if (!(cx || (t.fin ?? t.done)) || t.close < from) continue;
        if (t.win > K.maxPerWindow || t.off) continue;
        const f = baseline ? true : lab.filter(t); if (f == null) continue;
        const dk = etDay(t.close), ws = wS[t.close] || (wS[t.close] = { net: day[dk] || 0, pk: dayPk[dk] || 0, bank });   // the day as the window opened
        if (K.dailyLossUsd > 0 && ws.net <= -K.dailyLossUsd) continue;
        if (stopD[dk]) continue; if (dayPk[dk] == null) dayPk[dk] = 0;
        if (ddLast && ddLast !== dk && stopD[ddLast] === 'bankdd') ddRef = bank; ddLast = dk; ddRef = Math.max(ddRef, bank);
        if (K.dailyWinUsd > 0 && ws.net >= K.dailyWinUsd) continue;
        if (K.giveBackPct > 0 && ws.pk >= (K.giveBackMin ?? 25) && ws.net <= ws.pk * K.giveBackPct / 100) { stopD[dk] = 'giveback'; continue; }
        if (K.bankDdPct > 0 && ws.bank <= ddRef * (1 - K.bankDdPct / 100)) { stopD[dk] = 'bankdd'; continue; }
        let size = lab.size && !baseline ? lab.size(bank, t, { peak, start: K.startUsd }) : K.sizeUsd, lockCut = false;
        if (K.lockAt > 0 && f) { if (lockR[t.close] == null) lockR[t.close] = ws.pk >= K.lockAt ? ws.net - ws.pk * (K.lockKeep || 0) / 100 : Infinity; if (lockR[t.close] < t.px + fee(t.px, 1)) lockCut = true; else size = Math.min(size, lockR[t.close]); }
        const k = Math.floor(size / t.px), cost = k * t.px + fee(t.px, k), pnl = cx ? k * t.xPx - fee(t.xPx, k) - cost : (held ? k : 0) - cost, ok = cx ? pnl > 0 : held;
        if (!f) { sk++; skNet += t.rulePnl ?? t.pnl ?? 0; continue; }
        if (lockCut) continue; if (!t.late) { if ((tw[t.close] || 0) >= wCap) continue; tw[t.close] = (tw[t.close] || 0) + 1; }
        if (isFinite(lockR[t.close] ?? Infinity)) lockR[t.close] -= cost;
        n++; if (ok) won++; bank += pnl; day[dk] = (day[dk] || 0) + pnl; dayPk[dk] = Math.max(dayPk[dk], day[dk]); peak = Math.max(peak, bank); dd = Math.max(dd, peak - bank); eq.push([t.close, +bank.toFixed(2)]);
        if (dk === todayK) { td.n++; if (ok) td.won++; td.net += pnl; }
      }
      const step = Math.max(1, Math.ceil(eq.length / 120));
      return { n, won, net: +(bank - K.startUsd).toFixed(2), dd: +dd.toFixed(2), today: { n: td.n, won: td.won, net: +td.net.toFixed(2) }, skipped: { n: sk, net: +skNet.toFixed(2) }, eq: eq.filter((x, i) => i % step === 0 || i === eq.length - 1) };
    };
    return LABS.map(lab => {
      const trades = lab.m10Only ? m10T : plain;
      const first = trades.find(t => t.done && t.win <= K.maxPerWindow && lab.filter(t) != null);
      if (!first) return { id: lab.id, name: lab.name, desc: lab.desc, color: lab.color, labOnly: !!lab.m10Only, since: null, n: 0, won: 0, net: 0, dd: 0, today: { n: 0, won: 0, net: 0 }, skipped: { n: 0, net: 0 }, eq: [], base: null, delta: null };
      const both = cash => { const r = sim(lab, first.close, false, cash), b = lab.id === 'rule' ? null : sim(lab, first.close, true, cash);
        return { ...r, base: b ? { n: b.n, won: b.won, net: b.net, dd: b.dd, today: b.today } : null, delta: b ? +(r.net - b.net).toFixed(2) : null }; };
      return { id: lab.id, name: lab.name, desc: lab.desc, color: lab.color, labOnly: !!lab.m10Only, since: first.close, ...both(false), cx: both(true) };
    });
  }

  // ---------- dashboard commands, applied here ----------
  async function command(type, a, who = {}) {
    await load();
    // MC 2026-11-10 a locked device may change paper settings and the paper playbook, and nothing else, and only while live is off
    if (who.locked && (ctlL.enabled === true || !(type === 'kalshiSet' || (type === 'kalshiStrat' && a?.book === 'paper')))) return { ok: false, msg: ctlL.enabled === true ? 'Live trading is on, so settings need an unlocked device.' : 'That needs an unlocked device.' };
    if (type === 'kalshiSet') {
      const out = {}, ch = [];
      for (const k of Object.keys(BOUNDS)) { if (a[k] == null || a[k] === '') continue; const v = Number(a[k]); if (!isFinite(v)) continue; const x = Math.min(BOUNDS[k][1], Math.max(BOUNDS[k][0], k === 'minAsk' || k === 'maxAsk' || k === 'mixMaxPx' ? Math.round(v * 100) / 100 : Math.round(v))); if (x !== cfgP[k]) { out[k] = x; ch.push(`${k} ${cfgP[k]} -> ${x}`); } }
      if (Array.isArray(a.coins)) { const want = COINS.filter(x => a.coins.includes(x)); if (!want.length) return { ok: false, msg: 'Pick at least one coin.' }; const v = want.length === COINS.length ? null : want, cur = cfgP.coins || null; if (JSON.stringify(v) !== JSON.stringify(cur)) { out.coins = v; ch.push(`coins ${v ? v.join(', ') : 'all nine'}`); } }
      if (out.minAsk != null || out.maxAsk != null) { const lo = out.minAsk ?? cfgP.minAsk, hi = out.maxAsk ?? cfgP.maxAsk ?? 0.99; if (lo > hi) return { ok: false, msg: 'The maximum price can\'t be below the minimum price.' }; }
      if (out.mixSame != null || out.mixSameMax != null) { const lo = out.mixSame ?? cfgP.mixSame ?? 3, hi = out.mixSameMax ?? cfgP.mixSameMax ?? 9; if (lo > hi) return { ok: false, msg: 'Coins on the same side: the most can\'t be below the least.' }; }
      if (['fixed', 'pct', 'kelly', 'ratchet'].includes(a.mixSize) && a.mixSize !== (cfgP.mixSize || 'fixed')) { out.mixSize = a.mixSize; ch.push(`mix sizing ${a.mixSize}`); }
      if (a.paperFrom != null) { const v = a.paperFrom === 0 ? 0 : Math.min(Date.now(), Math.max(0, +a.paperFrom || 0)); if (v !== (cfgP.paperFrom || 0)) { out.paperFrom = v; out.paperPrev = cfgP.paperFrom || 0; ch.push(v ? `new paper run from ${new Date(v).toISOString().slice(0, 16)}Z` : 'paper run covers everything again'); } }
      if (Array.isArray(a.skipHours)) { const v = [...new Set(a.skipHours.map(Number).filter(h => Number.isInteger(h) && h >= 0 && h < 24))].sort((x, y) => x - y); if (v.length === 24) return { ok: false, msg: 'Leave at least one hour on.' }; if (JSON.stringify(v) !== JSON.stringify(cfgP.skipHours || [])) { out.skipHours = v; ch.push(`off hours ${v.length ? v.join(', ') : 'none'}`); } }
      if (!ch.length) return { ok: false, msg: 'Nothing changed.' };
      cfgP = { ...cfgP, ...out }; await kv.put('kcfg', cfgP); viewDirty = true; await publish(true);
      return { ok: true, msg: `Kalshi settings saved: ${ch.join(', ')}.` };
    }
    if (type === 'kalshiLive') {
      const next = { ...ctlL }, ch = [];
      if (a.enabled === true || a.enabled === false) { if (next.enabled !== a.enabled) ch.push(a.enabled ? 'live trading ON' : 'live trading OFF'); next.enabled = a.enabled; }
      if (a.sizeUsd != null && isFinite(+a.sizeUsd)) { const v = Math.min(HARD.maxSize, Math.max(5, Math.round(+a.sizeUsd))); if (v !== next.sizeUsd) ch.push(`size $${next.sizeUsd} -> $${v}`); next.sizeUsd = v; }
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
    // MC 2026-11-13 request 8: Kalshi's API usage level, read and upgraded from the Live account tab. 'check' reads the tier and
    // limits (GET /account/limits) and the 30-day volume toward the volume tiers (GET /account/api_usage_level/volume_progress).
    // 'upgrade' asks Kalshi for the permanent Advanced grant (POST /account/api_usage_level/upgrade). Kalshi only gives it when
    // at least one of the account's last 100 orders came in through the API, so a 403 means no live order has been placed yet.
    // Advanced is what subaccounts (live books) need. The answer is kept in kapi so the tab shows it without asking again.
    if (type === 'kalshiApi') {
      if (who.locked) return { ok: false, msg: 'That needs an unlocked device.' };
      if (!hasKeys()) return { ok: false, msg: env.KEY_HELP || 'The Kalshi key is not set in Cloudflare yet.' };
      const read = async () => { const [l, v] = await Promise.all([kreq('GET', '/account/limits'), kreq('GET', '/account/api_usage_level/volume_progress')]);
        const o = { at: Date.now(), ok: !!l?.ok, limits: l?.ok ? l.j : null, err: l?.ok ? null : `${l?.status} ${errOf(l)}`, vol: v?.ok ? (v.j?.volume_progress || [])[0] || null : null };
        await kv.put('kapi', o); apiV = o; return o; };
      if (a?.op === 'upgrade') {
        const r = await kreq('POST', '/account/api_usage_level/upgrade');
        say(`LIVE api usage upgrade asked: ${r?.status}`);
        const o = await read(); viewDirty = true; await publish(true);
        if (r?.ok) return { ok: true, msg: 'Kalshi granted the Advanced API level. Subaccounts can be created now.', api: o };
        if (r?.status === 403) return { ok: false, msg: 'Kalshi said no: it gives Advanced only once at least one of your last 100 orders was placed through the API. Turn live on and let it place one trade, then try again.', api: o };
        return { ok: false, msg: `Kalshi would not upgrade: ${r?.status} ${errOf(r)}`, api: o };
      }
      const o = await read(); viewDirty = true; await publish(true);
      return o.ok ? { ok: true, msg: 'Read your API level from Kalshi.', api: o } : { ok: false, msg: `Kalshi did not answer: ${o.err}`, api: o };
    }
    if (type === 'kalshiBook') {
      if (who.locked) return { ok: false, msg: 'Live books need an unlocked device.' };
      const r = await books.command(a || {}, LAB_IDS.filter(id => !labDefs(cfgP).find(l => l.id === id).m10Only)); viewDirty = true; await publish(true); return r;
    }
    if (type === 'kalshiStrat') {
      // MC 2026-11-08 switch the paper book or the live gate to a lab (or back to the rule), logged with a timestamp so the
      // books apply it from now on and the history before it stays as it was.
      const id = String(a.id || 'rule'), book = a.book === 'live' ? 'live' : 'paper';
      if (!LAB_IDS.includes(id)) return { ok: false, msg: 'Unknown playbook.' };
      if (labDefs(cfgP).find(l => l.id === id).m10Only) return { ok: false, msg: 'Wait for the trend runs in Labs only for now.' };
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
  return { events, tick, alarm, entry, command, importRows, publish, load, status, checkKeys, resetKey, coins: COINS, _t: { gapWatch, gapFill, gaps: () => gaps, compact, saveRec, saveRec3, dropT, sql, books, keepFill, trendCheck, minute10, settle3, rec3: () => rec3, volRepair, secondLook, settle2, rec2: () => rec2, kalshiView, kliveBody, liveView, rec: () => rec, L: () => L, st, nextMark, onRule, sign, logs } };
}
