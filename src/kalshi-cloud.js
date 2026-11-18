import { feats, fit, predict, logit, LEARN_F, LEARN_NAME } from './learn.js';
import { createBooks } from './books.js';
import { createVault } from './vault.js';
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
// MC 2026-11-16 Early pack buys leaders from 60c, so the trade check now keeps every coin led at 60c or more (KEEP_LO). The work
// that runs on the kept coins afterwards (price paths, minute-10 checks, chart fill-ins, the learning model) stays at 85c (KEEP_ASK)
// so it costs no more than before; the 60c to 85c rows only need their result.
const KEEP_LO = 0.6, EP_LO = 0.6, EP_HI = 0.9;
// MC 2026-11-16 Early pack counts only from 1.2.59's release. Before it the trade check kept only coins at 85c or more, so the older
// rows held just the 85c to 90c slice and undercounted the pack; its Labs line showed -$395 for 7 days on a rule it wasn't running.
const EP_FROM = Date.parse('2026-11-16T17:50:00Z');
const L2_LO = 0.9099, L2_HI = 0.9501, L2_MIN_LEFT = 4;   // second look: price band and the last minute it may buy
// MC 2026-11-11 live cap raised from $25 to $50 a trade (asked, for the subaccount books at $50); the floor and limits are unchanged
// MC 2026-11-14 the rules live trading keeps apart from paper (asked to separate paper and live settings). Everything else in
// PAPER_DEF (bank, paper size and stop, paper run, cash out) is paper only; live size, loss cap and floor stay in kctl.
const LIVE_KEYS = ['slipC', 'capPb', 'retryFill', 'trendExit', 'trendKeep', 'minAsk', 'maxAsk', 'winCap', 'coldDays', 'coins', 'skipHours', 'dailyWinUsd', 'giveBackPct', 'giveBackMin', 'bankDdPct', 'lockAt', 'lockKeep', 'mixSame', 'mixSameMax', 'mixMaxPx', 'mixVol', 'mixSize', 'mixPct', 'ratchetAdd', 'ratchetEvery'];
const HARD = { maxSize: 50, minBank: 300, maxPerWindow: 9, maxPerDay: 150 };
const XI = 2;   // the 15-minute crypto markets trade on exchange shard 2
const PAPER_DEF = { slipC: 1, capPb: 1, startUsd: 1000, sizeUsd: 50, maxPerWindow: 9, minAsk: 0.9, maxAsk: 0.99, dailyLossUsd: 250, coldDays: 30, coins: null, mixSame: 3, mixSameMax: 9, mixMaxPx: 0.95, mixVol: 0, mixSize: 'fixed', mixPct: 5, skipHours: [], giveBackPct: 0, giveBackMin: 25, dailyWinUsd: 0, bankDdPct: 0, ratchetAdd: 10, ratchetEvery: 200, paperFrom: 0, lockAt: 0, lockKeep: 0, trendExit: 0, trendKeep: 50, winCap: 9 };
// MC 2026-11-08 coin list and starting bank are settable from the dashboard (plug-and-play edition); null coins = all nine
// MC 2026-11-14 Steven asked how much slippage a live order allows: it was the ask read at the trade check plus 1 cent, with no
// ceiling, so a coin picked at 94.8c under an under-95 playbook filled at 95.6c. The room is now a live setting (slipC, cents,
// default 1) and the order's top price never goes past live's Maximum price or the playbook's own price limit. pbCap is that
// limit: the price the playbook would no longer take (exclusive), or tr10's 98c (inclusive).
// MC 2026-11-17 asked for every skip to say why in plain words (Steven has questioned several). A skip read "filtered out", or
// only the moves figure whichever check had said no. labWhy names the check that turned the trade down, in the playbook's own
// numbers, with a few words on what the check is for. Order matters: price first (the reading that passed should not be the one
// shown), then how clear of the target, then each playbook's extra checks. t is the same reading the playbook's filter was given.
// MC 2026-11-17 asked to put these away: off the Labs page, the Backtest page and the playbook pickers, but not deleted. They keep
// running underneath (an account still set to one carries on and still shows it), so taking one out of this list brings it back
// with its history.
const ARCH = new Set(['kelly', 'no95', 'six', 'tr10', 'edge', 'edge2', 'two']);
function labWhy(id, t, K = {}) {
  const c = v => `${(v * 100).toFixed(1).replace(/\.0$/, '')}¢`, m = (v, need) => (v < need && +v.toFixed(2) >= need ? v.toFixed(3) : v.toFixed(2)), pc = v => `${(v * 100).toFixed(0)}%`;
  const need = px => px + 0.07 * px * (1 - px) + 0.01, far = (z, bar, what = '') => `it was only ${m(z, bar)} usual moves from its target${what} and this playbook wants at least ${bar}, so a normal swing could still flip it`;
  const cap = id === 'mv96' ? 0.96 : ['no95', 'mv95', 'mvl', 'mv15', 'mvai', 'mvsw', 'mvcc', 'cpk', 'all'].includes(id) ? 0.95 : id === 'mix' ? (K.mixMaxPx ?? 0.95) : null;
  if (cap != null && t.px >= cap) return `it cost ${c(t.px)} and this playbook only buys under ${c(cap)}, because the priciest contracts pay too little for the risk`;
  if (id === 'six' || id === 'all') { if (t.win != null && t.win < 6) return `only ${t.win} coin${t.win === 1 ? '' : 's'} qualified in this window and this playbook wants at least 6`; if (id === 'six') return null; }
  if (id === 'kelly') return t.kf == null ? 'there is not enough history at this price to size the bet yet' : 'trades at this price have not shown an edge yet, so it bets nothing';
  if (id === 'learn') return t.pl == null ? 'the learning model had no reading for this coin yet' : `the learning model gave it a ${pc(t.pl)} chance and the price needs ${pc(need(t.px))} to be worth it`;
  if (id === 'vol2') return t.z10 == null ? 'there was no price history reading for this coin yet, so it could not be checked' : far(t.z10, 1, ' (10-minute measure)');
  if (id === 'edge2') return t.z2 == null ? 'there was no price history reading for this coin yet, so it could not be checked' : `our win chance was ${pc(winP(t.z2))} and the price needs ${pc(need(t.px))} to be worth it`;
  if (id === 'two') { if (t.z == null || t.z10 == null) return 'there was no price history reading for this coin yet, so it could not be checked'; return far(Math.min(t.z, t.z10), 2); }
  if (t.z == null) return 'there was no price history reading for this coin yet, so it could not be checked';
  if (id === 'edge') return `our win chance was ${pc(winP(t.z))} and the price needs ${pc(need(t.px))} to be worth it`;
  const bar = id === 'mv15' || id === 'mvai' ? 1.5 : id === 'mix' ? null : 1;
  if (bar != null && t.z < bar) return far(t.z, bar);
  if (id === 'mvl') return t.pl == null ? 'the learning model had no reading for this coin yet' : `the learning model gave it a ${pc(t.pl)} chance and the price needs ${pc(need(t.px))} to be worth it`;
  if (id === 'mvai' && t.same != null && t.same < 3) return `only ${t.same} coin${t.same === 1 ? ' was' : 's were'} leading this way at 90¢ or more and this playbook wants at least 3 moving together`;
  if (id === 'mvsw') return t.sw == null ? 'there was no chart reading for this coin yet, so it could not be checked' : 'its lead was mostly new: 20 minutes earlier it was on the other side of its target, and leads like that swung back more often in testing';
  const ch = id === 'cpk' ? { r2: 0.7, dp: -2 } : id === 'mvcc' ? { r2: 0.81, dp: -1.7 } : null;
  if (ch) { if (t.r2 == null || t.dp == null) return 'there was no chart reading for this coin yet, so it could not be checked';
    if (t.dp <= ch.dp) return `it was ${Math.abs(t.dp).toFixed(1)} usual moves on the wrong side of its target in the last 30 minutes (the limit is ${Math.abs(ch.dp)}), and a coin that swung that far can swing back`;
    if (t.r2 >= ch.r2) return `its last 15 minutes ran in a near-straight line (${t.r2.toFixed(2)}, needs under ${ch.r2.toFixed(2)}), and runs like that reversed more often in testing`; }
  if (id === 'mix') return 'it did not pass the checks you set in Your mix';
  return null;
}
const PB_CAP = { no95: 0.95, mv95: 0.95, mvl: 0.95, mv15: 0.95, mvai: 0.95, mvsw: 0.95, mvcc: 0.95, cpk: 0.95, all: 0.95, mv96: 0.96 };
function orderLimit(r, labId, cfg) {
  const room = Math.max(0, Math.min(3, cfg.slipC ?? 1)) / 100, tick = p => (p < 0.1 || p >= 0.9) ? 0.001 : 0.01;
  let top = Math.min(0.99, cfg.maxAsk ?? 0.99, +(r.ask + room).toFixed(4)), why = room ? `${(room * 100).toFixed(1).replace(/\.0$/, '')}c of room` : 'no room';
  // MC 2026-11-14 Steven is fine with a fill spilling a little past the playbook's limit when the price it picked was under it, so
  // holding to the playbook's limit is a live setting (capPb, on unless turned off). Your Maximum price always holds.
  const ex = cfg.capPb === 0 ? null : labId === 'mix' ? (cfg.mixMaxPx ?? 0.95) : PB_CAP[labId];
  if (ex != null && top >= ex - 1e-9) { top = +(ex - tick(ex - 0.0005)).toFixed(4); why = `held under the playbook's ${Math.round(ex * 100)}c limit`; }
  else if (cfg.capPb !== 0 && labId === 'tr10' && top > 0.98) { top = 0.98; why = "held at the playbook's 98c limit"; }
  else if (top >= (cfg.maxAsk ?? 0.99) - 1e-9 && (cfg.maxAsk ?? 0.99) < 0.99) why = 'held at your maximum price';
  return { top, why };
}
const pickL = c => Object.fromEntries(LIVE_KEYS.map(k => [k, c[k] ?? PAPER_DEF[k] ?? null]));
const COINS = SERIES.map(s => s.replace(/^KX|15M$/g, ''));
// MC 2026-11-13 a price as cents for copy: whole cents as before, and a tenth when the setting has one (94.5). Request 10 let
// the minimum and maximum price take a tenth of a cent, because about half the leaders in the history sit between two cents.
const cts = p => { const c = Math.round(p * 1000) / 10; return Number.isInteger(c) ? String(c) : c.toFixed(1); };
const BOUNDS = { sizeUsd: [5, 500], dailyLossUsd: [25, 2000], minAsk: [0.85, 0.98], maxAsk: [0.86, 0.99], coldDays: [0, 90], startUsd: [100, 1000000], mixSame: [1, 9], mixSameMax: [1, 9], mixMaxPx: [0.91, 1], mixVol: [0, 1], mixPct: [1, 10], giveBackPct: [0, 90], giveBackMin: [5, 1000], dailyWinUsd: [0, 5000], bankDdPct: [0, 50], ratchetAdd: [1, 100], ratchetEvery: [25, 5000], lockAt: [0, 5000], lockKeep: [0, 90], trendExit: [0, 1], trendKeep: [5, 95], winCap: [1, 9], slipC: [0, 3], capPb: [0, 1], retryFill: [0, 1] };
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
    // MC 2026-11-14 asked whether Margin vs volatility under 95c could be made safer on wins. Tested on Aug 7 to Nov 9 (4,577 of its
    // trades, $50 each, split in two halves): losses look almost the same as wins on every reading we keep (1.41 moves clear
    // against 1.48, learned chance 93.7% against 94.0%), so every filter trades profit for safety. Tried and dropped: the 10-minute
    // check on top (less profit, more red days), price sliding back (no effect), volatility picking up (worse), coins on the same
    // side (helped one half, hurt the other). These two held up on both halves. Learned agreeing kept 82% of the profit with
    // $1.20 a trade against $0.93 and a smaller worst day; 1.5 moves kept about half the profit and cut the worst day almost in half.
    { id: 'mvl', name: 'Margin vs volatility + Learned', desc: 'Margin vs volatility under 95¢, and only when the self-learning model also gives the trade a better chance than Kalshi\'s price plus the fee and a cent. Two separate checks have to agree. In the history it kept about 80% of the profit on about 60% of the trades, with more profit per trade and a smaller worst day.', color: '#B5179E', filter: t => t.z == null || t.pl == null ? null : t.z >= 1 && t.px < 0.95 && t.pl >= t.px + 0.07 * t.px * (1 - t.px) + 0.01 },
    // MC 2026-11-15 Mitchell's rule, named by him. First version: Margin vs volatility under 95c, and the trend line and the
    // likely line both had to finish on our side at the trade check. Tested the same day on every market from Sep 6 to Nov 15
    // (4,673 Margin vs volatility trades): the likely line never vetoed a trade, the trend line vetoed 400 that won 94.5% and
    // made more per trade than the ones it kept, and a shrinking lead was no warning either. What did hold in both halves of
    // that stretch: a lead of 1.5 moves, and skipping lone leaders (with fewer than 3 coins leading the same way those trades
    // lost money in both halves). Together: 95.4% won, $1.18 a trade against $0.81, 58 losses against 278, the worst day and
    // the deepest drop about half as deep, on about a quarter of the trades and 40% of the profit. Rebuilt on those two checks
    // at his say-so. The two lines stay on the charts and are still recorded on every trade (tl, lk) for later tests.
    { id: 'mvai', name: 'Margin vs volatility (AI checked)', desc: 'Margin vs volatility under 95¢ with two extra checks that held up in testing: the coin must be at least 1.5 normal 10-minute moves past its target, and at least 3 coins must be leading the same way in that window. Far fewer trades (about 18 a day in the test), fewer losses and shallower bad days, and less profit in total.', color: '#4CC9F0', filter: t => t.z == null ? null : t.z >= 1.5 && t.px < 0.95 && t.same >= 3 },
    // MC 2026-11-16 from Mitchell's ask to find a pattern in the last 4 days of automatic trades. Rebuilt from Kalshi's public data:
    // Nov 12 to 16 the live playbook won 89.7% and lost $396 at $50 a trade. Coins whose lead was mostly new (20 minutes before the
    // trade check they were on the other side of the target by at least half of what they now lead by, sw >= 1.5) won 83% and lost
    // $4.95 a trade; over Sep 6 to Nov 15 the same group made $0.41 a trade against $0.94 for the rest, and leaving it out helped
    // in both halves of that stretch ($0.95 and $0.94 a trade). It cut the 4-day loss to $129; it does not make that stretch pay.
    { id: 'mvsw', name: 'Margin vs volatility, no late swing', desc: 'Margin vs volatility under 95¢, skipping coins whose lead is mostly new: 20 minutes before the trade check they were on the other side of the target by at least half of what they now lead by. In testing those swung back more often than the rest.', color: '#8AC926', filter: t => t.z == null || t.sw == null ? null : t.z >= 1 && t.px < 0.95 && t.sw < 1.5 },
    // MC 2026-11-16 Mitchell asked for the chart-shape version as its own playbook, next to "no late swing". In the same test it made
    // $0.95 a trade against $0.59 for the live playbook ($0.90 and $1.01 in the two halves, $0.99 over the last four weeks), more
    // in total on 30% fewer trades, with the worst day about half as deep. Cut-offs picked by looking at five groups, so expect less.
    // MC 2026-11-16 asked for the best setup as one playbook, after Steven's idea of trading only when several playbooks agree
    // (they all judge the same trade, so agreeing came out as roughly chart checked). Walk-forward on Sep 9 to Nov 16: 160
    // threshold mixes were scored on the first half and the pick tested on the unseen second half. Most mixes didn't carry over
    // (per-trade result on the two halves was uncorrelated), but one thing did, and smoothly: how straight the last 15 minutes
    // were. Under 0.70 held $1.18 then $1.20 a trade; the trades it skips lost money. Depth is kept as a loose guard (2 moves, was
    // 1.7). Both halves over $1 a trade, every week green, $1.17 a trade against $1.03 for chart checked and $0.66 for under 95c.
    // Tried and dropped: a higher moves bar, a pack count, a 91c floor, coin and hour picks; each looked good on one half only.
    { id: 'cpk', name: "Claude's pick", desc: 'The best setup found in testing, as one playbook. Buys leaders under 95¢ that are at least one usual move clear of their target, and skips two chart shapes: a last 15 minutes that ran in a near-straight line (a stricter bar than chart checked), and a coin that was 2 or more usual moves on the wrong side of its target in the last 30 minutes.', color: '#C792EA', filter: t => t.z == null || t.dp == null || t.r2 == null ? null : t.z >= 1 && t.px < 0.95 && t.dp > -2 && t.r2 < 0.7 },
    { id: 'mvcc', name: 'Margin vs volatility, chart checked', desc: 'Margin vs volatility under 95¢, skipping two chart shapes that tended to snap back in testing: a coin that was 1.7 or more usual moves on the wrong side of its target in the last 30 minutes, and a coin whose last 15 minutes were a near-straight run.', color: '#FF7F50', filter: t => t.z == null || t.dp == null || t.r2 == null ? null : t.z >= 1 && t.px < 0.95 && t.dp > -1.7 && t.r2 < 0.81 },
    // MC 2026-11-16 Mitchell's own hand-buy pattern, named by him. His live hand buys Nov 15 to 16 (63 on Main, 84% won, +$163)
    // won 95% (+$379) in windows where every coin he bought went the same way and 55% (-$216) where he bought both sides. His best
    // money was 60c to 90c with 8 to 12 minutes left; after 9 PM and HYPE were where it went wrong. Fitted on those 63 trades, so
    // Labs only (ep) until it shows something on trades it has not seen. Runs on its own rows: leaders at 60c to 90c at the trade
    // check, which the paper and live price bands never see. same = coins led on this side at 60c or more, this one included.
    { id: 'epk', name: 'Early pack', ep: true, desc: 'Buys the leader early and cheaper: 60¢ to 90¢ at the trade check (10 minutes left), only when at least 3 coins are leading the same way, before 9 PM ET, and never HYPE. Built from your own winning hand buys. Labs only for now; the paper and live price bands start higher.', color: '#F15BB5', filter: t => t.hr == null ? null : t.px >= EP_LO && t.px < EP_HI && t.same >= 3 && t.hr < 21 && t.coin !== 'HYPE' },
    { id: 'mv15', name: 'Margin vs volatility, 1.5 moves', desc: 'Margin vs volatility under 95¢ with a higher bar: the coin must be at least 1.5 normal 10-minute moves past its target, not 1. About 40% of the trades and half the profit in the history, but the worst day and the worst drop were both about half as deep, and the win rate went from 94.2% to 95.2%.', color: '#80FFDB', filter: t => t.z == null ? null : t.z >= 1.5 && t.px < 0.95 },
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
    { id: 'tr10', name: 'Wait for the trend', m10Only: true, desc: `Skips the 10-minutes-left buy. At 5 minutes left it buys the leader if it costs ${cts(K.minAsk ?? 0.9)}¢ to 98¢ and the trend line from minute 5 to minute 10 runs with the bet or is flat. Higher prices than the mark, so smaller wins; the question is whether fewer losses make up for it.`, color: '#E9C46A', filter: t => !!t.m10 && t.px >= K.minAsk && t.px <= 0.98 && t.dir >= 0 },
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
// a market's target and settled value are coin prices, not cents: read them as plain numbers
const kNum = x => { if (x == null || x === '') return null; const v = Number(x); return isFinite(v) ? v : null; }, kStrike = m => m ? kNum(m.custom_strike?.floor_strike ?? m.floor_strike ?? m.cap_strike ?? m.functional_strike) : null;
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
    side = await side; if (side !== 'yes' && side !== 'no') return null;   // MC 2026-11-17 the trade check asks before it knows the side
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
    // MC 2026-11-15 the two chart lines at this moment, for the AI checked playbook. Trend: least squares through the last 20
    // one-minute closes and the current price, read 10 minutes on. Likely: the slope of the last 3 minutes times 130 seconds (a
    // pace that halves every 90 seconds adds that much in all). Each is kept as its margin past the target on our side.
    // MC 2026-11-16 sw: how much of the lead is new. 0 means the coin led by as much 20 minutes ago; 1.5 or more means 20 minutes ago
    // it was on the other side of the target by at least half of what it leads by now (a late swing across).
    let tl = null, lk = null, sw = null; { const T = rows.slice(-20).map(k => [k[0] + 60, k[4]]), tN = T[T.length - 1][0] + (age > 0 ? Math.min(age, 90) : 0); if (src !== 'candle' && src !== 'history') T.push([tN, px]); else T[T.length - 1][1] = px;
      const fit = A => { const n = A.length, mx = A.reduce((a, q) => a + q[0], 0) / n, my = A.reduce((a, q) => a + q[1], 0) / n; let sxy = 0, sxx = 0; for (const q of A) { sxy += (q[0] - mx) * (q[1] - my); sxx += (q[0] - mx) ** 2; } return sxx > 0 ? { b: sxy / sxx, at: t => my + sxy / sxx * (t - mx) } : null; };
      const sg = v => +((side === 'yes' ? v - strike : strike - v) / strike).toFixed(6), end = T[T.length - 1][0] + 600;
      if (T.length >= 12 && src !== 'stale') { const L = fit(T), S3 = fit(T.slice(-4)); if (L) tl = sg(L.at(end)); if (S3) lk = sg(px + S3.b * 130 * (1 - Math.exp(-600 / 130))); const ld = sg(px); if (ld > 0) sw = +((ld - sg(T[0][1])) / ld).toFixed(3); } }
    // MC 2026-11-16 two chart-shape readings that held up in testing (Sep 8 to Nov 16, every market). dp: the furthest the coin was
    // on the wrong side of the target in the last 30 minutes, in usual 10-minute moves (0 if it never was); the worse it was, the
    // worse those trades did, step by step, in both halves and the last four weeks. r2: how close to a straight line the last 15
    // minutes were (1 = a ruler-straight run); the straightest fifth did worst in all three periods. Ten other shapes were tried
    // (crossings, hugging the target, spikes, jumps, noise, place in the range) and showed nothing steady.
    let dp = null, r2 = null; { const u = sigma * Math.sqrt(10), sgn = v => (side === 'yes' ? v - strike : strike - v) / strike;
      const Q = src === 'candle' || src === 'history' ? rows.slice(-31).map(k => k[4]) : rows.slice(-30).map(k => k[4]).concat([px]); if (src === 'candle' || src === 'history') Q[Q.length - 1] = px;
      if (u > 0 && Q.length >= 25 && src !== 'stale') { const P = Q.map(v => sgn(v) / u); dp = +Math.min(0, ...P).toFixed(3);
        const Y = P.slice(-15), n = Y.length, mx = (n - 1) / 2, my = Y.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; Y.forEach((y, i) => { sxy += (i - mx) * (y - my); sxx += (i - mx) ** 2; syy += (y - my) ** 2; }); r2 = syy > 0 ? +(sxy * sxy / (sxx * syy)).toFixed(3) : 0; } }
    return { tl, lk, sw, dp, r2, px, sigma: +sigma.toExponential(3), margin: +margin.toFixed(6), z: z == null ? null : +z.toFixed(2), sigma15: +sigma15.toExponential(3), drift: +drift.toFixed(6), z2: z2 == null ? null : +z2.toFixed(2), sigma10: sigma10 == null ? null : +sigma10.toExponential(3), z10, age, src };
}


