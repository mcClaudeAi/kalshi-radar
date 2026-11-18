// Kalshi 15-minute crypto: what each trade in backtest.json could have been sold for at every minute after the trade check, and
// how far the coin sat from its target at that minute, for testing rules that sell early. Public market data only, no keys.
// Usage: node exitpath.mjs COIN   (reads backtest.json at the repo root; prints one XP line per trade)
// XP: [trade check minute, coin index, 1 if the trade was on YES, bids, leads]
//   bids  = the best bid for the side held at 9, 8, ... 1 minutes left, in tenths of a cent (null where Kalshi has no candle)
//   leads = the coin's lead past its target on the side held at those same minutes, in usual 10-minute moves x100
import { readFileSync } from 'node:fs';
const B = 'https://api.elections.kalshi.com/trade-api/v2', CB = 'https://api.exchange.coinbase.com', COIN = process.argv[2], S = `KX${COIN}15M`, PID = `${COIN}-USD`, sleep = ms => new Promise(r => setTimeout(r, ms));
const BT = JSON.parse(readFileSync(new URL('../backtest.json', import.meta.url), 'utf8')), ci = BT.coins.indexOf(COIN), rows = BT.rows.filter(r => r[1] === ci);
if (ci < 0 || !rows.length) { console.log('no rows for', COIN); process.exit(0); }
const START = rows[0][0] * 60 - 7200, END = rows.at(-1)[0] * 60 + 1200;
async function j(u, base = B) { for (let i = 0; i < 6; i++) { try { const r = await fetch(base + u, { headers: { accept: 'application/json', 'user-agent': 'kalshi-radar-research' } }); if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue; } if (!r.ok) return { _err: r.status }; return await r.json(); } catch { await sleep(800 * (i + 1)); } } return { _err: 'gave up' }; }
// older markets come back from the historical endpoint priced in dollars under the plain key (0.93), newer ones in cents (93)
const px = (o, k) => { if (!o) return null; const d = o[k + '_dollars']; if (d != null) return +d; const v = o[k]; return v == null ? null : (String(v).includes('.') || +v <= 1) ? +v : +v / 100; };
const ts = m => Math.floor(new Date(m.close_time).getTime() / 1000);
const C = new Map(); { let bad = 0; for (let e = END; e > START; e -= 300 * 60) { const s = e - 299 * 60, r = await j(`/products/${PID}/candles?granularity=60&start=${new Date(s * 1000).toISOString()}&end=${new Date(e * 1000).toISOString()}`, CB);
    if (Array.isArray(r)) for (const k of r) { if (+k[4] > 0) C.set(+k[0], +k[4]); } else bad++; await sleep(130); } console.log(S, 'coinbase minutes', C.size, 'failed requests', bad); }
const M = new Map(); for (const path of ['/markets?status=settled&', '/historical/markets?']) { let cur = ''; for (let k = 0; k < 400; k++) { const r = await j(`${path}series_ticker=${S}&min_close_ts=${START}&max_close_ts=${END}&limit=1000${cur ? '&cursor=' + cur : ''}`);
    for (const m of r.markets || []) if ((m.result === 'yes' || m.result === 'no') && !M.has(ts(m))) M.set(ts(m), m); cur = r.cursor; if (!cur || !(r.markets || []).length) break; await sleep(150); } }
console.log(S, M.size, 'markets', rows.length, 'trades');
let i = 0, n = 0, noM = 0, noK = 0;
await Promise.all(Array.from({ length: 5 }, async () => { while (i < rows.length) { const r = rows[i++], mark = r[0] * 60, close = mark + 600, m = M.get(close), k = m && (m.floor_strike ?? m.cap_strike ?? null); if (!(k > 0)) { noM++; continue; }
  const yes = (m.result === 'yes') === !!r[3];
  let c = await j(`/series/${S}/markets/${m.ticker}/candlesticks?start_ts=${mark}&end_ts=${close}&period_interval=1`); if (c._err || !(c.candlesticks || []).length) c = await j(`/historical/markets/${m.ticker}/candlesticks?start_ts=${mark}&end_ts=${close}&period_interval=1`);
  const K = new Map(); for (const x of c.candlesticks || []) K.set(x.end_period_ts, x); if (!K.size) { noK++; continue; }
  // the usual 10-minute move, from the hour up to the trade check
  const cl = []; for (let t = mark - 61 * 60; t <= mark - 60; t += 60) { const v = C.get(t); if (v != null) cl.push(v); } let u = null; if (cl.length >= 40) { const rets = []; for (let q = 1; q < cl.length; q++) rets.push(Math.log(cl[q] / cl[q - 1])); const mu = rets.reduce((a, b) => a + b, 0) / rets.length, sg = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / rets.length); if (sg > 0) u = sg * Math.sqrt(10); }
  const bids = [], leads = []; for (let q = 1; q <= 9; q++) { const t = mark + q * 60, x = K.get(t), yb = x ? px(x.yes_bid, 'close') : null, ya = x ? px(x.yes_ask, 'close') : null, b = yes ? yb : (ya == null ? null : 1 - ya), v = C.get(t - 60);
    bids.push(b == null ? null : Math.round(b * 1000)); leads.push(v == null || u == null ? null : Math.round((yes ? v - k : k - v) / k / u * 100)); }
  n++; console.log('XP ' + JSON.stringify([r[0], ci, yes ? 1 : 0, bids, leads])); } }));
console.log(`RESULT ${S} trades=${rows.length} filled=${n} noMarket=${noM} noCandles=${noK}`);
