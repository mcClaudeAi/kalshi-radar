// Kalshi 15-minute crypto: the two chart readings for every trade in backtest.json, so the Backtest page can run the playbooks
// that read the coin's chart (chart checked, Claude's pick). Public market data only, no keys.
// Usage: node ccfill.mjs COIN   (reads backtest.json at the repo root; prints one CC line per trade)
// CC: [trade check minute, coin index, depth x100, straightness x100]
//   depth        = the furthest the coin sat on the wrong side of its target in the 31 minutes up to the trade check, in usual
//                  10-minute moves (the last hour's 1-minute spread x sqrt 10); negative is the wrong side
//   straightness = R squared of a straight line through the last 15 minute closes (1 is a dead-straight run)
import { readFileSync } from 'node:fs';
const B = 'https://api.elections.kalshi.com/trade-api/v2', CB = 'https://api.exchange.coinbase.com', COIN = process.argv[2], S = `KX${COIN}15M`, PID = `${COIN}-USD`, sleep = ms => new Promise(r => setTimeout(r, ms));
const BT = JSON.parse(readFileSync(new URL('../backtest.json', import.meta.url), 'utf8')), ci = BT.coins.indexOf(COIN), rows = BT.rows.filter(r => r[1] === ci);
if (ci < 0 || !rows.length) { console.log('no rows for', COIN); process.exit(0); }
const START = rows[0][0] * 60 - 7200, END = rows.at(-1)[0] * 60 + 1200;
async function j(u, base = B) { for (let i = 0; i < 6; i++) { try { const r = await fetch(base + u, { headers: { accept: 'application/json', 'user-agent': 'kalshi-radar-research' } }); if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue; } if (!r.ok) return { _err: r.status }; return await r.json(); } catch { await sleep(800 * (i + 1)); } } return { _err: 'gave up' }; }
const ts = m => Math.floor(new Date(m.close_time).getTime() / 1000);
// Coinbase 1-minute closes for the whole stretch, 300 a request
const C = new Map(); { let bad = 0; for (let e = END; e > START; e -= 300 * 60) { const s = e - 299 * 60, r = await j(`/products/${PID}/candles?granularity=60&start=${new Date(s * 1000).toISOString()}&end=${new Date(e * 1000).toISOString()}`, CB);
    if (Array.isArray(r)) for (const k of r) { if (+k[4] > 0) C.set(+k[0], +k[4]); } else bad++; await sleep(130); } console.log(S, 'coinbase minutes', C.size, 'failed requests', bad); }
// every settled market in the stretch: the target and how it ended, by close time
const M = new Map(); for (const path of ['/markets?status=settled&', '/historical/markets?']) { let cur = ''; for (let k = 0; k < 400; k++) { const r = await j(`${path}series_ticker=${S}&min_close_ts=${START}&max_close_ts=${END}&limit=1000${cur ? '&cursor=' + cur : ''}`);
    for (const m of r.markets || []) if ((m.result === 'yes' || m.result === 'no') && !M.has(ts(m))) M.set(ts(m), m); cur = r.cursor; if (!cur || !(r.markets || []).length) break; await sleep(150); } }
console.log(S, M.size, 'markets', rows.length, 'trades');
let n = 0, noM = 0, noCb = 0;
for (const r of rows) { const mark = r[0] * 60, m = M.get(mark + 600), k = m && (m.floor_strike ?? m.cap_strike ?? null); if (!(k > 0)) { noM++; continue; }
  const yes = (m.result === 'yes') === !!r[3];   // the trade was on the leader: it won when the leader's side is how the market ended
  const cl = []; for (let t = mark - 61 * 60; t <= mark - 60; t += 60) { const v = C.get(t); if (v != null) cl.push([t + 60, v]); } if (cl.length < 40 || mark - cl.at(-1)[0] > 180) { noCb++; continue; }
  const rets = []; for (let q = 1; q < cl.length; q++) rets.push(Math.log(cl[q][1] / cl[q - 1][1])); const mu = rets.reduce((a, b) => a + b, 0) / rets.length, sg = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / rets.length);
  if (!(sg > 0)) { noCb++; continue; } const u = sg * Math.sqrt(10), P = cl.slice(-31).map(q => (yes ? q[1] - k : k - q[1]) / k / u); if (P.length < 25) { noCb++; continue; }
  const ys = P.slice(-15), N = ys.length, mx = (N - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / N; let sxx = 0, sxy = 0, syy = 0; ys.forEach((y, i) => { sxx += (i - mx) ** 2; sxy += (i - mx) * (y - my); syy += (y - my) ** 2; });
  n++; console.log('CC ' + JSON.stringify([r[0], ci, Math.round(Math.min(...P) * 100), Math.round((syy > 0 ? sxy * sxy / (sxx * syy) : 0) * 100), Math.round(P.at(-1) * 100)])); }
console.log(`RESULT ${S} trades=${rows.length} filled=${n} noMarket=${noM} noCoinbase=${noCb}`);