// MC 2026-11-10 the same reading rebuilt from Coinbase's history for a past trade check: candles up to the minute before `at`.
// Used to repair readings taken from a stale candle list, and to give older trades the 10-minute measure they never had.
let CCB = 4;      // Coinbase requests the repair may still make this minute
let CCB_MAX = 4;  // MC 2026-11-17 what that allowance starts at each pass: 4 on Cloudflare's free plan, more with PAID_PLAN set (see createKalshi)
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
  // MC 2026-11-17 Cloudflare's paid Workers plan allows 10,000 outside calls a run (the free plan 50) and far more computing
  // time. With PAID_PLAN set to 1 (a variable or secret on the worker) the fill-ins stop rationing: chart readings for past
  // trades, hand-buy readings, the second-by-second coin paths and late settles work through a backlog in minutes, and every
  // trade's minute-by-minute Kalshi prices are saved as they come in. Without it nothing changes, so a copy on the free plan
  // keeps the old limits. Kalshi's and Coinbase's own rate limits still apply either way (a 429 pauses the pass as before).
  const PAID = String(env.PAID_PLAN ?? '').trim() === '1'; CCB_MAX = PAID ? 24 : 4;
  const mkMem = new Map();   // series -> the market the last minute scan saw open, so the trade check can skip the market list
  sql.exec('CREATE TABLE IF NOT EXISTS kt (tk TEXT PRIMARY KEY, close INTEGER, j TEXT)');
  sql.exec('CREATE TABLE IF NOT EXISTS ko (tk TEXT PRIMARY KEY, at INTEGER, j TEXT)');
  sql.exec('CREATE TABLE IF NOT EXISTS k2 (tk TEXT PRIMARY KEY, close INTEGER, j TEXT)');   // second-look entries, kept apart from the mark records so nothing else counts them
  sql.exec('CREATE TABLE IF NOT EXISTS k3 (tk TEXT PRIMARY KEY, close INTEGER, j TEXT)');   // every coin's price and trend at minute 10, for the Wait for the trend lab
  let rec2 = new Map(), rec3 = new Map();
  let cfgL = null;   // live rules (LIVE_KEYS), seeded from paper the first time
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
    { const l = await kv.get('kcfgL'); if (l) cfgL = { ...pickL(PAPER_DEF), ...l }; else { cfgL = pickL(cfgP); await kv.put('kcfgL', cfgL); } }
    ctlL = { enabled: false, sizeUsd: 10, dailyLossUsd: 100, sellAllAt: 0, ...((await kv.get('kctl')) || {}) };
    apiV = (await kv.get('kapi')) || null;
    kmoney = (await kv.get('kmoney')) || null;
    const s = (await kv.get('kst')) || {}; st.sellAllDone = s.sellAllDone || 0;
    await books.load(); await vault.load();
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
  const ctl = () => ({ enabled: ctlL.enabled === true, autoPause: ctlL.autoPause === true, sizeUsd: Math.min(HARD.maxSize, Math.max(5, +ctlL.sizeUsd || 10)), dailyLossUsd: Math.max(10, +ctlL.dailyLossUsd || 100), sellAllAt: +ctlL.sellAllAt || 0, at: ctlL.at || 0, minBank: ctlL.minBank ?? HARD.minBank, strat: Array.isArray(ctlL.strat) ? ctlL.strat : [] });

  // ---------- signed requests ----------
  let KEY = null;
  const activeSeries = () => cfgP?.coins?.length ? SERIES.filter(s => cfgP.coins.includes(coin(s))) : SERIES;
  // MC 2026-11-14 the trade check reads every coin paper or live trades; a coin only live trades is recorded with lo set, and the
  // paper book and labs leave those rows out
  const liveSeries = () => cfgL?.coins?.length ? SERIES.filter(s => cfgL.coins.includes(coin(s))) : SERIES;
  const scanSeries = () => { const a = new Set(activeSeries()); if (ctlL?.enabled || books.anyOn()) for (const x of liveSeries()) a.add(x); { const oc = books.ownCoins(); for (const x of SERIES) if (oc === null || oc.includes(coin(x))) a.add(x); } return SERIES.filter(x => a.has(x)); };
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
  const books = createBooks({ state, env, say, HOSTS, API, XI, coin, etDay, etHour, fee, stratAt, stratSince, mainReq: (m, p, b) => kreq(m, p, b), mainKeys: () => hasKeys(), mainShards: async () => { st.balAt = 0; const b = await balance(true); return b == null ? null : st.shard; }, orderLimit, fillMerge, resOf: tk => { const r = rec.get(tk)?.result; return r === 'yes' || r === 'no' ? r : null; }, labName: id => labDefs(cfgP).find(l => l.id === id)?.name || id });
  const fail = m => { st.lastErr = m; st.errAt = Date.now(); say('LIVE ' + m); };
  const vq = [];   // vault notices waiting for the next push
  const vault = createVault({ kv, say, XI, etDay, etHour, fail, mainReq: (m, p, b) => kreq(m, p, b), mainKeys: () => hasKeys(),
    mainBal: async force => { if (force) st.balAt = 0; await balance(true); return st.bal == null ? null : { bal: st.bal, shard: st.shard }; }, mainCash: () => st.bal,
    liveTrades: () => [...L.values()], openLive: () => [...L.values()].some(x => x.fill > 0 && !x.result), bookSubs: () => books.view().map(b => b.sub),
    viewDirty: () => { viewDirty = true; }, notify: e => vq.push(e) });

  // ---------- bench: a coin sits out while its rule trades over the last cold days netted below zero ($50 a trade) ----------
  function coldSet(at, cfg = cfgP) {
    const days = cfg.coldDays; if (!(days > 0)) return new Set();
    const cut = at - days * 86400000, net = {};
    for (const r of rec.values()) { if (!r.result || r.result === 'void' || !(r.ask >= 0.9) || r.close <= cut || r.close > at) continue; const px = r.avgN || r.ask, n = Math.floor(50 / px); const c = coin(r.series); net[c] = (net[c] || 0) + (r.won ? n : 0) - n * px - fee(px, n); }
    return new Set(Object.entries(net).filter(([, v]) => v < 0).map(([k]) => k));
  }

  // ---------- live account ----------
  const todayL = () => { const d = etDay(Date.now()); return [...L.values()].filter(x => etDay(x.at) === d); };
  const realized = l => l.reduce((a, x) => a + (x.pnl ?? 0), 0);
  async function balance(force) {
    if (Date.now() - st.balAt < (force ? 30000 : 60000)) return st.bal;
    // MC 2026-11-15 the per-shard reads below made every balance check three calls and Steven's copy ran into Cloudflare's cap
    // on calls per run. The split is read again only when the total changed, when balAt was set to 0 (fill, settle, transfer),
    // or after 10 minutes; otherwise the last split is kept. See books.js balance() for the same change.
    const stale = !st.balAt, was = st.bal, keep = st.shard;
    const r = await kreq('GET', '/portfolio/balance');
    if (r?.ok) { const j = r.j || {}; st.bal = j.balance_dollars != null ? +j.balance_dollars : j.balance != null ? j.balance / 100 : null; st.balAt = Date.now(); st.keyOk = true; st.shard = {}; for (const b of j.balance_breakdown || []) st.shard[b.exchange_index] = +b.balance;
      // MC 2026-11-15 Steven's live orders were all refused and the top-up kept failing with "could not move $600.00 ... insufficient
      // balance" while his main account held $420.76, after he put money into subaccounts. The top-up trusted balance_breakdown
      // for what sits on shard 0, and Kalshi's docs do not say that breakdown is limited to the account asked about; his numbers
      // fit a breakdown that counts the subaccounts' money too. So when the breakdown does not add up to this account's own
      // balance (or is missing), each shard is asked for by itself with exchange_index, which is scoped to the account.
      const sum = Object.values(st.shard).reduce((x, v) => x + v, 0);
      if (st.bal != null && (!(j.balance_breakdown || []).length || Math.abs(sum - st.bal) > 0.01)) {
        if (!stale && was === st.bal && keep && Object.keys(keep).length && Date.now() - (st.shAt || 0) < 600000) st.shard = keep; else {
        const val = q => q?.ok ? (q.j?.balance_dollars != null ? +q.j.balance_dollars : q.j?.balance != null ? q.j.balance / 100 : null) : null;
        // MC 2026-11-15 second pass. With a book holding $200 the main account still read "$643.15 on crypto" against $443.15 of
        // cash, so asking by exchange_index alone also came back counting the subaccount. The primary account is now named in the
        // request (subaccount=0). If the two shards still add up to more than this account's own cash, what the books hold on
        // each shard (read with their own keys) is taken off, and whatever is left is held to the account's cash, so the main
        // account is never shown, or sized, with money that belongs to a book.
        const [a0, ax] = await Promise.all([kreq('GET', '/portfolio/balance?subaccount=0&exchange_index=0'), kreq('GET', `/portfolio/balance?subaccount=0&exchange_index=${XI}`)]);
        let v0 = val(a0) ?? st.shard[0] ?? 0, vx = val(ax) ?? st.shard[XI] ?? 0;
        if (v0 + vx > st.bal + 0.01) { let b0 = 0, bx = 0; try { for (const k of books.view()) { const c = k.crypto ?? 0; bx += c; b0 += Math.max(0, (k.bal ?? 0) - c); } } catch { } v0 = Math.max(0, v0 - b0); vx = Math.max(0, vx - bx); }
        if (v0 + vx > st.bal + 0.01) { vx = Math.min(vx, st.bal); v0 = Math.max(0, +(st.bal - vx).toFixed(2)); }
        st.shard = { 0: +v0.toFixed(2), [XI]: +vx.toFixed(2) }; st.shAt = Date.now(); }
      } }
    else if (/subrequest/i.test(errOf(r) || '') || r?.status === 429) say(`LIVE ${r?.status === 429 ? 'Kalshi asked to slow down' : 'out of calls this run'}, balance kept`);
    else { st.keyOk = r?.status === 401 ? false : st.keyOk; fail(`balance check failed: ${r?.status} ${errOf(r)}`); }
    return st.bal;
  }
  async function fund(c) {
    if (Date.now() - st.xferAt < 60000) return;
    // MC 2026-11-15 Steven's dashboard showed "could not move $600.00 to the crypto shard: 400 insufficient balance". The amount was
    // worked out from balances up to a minute old: fills are taken off the crypto shard here as they happen, but wins and earlier
    // top-ups only show after the next balance read, so the shard looked empty and the main balance looked full when neither was
    // true. The balances are read fresh before deciding now, and a refusal while the shard still covers the next order is logged,
    // not shown as an error.
    // MC 2026-11-15 balAt = 1 (not 0) skips the cache without marking the shard split as stale, so this every-minute check costs
    // one call, not three, while the total is unchanged.
    if (Date.now() - st.balAt > 5000) { if (st.balAt) st.balAt = 1; await balance(true); }
    const have = st.shard[XI] ?? 0, src = Math.max(0, Math.min(st.shard[0] ?? 0, (st.bal ?? Infinity) - have) - vault.held()), want = Math.round(c.sizeUsd * 12), low = c.sizeUsd * 9;
    if (have >= low || src < 1) return;
    const amt = Math.floor(Math.min(src, want - have) * 100) / 100; if (amt < 1) return;
    st.xferAt = Date.now();
    const res = await kreq('POST', '/portfolio/intra_exchange_instance_transfer', { source: 'event_contract', destination: 'event_contract', amount: Math.floor(amt * 100) * 100, source_exchange_shard: 0, destination_exchange_shard: XI, client_transfer_id: crypto.randomUUID() });
    if (!res?.ok) { const m = `could not move $${amt.toFixed(2)} to the crypto shard: ${res?.status} ${errOf(res)}`; st.balAt = 0; if (have >= c.sizeUsd + 1) console.log('fund: ' + m + ' (shard still covers the next order)'); else fail(m); return; }
    st.lastXfer = { at: Date.now(), amt: +amt.toFixed(2) }; st.balAt = 0; say(`LIVE moved $${amt.toFixed(2)} to the crypto shard`);
  }
  function skipLive(r, why) {
    if (L.has(r.ticker)) return;
    const x = { tk: r.ticker, coin: coin(r.series), side: r.side, at: Date.now(), close: r.close, paperPx: r.avgN || r.ask, skipped: why, strat: stratAt(ctl().strat, Date.now()) }; L.set(r.ticker, x); saveL(x); say(`LIVE skip ${r.ticker}: ${why}`);
  }
  // MC 2026-11-14 Steven, testing live: no-fills and slippage will matter more once several books copy the same trades. Orders
  // went out one at a time, each after the one before it answered, and the subaccount books only after the main book was done,
  // so the fourth order of a busy window left a second or more after its price was read. Now every order is checked in turn
  // (same gates, same order, a planned order counts toward the window cap, the day's count and the cash floor as if it filled),
  // then all of them are sent at once, and the books run beside the main book. A no-fill leaves its slot empty rather than
  // passing it to the next coin. Pass later=[] to collect the sends; without it the order goes out at once as before.
  let resv = 0;   // $ planned at this mark but not sent yet
  const busy = x => x.fill > 0 || !!x.pend;
  async function onRule(r, lab = null, later = null, missed = null) {
    const c = ctl(); if (!c.enabled || L.has(r.ticker)) return;
    const cn = coin(r.series), why = (() => {
      if (coldSet(Date.now(), cfgL).has(cn)) return `${cn} is benched (down over its last ${cfgL.coldDays} days)`;
      const t = todayL(); if (realized(t) <= -c.dailyLossUsd) return `daily loss cap hit (${realized(t).toFixed(2)})`;
      if (cfgL.dailyWinUsd > 0 && realized(t) >= cfgL.dailyWinUsd) return `daily profit target hit (+$${realized(t).toFixed(2)})`;
      // MC 2026-11-09 give-back and bank-drawdown stops on the live book too, from the paper settings
      if (cfgL.giveBackPct > 0) { let run = 0, pk = 0; for (const x of t.filter(x => x.pnl != null).sort((a, b) => a.at - b.at)) { run += x.pnl; pk = Math.max(pk, run); } if (pk >= (cfgL.giveBackMin ?? 25) && run <= pk * cfgL.giveBackPct / 100) return `give-back stop: today peaked at +$${pk.toFixed(2)}, now ${run >= 0 ? '+' : ''}$${run.toFixed(2)}`; }
      if (cfgL.bankDdPct > 0) { const xs = [...L.values()].filter(x => x.pnl != null).sort((a, b) => a.at - b.at), start = (st.bal ?? 0) - xs.reduce((a, x) => a + x.pnl, 0); let run = 0, ref = start, lastD = null; const tripped = {};
        for (const x of xs) { const d = etDay(x.at); if (lastD && lastD !== d && tripped[lastD]) ref = start + run; lastD = d; run += x.pnl; const cash = start + run; ref = Math.max(ref, cash); if (cash <= ref * (1 - cfgL.bankDdPct / 100)) tripped[d] = true; }
        if (lastD === etDay(Date.now()) && tripped[lastD]) return `bank drawdown stop: ${cfgL.bankDdPct}% under its high today`; }
      if (t.filter(busy).length >= HARD.maxPerDay) return 'daily order limit';
      // MC 2026-11-12 winCap: the most trades one window may take, clearest first (hits arrive sorted). Coins that line up on one
      // side lose together; at three a window the worst day in the history fell by a third for about a tenth of the profit.
      { const cap = Math.min(HARD.maxPerWindow, cfgL.winCap ?? 9); if ([...L.values()].filter(x => x.close === r.close && busy(x)).length >= cap) return cap < HARD.maxPerWindow ? `window is full (${cap} a window, clearest first)` : 'window limit'; }
      return null; })();
    // MC 2026-11-16 Steven read "Not trading right now: window is full" as a frozen dash, 7 minutes into the next window. The last
    // skip reason stayed up until the next order went in. A reason about one coin or one window (full window, benched coin, a
    // playbook pass) now ends with that window; only the day-long stops (loss cap, target, give-back, drawdown, order limit) stay.
    const skip = s => { st.stopped = s; st.stoppedDay = /^(daily |give-back|bank drawdown|cash|protecting)/.test(s); st.stoppedTo = st.stoppedDay ? null : r.close; const x = { tk: r.ticker, coin: cn, side: r.side, at: Date.now(), close: r.close, paperPx: r.avgN || r.ask, skipped: s }; L.set(r.ticker, x); saveL(x); say(`LIVE skip ${r.ticker}: ${s}`); };
    if (why) return skip(why);
    const bal = await balance(true);
    if (bal == null) { fail(`no order for ${r.ticker}: could not read the balance`); return; }
    // MC 2026-11-13 money brought back from the vault for a bank withdrawal is held: it does not count toward the cash floor
    const held = vault.held() + resv, floor = c.minBank ?? HARD.minBank; if (bal - held < floor) return skip(`cash $${bal.toFixed(2)}${held ? ` ($${held.toFixed(2)} of it held for a withdrawal)` : ''} is under the $${floor} floor`);
    st.stopped = null;
    // MC 2026-11-08 a sizing playbook (5% of the Kalshi cash) stays inside the $5 to HARD.maxSize live band and the saved size is its ceiling
    let rS = null; if (lab?.size) { let run = 0, pk = 0; for (const x of [...L.values()].filter(x => x.pnl != null).sort((a, b) => a.at - b.at)) { run += x.pnl; pk = Math.max(pk, run); } rS = { peak: bal + (pk - run), start: bal - run }; }
    let sizeUsd = lab?.size ? Math.min(c.sizeUsd, HARD.maxSize, Math.max(5, lab.size(bal, { kf: r.kf, win: r.win }, rS))) : c.sizeUsd;
    // MC 2026-11-10 protect today's profit on the live book too: today's settled live result and its high, less what this window
    // already has riding. Under the $5 minimum order it skips.
    if (cfgL.lockAt > 0) { const t2 = todayL().filter(x => x.pnl != null).sort((a, b) => a.at - b.at); let run = 0, pk = 0; for (const x of t2) { run += x.pnl; pk = Math.max(pk, run); }
      if (pk >= cfgL.lockAt) { const riding = [...L.values()].filter(x => x.close === r.close && busy(x) && !x.result).reduce((a, x) => a + (x.cost || (x.pend ? x.size : 0) || 0), 0), room = run - pk * (cfgL.lockKeep || 0) / 100 - riding;
        if (room < 5) return skip(`protecting today's profit: $${Math.max(0, room).toFixed(2)} of room left`); sizeUsd = Math.min(sizeUsd, room); } }
    if ((st.shard[XI] ?? 0) - resv < sizeUsd + 1) { st.xferAt = 0; await fund(c); }
    const lim = orderLimit(r, lab?.id || 'rule', cfgL), maxPx = lim.top;
    if (maxPx < r.ask - 1e-9) return skip(`the ${(r.ask * 100).toFixed(1)}c ask is over your limit (${lim.why})`);
    const n = Math.floor(sizeUsd / maxPx);
    if (n < 1) return;
    const grid = p => (p < 0.1 || p >= 0.9) ? 0.001 : 0.01, down = p => +(Math.floor(p / grid(p) + 1e-9) * grid(p)).toFixed(4), up = p => +(Math.ceil(p / grid(p) - 1e-9) * grid(p)).toFixed(4);
    const body = r.side === 'yes'
      ? { ticker: r.ticker, side: 'bid', count: String(n), price: down(maxPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', client_order_id: `cr-${r.ticker}` }
      : { ticker: r.ticker, side: 'ask', count: String(n), price: up(1 - maxPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', client_order_id: `cr-${r.ticker}` };
    const row = { tk: r.ticker, coin: cn, side: r.side, at: Date.now(), close: r.close, paperPx: r.avgN || r.ask, ask: r.ask, read: r.at, want: n, limit: maxPx, limWhy: lim.why, size: sizeUsd, fill: 0, strat: lab?.id || 'rule', pend: 1 };
    L.set(r.ticker, row); saveL(row); resv += sizeUsd;
    const send = async () => {
      // sent: ms from reading the price to sending the order; rtt: how long Kalshi took to answer
      const t0 = Date.now(); row.sent = t0 - (r.at || t0);
      let res; try { res = await kreq('POST', '/portfolio/events/orders', body); } finally { delete row.pend; resv = Math.max(0, resv - sizeUsd); }
      row.rtt = Date.now() - t0;
      if (!res?.ok) { row.err = `${res?.status} ${errOf(res)}`.slice(0, 200); saveL(row); fail(`order ${r.ticker} refused: ${row.err}`); return; }
      const j = res.j?.order || res.j || {}, fill = +(j.fill_count ?? 0), avgYes = j.average_fill_price != null ? +j.average_fill_price : null, avgFee = j.average_fee_paid != null ? +j.average_fee_paid : 0;
      Object.assign(row, { id: j.order_id || null, fill, avgYes, px: avgYes == null ? null : +(r.side === 'yes' ? avgYes : 1 - avgYes).toFixed(4), fees: +(fill * avgFee).toFixed(4) });
      row.cost = row.px == null ? null : +(fill * row.px + row.fees).toFixed(2);
      saveL(row); say(`LIVE ${r.ticker} ${r.side.toUpperCase()} ${fill}/${n} filled${row.px != null ? ` at ${(row.px * 100).toFixed(1)}c` : ''} (sent ${row.sent}ms after the price was read, answered in ${row.rtt}ms)`);
      if (row.cost) { if (st.bal != null) st.bal = +(st.bal - row.cost).toFixed(2); if (st.shard[XI] != null) st.shard[XI] = +(st.shard[XI] - row.cost).toFixed(2); }
      if (fill < n && missed) missed.push({ row, save: () => saveL(row), retry: !!cfgL.retryFill, floor: Math.max(cfgL.minAsk ?? 0.9, r.ask - 0.01), again: async k => {
        const res2 = await kreq('POST', '/portfolio/events/orders', { ...body, count: String(Math.floor(row.want - row.fill + 1e-9)), client_order_id: `cr-${r.ticker}-r${k}` });
        if (!res2?.ok) { say(`LIVE ${r.ticker} second try refused: ${res2?.status} ${errOf(res2)}`.slice(0, 200)); return 0; }
        const got = fillMerge(row, r.side, res2.j?.order || res2.j || {}); saveL(row);
        if (got.cost) { if (st.bal != null) st.bal = +(st.bal - got.cost).toFixed(2); if (st.shard[XI] != null) st.shard[XI] = +(st.shard[XI] - got.cost).toFixed(2); }
        return got.fill; } });
    };
    if (later) later.push(send); else await send();
  }
  // MC 2026-11-14 Steven: when an order does not fill, show the price it missed. Right after the orders, each market that came up
  // short is read once more and the best ask on our side is kept with the order (missAsk, and how many contracts sat there).
  // MC 2026-11-17 Steven kept missing trades Mitchell's copy took: both copies send the same order in the same second, the first
  // to land takes the contracts at that price, and the other's one-shot order finds the ask a tick over its limit and gets nothing.
  // His misses showed it (limit 91.0c, ask right after 90.8c). With "Try again for a missed fill" on (retryFill, off unless turned
  // on), a short order is sent again for the contracts still wanted: same top price, so it never pays more than the first order
  // was allowed to, once straight after the miss and once about 4 seconds later. It only goes again when the ask is back at or
  // under that top price and has not dropped more than 1c under the price first read (a leader falling away is not chased).
  // fillMerge folds a second fill into the order's row: contracts, average price, fees, cost.
  function fillMerge(row, side, j) {
    const f = +(j.fill_count ?? 0); if (!(f > 0)) return { fill: 0, cost: 0 };
    const ay = j.average_fill_price != null ? +j.average_fill_price : null, px = ay == null ? null : +(side === 'yes' ? ay : 1 - ay).toFixed(4), fe = +(f * (j.average_fee_paid != null ? +j.average_fee_paid : 0)).toFixed(4);
    const f0 = row.fill || 0, tot = +(f0 + f).toFixed(2); if (px != null) { row.px = +(((row.px || 0) * f0 + px * f) / tot).toFixed(4); row.avgYes = +(((row.avgYes || 0) * f0 + ay * f) / tot).toFixed(4); }
    row.fill = tot; row.fees = +((row.fees || 0) + fe).toFixed(4); const before = row.cost || 0; row.cost = row.px == null ? null : +(tot * row.px + row.fees).toFixed(2); row.again = (row.again || 0) + 1;
    return { fill: f, cost: row.cost == null ? 0 : +(row.cost - before).toFixed(2) };
  }
  async function missCheck(missed) {
    if (!missed.length) return;
    const read = async list => { const tks = [...new Set(list.map(m => m.row.tk))], bk = {}; await Promise.all(tks.map(async tk => { try { bk[tk] = book(await get(`/markets/${tk}/orderbook`)); } catch { } }));
      for (const m of list) { const b = bk[m.row.tk]; if (!b) continue; const a = (m.row.side === 'yes' ? b.yesAsks : b.noAsks)[0]; m.row.missAsk = a ? a[0] : null; m.row.missQty = a ? a[1] : null; m.row.missAt = Date.now(); } };
    await read(missed);
    // a part fill can be a sliver of one contract (Steven got 0.02 of 54); the second try asks for whole contracts, so under 1 left is done
    const short = () => missed.filter(m => m.retry && m.again && m.row.want - m.row.fill >= 1 && m.row.close - Date.now() > 240000);
    for (let k = 1; k <= 2 && short().length; k++) {
      if (k > 1) { await new Promise(r => setTimeout(r, 4000)); try { await read(short()); } catch { } }
      for (const m of short()) { const a = m.row.missAsk; if (a == null || a > m.row.limit + 1e-9 || a < m.floor - 1e-9) continue;
        try { const got = await m.again(k); m.row.tries = k; if (got) say(`LIVE second try ${m.row.coin}: ${got} more, now ${m.row.fill}/${m.row.want} at ${(m.row.px * 100).toFixed(1)}c`); } catch (e) { say('second try error: ' + e.message); } }
    }
    for (const m of missed) { try { m.save(); } catch { } }
    say(`LIVE short fills: ${missed.map(m => `${m.row.coin} ${m.row.fill}/${m.row.want}, limit ${(m.row.limit * 100).toFixed(1)}c, ask after ${m.row.missAsk != null ? (m.row.missAsk * 100).toFixed(1) + 'c' : 'none'}`).join('; ')}`);
  }
  // MC 2026-11-14 live cash out at minute 10: sell the position at the bid seen at the check, giving up to 3 cents more for the
  // book moving, never lower. Whatever does not sell is held to the close. A partial sale settles the rest normally (onSettle).
  // MC 2026-11-14 one sell for every early exit on the main live account: the minute-10 cash out and the manual Sell on a
  // position. It sells what is still held, IOC and reduce-only, never below minPx; whatever does not sell stays open and settles
  // normally (onSettle counts the sale in). A second sale on the same position adds to the first.
  async function sellPos(x, minPx, kind) {
    const left = x.fill - (x.sold?.fill || 0); if (!(left > 0)) return { f: 0 };
    const grid = p => (p < 0.1 || p >= 0.9) ? 0.001 : 0.01, up = p => +(Math.ceil(p / grid(p) - 1e-9) * grid(p)).toFixed(4), down = p => +(Math.floor(p / grid(p) + 1e-9) * grid(p)).toFixed(4), cid = `cr${kind[0]}${Date.now() % 100000}-${x.tk}`.slice(0, 60);
    const body = x.side === 'yes'
      ? { ticker: x.tk, side: 'ask', count: String(left), price: up(minPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', reduce_only: true, client_order_id: cid }
      : { ticker: x.tk, side: 'bid', count: String(left), price: down(1 - minPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', reduce_only: true, client_order_id: cid };
    const res = await kreq('POST', '/portfolio/events/orders', body);
    if (!res?.ok) { const e = `${res?.status} ${errOf(res)}`; fail(`${kind === 'cash' ? 'cash out' : 'sell'} ${x.tk} refused: ${e}`); return { f: 0, err: e }; }
    const j = res.j?.order || res.j || {}, f = +(j.fill_count ?? 0), avg = j.average_fill_price != null ? +j.average_fill_price : null, fe = j.average_fee_paid != null ? +j.average_fee_paid * f : 0;
    if (!(f > 0) || avg == null) return { f: 0 };
    const px = +(x.side === 'yes' ? avg : 1 - avg).toFixed(4), p0 = x.sold;
    x.sold = p0 ? { ...p0, at: Date.now(), fill: p0.fill + f, px: +((p0.fill * p0.px + f * px) / (p0.fill + f)).toFixed(4), fee: +((p0.fee || 0) + fe).toFixed(4), [kind]: 1 } : { at: Date.now(), fill: f, px, fee: +fe.toFixed(4), [kind]: 1 };
    if (x.sold.fill >= x.fill) { x.pnl = +(x.sold.fill * x.sold.px - x.sold.fee - (x.cost ?? 0)).toFixed(2); x.result = 'sold'; }
    saveL(x); st.balAt = 0; viewDirty = true; return { f, px };
  }
  async function cashLive(r, best) {
    const x = L.get(r.ticker); if (!x || !(x.fill > 0) || x.result || x.sold || x.close <= Date.now()) return;
    const minPx = Math.max(0.01, best - 0.03), o = await sellPos(x, minPx, 'cash');
    if (o.err) return;
    if (!o.f) { say(`LIVE cash out ${x.tk}: nothing sold at ${(minPx * 100).toFixed(1)}c or better, holding`); x.cashTry = { at: Date.now(), min: minPx }; saveL(x); return; }
    say(`LIVE cashed out ${x.tk}: ${o.f}/${x.fill} at ${(o.px * 100).toFixed(1)}c`);
  }
  // MC 2026-11-14 manual sell. sellQuote reads the book for what is still held: best bid, the average a sale of all of it would get
  // walking down the book, a floor 3c under the best bid, and what selling would book against holding to a win
  // MC 2026-11-15 the position cards now ask for a sell quote every few seconds from every open device. The order book behind
  // it is kept for 4 seconds, so two phones and a laptop watching the same position cost one read, not three. The sell itself
  // does not use this; it places its order against a price floor and Kalshi fills it at the live book.
  const obC = new Map();
  async function obGet(tk) { const c = obC.get(tk), now = Date.now(); if (c && now - c.at < 4000) return c.j; const j = await get(`/markets/${tk}/orderbook`); if (j) { obC.set(tk, { at: now, j }); if (obC.size > 40) for (const [k, v] of obC) if (now - v.at > 60000) obC.delete(k); } return j; }
  async function sellQuote(tk) {
    const x = L.get(tk); if (!x || !(x.fill > 0) || x.result) return { ok: false, msg: 'No open live position in that market.' };
    if (x.close <= Date.now()) return { ok: false, msg: 'That market has closed; it settles on its own.' };
    const left = x.fill - (x.sold?.fill || 0); let b; try { b = bids(await obGet(tk)); } catch { return { ok: false, msg: 'Could not read the market. Try again.' }; }
    const mine = x.side === 'yes' ? b.yes : b.no, best = mine[0]?.[0] ?? null; if (best == null) return { ok: false, msg: `Nobody is buying ${x.side.toUpperCase()} right now, so it cannot be sold.` };
    const avg = walk(mine, left) ?? null, depth = mine.reduce((a, l) => a + l[1], 0), est = Math.min(left, depth), px = avg ?? (mine.reduce((a, l) => a + l[0] * l[1], 0) / depth), fe = fee(px, est);
    const prior = x.sold ? x.sold.fill * x.sold.px - (x.sold.fee || 0) : 0, proceeds = +(est * px - fe).toFixed(2);
    return { ok: true, tk, coin: x.coin, side: x.side, left, est, best, avg: +px.toFixed(4), minPx: +Math.max(0.01, best - 0.03).toFixed(4), proceeds, pnl: +(proceeds + prior - (x.cost ?? 0)).toFixed(2), ifWin: +(left + prior - (x.cost ?? 0)).toFixed(2), ifLose: +(prior - (x.cost ?? 0)).toFixed(2), paid: x.px, accts: [{ id: 'main', name: 'Main', left, ok: true }, ...(await books.load(), books.heldList(tk)).map(b => ({ ...b, ok: true }))] };
  }
  // MC 2026-11-14 manual buy, the other half of the manual sell. Asked for after SOL led NO at 94c with 7 minutes left: the rule
  // only buys at the trade check, so there was no way to pick it up from the dashboard. buyQuote reads the book for the side asked:
  // best ask, the average a buy at the live size would pay walking up the book, and a ceiling of the best ask plus the live price
  // room. The live rules a buy like this would not have passed (the timing, price band, coins, window cap, profit target) are named
  // in the quote, not enforced: buying by hand is the point. The hard stops stay: live on, an unlocked device, the daily loss cap,
  // the daily order limit, the cash floor and the $50 size cap. One position per market, so a market live already holds is refused.
  function handGate(c, tk) {
    const t = todayL(), x = L.get(tk);
    if (!c.enabled) return 'Turn live trading on first. A manual buy uses the live account.';
    if (x && busy(x)) return 'Live already holds this market.';
    if (realized(t) <= -c.dailyLossUsd) return `Live's daily loss cap is hit (${realized(t).toFixed(2)}), so no more buys today.`;
    if (t.filter(busy).length >= HARD.maxPerDay) return 'Live has reached its daily order limit.';
    return null;
  }
  const handMkt = (tk, side) => { const s = SERIES.find(z => String(tk).startsWith(z + '-')); return s && (side === 'yes' || side === 'no') ? s : null; };
  async function buyQuote(tk, side) {
    tk = String(tk || ''); const s = handMkt(tk, side); if (!s) return { ok: false, msg: 'Unknown market.' };
    // MC 2026-11-15 the quote lists the accounts a hand buy can go to (accts). When the main account already holds the market the
    // quote still comes back if a book could take it, with mainHeld set, so a position can be added to the books afterwards.
    await books.load(); const bkL = books.handList(tk), HELD = 'Live already holds this market.';
    const c = ctl(), g = handGate(c, tk), mainHeld = g === HELD && bkL.some(b => b.ok); if (g && !mainHeld) return { ok: false, msg: g };
    let m, ob; try { [m, ob] = await Promise.all([get(`/markets/${tk}`), get(`/markets/${tk}/orderbook`)]); m = m?.market || m; } catch { return { ok: false, msg: 'Could not read the market. Try again.' }; }
    const now = Date.now(), close = Date.parse(m?.close_time); if (!(close > now + 20000)) return { ok: false, msg: 'That market is about to close, too late to buy.' };
    const mine = book(ob)[side === 'yes' ? 'yesAsks' : 'noAsks'], best = mine[0]?.[0] ?? null; if (best == null) return { ok: false, msg: `Nobody is selling ${side.toUpperCase()} right now.` };
    const room = Math.min(3, Math.max(0, cfgL.slipC ?? 1)), maxPx = +Math.min(0.99, best + room / 100).toFixed(4), size = c.sizeUsd, n = Math.floor(size / maxPx);
    if (n < 1) return { ok: false, msg: 'Your live size is too small for one contract at this price.' };
    const near = mine.filter(([p]) => p <= maxPx + 1e-9), depth = near.reduce((a, l) => a + l[1], 0), est = Math.min(n, depth), avg = est ? walk(near, est) : best, fe = fee(avg, est), cost = +(est * avg + fe).toFixed(2);
    const bal = await balance(false), floor = c.minBank ?? HARD.minBank; if (!mainHeld && bal != null && bal - vault.held() - resv < floor) return { ok: false, msg: `Your Kalshi cash ($${bal.toFixed(2)}) is under the $${floor} floor.` };
    const cn = coin(s), t = todayL(), mark = close - 10 * 60000, notes = [];
    notes.push(now < mark ? `${Math.round((mark - now) / 60000)} min before the trade check` : `after the trade check (${Math.max(0, Math.round((close - now) / 60000))} min left)`);
    if (best < 0.5) notes.push(`${side.toUpperCase()} is behind, under 50¢`);
    else if (best < (cfgL.minAsk ?? 0.9) || best > (cfgL.maxAsk ?? 0.99)) notes.push(`${(best * 100).toFixed(1)}¢ is outside your live price band (${Math.round((cfgL.minAsk ?? 0.9) * 100)} to ${Math.round((cfgL.maxAsk ?? 0.99) * 100)}¢)`);
    if (cfgL.coins?.length && !cfgL.coins.includes(cn)) notes.push(`${cn} is not one of your live coins`);
    if (coldSet(now, cfgL).has(cn)) notes.push(`${cn} is benched`);
    if ((cfgL.skipHours || []).includes(etHour(now))) notes.push('this hour is one of your off hours');
    if (cfgL.dailyWinUsd > 0 && realized(t) >= cfgL.dailyWinUsd) notes.push(`live's daily profit target is already hit (+$${realized(t).toFixed(2)})`);
    { const cap = Math.min(HARD.maxPerWindow, cfgL.winCap ?? 9), inW = [...L.values()].filter(x => x.close === close && busy(x)).length; if (inW >= cap) notes.push(`this window already has ${inW} live trade${inW === 1 ? '' : 's'}, your cap is ${cap}`); }
    return { ok: true, tk, coin: cn, side, best, avg: +avg.toFixed(4), maxPx, room, n, est, size, cost, fee: fe, ifWin: +(est - cost).toFixed(2), ifLose: -cost, close, notes, mainHeld, accts: [{ id: 'main', name: 'Main', size, ok: !mainHeld, why: mainHeld ? 'already holds it' : null }, ...bkL] };
  }
  function onSettle(r) {
    const x = L.get(r.ticker); if (!x || x.result || !(x.fill > 0)) return;
    if (x.sold && !x.sold.cash && !x.sold.manual) return;
    // the rest of a partly cashed-out position settles here, with the sale counted in
    const keep = x.fill - (x.sold?.fill || 0), sale = x.sold ? x.sold.fill * x.sold.px - (x.sold.fee || 0) : 0;
    x.result = r.result; x.won = r.result === x.side; x.pnl = +((x.won ? keep : 0) + sale - (x.cost ?? 0)).toFixed(2); saveL(x); st.balAt = 0;
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
  let apiV = null, labRowsMem = null, tradesMem = null;
  function liveView() {
    const c = ctl(), t = todayL().filter(x => x.fill > 0), done = t.filter(x => x.result), all = [...L.values()].sort((a, b) => b.at - a.at);
    return { on: c.enabled, autoPause: c.autoPause, money: (kmoney?.list?.length ? kmoney.list : Array.isArray(ctlL.money) ? ctlL.money : []).filter(x => !(ctlL.moneyHide || []).includes(x.id)), moneyOut: kmoney?.list?.length ? kmoney.list.filter(x => (ctlL.moneyHide || []).includes(x.id)) : [], moneySrc: kmoney?.list?.length ? 'kalshi' : 'manual', moneyHand: Array.isArray(ctlL.money) ? ctlL.money : [], moneyAt: kmoney?.at || null, moneyErr: kmoney?.err || null, moneyPend: kmoney?.pend || 0, size: c.sizeUsd, dailyLossUsd: c.dailyLossUsd, since: c.at || null, keys: hasKeys(), keyOk: st.keyOk, bal: st.bal, balAt: st.balAt || null, shard: st.shard, crypto: st.shard[XI] ?? null, xfer: st.lastXfer, err: st.lastErr && Date.now() - st.errAt < 3600000 ? st.lastErr : null, stopped: st.stopped && (!st.stoppedTo || Date.now() < st.stoppedTo) ? st.stopped : null, stoppedDay: !!st.stoppedDay,
      hard: { ...HARD, minBank: c.minBank }, // MC 2026-11-15 paper's Today line says how many trades its playbook passed on and how they went (5-1); live had no such count.
      // Same idea for live: today's markets the live playbook skipped, scored by how the market settled.
      today: { n: done.length, won: done.filter(x => x.won).length, net: +realized(done).toFixed(2), open: t.filter(x => !x.result).length, ...(() => { const ps = todayL().filter(x => x.skipped && x.strat && !(x.fill > 0)), rs = ps.map(x => [x, rec.get(x.tk)?.result]).filter(z => z[1] === 'yes' || z[1] === 'no'); return { passed: ps.length, pWon: rs.filter(z => z[1] === z[0].side).length, pLost: rs.filter(z => z[1] !== z[0].side).length }; })() }, bench: [...coldSet(Date.now(), cfgL)], cfg: cfgL, where: 'cloud',
      total: { n: all.filter(x => x.result && x.fill > 0).length, net: +realized(all.filter(x => x.fill > 0)).toFixed(2) },
      open: all.filter(x => x.fill > 0 && !x.result).map(x => ({ tk: x.tk, coin: x.coin, side: x.side, fill: x.fill, px: x.px, cost: x.cost, paperPx: x.paperPx, close: x.close, at: x.at })),
      // MC 2026-11-08 every settled live trade in the paper history's compact shape, for the dashboard's Live analytics tab
      hist: all.filter(x => x.fill > 0 && x.result).slice(0, 2000).map(x => [x.close, x.coin, x.side, x.px, x.fill, x.pnl, x.won ? 1 : 0, 1, x.hand ? 1 : 0]),   // MC 2026-11-15 last flag: bought by hand, so Analytics can split hand buys from the tracker's own
      // MC 2026-11-14 limWhy: what set the order's top price (the room, or a cap that held it lower)
      // MC 2026-11-14 with the order's limit, the ask it was based on, how fast it went out, what a miss saw after, the fees, and
      // the minute-10 check from the paper record of the same market (m10: sale price, best bid, trend direction, share of lead kept)
      recent: all.slice(0, 150).map(x => { const rr = rec.get(x.tk), e = rr?.exit || (rr?.m10 ? { ...rr.m10, dir: null } : null); return { tk: x.tk, coin: x.coin, side: x.side, at: x.at, close: x.close, want: x.want ?? null, fill: x.fill ?? 0, px: x.px ?? null, paperPx: x.paperPx, cost: x.cost ?? null, result: x.result || null, won: x.won ?? null, pnl: x.pnl ?? null, err: x.err || null, skipped: x.skipped || null, mres: rr?.result === 'yes' || rr?.result === 'no' ? rr.result : null, sold: x.sold || null, strat: x.strat || null, hand: x.hand || null, was: x.was || null, strike: x.strike ?? null, title: x.title || null, final: x.final ?? null,
        ask: x.ask ?? null, limit: x.limit ?? null, limWhy: x.limWhy || null, size: x.size ?? null, fees: x.fees ?? null, sent: x.sent ?? null, rtt: x.rtt ?? null, again: x.again || 0, missAsk: x.missAsk ?? null, missQty: x.missQty ?? null, m10: e ? [e.px ?? null, e.best ?? null, e.dir, e.keep ?? null, e.pct] : null }; }),
      playbook: { id: stratAt(c.strat, Date.now()), since: stratSince(c.strat, Date.now()), log: (c.strat || []).slice(-12) }, books: books.view(), api: apiV, vault: vault.view() };
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
    // MC 2026-11-14 read the live balances while the coins are scanned, so the first order does not wait for one
    const warm = Promise.all([ctl().enabled && hasKeys() ? balance(true).catch(() => { }) : null, books.warm().catch(() => { })]);
    // MC 2026-11-17 two waits taken out of every coin's read. (1) The market list was asked first just to learn the ticker; the
    // minute scan saw the same market under a minute ago, so when it is still in memory the read goes straight to the order
    // book (the list is still asked when memory is empty or the market does not fit the mark). (2) The Coinbase candles were
    // asked only after the order book had answered, because the reading needs the leading side; they are now asked at the same
    // moment and the side is handed over when the book is in. Each coin waits for the slower of the two, not one after the other.
    const scanOne = async s => {
      const got = [], mem = mkMem.get(s), fits = m => { const left = (Date.parse(m.close_time) - now) / 60000; return left <= MIN_LEFT + 0.4 && left >= MIN_LEFT - 1; };
      const ms = mem && fits(mem) && detail(mem).strike > 0 ? [mem] : (await get(`/markets?series_ticker=${s}&status=open&limit=6`))?.markets || [];
      for (const m of ms) {
        const close = Date.parse(m.close_time), left = (close - now) / 60000;
        if (rec.has(m.ticker) || left > MIN_LEFT + 0.4 || left < MIN_LEFT - 1) continue;
        let tell = null; const sideP = new Promise(z => { tell = z; }), det = detail(m), vP = volAt(coin(s), det.strike, sideP);
        try {
        const b = book(await get(`/markets/${m.ticker}/orderbook`));
        const ya = b.yesAsks[0]?.[0], na = b.noAsks[0]?.[0]; if (ya == null || na == null) continue;
        const side = ya >= na ? 'yes' : 'no', asks = side === 'yes' ? b.yesAsks : b.noAsks, ask = asks[0][0];
        if (ask < KEEP_LO) continue;
        tell(side);
        const avgN = walk(asks, BOOK_N);
        // MC 2026-11-12 what 250 and 500 contracts would cost at the mark, logged beside the 100-contract price. The backtests
        // assume every order fills near the quote; before the live size goes past $50 a trade we need to know which coins have
        // the book for it. null = the book did not hold that many.
        // MC 2026-11-17 1,000 contracts too, and lad: the ten best offers as [price in tenths of a cent, contracts], so any
        // order size can be priced afterwards, in dollars, without guessing from three fixed sizes.
        const dp = n => { const a = walk(asks, n); return a == null ? null : +a.toFixed(4); };
        const r = { a250: dp(250), a500: dp(500), a1000: dp(1000), lad: asks.slice(0, 10).map(([p, q]) => [Math.round(p * 1000), Math.round(q)]), ticker: m.ticker, series: s, at: now, close, left: +left.toFixed(2), side, ask, depthAtAsk: asks[0][1], avgN: avgN == null ? null : +avgN.toFixed(4), ...det, ya, na, depth: asks.reduce((a, x) => a + x[1], 0), src: 'cloud' };
        const v = await vP; if (v) r.vol = v;
        got.push(r);
        } finally { tell(null); }
      }
      return got;
    };
    const paperS = new Set(activeSeries()), liveS = new Set(liveSeries()), hitsL = [], seen = [];
    const all = await Promise.all(scanSeries().map(s => scanOne(s).catch(e => { say(`scan ${s} error: ${e.message}`); return []; })));
    for (const r of all.flat()) {
      if (rec.has(r.ticker)) continue;
      if (!paperS.has(r.series)) r.lo = 1;
      rec.set(r.ticker, r); saveRec(r); n++;
      // MC 2026-11-13 request 9: a maximum price beside the minimum, so a price band can be tried without changing a playbook
      if (!r.lo && r.ask >= cfgP.minAsk && r.ask <= (cfgP.maxAsk ?? 0.99) + 1e-9) { say(`${r.ticker} ${r.side.toUpperCase()} at ${Math.round(r.ask * 100)}c <- rule`); hits.push(r); }
      // MC 2026-11-14 live has its own price band and coins
      if (liveS.has(r.series) && r.ask >= cfgL.minAsk && r.ask <= (cfgL.maxAsk ?? 0.99) + 1e-9) hitsL.push(r);
      seen.push(r);
    }
    console.log(`entry ${n} coins read in ${Date.now() - t0}ms, ${hits.length} for the rule, ${Math.round((Date.now() - (nextMark(now) - Q)) / 100) / 10}s after the mark`);
    // MC 2026-11-08 live orders go after the scan so the active playbook can see the whole window (how many coins qualified,
    // each coin's volatility reading). Was: order per coin inside the loop under the plain rule.
    learnFill(now + 1);
    // the playbook check for one hit, shared by the main live book and the subaccount books
    // MC 2026-11-15 the check is built from a set of live rules and that set's trades, so a book with its own rules gets its own
    const mkGate = (cfg, H) => { let kS0 = null; const kState = () => { if (!kS0) { kS0 = kNew(); for (const x of rec.values()) if (x.result && x.result !== 'void' && x.ask >= cfg.minAsk && x.close <= now) kAdd(kS0, x.avgN || x.ask, !!x.won); } return kS0; };
      return (sid, r) => { const lab = labDefs(cfg).find(l => l.id === sid); if (!lab || lab.m10Only || lab.ep) return { ok: false, why: 'playbook not available live' };
        if (sid === 'kelly' || (sid === 'mix' && cfg.mixSize === 'kelly')) { r.kf = kOf(kState(), r.avgN || r.ask).kf; r.win = H.length; }
        const f = sid === 'rule' ? true : lab.filter({ px: r.avgN || r.ask, win: H.length, same: H.filter(h => h.side === r.side).length, z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, tl: r.vol?.tl ?? null, lk: r.vol?.lk ?? null, sw: r.vol?.sw ?? null, dp: r.vol?.dp ?? null, r2: r.vol?.r2 ?? null, kf: r.kf ?? null, pl: r.lp ?? null });
        if (f === true) return { ok: true, lab }; const tt = { px: r.avgN || r.ask, win: H.length, same: H.filter(h => h.side === r.side).length, z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, sw: r.vol?.sw ?? null, dp: r.vol?.dp ?? null, r2: r.vol?.r2 ?? null, kf: r.kf ?? null, pl: r.lp ?? null };
        return { ok: false, why: `${lab.name}: ${labWhy(sid, tt, cfg) || 'it did not pass this playbook\'s checks'}` }; }; };
    const gate = mkGate(cfgL, hitsL);
    const ownOf = cfg => { const H = seen.filter(r => (!cfg.coins?.length || cfg.coins.includes(coin(r.series))) && r.ask >= cfg.minAsk && r.ask <= (cfg.maxAsk ?? 0.99) + 1e-9).sort((a, b) => (b.vol?.z ?? -9) - (a.vol?.z ?? -9)); return { hits: H, gate: mkGate(cfg, H), cfg, bench: coldSet(now, cfg) }; };
    const c = ctl(), sends = [], missed = [];
    await warm;
    if (c.enabled && c.autoPause && hitsL.length) { for (const r of hitsL) skipLive(r, 'automatic buying is paused'); console.log(`entry: automatic buying is paused, ${hitsL.length} left alone`); }
    if (c.enabled && !c.autoPause && hitsL.length) {
      const sid = stratAt(c.strat, now), lab = labDefs(cfgL).find(l => l.id === sid);
      let kS = null; if (sid === 'kelly' || (sid === 'mix' && cfgL.mixSize === 'kelly')) { kS = kNew(); for (const x of rec.values()) if (x.result && x.result !== 'void' && x.ask >= cfgL.minAsk && x.close <= now) kAdd(kS, x.avgN || x.ask, !!x.won); }
      // MC 2026-11-09 schedule: hours (ET, by entry time) picked as off are skipped (MC 2026-11-14 live's own off hours now)
      const offNow = (cfgL.skipHours || []).includes(etHour(now));
      hitsL.sort((a, b) => (b.vol?.z ?? -9) - (a.vol?.z ?? -9));   // clearest first, so profit protection gives them the room
      for (const r of hitsL) {
        if (offNow) { skipLive(r, `off schedule (${etHour(now)}:00 ET hour)`); continue; }
        if (kS) { r.kf = kOf(kS, r.avgN || r.ask).kf; r.win = hitsL.length; }
        const f = sid === 'rule' ? true : lab.filter({ px: r.avgN || r.ask, win: hitsL.length, same: hitsL.filter(h => h.side === r.side).length, z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, tl: r.vol?.tl ?? null, lk: r.vol?.lk ?? null, sw: r.vol?.sw ?? null, dp: r.vol?.dp ?? null, r2: r.vol?.r2 ?? null, kf: r.kf ?? null, pl: r.lp ?? null });
        if (f === true) { try { await onRule(r, lab, sends, missed); } catch (e) { fail('order error: ' + e.message); } }
        else skipLive(r, `${lab.name}: ${labWhy(sid, { px: r.avgN || r.ask, win: hitsL.length, same: hitsL.filter(h => h.side === r.side).length, z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, sw: r.vol?.sw ?? null, dp: r.vol?.dp ?? null, r2: r.vol?.r2 ?? null, kf: r.kf ?? null, pl: r.lp ?? null }, cfgL) || 'it did not pass this playbook\'s checks'}`);
      }
    }
    if (!c.autoPause && (hitsL.length || (seen.length && books.ownCoins()?.length !== 0))) {
      hitsL.sort((a, b) => (b.vol?.z ?? -9) - (a.vol?.z ?? -9));
      const ts = Date.now();
      await Promise.all([Promise.all(sends.map(f => f().catch(e => fail('order error: ' + e.message)))), books.onMark(hitsL, now, gate, cfgL, coldSet(now, cfgL), missed, ownOf).catch(e => say('books error: ' + e.message))]);
      if (sends.length || books.anyOn()) console.log(`orders ${sends.length} main sent together, all answered ${Date.now() - ts}ms after sending began, ${Date.now() - t0}ms after the scan began`);
      try { await missCheck(missed); } catch (e) { say('miss check error: ' + e.message); }
    }
    } finally { entryBusy = false; resv = 0; }
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
      mkMem.set(s, m);
      // MC 2026-11-17 on the paid plan every kept leader (60c and up) gets its minute prices, and they are saved each minute.
      // Before, the path lived in memory until the trade settled, and Cloudflare drops this object from memory between minutes
      // when nobody has the page open, so most paths held only their last minute or two.
      if (r && !r.result && (r.ask >= K.minAsk || (PAID && r.ask >= KEEP_LO))) { r.path = r.path || []; r.path.push([Math.round(now / 1000), yb, ya, last]); if (r.path.length > 40) r.path.splice(0, r.path.length - 40); if (PAID) saveRec(r); }
    }
    scan = out; scanAt = now;
    // MC 2026-11-14 the path capture and the volatility repair stand aside from 7 to 3 minutes before each close, when the trend
    // check reads Coinbase (they were using up Coinbase's allowance and the trend check got 429s on most coins)
    const toClose = Q - (now % Q);
    if (now - mk > 150000 && nextMark(now) - now > 90000) { const cbOk = toClose > 420000 || toClose < 180000;
      if (cbOk) try { await trendFill(now, PAID ? 600 : 60); } catch (e) { say('trend fill error: ' + e.message); }
      if (cbOk) try { await pathFill(now); } catch (e) { console.log('path fill error: ' + e.message); }
      try { await gapFill(now); } catch (e) { say('gap fill error: ' + e.message); }
      try { await moneySync(now); } catch (e) { console.log('money sync error: ' + e.message); }
      if (cbOk) try { await volRepair(now, PAID ? 400 : 40); } catch (e) { say('repair error: ' + e.message); } }
    await settleSome(now, false);
    try { await trendCheck(now); } catch (e) { say('trend check error: ' + e.message); }
    try { await minute10(now, out); } catch (e) { say('minute 10 error: ' + e.message); }
    try { await keepFill(now); } catch (e) { say('share fill error: ' + e.message); }
    try { await settle3(now); } catch (e) { say('minute 10 settle error: ' + e.message); }
    // MC 2026-11-10 was also gated on st.lastMark >= mk, which lives in memory: the object is dropped from memory between
    // minutes often enough that the second look never ran once in its first three windows. The clock alone decides now.
    if (now - mk > 70000) { try { await secondLook(now, out); } catch (e) { say('second look error: ' + e.message); } }
    try { await settle2(now); } catch (e) { say('second look settle error: ' + e.message); }
    try { await settleH(now); } catch (e) { say('hand paper settle error: ' + e.message); }
    // live account upkeep
    const c = ctl();
    if (c.sellAllAt && c.sellAllAt > st.sellAllDone) { st.sellAllDone = c.sellAllAt; await kv.put('kst', { sellAllDone: st.sellAllDone }); say('LIVE sell-all requested'); try { await sellAll(); } catch (e) { fail('sell-all error: ' + e.message); } }
    if (hasKeys() && (c.enabled || now - st.balAt > 5 * 60000)) { try { await balance(); } catch (e) { fail(e.message); } }
    if (c.enabled && st.balAt) { try { await fund(c); } catch (e) { fail('funding error: ' + e.message); } }
    try { await books.upkeep(now); } catch (e) { say('books upkeep error: ' + e.message); }
    try { await vault.upkeep(now); } catch (e) { say('vault upkeep error: ' + e.message); }
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
      const na = +(1 - yb).toFixed(4), side = ya >= na ? 'yes' : 'no', ask = side === 'yes' ? ya : na; if (ask < KEEP_LO) { why.low++; continue; }
      const r = { ticker: m.ticker, series: s, at: w - 600000, close: w, left: 10, side, ask, depthAtAsk: null, avgN: null, ...detail(m), ya, na, src: 'fill' };
      if (m.result === 'yes' || m.result === 'no') { r.result = m.result; r.won = m.result === side; r.final = fin(m); }
      rec.set(m.ticker, r); saveRec(r); n++;
    }
    if (why.nomkt === activeSeries().length && w > now - 6 * 3600000) { console.log(`gapfill ${new Date(w).toISOString()} no markets listed yet ${smp}`); return; }
    g[0] = w - 599000; await kv.put('kgaps', gaps); viewDirty = true;
    say(`filled in the ${new Date(w - 600000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET trade check: ${n} coin${n === 1 ? '' : 's'} at 85c or more`);
    console.log(`gapfill ${new Date(w).toISOString()} added ${n} ${JSON.stringify(why)} ${smp}`);
  }
  // MC 2026-11-14 a row counts as ours for the fast settle when paper or live would take it at its price (live's band can start
  // lower than paper's), or when the live account holds it
  const ours = r => r.ask >= Math.min(cfgP.minAsk, cfgL?.minAsk ?? 1) || L.has(r.ticker);
  async function settleSome(now, quick) {
    let k = 0, any = false;
    for (const r of rec.values()) {
      if (r.result || now < r.close + (quick ? 15000 : 60000)) continue;
      if (quick && (!ours(r) || now > r.close + 600000)) continue;
      if (++k > (PAID ? 40 : 12)) break;
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
    // MC 2026-11-15 a hand buy stayed "open" on Trades after its market closed. Live positions were only ever settled through the
    // tracker's own record of the market, and a market under 85c at the trade check has no record, so a hand buy there was
    // paid by Kalshi but never closed here. Any live position (Main's or a book's) past its close with no record of its own
    // is now asked for directly, six a pass.
    { const due = new Set(); for (const x of L.values()) if (x.fill > 0 && !x.result && x.close <= now - 15000 && x.close > now - 86400000 && !(x.sold && !x.sold.cash && !x.sold.manual)) due.add(x.tk); try { for (const tk of books.dueTks(now - 15000)) due.add(tk); } catch { }
      let n = 0; for (const tk of due) { const r0 = rec.get(tk); if (r0 && !r0.result && now < r0.close + 6 * 3600000) continue; if (++n > 6) break;
        let res = r0?.result, mk = null; if (res !== 'yes' && res !== 'no') { try { const j = await get(`/markets/${tk}`); mk = j?.market || null; res = mk?.result; } catch { continue; } }
        if (mk) { const fin = kNum(mk.expiration_value); for (const x of [L.get(tk), ...books.rowsOf(tk)]) if (x) { if (x.strike == null) x.strike = kStrike(mk); x.title = x.title || mk.title || null; if (fin != null && x.final == null) x.final = fin; } }
        if (res !== 'yes' && res !== 'no') continue;
        const r = { ticker: tk, result: res }; say(`settled ${tk} (live position, no tracker record): ${res}`);
        try { onSettle(r); } catch (e) { fail('settle error: ' + e.message); } try { books.onSettle(r); } catch (e) { say('books settle error: ' + e.message); } any = true; viewDirty = true; } }
    // MC 2026-11-16 hand buys made before their rows kept the market's target have no replay under Trades; fill the target,
    // title and settled value in from the market, a few a pass, for the last week
    { const need = [...L.values(), ...books.allRows()].filter(x => x.hand && x.strike == null && !x.metaTry && x.close > now - 7 * 86400000 && x.close < now - 60000 && !rec.get(x.tk)?.strike).slice(0, 4);
      for (const x of need) { x.metaTry = 1; try { const j = await get(`/markets/${x.tk}`), mk = j?.market; if (!mk) continue; const fin = kNum(mk.expiration_value);
          for (const y of [L.get(x.tk), ...books.rowsOf(x.tk)]) if (y && y.strike == null) { y.strike = kStrike(mk) ?? null; y.title = y.title || mk.title || null; if (fin != null) y.final = fin; if (L.get(x.tk) === y) saveL(y); else books.saveAny(y); } viewDirty = true; } catch { } } }
    if (any) { st.balAt = 0; }
    return any;
  }
  // the next wake: the next 10-minute mark, or sooner when one of our trades just closed or is still waiting on its result
  function nextAlarm(now) {
    let t = nextMark(now + 1000);
    for (const r of rec.values()) {
      if (r.result || !ours(r) || now > r.close + 600000) continue;
      t = Math.min(t, now < r.close + 15000 ? r.close + 15000 : now + 20000);
    }
    // live positions with no tracker record (hand buys) get the same quick look after their close
    for (const x of L.values()) { if (x.result || !(x.fill > 0) || rec.has(x.tk) || now > x.close + 600000) continue; t = Math.min(t, now < x.close + 15000 ? x.close + 15000 : now + 20000); }
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
  // MC 2026-11-15 Kalshi's prices on the scanner were read once a minute, too slow to trade the other coins by hand. While
  // someone has the board open the page asks for a fresh read, and the nine markets' prices are fetched again, at most once
  // every 9 seconds however many devices ask. Nothing is recorded from it; the minute read still does the bookkeeping.
  let sqAt = 0, sqBusy = null;
  // MC 2026-11-15 later: the first version read the nine markets one by one, nine requests at once every 9 seconds while anyone
  // watched, and with the sell quotes below it Steven's tracker was turned away by Kalshi (429). Now one request for all nine
  // (the market list takes a list of tickers) every 15 seconds at most.
  async function scanQuick() {
    await load(); const now = Date.now(); if (!scan.length) return null; if (now - Math.max(scanAt, sqAt) < 15000) return false; if (sqBusy) return sqBusy; sqAt = now;
    sqBusy = (async () => { try { const live = scan.filter(x => x.close > Date.now()); if (!live.length) return true;
        const j = await get(`/markets?tickers=${live.map(x => x.tk).join(',')}&limit=${live.length + 5}`), M = new Map((j?.markets || []).map(m => [m.ticker, m]));
        for (const x of live) { const m = M.get(x.tk); if (!m) continue;
          const yb = d4(num(m.yes_bid_dollars ?? m.yes_bid)), ya = d4(num(m.yes_ask_dollars ?? m.yes_ask)), last = d4(num(m.last_price_dollars ?? m.last_price)); if (yb == null && ya == null) continue;
          const na = yb == null ? null : +(1 - yb).toFixed(4); x.yb = yb; x.ya = ya; x.last = last; x.leader = ya == null || na == null ? null : ya >= na ? 'yes' : 'no'; x.lask = x.leader === 'yes' ? ya : x.leader === 'no' ? na : null; x.q = Date.now(); }
        return true; } catch { return true; } finally { sqBusy = null; } })();
    return sqBusy;
  }
  const liveJson = () => JSON.stringify(kliveBody());
  function kliveBody() {
    const now = Date.now(), K = cfgP, open = [], fresh = tk => { const z = scan.find(q => q.tk === tk); return z?.q && now - z.q < 60000 ? z : null; };
    // MC 2026-11-17 a card sat with no tag for a minute or two after the trade check: the tag came from the paper book's own
    // list, which is rebuilt up to two minutes later. The playbook's answer for each open market is worked out here as well (pb 1
    // took it, 0 passed with the reason), so the card can say so at once. The window cap and the day's stops still come from the
    // paper book when it catches up.
    const sidP = stratAt(K.strat, now), labP = labDefs(K).find(l => l.id === sidP), wN = {}, sN = {};
    for (const r of rec.values()) if (!r.result && r.ask >= K.minAsk && r.ask <= (K.maxAsk ?? 0.99) + 1e-9) { wN[r.close] = (wN[r.close] || 0) + 1; sN[r.close + r.side] = (sN[r.close + r.side] || 0) + 1; }
    const pbOf = (r, px) => { if (!labP || labP.late || labP.m10Only || labP.size || sidP === 'kelly') return {}; const tt = { px, win: wN[r.close] || 1, same: sN[r.close + r.side] || 1, z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, tl: r.vol?.tl ?? null, lk: r.vol?.lk ?? null, sw: r.vol?.sw ?? null, dp: r.vol?.dp ?? null, r2: r.vol?.r2 ?? null, kf: null, pl: r.lp ?? null };
      let f; try { f = sidP === 'rule' ? true : labP.filter(tt); } catch { return {}; } return f === true ? { pb: 1 } : { pb: 0, why: labWhy(sidP, tt, K) }; };
    for (const r of rec.values()) {
      if (r.result || !(r.ask >= K.minAsk) || now > r.close + 300000) continue;   // MC 2026-11-08 keep a closed trade on the board until it settles (was dropped after 90s)
      const px = r.avgN || r.ask, n = Math.floor(K.sizeUsd / px), lp = r.path?.at(-1);
      open.push({ ...pbOf(r, px), tk: r.ticker, coin: coin(r.series), side: r.side, px: +px.toFixed(4), ask: r.ask, n, cost: +(n * px + fee(px, n)).toFixed(2), at: r.at, close: r.close, strike: r.strike ?? null, title: r.title || null, yb: fresh(r.ticker)?.yb ?? lp?.[1] ?? null, ya: fresh(r.ticker)?.ya ?? lp?.[2] ?? null, last: fresh(r.ticker)?.last ?? lp?.[3] ?? null, path: r.path || [], z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, pl: r.lp ?? null });
    }
    if (stratAt(K.strat, now) === 'look2') for (const r of rec2.values()) {
      if (r.result || now > r.close + 300000 || baseTaken(r.ticker)) continue;
      const px = r.avgN || r.ask, n = Math.floor(K.sizeUsd / px), lp = rec.get(r.ticker)?.path?.at(-1), i = open.findIndex(o => o.tk === r.ticker), o = { late: 1, left: r.left, tk: r.ticker, coin: coin(r.series), side: r.side, px: +px.toFixed(4), ask: r.ask, n, cost: +(n * px + fee(px, n)).toFixed(2), at: r.at, close: r.close, strike: r.strike ?? null, title: r.title || null, yb: lp?.[1] ?? null, ya: lp?.[2] ?? null, last: lp?.[3] ?? null, path: rec.get(r.ticker)?.path || [], z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, pl: null };
      if (i >= 0) open[i] = o; else open.push(o);
    }
    return { at: Math.max(scanAt, ...scan.map(z => z.q || 0)) || now, open, scan, size: K.sizeUsd, minAsk: K.minAsk, live: liveView(), where: 'cloud' };
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
    // MC 2026-11-13 vault sweeps go out as live win notices
    while (vq.length) { const e = vq.shift(); out.push({ book: 'live', kind: 'settle', win: true, loss: false, title: e.title, body: e.body, tag: 'kvault', url: e.url }); }
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
    // MC 2026-11-14 the trend check was turned away by Coinbase (429) on most coins since the price path capture started sharing
    // the same API; one retry after a pause, and the capture now stands aside around minute 10 (see tick)
    let pts = []; try { let raw; try { raw = await advCandles(pid, x0 + 240, x0 + 600); } catch (e) { if (e.status !== 429) throw e; await sleep(1500); raw = await advCandles(pid, x0 + 240, x0 + 600); } pts = raw.map(k => [k[0] + 60, k[4]]).filter(p => p[0] >= x0 + 300 && p[0] <= x0 + 600); } catch (e) { console.log(`trend ${c}: ${e.message}`); return null; }
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
  // MC 2026-11-13 Steven could not replay early-morning trades: the page drew the replay from Coinbase's recent-trades feed,
  // which only reaches back an hour or so on a busy coin, then fell back to one price a minute. Each window's exact path is now
  // kept here. A short while after a window closes, every coin the tracker recorded in it (85c and up) is queued; the queue
  // asks Coinbase Advanced Trade's public trades for that window, 1,000 trades a request (BTC needs about 15, a quiet coin 1),
  // newest first, stepping back until the window's start, at most 8 requests a minute and never near a trade check. The path is
  // stored as one price per second where it changed, about 5 KB a coin-window, kept 30 days, and read back only when a replay
  // opens. The first run also queues the last two days. The exchange feed is not used: it rate-limits Cloudflare (Nov 10).
  sql.exec('CREATE TABLE IF NOT EXISTS kpath (tk TEXT PRIMARY KEY, close INTEGER, j TEXT)');
  let pq = null, pqAt = null, pj = null, pqSaveAt = 0;
  const PATH_DAYS = 30, PATH_BUDGET = PAID ? 30 : 8;
  async function pathQueue(now) {
    if (pq == null) { pq = (await kv.get('kpq')) || []; pqAt = (await kv.get('kpqAt')) ?? now - 2 * 86400000; pj = (await kv.get('kpj')) || null; }
    const upTo = now - 45000; let add = 0;
    if (upTo > pqAt) { const have = new Set(pq.map(x => x.tk)); if (pj) have.add(pj.tk);
      for (const r of rec.values()) { if (!(r.close > pqAt && r.close <= upTo) || !(r.ask >= KEEP_ASK) || have.has(r.ticker) || !CBPID[coin(r.series)]) continue; pq.push({ tk: r.ticker, coin: coin(r.series), o: Math.floor(r.close / 1000) - 900, c: Math.floor(r.close / 1000) }); add++; }
      pqAt = upTo; pq.sort((a, b) => b.c - a.c);   // newest first, so today's trades are ready before the backfill
      if (add) { await kv.put('kpq', pq); } await kv.put('kpqAt', pqAt); }
  }
  async function pathFill(now) {
    await pathQueue(now); let used = 0;
    while (used < PATH_BUDGET && (pj || pq.length)) {
      if (!pj) { const x = pq.shift(); if ([...sql.exec('SELECT COUNT(*) n FROM kpath WHERE tk = ?', x.tk)][0].n) continue; pj = { ...x, end: x.c + 2, pts: {} }; }
      const r = await fetch(`https://api.coinbase.com/api/v3/brokerage/market/products/${CBPID[pj.coin]}/ticker?limit=1000&start=${pj.o - 60}&end=${pj.end}`, { headers: CBH }); used++;
      // Coinbase answers 429 when the shared Cloudflare address is busy: wait for the next minute without counting it against the job
      if (!r.ok) { console.log(`path ${pj.tk}: ${r.status}`); if (r.status !== 429) { pj.err = (pj.err || 0) + 1; if (pj.err >= 4) pj = null; } break; }
      const t = (await r.json())?.trades || []; let min = Infinity; await new Promise(z => setTimeout(z, 350));
      for (const x of t) { const ms = Date.parse(x.time), sec = Math.floor(ms / 1000), px = +x.price; if (!(px > 0) || !isFinite(sec)) continue; if (ms < min) min = ms; if (!(sec in pj.pts)) pj.pts[sec] = px; }
      const next = Math.floor(min / 1000);
      if (t.length < 1000 || !isFinite(next) || next <= pj.o - 60 || next >= pj.end) {   // reached the start of the window (or nothing older)
        // stored as deltas: seconds since the last change and price steps in the coin's smallest quoted unit (about 5 KB for BTC)
        const secs = Object.keys(pj.pts).map(Number).sort((a, b) => a - b), dec = Math.min(8, Math.max(0, ...secs.map(sc => (String(pj.pts[sc]).split('.')[1] || '').length))), f = 10 ** dec, dt = [], dp = [];
        let ls = pj.o - 60, lv = null, p0 = null;
        for (const sc of secs) { const v = Math.round(pj.pts[sc] * f); if (v === lv && sc !== secs[secs.length - 1]) continue; if (p0 == null) { p0 = v; lv = v; } dt.push(sc - ls); dp.push(v - lv); ls = sc; lv = v; }
        if (dt.length) sql.exec('INSERT OR REPLACE INTO kpath (tk, close, j) VALUES (?, ?, ?)', pj.tk, pj.c * 1000, JSON.stringify({ t0: pj.o - 60, d: dec, p0, dt, dp }));
        pj = null;
      } else pj.end = next;   // trades in the same second as the oldest may be cut; the second already holds a price
    }
    if (used) { await kv.put('kpj', pj); if (now - pqSaveAt > 300000 || !pq.length) { pqSaveAt = now; await kv.put('kpq', pq); } }
    if (Math.floor(now / 3600000) !== Math.floor((now - 60000) / 3600000)) sql.exec('DELETE FROM kpath WHERE close < ?', now - PATH_DAYS * 86400000);
  }
  const pathOf = async tk => { const r = [...sql.exec('SELECT j FROM kpath WHERE tk = ?', tk)][0]; if (!r) return null; try { const j = JSON.parse(r.j), f = 10 ** j.d, out = []; let t = j.t0, v = j.p0; for (let i = 0; i < j.dt.length; i++) { t += j.dt[i]; v += j.dp[i]; out.push([t, v / f]); } return out; } catch { return null; } };
  async function keepFill(now) {
    let n = 0;
    const due = [...rec.values()].filter(r => { const x = r.exit; return x && (x.keep == null || (x.keepV || 0) < KEEP_V) && (x.keepTry || 0) < 3 && r.strike > 0 && r.close <= now - 60000; }).sort((a, b) => b.close - a.close);
    for (const r of due) { const x = r.exit; if (++n > (PAID ? 40 : 8)) break;
      const c = coin(r.series), key = c + ':' + r.close; if (!leads.has(key)) { slopes.delete(key); try { await slopeOf(c, r.close); } catch { } }
      const L = leads.get(key); if (!L) { x.keepTry = (x.keepTry || 0) + 1; saveRec(r); continue; }
      x.keep = keepOf(L, r.side, r.strike); x.keepV = KEEP_V; saveRec(r); viewDirty = true; }
    if (n) console.log(`trend share filled for ${Math.min(n, 8)} earlier checks`);
  }
  async function trendCheck(now) {
    const due = [...rec.values()].filter(r => !r.exit && r.ask >= KEEP_ASK && r.strike > 0 && r.result !== 'void' && r.close - now <= 330000 && r.close - now >= 200000);
    if (!due.length) return;
    const byCoin = {}; for (const r of due) (byCoin[coin(r.series)] = byCoin[coin(r.series)] || []).push(r);
    let first = true;
    for (const [c, list] of Object.entries(byCoin)) {
      if (!first) await sleep(150); first = false;
      const slope = await slopeOf(c, list[0].close);
      // MC 2026-11-14 no trend reading: on the last try before the close still keep the minute-10 sale price (m10), so Trades has it
      if (slope == null) { for (const r of list) if (!r.m10 && r.close - now < 265000) { try { const b = bids(await get(`/markets/${r.ticker}/orderbook`)), mine = r.side === 'yes' ? b.yes : b.no; r.m10 = { at: now, best: mine[0]?.[0] ?? null, px: mine.length ? +(walk(mine, BOOK_N) ?? mine[0][0]).toFixed(4) : null }; saveRec(r); viewDirty = true; } catch { } } continue; }
      for (const r of list) {
        const pct = slope * 300 / r.strike * 100 * (r.side === 'yes' ? 1 : -1), dir = Math.abs(pct) < 0.02 ? 0 : pct > 0 ? 1 : -1, x = { at: now, pct: +pct.toFixed(4), dir, keep: keepOf(leads.get(c + ':' + r.close), r.side, r.strike), keepV: KEEP_V };
        // MC 2026-11-14 Steven: keep the sale price at minute 10 on every trade, not only the ones trending against the bet, to see
        // what a cash-out would have paid against how the trade ended (also for trades that turned back into wins)
        { try { const b = bids(await get(`/markets/${r.ticker}/orderbook`)), mine = r.side === 'yes' ? b.yes : b.no; if (mine.length) { x.best = mine[0][0]; const avg = walk(mine, BOOK_N); x.px = +(avg ?? mine[0][0]).toFixed(4); x.depth = mine.reduce((a, q) => a + q[1], 0); } } catch (e) { console.log(`trend ${r.ticker}: book ${e.message}`); } }
        r.exit = x; saveRec(r); viewDirty = true;
        // MC 2026-11-14 Steven: cash out on live too, from live's own setting (off unless turned on in Live settings)
        // MC 2026-11-15 each book reads the cash out rule from its own live rules now (Main's when it follows Main)
        { const turn = cfg => !!cfg.trendExit && dir < 0 && x.keep != null && x.keep * 100 < (cfg.trendKeep ?? 50) && x.best != null;
          if (turn(cfgL)) { try { await cashLive(r, x.best); } catch (e) { fail('cash out error: ' + e.message); } }
          if (dir < 0 && x.best != null) { try { await books.cashOut(r, x.best, turn, cfgL); } catch (e) { say('books cash out error: ' + e.message); } } }
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
  let l2sum = null;
  async function secondLook(now, out) {
    if (!l2log) l2log = (await kv.get('kl2')) || {};
    let n = 0, touched = false; const note = (o, side, ask, left, why, took) => { const was = l2log[o.tk]; l2log[o.tk] = { coin: o.coin, close: o.close, side, ask, left: +left.toFixed(1), why, took: !!took, at: now, ...(was?.tr ? { tr: was.tr } : {}) }; touched = true; };
    // MC 2026-11-14 asked for: every second-look row should show how it ended and the money, whatever its price, judged by the
    // coin's trend line. Two additions. (1) Results: the tracker only keeps markets that were 85c or more at the mark, so a 58c
    // row never learned its result; settled rows now ask Kalshi for it, nine a minute at most, five tries each. (2) Trend: at the
    // last look of a window (4 to 5 minutes left) each coin's last five 1-minute closes are fitted with a straight line and
    // carried to the close; the side that line lands on, and that side's ask then, are kept on the row (tr). One Coinbase request
    // a coin a window, after the minute-10 trend check has run, and it stops for the minute at the first 429.
    { let asked = 0; for (const [tk, x] of Object.entries(l2log)) { if (x.res || x.close > now - 90000 || (x.rt || 0) >= 5 || asked >= 9) continue; asked++;
        try { const m = await get(`/markets/${tk}`), r = (m?.market || m)?.result; if (r === 'yes' || r === 'no') x.res = r; else x.rt = (x.rt || 0) + 1; } catch { x.rt = (x.rt || 0) + 1; } touched = true; } }
    // MC 2026-11-15 asked for a 24h / 7d / All summary and chart on top of the table: what taking these would have made. The
    // table only holds the last hour, so each row is added to a running tally once, when its result arrives. Two lines are kept:
    // (a) every coin the second look passed, bought on the leader's side at the last price seen, and (b) the side the trend line
    // pointed to, bought at that side's price at the last look, for every coin with a reading. Paper size, fee in, same sums as
    // the table. Kept by the hour for the last day and by the ET day for everything older, so it stays small.
    if (!l2sum) l2sum = (await kv.get('kl2h')) || { h: {}, d: {}, since: now };
    { const size = +cfgP.sizeUsd || 50, pay = (px, won) => { if (!(px > 0 && px < 1)) return null; const n = Math.floor(size / px); if (n < 1) return null; const c = n * px + fee(px, n); return won ? n - c : -c; }; let add = 0;
      for (const x of Object.values(l2log)) { if (!x.res || x.h) continue; x.h = 1; touched = true;
        const hk = Math.floor(x.close / 3600000) * 3600000, dk = etDay(x.close), put = (i, v, won) => { if (v == null) return; for (const [m, k] of [[l2sum.h, hk], [l2sum.d, dk]]) { const r = m[k] || (m[k] = [0, 0, 0, 0, 0, 0]); r[i]++; if (won) r[i + 1]++; r[i + 2] = +(r[i + 2] + v).toFixed(2); } add++; };
        if (!x.took && x.why !== 'held' && x.side) put(0, pay(x.ask, x.res === x.side), x.res === x.side);
        if (x.tr?.side && x.tr.ask != null) put(3, pay(x.tr.ask, x.res === x.tr.side), x.res === x.tr.side); }
      if (add) { for (const k of Object.keys(l2sum.h)) if (+k < now - 26 * 3600000) delete l2sum.h[k]; await kv.put('kl2h', l2sum); } }
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
    for (const o of out) { const left = (o.close - now) / 60000, x = l2log[o.tk]; if (!(left < L2_MIN_LEFT + 1 && left >= L2_MIN_LEFT) || !x || x.tr || !(o.strike > 0) || !CBPID[o.coin]) continue;
      let pts = null; try { const sec = Math.floor(now / 1000), raw = await advCandles(CBPID[o.coin], sec - 360, sec); pts = raw.map(k => [k[0] + 60, k[4]]).filter(p => p[0] <= sec + 5).sort((a, b) => a[0] - b[0]).slice(-5); } catch (e) { console.log(`look2 trend ${o.coin}: ${e.message}`); if (e.status === 429) break; }
      if (!pts || pts.length < 3) { x.tr = { none: 1 }; touched = true; continue; }
      const m = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / m, my = pts.reduce((a, p) => a + p[1], 0) / m; let sxx = 0, sxy = 0; for (const p of pts) { sxx += (p[0] - mx) ** 2; sxy += (p[0] - mx) * (p[1] - my); }
      const slope = sxx ? sxy / sxx : 0, proj = my + slope * (o.close / 1000 - mx), side = proj >= o.strike ? 'yes' : 'no', ask = side === 'yes' ? o.ya : (o.yb != null ? +(1 - o.yb).toFixed(4) : null);
      x.tr = { side, ask: ask > 0 && ask < 1 ? ask : null, proj: +proj.toPrecision(8), pm: +(slope * 60 / my * 100).toFixed(4), left: +left.toFixed(1) }; touched = true; await sleep(250); }
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
  // MC 2026-11-15 paper buys and sells by hand (asked for after the scanner's Buy turned out to be live only). A hand buy is its
  // own record in kh: the market, side, the price the book would have filled the paper size at when Buy was pressed, and the
  // contracts. The paper book takes these as they are, past every rule, stop, cap and the playbook, the same way a hand buy on
  // live skips them, and they never count toward the rule's analytics or the labs. A hand sell works on any open paper position
  // (the rule's or a hand buy): psold on the record holds the price the book's buyers would have paid, and the book scores the
  // trade at that instead of the settlement. Nothing here touches Kalshi's order endpoints or needs keys.
  sql.exec('CREATE TABLE IF NOT EXISTS kh (tk TEXT PRIMARY KEY, close INTEGER, j TEXT)');
  let recH = null; const loadH = () => { if (recH) return recH; recH = new Map(); for (const r of sql.exec('SELECT j FROM kh')) { try { const j = JSON.parse(r.j); recH.set(j.ticker, j); } catch {} } return recH; };
  const saveH = r => sql.exec('INSERT OR REPLACE INTO kh (tk, close, j) VALUES (?, ?, ?)', r.ticker, r.close, JSON.stringify(r));
  async function settleH(now) {
    let k = 0;
    for (const r of loadH().values()) {
      if (r.result || now < r.close + 60000) continue;
      let res = rec.get(r.ticker)?.result; if (!res) { if (++k > 6) break; const j = await get(`/markets/${r.ticker}`); res = j?.market?.result; }
      if (res !== 'yes' && res !== 'no') { if (res === 'void' || now > r.close + 6 * 3600000) { r.result = 'void'; saveH(r); viewDirty = true; } continue; }
      r.result = res; r.won = res === r.side; saveH(r); viewDirty = true; say(`settled ${r.ticker} (paper, by hand): ${r.won ? 'won' : 'LOST'}`);
    }
  }
  // the open paper position in a market, from the last book run: the rule's trade, a second look, or a hand buy
  const paperPos = tk => { const t = (pnT || []).find(t => t.mk === tk && !t.capped && !t.done); return t ? { t, r: t.hand ? loadH().get(tk) : t.late ? rec2.get(tk) : rec.get(tk), save: t.hand ? saveH : t.late ? saveRec2 : saveRec } : null; };
  async function paperBuyQuote(tk, side) {
    tk = String(tk || ''); const s = handMkt(tk, side); if (!s) return { ok: false, msg: 'Unknown market.' };
    kalshiView(); if (loadH().has(tk) || (pnT || []).some(t => t.mk === tk && !t.capped)) return { ok: false, msg: 'Paper already holds this market.' };
    let m, ob; try { [m, ob] = await Promise.all([get(`/markets/${tk}`), get(`/markets/${tk}/orderbook`)]); m = m?.market || m; } catch { return { ok: false, msg: 'Could not read the market. Try again.' }; }
    const now = Date.now(), close = Date.parse(m?.close_time); if (!(close > now + 20000)) return { ok: false, msg: 'That market is about to close, too late to buy.' };
    const b = book(ob), mine = b[side === 'yes' ? 'yesAsks' : 'noAsks'], best = mine[0]?.[0] ?? null; if (best == null) return { ok: false, msg: `Nobody is selling ${side.toUpperCase()} right now.` };
    const size = cfgP.sizeUsd, n = Math.floor(size / best), depth = mine.reduce((a, l) => a + l[1], 0), est = Math.min(n, depth); if (est < 1) return { ok: false, msg: 'Your paper size is too small for one contract at this price.' };
    const avg = walk(mine, est) ?? best, fe = fee(avg, est), cost = +(est * avg + fe).toFixed(2), cn = coin(s), mark = close - 10 * 60000;
    const notes = [now < mark ? `${Math.round((mark - now) / 60000)} min before the trade check` : `after the trade check (${Math.max(0, Math.round((close - now) / 60000))} min left)`];
    return { ok: true, paper: 1, tk, coin: cn, side, best, avg: +avg.toFixed(4), maxPx: +avg.toFixed(4), room: 0, n, est, size, cost, fee: fe, ifWin: +(est - cost).toFixed(2), ifLose: -cost, close, notes, series: s, strike: m?.floor_strike ?? m?.cap_strike ?? null, ya: b.yesAsks[0]?.[0] ?? null, na: b.noAsks[0]?.[0] ?? null };
  }
  async function paperSellQuote(tk) {
    tk = String(tk || ''); kalshiView(); const p = paperPos(tk); if (!p?.r) return { ok: false, msg: 'Paper has no open position in that market.' };
    if (p.r.psold) return { ok: false, msg: 'That paper position is already sold.' }; if (Date.now() >= p.t.close) return { ok: false, msg: 'That market has closed; it settles by itself.' };
    let ob; try { ob = await get(`/markets/${tk}/orderbook`); } catch { return { ok: false, msg: 'Could not read the market. Try again.' }; }
    const bb = bids(ob), mine = p.t.side === 'yes' ? bb.yes : bb.no, best = mine[0]?.[0] ?? null; if (best == null) return { ok: false, msg: 'Nobody is buying right now, so there is nothing to sell into.' };
    const n = p.t.n, depth = mine.reduce((a, l) => a + l[1], 0), est = Math.min(n, depth), avg = walk(mine, est) ?? best, fe = fee(avg, n), proceeds = +(n * avg - fe).toFixed(2);
    return { ok: true, paper: 1, tk, coin: p.t.coin, side: p.t.side, left: n, est, best, avg: +avg.toFixed(4), minPx: +avg.toFixed(4), proceeds, pnl: +(proceeds - p.t.cost).toFixed(2), ifWin: +(n - p.t.cost).toFixed(2), ifLose: -p.t.cost, paid: p.t.px };
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
  // MC 2026-11-15 the AI checked playbook needs the trend and likely readings on every trade to show a history in Labs. Trades
  // recorded before today do not have them, so they are worked out from Coinbase's minute history, newest first, on the same
  // request allowance as the repair pass (the candles of one coin are shared between its trades). Two tries a trade.
  // the readings kept on a live row: distance from the target in usual moves and as a share of the price, the 10-minute move,
  // and the chart readings
  const volPick = v => ({ z: v.z ?? null, margin: v.margin ?? null, sigma: v.sigma ?? null, z10: v.z10 ?? null, tl: v.tl ?? null, lk: v.lk ?? null, sw: v.sw ?? null, dp: v.dp ?? null, r2: v.r2 ?? null, src: v.src || null });
  // every live trade with a fill, Main's and the books', for the export under Trades
  async function liveAll() { await load(); await books.load(); const one = (x, acct) => ({ acct, tk: x.tk, coin: x.coin, side: x.side, at: x.at, close: x.close, px: x.px ?? null, fill: x.fill ?? 0, cost: x.cost ?? null, hand: x.hand ? 1 : 0, strat: x.strat || null, result: x.result || null, won: x.won ?? null, pnl: x.pnl ?? null, strike: x.strike ?? rec.get(x.tk)?.strike ?? null, final: x.final ?? rec.get(x.tk)?.final ?? null, sold: x.sold ? { px: x.sold.px, fill: x.sold.fill } : null, v: x.vol || (x.hand ? null : (rec.get(x.tk)?.vol ? volPick(rec.get(x.tk).vol) : null)) });
    return [...[...L.values()].filter(x => x.fill > 0).map(x => one(x, 'Main')), ...books.allRows().filter(x => x.fill > 0).map(x => one(x, books.nameOf(x)))].sort((a, b) => b.at - a.at); }
  let tfAt = 0, tfN = 0, tfReset = false;
  // MC 2026-11-16 asked for: find deposits and withdrawals on their own, for Steven's copy and his. Kalshi lists both
  // (/portfolio/deposits, /portfolio/withdrawals, amounts in cents). Read every 6 hours, or soon after the Money box asks; only
  // applied ones count. When Kalshi answers, its list is the one used and hand-entered notes stay as a fallback for when it doesn't.
  let kmoney = null, moneyAt = 0;
  async function moneySync(now, force = false) {
    if (!hasKeys() || (!force && (now - moneyAt < 600000 || (kmoney?.at && now - kmoney.at < 6 * 3600000 && !kmoney.want)))) return; moneyAt = now;
    const ms = t => +t > 0 ? (+t < 1e12 ? +t * 1000 : +t) : null, pull = async (path, key) => { const out = []; let cur = '';
      for (let i = 0; i < 4; i++) { const r = await kreq('GET', `/portfolio/${path}?limit=500${cur ? '&cursor=' + encodeURIComponent(cur) : ''}`);
        if (!r?.ok) return { err: r?.status || 'no answer' }; out.push(...(r.j?.[key] || [])); cur = r.j?.cursor; if (!cur || !(r.j?.[key] || []).length) break; }
      return { list: out }; };
    const [d, w] = [await pull('deposits', 'deposits'), await pull('withdrawals', 'withdrawals')];
    if (d.err || w.err) { kmoney = { ...(kmoney || {}), at: now, want: 0, err: `Kalshi answered ${d.err || w.err}` }; await kv.put('kmoney', kmoney); viewDirty = true; return; }
    const one = (x, sign) => ({ id: 'k' + x.id, at: ms(x.finalized_ts) || ms(x.created_ts) || now, usd: sign * Math.round(+x.amount_cents || 0) / 100, fee: Math.round(+x.fee_cents || 0) / 100, note: `${x.type || ''} ${sign > 0 ? 'deposit' : 'withdrawal'}`.trim(), auto: 1 });
    const list = [...d.list.filter(x => x.status === 'applied').map(x => one(x, 1)), ...w.list.filter(x => x.status === 'applied').map(x => one(x, -1))].sort((a, b) => a.at - b.at);
    kmoney = { at: now, want: 0, err: null, list, pend: [...d.list, ...w.list].filter(x => x.status === 'pending').length };
    await kv.put('kmoney', kmoney); viewDirty = true; say(`money: ${list.length} deposit${list.length === 1 ? '' : 's'} and withdrawals from Kalshi`);
  }
  async function trendFill(now, max = 60) {
    if (now - tfAt < 50000) return; tfAt = now;
    if (!tfReset) { tfReset = true; if (!(await kv.get('tfReset1'))) { for (const r of rec.values()) if (r.vol && r.vol.dp === undefined && r.vol.tlTry) { delete r.vol.tlTry; saveRec(r); } await kv.put('tfReset1', 1); } }
    // hand buys from before their readings were kept: worked out from Coinbase's history at the moment of the buy, a few a pass
    { const hs = [...L.values(), ...books.allRows()].filter(x => x.hand && x.fill > 0 && x.strike > 0 && !x.vol && (x.volTry || 0) < 2 && x.at > now - 21 * 86400000).sort((a, b) => b.at - a.at).slice(0, PAID ? 200 : 20);
      CCB = CCB_MAX; for (const x of hs) { try { const v = await volPast(x.coin, x.strike, x.side, x.at); if (v) x.vol = volPick(v); else x.volTry = (x.volTry || 0) + 1; if (L.get(x.tk) === x) saveL(x); else books.saveAny(x); viewDirty = true; }
        catch (e) { if (e.status === 'budget' || /subrequest/i.test(e.message || '')) break; if (e.status === 429) { tfAt = now + 5 * 60000; return; } x.volTry = (x.volTry || 0) + 1; break; } } }
    const todo = [...rec.values()].filter(r => r.ask >= KEEP_ASK && r.vol && (r.vol.tl === undefined || r.vol.sw === undefined || r.vol.dp === undefined) && r.strike > 0 && (r.vol.tlTry || 0) < 2 && r.at < now - 120000 && r.at > now - 21 * 86400000).sort((a, b) => b.at - a.at).slice(0, max); if (!todo.length) return;
    let n = 0; CCB = CCB_MAX;
    for (const r of todo) { try { const v = await volPast(coin(r.series), r.strike, r.side, r.at); if (v) { r.vol.tl = v.tl ?? null; r.vol.lk = v.lk ?? null; r.vol.sw = v.sw ?? null; r.vol.dp = v.dp ?? null; r.vol.r2 = v.r2 ?? null; n++; } else r.vol.tlTry = (r.vol.tlTry || 0) + 1; saveRec(r); }
      // MC 2026-11-16 the fill stalled at Nov 15 for no late swing and chart checked. It runs last in a busy minute, and when the
      // run had used up Cloudflare's calls the fetch threw "Too many subrequests", which counted as a failed try on that trade:
      // two of those and the trade was dropped for good, one trade per pass, so the fill stopped moving. Running out of calls now
      // just ends the pass. Trades dropped that way get their tries back once (tfReset).
      catch (e) { if (e.status === 'budget' || /subrequest/i.test(e.message || '')) break; if (e.status === 429) { tfAt = now + 5 * 60000; break; } r.vol.tlTry = (r.vol.tlTry || 0) + 1; saveRec(r); break; } }
    if (n) { labRowsMem = null; viewDirty = true; tfN += n; console.log(`trend fill: ${n} trades given their chart readings`); }
  }
  async function volRepair(now, max = 40) {
    if (now - fixAt < 50000) return; fixAt = now;
    const sus = [], none = [], old = [], rest = [];
    for (const r of rec.values()) { const v = r.vol;
      // no reading at all (Coinbase did not answer at the check): rebuild it from history, within the last week
      if (!v) { if (r.ask >= KEEP_ASK && r.strike > 0 && (r.vrt || 0) < 3 && r.at < now - 120000 && r.at > now - 7 * 86400000) none.push(r); continue; }
      if (!(r.ask >= KEEP_ASK) || (v.age != null && v.src !== 'stale') || v.chk || v.fixed || (v.rt || 0) >= 3 || !(r.strike > 0) || r.at > now - 120000) continue;
      const zz = v.z10 ?? v.z; if (v.src === 'stale' || (zz != null && winP(zz) < (r.avgN || r.ask) - 0.15)) sus.push(r); else if (v.z10 == null) old.push(r); else rest.push(r); }
    const todo = [...sus.sort((a, b) => b.at - a.at), ...none.sort((a, b) => b.at - a.at), ...rest.sort((a, b) => b.at - a.at), ...old.sort((a, b) => b.at - a.at)].slice(0, max); if (!todo.length) return;
    let fixed = 0; CCB = CCB_MAX;
    for (const r of todo) {
      const v = r.vol;
      try {
        const n = await volPast(coin(r.series), r.strike, r.side, r.at);
        if (!v) { if (n) { r.vol = { ...n, fixed: 1 }; delete r.lp; fixed++; } else r.vrt = (r.vrt || 0) + 1; saveRec(r); viewDirty = true; continue; }
        if (!n) { v.rt = (v.rt || 0) + 1; if (v.rt >= 3) v.chk = 1; saveRec(r); continue; }
        const typ = n.sigma10 || n.sigma * Math.sqrt(10), moved = Math.abs(n.margin - v.margin) > typ / 3;
        if (moved) { r.vol = { ...n, fixed: 1, was: { px: v.px, margin: v.margin, z: v.z, z10: v.z10 ?? null } }; delete r.lp; fixed++; }
        else r.vol = { ...v, sigma15: v.sigma15 ?? n.sigma15, drift: v.drift ?? n.drift, z2: v.z2 ?? n.z2, sigma10: v.sigma10 ?? n.sigma10, z10: v.z10 ?? (n.sigma10 > 0 ? +(v.margin / n.sigma10).toFixed(2) : null), tl: v.tl ?? n.tl ?? null, lk: v.lk ?? n.lk ?? null, sw: v.sw ?? n.sw ?? null, dp: v.dp ?? n.dp ?? null, r2: v.r2 ?? n.r2 ?? null, chk: 1 };
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
      if (r.lp != null || r.at >= before || r.vol?.z10 == null || !(r.ask >= KEEP_ASK)) continue;
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
    const K = cfgP, rows = [...rec.values()].filter(r => !r.lo).sort(byClear), sum = l => +l.reduce((a, t) => a + t.pnl, 0).toFixed(2);
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
    const hands = [...loadH().values()].filter(r => r.result !== 'void');
    const rowsAll = lates.length || hands.length ? [...rows, ...lates, ...hands].sort(byClear) : rows, lockRem = {}, wSnap = {}, tookW = {}, ifW = {}, wCap = K.winCap ?? 9;
    for (const r of rowsAll) {
      const late = !!r.late, hand = !!r.hand;
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
      const f = late ? true : lab ? lab.filter({ px, win: winN[w], same: sameN[w + r.side], z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, tl: r.vol?.tl ?? null, lk: r.vol?.lk ?? null, sw: r.vol?.sw ?? null, dp: r.vol?.dp ?? null, r2: r.vol?.r2 ?? null, kf: ko.kf, pl: r.lp ?? null }) : true, strat = f !== true ? sid : null;
      const sizeUsd = lab?.size ? lab.size(bal, { kf: ko.kf, win: winN[w] }, { peak, start: K.startUsd }) : K.sizeUsd;
      const off = (K.skipHours || []).includes(etHour(r.at)), capped0 = !hand && ((!late && perWin[w] > K.maxPerWindow) || halted || (cold && !late) || off || !!strat);
      // MC 2026-11-10 protect today's profit (Steven's request). Once the day's high reaches lockAt, a window may stake no more than
      // today's profit minus lockKeep% of the day's high, so the worst a window can do is take the day back to that floor (keep 0:
      // back to even). The budget is fixed when the window's first trade comes up and shared across its coins, clearest first; a
      // coin that does not fit in full is bought smaller, and one that cannot buy a single contract is skipped. Tested on the
      // four-month history with a $200 target, starting at $100 and keeping 0%: more green days on every playbook; more profit on
      // Margin vs volatility and v2, much less on the plain rule (it stakes many coins a window and runs out of budget). Off by default.
      let lockCut = false, szUse = sizeUsd;
      if (K.lockAt > 0 && !capped0 && !hand) { if (lockRem[w] == null) lockRem[w] = ws.peak >= K.lockAt ? ws.net - ws.peak * (K.lockKeep || 0) / 100 : Infinity; if (lockRem[w] < px + fee(px, 1)) lockCut = true; else szUse = Math.min(sizeUsd, lockRem[w]); }
      const wcap = !late && !capped0 && !lockCut && (tookW[w] || 0) >= wCap; if (!late && !capped0 && !lockCut && !wcap) tookW[w] = (tookW[w] || 0) + 1;
      // MC 2026-11-12 asked to see what a day would have come to if trading had gone on past a stop (daily loss, profit target,
      // give-back, bank drawdown, protect profit). A trade skipped only because of a stop is scored as if it had been taken, at
      // full size, if the playbook, schedule, bench and window cap would all have let it through. Nothing else changes: the bank
      // and the day's total still stop where the stop stopped them.
      const stopSk = !late && (halted || lockCut) && !strat && !off && !cold && !(perWin[w] > K.maxPerWindow) && (tookW[w] || 0) + (ifW[w] || 0) < wCap; if (stopSk) ifW[w] = (ifW[w] || 0) + 1;
      const capped = capped0 || lockCut || wcap, n = hand && r.n ? r.n : Math.floor(szUse / px), cost = +(n * px + fee(px, n)).toFixed(2);
      if (!capped && isFinite(lockRem[w] ?? Infinity)) lockRem[w] -= cost;
      const t = { stopSk: stopSk ? 1 : 0, wcap: wcap ? 1 : 0, lock: lockCut ? 1 : 0, lockSz: !capped && szUse < sizeUsd ? +szUse.toFixed(2) : null, late: late ? 1 : 0, mk: r.ticker, tk: hand ? r.ticker + ':h' : late ? r.ticker + ':2' : r.ticker, t: r.at, close: r.close, coin: coin(r.series), side: r.side, px: +px.toFixed(3), n, cost, capped, halted, haltWhy, off, run: inRun, done: !!r.result, won: !!r.won, pnl: null, strat, stratWhy: strat ? (f === null ? (sid === 'learn' ? 'no model reading' : 'no volatility reading') : sid === 'kelly' ? 'Kelly: no edge at this price yet' : lab.name) : null, why: strat ? labWhy(sid, { px, win: winN[w], same: sameN[w + r.side], z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, z10: r.vol?.z10 ?? null, sw: r.vol?.sw ?? null, dp: r.vol?.dp ?? null, r2: r.vol?.r2 ?? null, kf: ko.kf, pl: r.lp ?? null }, K) : null, book: sid,
        left: r.left, ask: r.ask, ya: r.ya ?? null, na: r.na ?? null, dAsk: r.depthAtAsk ?? null, depth: r.depth ?? null, bookAvg: r.avgN != null, fee: fee(px, n),
        title: r.title || null, sub: r.sub || null, kq: ko.kq, kf: ko.kf, kn: ko.kn, strike: r.strike ?? null, final: r.final ?? null, res: r.result || null, cold, net30: +c30.x.toFixed(2), path: thin(late ? rec.get(r.ticker)?.path : r.path), z: r.vol?.z ?? null, z2: r.vol?.z2 ?? null, vpx: r.vol?.px ?? null, vmg: r.vol?.margin ?? null, vage: r.vol?.age ?? null, vsrc: r.vol?.src ?? null, vfix: r.vol?.fixed ? 1 : 0, vwas: r.vol?.was?.margin ?? null, vsg: r.vol?.sigma ?? null, vsg15: r.vol?.sigma15 ?? null, vdr: r.vol?.drift ?? null, z10: r.vol?.z10 ?? null, vsg10: r.vol?.sigma10 ?? null, pl: r.lp ?? null,
        // MC 2026-11-16 the chart readings went on the trade record but not on this copy, so the Labs lines for the playbooks that
        // read them (AI checked v1, no late swing, chart checked) found no reading on any trade and drew nothing
        tl: r.vol?.tl ?? null, lk: r.vol?.lk ?? null, sw: r.vol?.sw ?? null, dp: r.vol?.dp ?? null, r2: r.vol?.r2 ?? null };
      if (r.result && !late) { let i = kQ.length; while (i > kI && kQ[i - 1].close > r.close) i--; kQ.splice(i, 0, { close: r.close, px, won: !!r.won }); }
      if (stopSk && r.result) { const nf = Math.floor(sizeUsd / px); t.ifPnl = +((r.won ? nf : 0) - nf * px - fee(px, nf)).toFixed(2); }
      if (r.result && !late) { const n50 = Math.floor(50 / px); H.push({ coin: t.coin, close: r.close, pnl: (r.won ? n50 : 0) - n50 * px - fee(px, n50) }); const nr = Math.floor(K.sizeUsd / px); t.rulePnl = +((r.won ? nr : 0) - nr * px - fee(px, nr)).toFixed(2); }
      // MC 2026-11-11 Steven (request 5): sell only when the line runs against the bet AND less than trendKeep percent of the lead
      // is left at minute 10 (see keepOf). Replaces the "past 0.15%" slope test from this morning, which sold trades that still
      // held most of their lead. Checks recorded before this have no share saved and are held.
      const steep = r.exit?.dir < 0 && r.exit.keep != null && r.exit.keep * 100 < (K.trendKeep ?? 50);
      // a hand sell comes first: it happened when the button was pressed, whatever the minute-10 cash out would have done later
      const hs = !capped && r.psold?.px > 0 ? r.psold : null; if (hand) t.hand = 1;
      const cashed = !hs && !!(K.trendExit && !late && steep && r.exit.px != null && r.at < r.exit.at);
      if (cashed) { t.cashed = 1; t.exitPx = r.exit.px; t.exitPct = r.exit.pct; t.heldWon = r.result ? !!r.won : null; t.done = true; t.won = n * r.exit.px - fee(r.exit.px, n) - cost > 0; }
      if (hs) { t.cashed = 1; t.hsold = 1; t.exitPx = hs.px; t.heldWon = r.result ? !!r.won : null; t.done = true; t.won = n * hs.px - fee(hs.px, n) - cost > 0; }
      if (r.exit) { t.trend = r.exit.dir; t.trendPct = r.exit.pct; t.keep = r.exit.keep ?? null; t.m10 = r.exit.px ?? null; t.m10b = r.exit.best ?? null; } else if (r.m10) { t.m10 = r.m10.px; t.m10b = r.m10.best; }
      // MC 2026-11-11 the Labs cash-out switch needs every trade's sale price whether or not the setting is on, plus how it would
      // have ended if held, so each playbook can be replayed both ways. xPx is set only when the trend turned against the bet
      // after the buy; fin and hw are the settled result untouched by a paper cash-out.
      t.xPx = !late && steep && r.exit.px != null && r.at < r.exit.at ? r.exit.px : null; t.fin = !!r.result; t.hw = !!r.won;
      if (!capped && (r.result || cashed || hs)) { t.pnl = +(hs ? n * hs.px - fee(hs.px, n) - cost : cashed ? n * r.exit.px - fee(r.exit.px, n) - cost : (r.won ? n : 0) - cost).toFixed(2); dayNet[dk] = (dayNet[dk] || 0) + t.pnl; dayPeak[dk] = Math.max(dayPeak[dk], dayNet[dk]); if (inRun) { bal += t.pnl; peak = Math.max(peak, bal); maxDd = Math.max(maxDd, peak - bal); eq.push([r.close, +bal.toFixed(2)]); } }
      if (r.result && inRun) balU += (r.won ? n : 0) - cost;
      if (!capped && !r.result && !hs) open += cost;
      trades.push(t);
    }
    const grpW = {}; for (const t of trades) { if (t.late) continue; const g = t.close + t.side; grpW[g] = (grpW[g] || 0) + 1; } for (const t of trades) { t.same = grpW[t.close + t.side] || 1; t.win = perWin[t.close] || 1; }
    // every second-look entry as a bare trade for the Labs line, whichever playbook the paper book is on
    const lateT = [...rec2.values()].filter(r => r.result !== 'void').map(r => { const px = r.avgN || r.ask; return { late: 1, bTaken: baseTaken(r.ticker), tk: r.ticker, t: r.at, close: r.close, coin: coin(r.series), side: r.side, px: +px.toFixed(3), done: !!r.result, won: !!r.won, z: r.vol?.z ?? null, win: 1, same: 1, off: (K.skipHours || []).includes(etHour(r.at)) }; });
    const m10T = [...rec3.values()].filter(r => r.result !== 'void').map(r => ({ m10: 1, tk: r.ticker + ':10', t: r.at, close: r.close, coin: coin(r.series), side: r.side, px: +(r.avgN || r.ask).toFixed(3), done: !!r.result, won: !!r.won, dir: r.dir, pct: r.pct, z: null, win: 1, same: 1, off: (K.skipHours || []).includes(etHour(r.at)) }));
    // MC 2026-11-16 Early pack's own rows: every leader at 60c to 90c at the trade check, with how many coins led the same way
    const epN = {}; for (const r of rows) if (r.ask >= KEEP_LO && r.result !== 'void') epN[r.close + r.side] = (epN[r.close + r.side] || 0) + 1;
    const epT = rows.filter(r => r.at >= EP_FROM && r.ask >= EP_LO && r.ask < EP_HI && r.result !== 'void').map(r => ({ ep: 1, tk: r.ticker, t: r.at, close: r.close, coin: coin(r.series), side: r.side, px: +(r.avgN || r.ask).toFixed(3), done: !!r.result, won: !!r.won, z: r.vol?.z ?? null, win: 1, same: epN[r.close + r.side] || 1, hr: etHour(r.at), off: (K.skipHours || []).includes(etHour(r.at)) }));
    const labs = runLabs(trades, K, lateT, m10T, epT);
    pnT = trades; pnBank = bal;
    const doneAll = trades.filter(t => t.done && !t.capped), done = doneAll.filter(t => t.run), today = done.filter(t => etDay(t.close) === etDay(Date.now()));
    // MC 2026-11-12 today's taken paper trades in the worker log every 10 minutes, so a day's total can be checked from the tail
    // without the dashboard (the paper day went to -$65 after the outage fill-in and needed checking)
    if (Date.now() - dayLogAt > 600000) { dayLogAt = Date.now(); console.log('daylog ' + JSON.stringify({ db: Math.round((sql.databaseSize || 0) / 1048576 * 10) / 10, paths: (() => { try { return [...sql.exec('SELECT COUNT(*) n FROM kpath')][0].n; } catch { return null; } })(), cap: K.winCap, strat: K.strat?.at?.(-1) ?? K.strat, net: sum(today), n: today.length, t: today.map(t => [t.tk.replace(/^KX|15M-\d+/g, ''), t.side[0], t.px, t.won ? 1 : 0, t.pnl, rec.get(t.mk)?.src === 'fill' ? 'F' : '', rec.get(t.mk)?.vol?.z ?? null, new Date(t.close).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })]) })); }
    const byCoin = {}; for (const t of doneAll) { const b = byCoin[t.coin] = byCoin[t.coin] || { coin: t.coin, n: 0, won: 0, net: 0 }; b.n++; if (t.won) b.won++; b.net = +(b.net + t.pnl).toFixed(2); }
    const winLoss = {}; for (const t of done) { if (!t.won) winLoss[t.close] = (winLoss[t.close] || 0) + 1; }
    let streak = 0; for (let i = done.length - 1; i >= 0 && done[i].won; i--) streak++;
    const seen = rows.filter(r => r.ask >= KEEP_ASK).length, rule = rows.filter(r => r.ask >= K.minAsk).length, under = rows.filter(r => r.result && r.result !== 'void' && r.ask >= KEEP_ASK && r.ask < K.minAsk);
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
    tradesMem = trades;
    return {
      byHour, bySide, byPx, bySame, sameMin, daily, roll, breakEven, halves, checks, all, live: { at: scanAt, scan, live: liveView() }, keys, wr300: +(wr300 * 100).toFixed(1), worstDay, dd: +(peak - bal).toFixed(2),
      bounds: BOUNDS, coinsAll: COINS, cfg: K, balance: +bal.toFixed(2), net: +(bal - K.startUsd).toFixed(2), inPlay: +open.toFixed(2), maxDd: +maxDd.toFixed(2),
      popen: trades.filter(t => !t.capped && !t.done && t.close > Date.now()).map(t => ({ tk: t.mk, coin: t.coin, side: t.side, px: t.px, n: t.n, cost: t.cost, hand: t.hand || 0 })),
      n: done.length, won: done.filter(t => t.won).length, today: { n: today.length, won: today.filter(t => t.won).length, net: sum(today),
        // MC 2026-11-10 what the playbook passed on today and how those would have gone, so a filter can be judged at a glance
        ...(() => { const ps = trades.filter(t => t.strat && t.run && etDay(t.close) === etDay(Date.now())), pd = ps.filter(t => t.done); return { passed: ps.length, pWon: pd.filter(t => t.won).length, pLost: pd.filter(t => !t.won).length }; })(),
        ...(() => { const sk = trades.filter(t => t.ifPnl != null && t.run && etDay(t.close) === etDay(Date.now())); if (!sk.length) return {}; const x = +sk.reduce((a, t) => a + t.ifPnl, 0).toFixed(2); return { stop: { n: sk.length, won: sk.filter(t => t.ifPnl > 0).length, net: x, ifNet: +(sum(today) + x).toFixed(2) } }; })() },
      avg: done.length ? +(sum(done) / done.length).toFixed(2) : 0, streak, uncappedNet: +(balU - K.startUsd).toFixed(2), capped: trades.filter(t => t.capped).length,
      runFrom: runFrom || null, runN: done.length, prevN: doneAll.length - done.length, worstWin: Math.max(0, ...Object.values(winLoss)), halts: trades.filter(t => t.halted).length, seen, rule, since: (runFrom ? (done[0]?.t || runFrom) : rows[0]?.at) || null, last: rows[rows.length - 1]?.at || null,
      under: { n: under.length, won: under.filter(r => r.won).length, c: under.length ? +(under.reduce((a, r) => a + (r.pnl1 || 0), 0) / under.length * 100).toFixed(2) : 0 },
      eq: eq.filter((x, i) => i % step === 0 || i === eq.length - 1), byCoin: Object.values(byCoin).sort((a, b) => b.net - a.net), room: roomOf(rows, K), paid: PAID,
      cold: K.coldDays > 0 ? Object.fromEntries([...new Set(trades.map(t => t.coin))].map(c => [c, +net30(c, Date.now()).x.toFixed(2)])) : null, coldSkips: trades.filter(t => t.cold).length,
      look2sum: l2sum ? { since: l2sum.since, size: +cfgP.sizeUsd || 50, h: Object.entries(l2sum.h).map(([k, v]) => [+k, ...v]).sort((a, b) => a[0] - b[0]), d: Object.entries(l2sum.d).map(([k, v]) => [k, ...v]).sort((a, b) => a[0] < b[0] ? -1 : 1) } : null,
      look2: Object.entries(l2log || {}).map(([tk, x]) => ({ tk, ...x, res: rec2.get(tk)?.result || rec.get(tk)?.result || x.res || null, won: rec2.get(tk)?.result ? !!rec2.get(tk).won : null, final: (rec.get(tk)?.result || x.res) ? ((rec.get(tk)?.result || x.res) === x.side) : null })).sort((a, b) => b.close - a.close || (a.coin < b.coin ? -1 : 1)), trendx: trendStats(K), chartfill: (() => { const now = Date.now(); let left = 0, oldest = null; for (const r of rec.values()) { if (!r.vol || !(r.strike > 0) || r.at < now - 21 * 86400000 || r.at > now - 120000) continue; if (r.vol.dp === undefined && (r.vol.tlTry || 0) < 2) left++; else if (r.vol.dp != null && (oldest == null || r.at < oldest)) oldest = r.at; } return { left, oldest }; })(),
      volfix: (() => { let fixed = 0, left = 0; for (const r of rec.values()) { const v = r.vol; if (v?.fixed) fixed++; else if (v ? ((v.age == null || v.src === 'stale') && !v.chk && (v.rt || 0) < 3) : (r.ask >= KEEP_ASK && r.strike > 0 && (r.vrt || 0) < 3 && r.at > Date.now() - 7 * 86400000)) left++; } return { fixed, left }; })(), learn: learnView(trades, K), pending: trades.filter(t => !t.done && !t.capped).slice(-12), recent: trades.filter(t => t.done || t.capped).slice(-60).reverse(), where: 'cloud', logs: logs.slice(-20), labs,
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
    for (const r of rows) { if (!(r.ask >= K.minAsk) || r.at < cut || r.result === 'void' || r.src === 'fill') continue; const b = by[coin(r.series)] || (by[coin(r.series)] = { coin: coin(r.series), d: [], s: { 100: [0, 0, 0], 250: [0, 0, 0], 500: [0, 0, 0], 1000: [0, 0, 0] } });
      if (r.depthAtAsk != null) b.d.push(r.depthAtAsk);
      for (const [n, a] of [[100, r.avgN], [250, r.a250], [500, r.a500], [1000, r.a1000]]) { if (a === undefined) continue; const x = b.s[n]; x[0]++; if (a != null) { x[1]++; x[2] += (a - r.ask) * 100; } } }
    return Object.values(by).map(b => { b.d.sort((x, y) => x - y); const o = { coin: b.coin, n: b.d.length, med: b.d.length ? Math.round(b.d[b.d.length >> 1]) : null };
      for (const n of [100, 250, 500, 1000]) { const x = b.s[n]; o['n' + n] = x[0]; o['ok' + n] = x[0] ? +(x[1] / x[0]).toFixed(3) : null; o['c' + n] = x[1] ? +(x[2] / x[1]).toFixed(2) : null; } return o; }).sort((a, b) => (b.med ?? 0) - (a.med ?? 0));
  }
  function runLabs(tradesIn, K, lateT = [], m10T = [], epT = []) {
    labRowsMem = {};
    const LABS = labDefs(K), plain = tradesIn.filter(t => !t.late), withLate = lateT.length ? [...plain, ...lateT].sort((a, b) => a.t - b.t) : plain;
    const todayK = etDay(Date.now());
    // MC 2026-11-11 cash, when set, sells every trade whose trend turned against it at the minute-10 bid (the Cash out when the
    // trend turns setting) and holds the rest; unset, every trade is held to settlement. Either way the result does not depend on
    // what the paper setting is, so the Labs switch shows both before the setting goes on.
    // MC 2026-11-13 keep: also return each trade the playbook took ([close, coin, side, px, contracts, pnl, won, 1], the paper
    // "all" shape) so the Rule analytics tab can draw the full Analytics charts for any playbook. Kept in memory, served by /klab.
    const sim = (lab, from, baseline, cash = false, keep = false) => {
      const rows = keep ? [] : null;
      let bank = K.startUsd, peak = bank, dd = 0, n = 0, won = 0, sk = 0, skNet = 0; const day = {}, dayPk = {}, stopD = {}, eq = [], td = { n: 0, won: 0, net: 0 }, lockR = {}, wS = {}, tw = {}, wCap = K.winCap ?? 9; let ddRef = bank, ddLast = null;
      const trades = lab.ep ? epT : lab.m10Only && !baseline ? m10T : lab.late && !baseline ? withLate : plain;
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
        if (rows) rows.push([t.close, t.coin, t.side, +t.px, k, +pnl.toFixed(2), ok ? 1 : 0, 1]);
        if (dk === todayK) { td.n++; if (ok) td.won++; td.net += pnl; }
      }
      const step = Math.max(1, Math.ceil(eq.length / 120));
      return { n, won, net: +(bank - K.startUsd).toFixed(2), dd: +dd.toFixed(2), today: { n: td.n, won: td.won, net: +td.net.toFixed(2) }, skipped: { n: sk, net: +skNet.toFixed(2) }, eq: eq.filter((x, i) => i % step === 0 || i === eq.length - 1), rows };
    };
    return LABS.map(lab => {
      const trades = lab.ep ? epT : lab.m10Only ? m10T : plain;
      const first = trades.find(t => t.done && t.win <= K.maxPerWindow && lab.filter(t) != null);
      if (!first) return { id: lab.id, name: lab.name, desc: lab.desc, color: lab.color, labOnly: !!(lab.m10Only || lab.ep), arch: ARCH.has(lab.id), since: null, n: 0, won: 0, net: 0, dd: 0, today: { n: 0, won: 0, net: 0 }, skipped: { n: 0, net: 0 }, eq: [], base: null, delta: null };
      const both = cash => { const r = sim(lab, first.close, false, cash, !cash), b = lab.id === 'rule' ? null : sim(lab, first.close, true, cash); if (r.rows) labRowsMem[lab.id] = r.rows.slice(-20000); delete r.rows;
        return { ...r, base: b ? { n: b.n, won: b.won, net: b.net, dd: b.dd, today: b.today } : null, delta: b ? +(r.net - b.net).toFixed(2) : null }; };
      return { id: lab.id, name: lab.name, desc: lab.desc, color: lab.color, arch: ARCH.has(lab.id), labOnly: !!(lab.m10Only || lab.ep), since: first.close, ...both(false), cx: both(true) };
    });
  }

  // ---------- dashboard commands, applied here ----------
  async function command(type, a, who = {}) {
    await load();
    // MC 2026-11-10 a locked device may change paper settings and the paper playbook, and nothing else, and only while live is off
    if (who.locked && (ctlL.enabled === true || !(type === 'kalshiSet' || type === 'kalshiPaperBuy' || type === 'kalshiPaperSell' || (type === 'kalshiStrat' && a?.book === 'paper')))) return { ok: false, msg: type === 'kalshiBuyOne' || type === 'kalshiSellOne' ? `${type === 'kalshiBuyOne' ? 'Buying' : 'Selling'} needs an unlocked device.` : ctlL.enabled === true ? 'Live trading is on, so settings need an unlocked device.' : 'That needs an unlocked device.' };
    if (type === 'kalshiSet') {
      // MC 2026-11-14 paper and live keep separate rules: book 'live' edits the live set (LIVE_KEYS only), from an unlocked device.
      // copyFrom 'paper' sets every live rule to what paper uses now.
      // MC 2026-11-15 a.sub names a subaccount book: the same form and checks, saved to that book's own copy of the live rules
      const bk = a.book === 'live' && a.sub ? books.get(a.sub) : null; if (a.book === 'live' && a.sub && !bk) return { ok: false, msg: 'No such book.' };
      const isL = a.book === 'live', cur = bk ? { ...cfgL, ...(bk.cfg || {}) } : isL ? cfgL : cfgP, out = {}, ch = [];
      if (isL && who.locked) return { ok: false, msg: 'Live settings need an unlocked device.' };
      if (isL && !bk && a.copyFrom === 'paper') { const nx = pickL(cfgP); if (JSON.stringify(nx) === JSON.stringify(pickL(cfgL))) return { ok: false, msg: 'Live already matches paper.' }; cfgL = nx; await kv.put('kcfgL', cfgL); viewDirty = true; await publish(true); say('LIVE settings copied from paper'); return { ok: true, msg: 'Live settings now match paper. They apply from the next trade check.' }; }
      // MC 2026-11-13 the minimum and maximum price keep a tenth of a cent (request 10); the other prices stay whole cents
      for (const k of Object.keys(BOUNDS)) { if (isL && !LIVE_KEYS.includes(k)) continue; if (!isL && (k === 'slipC' || k === 'capPb')) continue; if (a[k] == null || a[k] === '') continue; const v = Number(a[k]); if (!isFinite(v)) continue; const x = Math.min(BOUNDS[k][1], Math.max(BOUNDS[k][0], k === 'minAsk' || k === 'maxAsk' ? Math.round(v * 1000) / 1000 : k === 'mixMaxPx' ? Math.round(v * 100) / 100 : Math.round(v))); if (x !== cur[k]) { out[k] = x; ch.push(`${k} ${cur[k]} -> ${x}`); } }
      if (Array.isArray(a.coins)) { const want = COINS.filter(x => a.coins.includes(x)); if (!want.length) return { ok: false, msg: 'Pick at least one coin.' }; const v = want.length === COINS.length ? null : want, was = cur.coins || null; if (JSON.stringify(v) !== JSON.stringify(was)) { out.coins = v; ch.push(`coins ${v ? v.join(', ') : 'all nine'}`); } }
      if (out.minAsk != null || out.maxAsk != null) { const lo = out.minAsk ?? cur.minAsk, hi = out.maxAsk ?? cur.maxAsk ?? 0.99; if (lo > hi) return { ok: false, msg: 'The maximum price can\'t be below the minimum price.' }; }
      if (out.mixSame != null || out.mixSameMax != null) { const lo = out.mixSame ?? cur.mixSame ?? 3, hi = out.mixSameMax ?? cur.mixSameMax ?? 9; if (lo > hi) return { ok: false, msg: 'Coins on the same side: the most can\'t be below the least.' }; }
      if (['fixed', 'pct', 'kelly', 'ratchet'].includes(a.mixSize) && a.mixSize !== (cur.mixSize || 'fixed')) { out.mixSize = a.mixSize; ch.push(`mix sizing ${a.mixSize}`); }
      if (!isL && a.paperFrom != null) { const v = a.paperFrom === 0 ? 0 : Math.min(Date.now(), Math.max(0, +a.paperFrom || 0)); if (v !== (cfgP.paperFrom || 0)) { out.paperFrom = v; out.paperPrev = cfgP.paperFrom || 0; ch.push(v ? `new paper run from ${new Date(v).toISOString().slice(0, 16)}Z` : 'paper run covers everything again'); } }
      if (Array.isArray(a.skipHours)) { const v = [...new Set(a.skipHours.map(Number).filter(h => Number.isInteger(h) && h >= 0 && h < 24))].sort((x, y) => x - y); if (v.length === 24) return { ok: false, msg: 'Leave at least one hour on.' }; if (JSON.stringify(v) !== JSON.stringify(cur.skipHours || [])) { out.skipHours = v; ch.push(`off hours ${v.length ? v.join(', ') : 'none'}`); } }
      if (!ch.length) return { ok: false, msg: 'Nothing changed.' };
      if (bk) { await books.setCfg(bk.id, pickL({ ...cur, ...out }), ch.join(', ')); viewDirty = true; await publish(true); return { ok: true, msg: `${bk.name} now has its own live rules: ${ch.join(', ')}.` }; }
      if (isL) { cfgL = { ...cfgL, ...out }; await kv.put('kcfgL', cfgL); say(`LIVE settings: ${ch.join(', ')}`); } else { cfgP = { ...cfgP, ...out }; await kv.put('kcfg', cfgP); }
      viewDirty = true; await publish(true);
      return { ok: true, msg: `${isL ? 'Live' : 'Paper'} settings saved: ${ch.join(', ')}.` };
    }
    if (type === 'kalshiShard') {
      // MC 2026-11-15 asked to see what is on the main balance and what is on the crypto trading balance, and to move money between
      // them from the dashboard. Kalshi holds the 15-minute crypto markets' money on its own exchange shard: deposits, withdrawals
      // and subaccount transfers use shard 0, orders spend the crypto shard, and until now only the automatic top-up moved money
      // between them. This moves a chosen amount either way inside the same account, from a fresh balance read. Nothing leaves
      // the account. With live on, the top-up still refills the crypto side before a trade check if it runs low.
      if (who.locked) return { ok: false, msg: 'Moving money needs an unlocked device.' };
      if (!hasKeys()) return { ok: false, msg: 'Connect the Kalshi key first.' };
      const to = a.to === 'main' ? 'main' : a.to === 'crypto' ? 'crypto' : null, amt = Math.floor((+a.amount || 0) * 100) / 100; if (!to || !(amt >= 1)) return { ok: false, msg: 'Move at least $1.' };
      st.balAt = 0; if (await balance(true) == null) return { ok: false, msg: 'Could not read your Kalshi balances. Try again.' };
      const from = to === 'crypto' ? 0 : XI, dest = to === 'crypto' ? XI : 0, free = Math.max(0, (st.shard[from] ?? 0) - (from === 0 ? vault.held() : 0));
      if (amt > free + 0.005) return { ok: false, msg: `Only $${free.toFixed(2)} is free on the ${to === 'crypto' ? 'main' : 'crypto trading'} balance right now.` };
      const res = await kreq('POST', '/portfolio/intra_exchange_instance_transfer', { source: 'event_contract', destination: 'event_contract', amount: Math.round(amt * 100) * 100, source_exchange_shard: from, destination_exchange_shard: dest, client_transfer_id: crypto.randomUUID() });
      if (!res?.ok) return { ok: false, msg: `Kalshi refused the move: ${errOf(res)} (code ${res?.status})` };
      st.xferAt = Date.now(); st.balAt = 0; await balance(true); viewDirty = true; await publish(true); say(`LIVE moved $${amt.toFixed(2)} to the ${to === 'crypto' ? 'crypto shard' : 'main balance'} by hand`);
      return { ok: true, msg: `$${amt.toFixed(2)} moved to the ${to === 'crypto' ? 'crypto trading' : 'main'} balance.` };
    }
    if (type === 'kalshiPaperBuy') {
      const q = await paperBuyQuote(a.tk, a.side); if (!q.ok) return q;
      const r = { ticker: q.tk, hand: 1, late: 1, series: q.series, at: Date.now(), close: q.close, left: +((q.close - Date.now()) / 60000).toFixed(2), side: q.side, ask: q.best, avgN: q.avg, n: q.est, strike: q.strike, ya: q.ya, na: q.na, title: rec.get(q.tk)?.title || null, src: 'hand' };
      loadH().set(r.ticker, r); saveH(r); for (const [k, v] of recH) if (v.close < Date.now() - 45 * 86400000) { recH.delete(k); sql.exec('DELETE FROM kh WHERE tk = ?', k); }
      viewDirty = true; await publish(true); say(`${r.ticker} ${r.side.toUpperCase()} at ${Math.round(q.avg * 100)}c <- paper, by hand`);
      return { ok: true, msg: `Paper bought ${q.est} ${q.coin} ${q.side.toUpperCase()} at ${(q.avg * 100).toFixed(1)}¢ for $${q.cost.toFixed(2)}. Practice money only.` };
    }
    if (type === 'kalshiPaperSell') {
      const q = await paperSellQuote(a.tk); if (!q.ok) return q; const p = paperPos(q.tk);
      p.r.psold = { px: q.avg, at: Date.now() }; p.save(p.r); viewDirty = true; await publish(true); say(`${q.tk} paper position sold by hand at ${Math.round(q.avg * 100)}c`);
      return { ok: true, msg: `Paper sold ${q.left} ${q.coin} ${q.side.toUpperCase()} at ${(q.avg * 100).toFixed(1)}¢, ${q.pnl >= 0 ? '+' : '-'}$${Math.abs(q.pnl).toFixed(2)} on the trade. Practice money only.` };
    }
    if (type === 'kalshiBuyOne') {
      // MC 2026-11-14 buy one market now (the Buy button on a scanner card). The page shows the quote first; maxPx is the ceiling
      // it showed, so the order never pays more than what was confirmed. IOC: whatever does not fill at once is not bought.
      if (who.locked) return { ok: false, msg: 'Buying needs an unlocked device.' };
      // MC 2026-11-15 a.accts picks the accounts: 'main' and book ids. Main and the books are sent side by side at the same
      // ceiling price, each at its own size. Books go only with Main, or when Main already holds the market.
      if (Array.isArray(a.accts) && !a.one) { const tk = String(a.tk || ''), s = handMkt(tk, a.side); if (!s) return { ok: false, msg: 'Unknown market.' };
        const ids = a.accts.filter(x => x !== 'main').map(String), wantMain = a.accts.includes('main'), held = (() => { const x = L.get(tk); return !!(x && busy(x)); })();
        if (!wantMain && !ids.length) return { ok: false, msg: 'Pick at least one account.' };
        if (!wantMain && !held) return { ok: false, msg: 'A hand buy for a subaccount goes with Main, unless Main already holds that market.' };
        const maxPx = Math.min(0.99, Math.max(0.01, Number(a.maxPx) || 0)); if (!(Number(a.maxPx) > 0)) return { ok: false, msg: 'No price to buy at. Open the quote again.' };
        let m = null; try { m = await get(`/markets/${tk}`); m = m?.market || m; } catch { } const close = Date.parse(m?.close_time); if (!(close > Date.now() + 15000)) return { ok: false, msg: 'That market is about to close, too late to buy.' };
        const [mr, br] = await Promise.all([wantMain ? command('kalshiBuyOne', { tk, side: a.side, maxPx: a.maxPx, ask: a.ask, one: 1 }, who) : null, ids.length ? books.handBuy(ids, { tk, coin: coin(s), side: a.side, maxPx, close, strike: kStrike(m) ?? null, title: m?.title || null, ask: Number(a.ask) || null }) : []]);
        viewDirty = true; await publish(true);
        return { ok: !!mr?.ok || br.some(x => x.ok), msg: [mr ? `Main: ${mr.msg}` : '', ...br.map(x => `${x.name}: ${x.msg}.`)].filter(Boolean).join(' ') }; }
      const tk = String(a.tk || ''), side = a.side, s = handMkt(tk, side); if (!s) return { ok: false, msg: 'Unknown market.' };
      const c = ctl(), g = handGate(c, tk); if (g) return { ok: false, msg: g };
      const maxPx = Math.min(0.99, Math.max(0.01, Number(a.maxPx) || 0)), size = c.sizeUsd, n = Math.floor(size / maxPx);
      if (!(Number(a.maxPx) > 0) || n < 1) return { ok: false, msg: 'No price to buy at. Open the quote again.' };
      let m = null; try { m = await get(`/markets/${tk}`); m = m?.market || m; } catch { }
      const close = Date.parse(m?.close_time); if (!(close > Date.now() + 15000)) return { ok: false, msg: 'That market is about to close, too late to buy.' };
      const bal = await balance(true); if (bal == null) return { ok: false, msg: 'Could not read your Kalshi cash. Try again.' };
      const floor = c.minBank ?? HARD.minBank; if (bal - vault.held() - resv < floor) return { ok: false, msg: `Your Kalshi cash ($${bal.toFixed(2)}) is under the $${floor} floor.` };
      if ((st.shard[XI] ?? 0) - resv < size + 1) { st.xferAt = 0; await fund(c); }
      const grid = p => (p < 0.1 || p >= 0.9) ? 0.001 : 0.01, down = p => +(Math.floor(p / grid(p) + 1e-9) * grid(p)).toFixed(4), up = p => +(Math.ceil(p / grid(p) - 1e-9) * grid(p)).toFixed(4), cid = `crh${Date.now() % 100000}-${tk}`.slice(0, 60);
      const body = side === 'yes'
        ? { ticker: tk, side: 'bid', count: String(n), price: down(maxPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', client_order_id: cid }
        : { ticker: tk, side: 'ask', count: String(n), price: up(1 - maxPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', client_order_id: cid };
      const prev = L.get(tk), cn = coin(s), row = { tk, coin: cn, side, at: Date.now(), close, strike: kStrike(m) ?? null, title: m?.title || null, ask: Number(a.ask) || null, want: n, limit: maxPx, limWhy: 'the price you confirmed', size, fill: 0, strat: 'hand', hand: 1, pend: 1, ...(prev?.skipped ? { was: prev.skipped } : {}) };
      // a buy that does not happen leaves the market as it was (the rule's skip, say), so the record of why the rule passed stays
      const undo = () => { if (prev) { L.set(tk, prev); saveL(prev); } else { L.delete(tk); sql.exec('DELETE FROM ko WHERE tk = ?', tk); } viewDirty = true; };
      L.set(tk, row); saveL(row); resv += size;
      // MC 2026-11-16 asked to find a pattern in the hand buys that won: keep the chart readings at the moment of the buy, read
      // after the order is sent so the order is not held up
      if (row.strike > 0) volAt(cn, row.strike, side).then(v => { if (v) { row.vol = volPick(v); saveL(row); } }).catch(() => { });
      const t0 = Date.now(); let res; try { res = await kreq('POST', '/portfolio/events/orders', body); } finally { delete row.pend; resv = Math.max(0, resv - size); }
      row.rtt = Date.now() - t0;
      if (!res?.ok) { const e = `${res?.status} ${errOf(res)}`.slice(0, 200); undo(); fail(`hand buy ${tk} refused: ${e}`); await publish(true); return { ok: false, msg: `Kalshi refused the order: ${e}` }; }
      const j = res.j?.order || res.j || {}, fill = +(j.fill_count ?? 0), avgYes = j.average_fill_price != null ? +j.average_fill_price : null, avgFee = j.average_fee_paid != null ? +j.average_fee_paid : 0;
      if (!(fill > 0) || avgYes == null) { undo(); await publish(true); return { ok: false, msg: `Nothing bought at ${(maxPx * 100).toFixed(1)}¢ or less; the price moved. Nothing was spent.` }; }
      Object.assign(row, { id: j.order_id || null, fill, avgYes, px: +(side === 'yes' ? avgYes : 1 - avgYes).toFixed(4), fees: +(fill * avgFee).toFixed(4) });
      row.cost = +(fill * row.px + row.fees).toFixed(2); saveL(row);
      if (st.bal != null) st.bal = +(st.bal - row.cost).toFixed(2); if (st.shard[XI] != null) st.shard[XI] = +(st.shard[XI] - row.cost).toFixed(2);
      st.balAt = 0; viewDirty = true; await publish(true);
      say(`LIVE bought ${tk} ${side.toUpperCase()} by hand: ${fill}/${n} at ${(row.px * 100).toFixed(1)}c ($${row.cost.toFixed(2)})`);
      return { ok: true, msg: `Bought ${fill}${fill < n ? ` of ${n}` : ''} ${cn} ${side.toUpperCase()} at ${(row.px * 100).toFixed(1)}¢ for $${row.cost.toFixed(2)}. It pays $${fill}.00 if ${side.toUpperCase()} wins.` };
    }
    if (type === 'kalshiSellOne') {
      // MC 2026-11-14 sell one open live position now (the Sell button on its card). The page shows the quote first; minPx is the
      // floor it showed, so the sale never goes below what was confirmed. Needs an unlocked device.
      if (who.locked) return { ok: false, msg: 'Selling needs an unlocked device.' };
      if (Array.isArray(a.accts) && !a.one) { const tk = String(a.tk || ''), ids = a.accts.filter(z => z !== 'main').map(String), wantMain = a.accts.includes('main'); if (!wantMain && !ids.length) return { ok: false, msg: 'Pick at least one account.' };
        const minPx = Math.min(0.99, Math.max(0.01, Number(a.minPx) || 0.01));
        const [mr, br] = await Promise.all([wantMain ? command('kalshiSellOne', { tk, minPx: a.minPx, one: 1 }, who) : null, ids.length ? books.handSell(ids, tk, minPx) : []]);
        viewDirty = true; await publish(true);
        return { ok: !!mr?.ok || br.some(z => z.ok), msg: [mr ? `Main: ${mr.msg}` : '', ...br.map(z => `${z.name}: ${z.msg}.`)].filter(Boolean).join(' ') }; }
      const x = L.get(String(a.tk || '')); if (!x || !(x.fill > 0) || x.result) return { ok: false, msg: 'No open live position in that market.' };
      if (x.close <= Date.now()) return { ok: false, msg: 'That market has closed; it settles on its own.' };
      const minPx = Math.min(0.99, Math.max(0.01, Number(a.minPx) || 0.01)), o = await sellPos(x, minPx, 'manual');
      if (o.err) return { ok: false, msg: `Kalshi refused the sale: ${o.err}` };
      await publish(true);
      if (!o.f) return { ok: false, msg: `Nothing sold at ${(minPx * 100).toFixed(1)}¢ or better; the price moved. The position is still open.` };
      say(`LIVE sold ${x.tk} by hand: ${o.f}/${x.fill} at ${(o.px * 100).toFixed(1)}c`);
      return { ok: true, msg: `Sold ${o.f} of ${x.fill} ${x.coin} ${x.side.toUpperCase()} at ${(o.px * 100).toFixed(1)}¢${x.result === 'sold' ? `, ${x.pnl >= 0 ? '+' : '-'}$${Math.abs(x.pnl).toFixed(2)} on the trade` : '. The rest is still open'}.` };
    }
    if (type === 'kalshiLive') {
      const next = { ...ctlL }, ch = [];
      if (a.enabled === true || a.enabled === false) { if (next.enabled !== a.enabled) ch.push(a.enabled ? 'live trading ON' : 'live trading OFF'); next.enabled = a.enabled; }
      if (a.sizeUsd != null && isFinite(+a.sizeUsd)) { const v = Math.min(HARD.maxSize, Math.max(5, Math.round(+a.sizeUsd))); if (v !== next.sizeUsd) ch.push(`size $${next.sizeUsd} -> $${v}`); next.sizeUsd = v; }
      if (a.dailyLossUsd != null && isFinite(+a.dailyLossUsd)) { const v = Math.min(500, Math.max(10, Math.round(+a.dailyLossUsd))); if (v !== next.dailyLossUsd) ch.push(`daily loss cap $${next.dailyLossUsd} -> $${v}`); next.dailyLossUsd = v; }
      if (a.minBank != null && isFinite(+a.minBank)) { const v = Math.min(100000, Math.max(0, Math.round(+a.minBank))); if (v !== (next.minBank ?? HARD.minBank)) ch.push(`cash floor $${next.minBank ?? HARD.minBank} -> $${v}`); next.minBank = v; }
      // MC 2026-11-15 asked for: pause the tracker's own buying but keep buying and selling by hand. autoPause leaves live on (hand
      // buys need it) and stops the trade check from placing orders for the main account and every book. Positions already
      // open ride as they would have; the cash out rule, if it is on, still acts on them.
      if (a.autoPause === true || a.autoPause === false) { if ((next.autoPause === true) !== a.autoPause) ch.push(a.autoPause ? 'automatic buying PAUSED' : 'automatic buying RESUMED'); next.autoPause = a.autoPause; }
      if (a.sellAll === true) { next.sellAllAt = Date.now(); ch.push('sell all open live positions'); }
      if (a.moneySync === true) { try { await moneySync(Date.now(), true); } catch (e) { return { ok: false, msg: 'Could not reach Kalshi: ' + e.message }; } publish(true); return { ok: !kmoney?.err, msg: kmoney?.err ? `Kalshi didn't share the list (${kmoney.err}).` : `Kalshi lists ${kmoney?.list?.length || 0} deposits and withdrawals.` }; }
      // MC 2026-11-16 asked for: the money he put in (and took out) beside the trading result, so the dash can say where the
      // account stands all time. Kalshi's API doesn't list deposits, so he enters them. + is money in, - is a withdrawal.
      if (a.moneyAdd) { const v = Math.round(+a.moneyAdd.usd * 100) / 100, at = +a.moneyAdd.at > 0 ? +a.moneyAdd.at : Date.now();
        if (!isFinite(v) || !v || Math.abs(v) > 1e7) return { ok: false, msg: 'Enter an amount.' };
        next.money = [...(next.money || []), { id: Date.now().toString(36), at, usd: v, note: String(a.moneyAdd.note || '').slice(0, 60) }].sort((x, y) => x.at - y.at).slice(-300);
        ch.push(`${v > 0 ? 'deposit' : 'withdrawal'} of $${Math.abs(v).toFixed(2)} noted`); }
      // MC 2026-11-16 asked to leave two old Kalshi entries out (a deposit and the withdrawal of it before this run). Hidden by id,
      // never deleted, and shown dimmed in the box so they can be counted again.
      if (a.moneyHide || a.moneyShow) { const id = String(a.moneyHide || a.moneyShow), h = new Set(next.moneyHide || []); if (a.moneyHide) h.add(id); else h.delete(id); next.moneyHide = [...h].slice(-200); ch.push(a.moneyHide ? 'money entry left out' : 'money entry counted again'); }
      if (a.moneyDel) { const was = (next.money || []).length; next.money = (next.money || []).filter(x => x.id !== a.moneyDel); if (next.money.length !== was) ch.push('money entry removed'); }
      if (!ch.length) return { ok: false, msg: 'Nothing changed.' };
      if (next.enabled && !hasKeys()) return { ok: false, msg: env.KEY_HELP || 'The Kalshi key is not set in Cloudflare yet. Run set-kalshi-secrets.bat on the PC once, then try again.' };
      next.at = Date.now(); next.by = 'dashboard'; ctlL = next; await kv.put('kctl', ctlL); say('LIVE ' + ch.join(', '));
      if (a.sellAll === true) { st.sellAllDone = next.sellAllAt; await kv.put('kst', { sellAllDone: st.sellAllDone }); try { await sellAll(); } catch (e) { fail('sell-all error: ' + e.message); } }
      // MC 2026-11-14 the dashboard header read "Paper only" for up to two minutes after live was turned on: the page's main view
      // was only rebuilt every two minutes unless marked dirty, and this command did not mark it
      viewDirty = true; await publish(true);
      return { ok: true, msg: `Kalshi live: ${ch.join(', ')}. Applied in the cloud right away.` };
    }
    // MC 2026-11-13 request 8: Kalshi's API usage level, read and upgraded from the Live account tab. 'check' reads the tier and
    // limits (GET /account/limits) and the 30-day volume toward the volume tiers (GET /account/api_usage_level/volume_progress).
    // 'upgrade' asks Kalshi for the permanent Advanced grant (POST /account/api_usage_level/upgrade). Kalshi only gives it when
    // at least one of the account's last 100 orders came in through the API, so a 403 means no live order has been placed yet.
    // Advanced is what subaccounts (live books) need. The answer is kept in kapi so the tab shows it without asking again.
    if (type === 'kalshiVault') {
      if (who.locked) return { ok: false, msg: 'That needs an unlocked device.' };
      const r = await vault.command(a || {}); viewDirty = true; await publish(true); return r;
    }
    if (type === 'kalshiApi') {
      if (who.locked) return { ok: false, msg: 'That needs an unlocked device.' };
      if (!hasKeys()) return { ok: false, msg: env.KEY_HELP || 'The Kalshi key is not set in Cloudflare yet.' };
      const read = async () => { const [l, v] = await Promise.all([kreq('GET', '/account/limits'), kreq('GET', '/account/api_usage_level/volume_progress')]);
        const o = { at: Date.now(), ok: !!l?.ok, limits: l?.ok ? l.j : null, err: l?.ok ? null : `${l?.status} ${errOf(l)}`, vol: v?.ok ? (v.j?.volume_progress || [])[0] || null : null };
        await kv.put('kapi', o); apiV = o; return o; };
      if (a?.op === 'upgrade') {
        // MC 2026-11-14 sent with no body the request carried no content type and Kalshi answered 400 invalid_content_type; an empty JSON body fixes that
        const r = await kreq('POST', '/account/api_usage_level/upgrade', {});
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
      if (a?.op === 'match') { const c = ctl(); a.main = { strat: stratAt(c.strat, Date.now()), size: c.sizeUsd, loss: c.dailyLossUsd, floor: c.minBank ?? HARD.minBank }; }
      const r = await books.command(a || {}, LAB_IDS.filter(id => { const l = labDefs(cfgP).find(l => l.id === id); return !l.m10Only && !l.ep; })); viewDirty = true; await publish(true); return r;
    }
    if (type === 'kalshiStrat') {
      // MC 2026-11-08 switch the paper book or the live gate to a lab (or back to the rule), logged with a timestamp so the
      // books apply it from now on and the history before it stays as it was.
      const id = String(a.id || 'rule'), book = a.book === 'live' ? 'live' : 'paper';
      if (!LAB_IDS.includes(id)) return { ok: false, msg: 'Unknown playbook.' };
      { const l = labDefs(cfgP).find(l => l.id === id); if (l.m10Only || l.ep) return { ok: false, msg: `${l.name} runs in Labs only for now.` }; }
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
  // MC 2026-11-13 Steven could not replay early-morning trades: the view only carries the last 60 in full, older ones arrive as
  // short rows with no target price, so Trades could not open them. One full trade is now served on request (/ktrade).
  // MC 2026-11-17 the Backtest page can run on this tracker's own record. Same row shape as the published four-month history
  // (research/learn/btdata.mjs): every settled leader at 90c or more, priced at what 100 contracts cost in the book.
  const btRows = async () => { await load(); const R = [...rec.values()].filter(r => !r.late && (r.result === 'yes' || r.result === 'no') && r.ask >= 0.9 && r.ask <= 0.99 + 1e-9 && r.src !== 'fill'), byW = {};
    for (const r of R) (byW[r.close] = byW[r.close] || []).push(r);
    const cs = [...new Set(R.map(r => coin(r.series)))].sort(), i = (v, k) => v == null || !isFinite(v) ? null : Math.round(v * k);
    const rows = R.sort((a, b) => a.close - b.close).map(r => { const W = byW[r.close], v = r.vol || {}, x = r.exit || null;
      return [Math.round((r.close - 600000) / 60000), cs.indexOf(coin(r.series)), i(r.avgN || r.ask, 1000), r.result === r.side ? 1 : 0, W.filter(q => q.side === r.side).length, W.length, i(v.z, 100), i(v.z2, 100), i(v.z10, 100), i(r.lp, 1000), i(x?.pct, 1000), i(x?.px ?? x?.best, 1000), i(x?.keep, 1000), i(v.dp, 100), i(v.r2, 100)]; });
    return { own: 1, built: Date.now(), from: rows.length ? rows[0][0] * 60000 : null, to: rows.length ? rows[rows.length - 1][0] * 60000 : null, coins: cs, rows, m10: [] }; };
  // one stretch of settled trades (a day at most) with each one's minute prices and the coin's price at those minutes, for the
  // path export: [seconds, yes bid, yes ask, last] from the minute scan, and the Coinbase price from the saved second path
  const pathsOf = async (from, to) => { await load(); to = Math.min(to, from + 86400000); const out = [];
    for (const r of rec.values()) { if (r.late || !(r.close >= from && r.close < to) || !r.path?.length || !(r.result === 'yes' || r.result === 'no')) continue;
      const cp = await pathOf(r.ticker); let k = 0; const lead = r.path.map(p => { if (!cp) return null; while (k + 1 < cp.length && cp[k + 1][0] <= p[0]) k++; return cp[k][0] <= p[0] ? cp[k][1] : null; });
      out.push({ tk: r.ticker, coin: coin(r.series), side: r.side, at: r.at, close: r.close, ask: r.ask, px: r.avgN ?? r.ask, strike: r.strike ?? null, won: r.result === r.side ? 1 : 0, path: r.path, lead }); }
    return out.sort((a, b) => a.close - b.close); };
  const tradeAt = async (close, coin) => { await load(); if (!tradesMem) kalshiView(); return (tradesMem || []).find(t => t.close === close && t.coin === coin && !t.late) || null; };
  const labRows = async id => { await load(); if (!labRowsMem) kalshiView(); return labRowsMem?.[id] ?? null; };
  return { buyQuote: (tk, side, bk) => bk === 'paper' ? paperBuyQuote(tk, side) : buyQuote(tk, side), sellQuote: (tk, bk) => bk === 'paper' ? paperSellQuote(tk) : sellQuote(tk), pathOf, pathsOf, btRows, paid: PAID, tradeAt, labRows, events, scanQuick, liveJson, liveAll, tick, alarm, entry, command, importRows, publish, load, status, checkKeys, resetKey, coins: COINS, _t: { fund, ctl, volCalc, trendFill, settleSome, settleH, secondLook, l2: () => l2log, onSettle, cashLive, missCheck, pathFill, gapWatch, gapFill, gaps: () => gaps, compact, saveRec, saveRec3, dropT, sql, books, keepFill, trendCheck, minute10, settle3, rec3: () => rec3, volRepair, secondLook, settle2, rec2: () => rec2, kalshiView, kliveBody, liveView, rec: () => rec, L: () => L, st, nextMark, onRule, sign, logs } };
}
