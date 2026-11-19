// Kalshi 15-minute crypto: the whole price path and both sides' prices for every market, to test buying a reversal (the coin breaks
// its trend and crosses back over the target, the new side still cheap). Public market data only, no keys.
// Usage: node rev.mjs COIN DAYS
// RV: [close minute, 1 if YES won, target, 10-minute move size as a share of price x1e6,
//      Coinbase closes from 30 minutes before the open to the close as offsets from the target in 1e-5 of the target (46 values, null if missing),
//      YES ask by minute 1..14 after the open in tenths of a cent (0 if no quote), YES bid the same, ticker]
const B = 'https://api.elections.kalshi.com/trade-api/v2', CB = 'https://api.exchange.coinbase.com', [COIN, DAYS = '90'] = process.argv.slice(2), S = `KX${COIN}15M`, PID = `${COIN}-USD`;
const END = Math.floor(Date.now() / 1000), START = END - +DAYS * 86400, sleep = ms => new Promise(r => setTimeout(r, ms));
async function j(u, base = B) { for (let i = 0; i < 6; i++) { try { const r = await fetch(base + u, { headers: { accept: 'application/json', 'user-agent': 'kalshi-radar-research' } }); if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue; } if (!r.ok) return { _err: r.status }; return await r.json(); } catch { await sleep(800 * (i + 1)); } } return { _err: 'gave up' }; }
const px = (o, k) => { if (!o) return null; const d = o[k + '_dollars']; if (d != null) return +d; const v = o[k]; return v == null ? null : (String(v).includes('.') || +v <= 1) ? +v : +v / 100; };
const ts = m => Math.floor(new Date(m.close_time).getTime() / 1000);
const C = new Map(); { let bad = 0; for (let e = END; e > START - 7200; e -= 300 * 60) { const s = e - 299 * 60, r = await j(`/products/${PID}/candles?granularity=60&start=${new Date(s * 1000).toISOString()}&end=${new Date(e * 1000).toISOString()}`, CB);
    if (Array.isArray(r)) for (const k of r) { if (+k[4] > 0) C.set(+k[0], +k[4]); } else bad++; await sleep(130); } console.log(S, 'coinbase minutes', C.size, 'failed requests', bad); }
const all = []; for (const path of ['/markets?status=settled&', '/historical/markets?']) { let cur = ''; for (let k = 0; k < 400; k++) { const r = await j(`${path}series_ticker=${S}&min_close_ts=${START}&max_close_ts=${END}&limit=1000${cur ? '&cursor=' + cur : ''}`); if (r._err) break; all.push(...(r.markets || [])); cur = r.cursor; if (!cur || !(r.markets || []).length) break; } }
const byT = {}; for (const m of all) byT[m.ticker] = byT[m.ticker] || m;
const ms = Object.values(byT).filter(m => (m.result === 'yes' || m.result === 'no') && ts(m) >= START && ts(m) <= END).sort((a, b) => ts(b) - ts(a));
console.log(S, ms.length, 'markets');
let i = 0, n = 0; await Promise.all(Array.from({ length: 6 }, async () => { while (i < ms.length) { const m = ms[i++], c = ts(m), open = c - 900, k = m.floor_strike ?? m.cap_strike ?? null; if (!(k > 0)) continue;
  // closes are stamped at the candle's start, so the close at minute u is the candle that starts at u - 60
  const path = []; for (let u = open - 30 * 60; u <= c; u += 60) { const v = C.get(u - 60); path.push(v == null ? null : Math.round((v - k) / k * 1e5)); }
  const pre = []; for (let u = open - 61 * 60; u <= open - 60; u += 60) { const v = C.get(u); if (v != null) pre.push(v); } if (pre.length < 40) continue;
  const rets = []; for (let a = 1; a < pre.length; a++) rets.push(Math.log(pre[a] / pre[a - 1])); const mu = rets.reduce((a, b) => a + b, 0) / rets.length, sg = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / rets.length), u10 = sg * Math.sqrt(10); if (!(u10 > 0)) continue;
  let r = await j(`/series/${S}/markets/${m.ticker}/candlesticks?start_ts=${open - 60}&end_ts=${c}&period_interval=1`); if (r._err) r = await j(`/historical/markets/${m.ticker}/candlesticks?start_ts=${open - 60}&end_ts=${c}&period_interval=1`);
  const K = r.candlesticks || [], ya = [], yb = [];
  for (let q = 1; q <= 14; q++) { const t = open + q * 60, kc = K.filter(x => x.end_period_ts <= t && x.end_period_ts > t - 120).pop(), a = kc && px(kc.yes_ask, 'close'), b = kc && px(kc.yes_bid, 'close'); ya.push(a == null ? 0 : Math.round(a * 1000)); yb.push(b == null ? 0 : Math.round(b * 1000)); }
  n++; console.log('RV ' + JSON.stringify([Math.round(c / 60), m.result === 'yes' ? 1 : 0, k, Math.round(u10 * 1e6), path, ya, yb, m.ticker])); } }));
console.log(`RESULT ${S} markets=${ms.length} rows=${n}`);
