// Kalshi 15-minute crypto: every market's prices for each of its last five minutes, from Kalshi's public 1-minute candles.
// For testing buys late in the window (the leader at 90 to 94c with 5 minutes or less left). Public market data only, no keys.
// Usage: node late5.mjs COIN DAYS   (prints one ROW line per market as it is read, so a stopped run keeps what it has)
// Each ROW: t ticker, c close (ms), k strike, r result, m = [left, yes ask close, yes bid close, yes ask low, yes bid high] for
// the minutes ending 5, 4, 3, 2 and 1 minutes before the close.
const B = 'https://api.elections.kalshi.com/trade-api/v2', [COIN, DAYS = '123'] = process.argv.slice(2), S = `KX${COIN}15M`;
const END = Math.floor(Date.now() / 1000), START = END - +DAYS * 86400, sleep = ms => new Promise(r => setTimeout(r, ms));
async function j(u) { for (let i = 0; i < 6; i++) { try { const r = await fetch(B + u); if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue; } if (!r.ok) return { _err: r.status }; return await r.json(); } catch { await sleep(800 * (i + 1)); } } return { _err: 'gave up' }; }
const px = (o, k) => { if (!o) return null; const d = o[k + '_dollars']; if (d != null) return +d; return o[k] != null ? o[k] / 100 : null; };
const ts = m => Math.floor(new Date(m.close_time).getTime() / 1000);
const all = []; for (const path of ['/markets?status=settled&', '/historical/markets?']) { let cur = ''; for (let k = 0; k < 400; k++) { const r = await j(`${path}series_ticker=${S}&min_close_ts=${START}&max_close_ts=${END}&limit=1000${cur ? '&cursor=' + cur : ''}`); if (r._err) break; all.push(...(r.markets || [])); cur = r.cursor; if (!cur || !(r.markets || []).length) break; } }
const byT = {}; for (const m of all) byT[m.ticker] = byT[m.ticker] || m;
const ms = Object.values(byT).filter(m => (m.result === 'yes' || m.result === 'no') && ts(m) >= START && ts(m) <= END).sort((a, b) => ts(b) - ts(a));
console.log(S, ms.length, 'markets');
let i = 0, n = 0; await Promise.all(Array.from({ length: 6 }, async () => { while (i < ms.length) { const m = ms[i++], c = ts(m);
  let r = await j(`/series/${S}/markets/${m.ticker}/candlesticks?start_ts=${c - 420}&end_ts=${c}&period_interval=1`); if (r._err) r = await j(`/historical/markets/${m.ticker}/candlesticks?start_ts=${c - 420}&end_ts=${c}&period_interval=1`);
  const ks = r.candlesticks || [], out = [];
  for (const left of [5, 4, 3, 2, 1]) { const e = c - left * 60, k = ks.filter(x => x.end_period_ts <= e).pop(); if (!k) continue;
    const v = [px(k.yes_ask, 'close'), px(k.yes_bid, 'close'), px(k.yes_ask, 'low'), px(k.yes_bid, 'high')]; if (v[0] == null || v[1] == null) continue; out.push([left, ...v.map(x => x == null ? null : +x.toFixed(4))]); }
  if (!out.length) continue; n++; console.log('ROW ' + JSON.stringify({ t: m.ticker, c: c * 1000, k: m.floor_strike ?? m.cap_strike ?? null, r: m.result, m: out })); } }));
console.log(`RESULT ${S} markets=${ms.length} rows=${n}`);
