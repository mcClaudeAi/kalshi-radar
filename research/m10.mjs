// Kalshi 15-minute crypto: every market's leading side at minute 10 (5 minutes left), from Kalshi's public 1-minute candles.
// Feeds the Wait for the trend and cash-out rows of the Backtest page. Public market data only, no keys.
// Usage: node m10.mjs COIN DAYS   (prints one ROW line per market as it is read, so a stopped run keeps what it has)
const B = 'https://api.elections.kalshi.com/trade-api/v2', [COIN, DAYS = '123'] = process.argv.slice(2), S = `KX${COIN}15M`;
const END = Math.floor(Date.now() / 1000), START = END - +DAYS * 86400, sleep = ms => new Promise(r => setTimeout(r, ms));
async function j(u) { for (let i = 0; i < 6; i++) { try { const r = await fetch(B + u); if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue; } if (!r.ok) return { _err: r.status }; return await r.json(); } catch { await sleep(800 * (i + 1)); } } return { _err: 'gave up' }; }
const px = (o, k) => { if (!o) return null; const d = o[k + '_dollars']; if (d != null) return +d; return o[k] != null ? o[k] / 100 : null; };
const ts = m => Math.floor(new Date(m.close_time).getTime() / 1000);
const all = []; for (const path of ['/markets?status=settled&', '/historical/markets?']) { let cur = ''; for (let k = 0; k < 400; k++) { const r = await j(`${path}series_ticker=${S}&min_close_ts=${START}&max_close_ts=${END}&limit=1000${cur ? '&cursor=' + cur : ''}`); if (r._err) break; all.push(...(r.markets || [])); cur = r.cursor; if (!cur || !(r.markets || []).length) break; } }
const byT = {}; for (const m of all) byT[m.ticker] = byT[m.ticker] || m;
// the historical list ignores the date filter, so the window is applied here
const ms = Object.values(byT).filter(m => (m.result === 'yes' || m.result === 'no') && ts(m) >= START && ts(m) <= END).sort((a, b) => ts(b) - ts(a));
console.log(S, ms.length, 'markets');
let i = 0, n = 0; await Promise.all(Array.from({ length: 6 }, async () => { while (i < ms.length) { const m = ms[i++], c = ts(m) - 300;
  let r = await j(`/series/${S}/markets/${m.ticker}/candlesticks?start_ts=${c - 180}&end_ts=${c + 60}&period_interval=1`); if (r._err) r = await j(`/historical/markets/${m.ticker}/candlesticks?start_ts=${c - 180}&end_ts=${c + 60}&period_interval=1`);
  const k = (r.candlesticks || []).filter(x => x.end_period_ts <= c).pop(); if (!k) continue;
  const ya = px(k.yes_ask, 'close'), yb = px(k.yes_bid, 'close'); if (ya == null || yb == null) continue; const na = +(1 - yb).toFixed(4);
  const side = ya >= na ? 'yes' : 'no', ask = side === 'yes' ? ya : na; if (!(ask > 0 && ask < 1)) continue;
  n++; console.log('ROW ' + JSON.stringify({ ticker: m.ticker, at: k.end_period_ts * 1000, close: ts(m) * 1000, side, ask, ya, yb, result: m.result, won: m.result === side, strike: m.floor_strike ?? m.cap_strike ?? null })); } }));
console.log(`RESULT ${S} markets=${ms.length} rows=${n}`);
