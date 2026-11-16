// Kalshi 15-minute crypto: every market's leader at the trade check (10 minutes before the close) with three readings worked out
// from Coinbase's 1-minute prices at that moment, for testing playbooks that read the coin's chart. Public market data only, no keys.
// Usage: node mvai.mjs COIN DAYS   (prints one ROW line per market, so a stopped run keeps what it has)
// ROW: [close minute, 1 if the leader is YES, leader ask in tenths of a cent, 1 if it won, z x100, trend x1e6, likely x1e6, strike,
//       lead now x1e6, lead 20 minutes ago x1e6, lead 3 minutes ago x1e6, the lead at each of the last 31 minute closes x1e6]
//   z      = the lead over the target divided by one usual 10-minute move (the last hour's 1-minute spread x sqrt 10)
//   trend  = where a straight line through the last 20 minutes lands at the close, as the lead past the target on the leader's side
//   likely = the same for the last 3 minutes' pace fading with a 90-second half-life
const B = 'https://api.elections.kalshi.com/trade-api/v2', CB = 'https://api.exchange.coinbase.com', [COIN, DAYS = '123'] = process.argv.slice(2), S = `KX${COIN}15M`, PID = `${COIN}-USD`;
const END = Math.floor(Date.now() / 1000), START = END - +DAYS * 86400, sleep = ms => new Promise(r => setTimeout(r, ms));
async function j(u, base = B) { for (let i = 0; i < 6; i++) { try { const r = await fetch(base + u, { headers: { accept: 'application/json', 'user-agent': 'kalshi-radar-research' } }); if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue; } if (!r.ok) return { _err: r.status }; return await r.json(); } catch { await sleep(800 * (i + 1)); } } return { _err: 'gave up' }; }
const px = (o, k) => { if (!o) return null; const d = o[k + '_dollars']; if (d != null) return +d; return o[k] != null ? o[k] / 100 : null; };
const ts = m => Math.floor(new Date(m.close_time).getTime() / 1000);
// Coinbase 1-minute closes for the whole stretch, 300 a request
const C = new Map(); { let bad = 0; for (let e = END; e > START - 7200; e -= 300 * 60) { const s = e - 299 * 60, r = await j(`/products/${PID}/candles?granularity=60&start=${new Date(s * 1000).toISOString()}&end=${new Date(e * 1000).toISOString()}`, CB);
    if (Array.isArray(r)) for (const k of r) { if (+k[4] > 0) C.set(+k[0], +k[4]); } else bad++; await sleep(130); } console.log(S, 'coinbase minutes', C.size, 'failed requests', bad); }
const all = []; for (const path of ['/markets?status=settled&', '/historical/markets?']) { let cur = ''; for (let k = 0; k < 400; k++) { const r = await j(`${path}series_ticker=${S}&min_close_ts=${START}&max_close_ts=${END}&limit=1000${cur ? '&cursor=' + cur : ''}`); if (r._err) break; all.push(...(r.markets || [])); cur = r.cursor; if (!cur || !(r.markets || []).length) break; } }
const byT = {}; for (const m of all) byT[m.ticker] = byT[m.ticker] || m;
const ms = Object.values(byT).filter(m => (m.result === 'yes' || m.result === 'no') && ts(m) >= START && ts(m) <= END).sort((a, b) => ts(b) - ts(a));
console.log(S, ms.length, 'markets');
const fit = A => { const n = A.length, mx = A.reduce((a, q) => a + q[0], 0) / n, my = A.reduce((a, q) => a + q[1], 0) / n; let sxy = 0, sxx = 0; for (const q of A) { sxy += (q[0] - mx) * (q[1] - my); sxx += (q[0] - mx) ** 2; } return sxx > 0 ? { b: sxy / sxx, at: t => my + sxy / sxx * (t - mx) } : null; };
let i = 0, n = 0, noCb = 0; await Promise.all(Array.from({ length: 6 }, async () => { while (i < ms.length) { const m = ms[i++], c = ts(m), mark = c - 600, k = m.floor_strike ?? m.cap_strike ?? null; if (!(k > 0)) continue;
  let r = await j(`/series/${S}/markets/${m.ticker}/candlesticks?start_ts=${mark - 240}&end_ts=${mark}&period_interval=1`); if (r._err) r = await j(`/historical/markets/${m.ticker}/candlesticks?start_ts=${mark - 240}&end_ts=${mark}&period_interval=1`);
  const kc = (r.candlesticks || []).filter(x => x.end_period_ts <= mark).pop(); if (!kc) continue; const ya = px(kc.yes_ask, 'close'), yb = px(kc.yes_bid, 'close'); if (ya == null || yb == null) continue;
  const na = +(1 - yb).toFixed(4), yes = ya >= na, ask = yes ? ya : na; if (!(ask >= 0.85 && ask < 1)) continue;
  // minute closes up to the mark: the candle that starts at t closes at t + 60
  const rows = []; for (let t = mark - 61 * 60; t <= mark - 60; t += 60) { const v = C.get(t); if (v != null) rows.push([t + 60, v]); } if (rows.length < 40 || mark - rows.at(-1)[0] > 180) { noCb++; continue; }
  const rets = []; for (let q = 1; q < rows.length; q++) rets.push(Math.log(rows[q][1] / rows[q - 1][1])); const mu = rets.reduce((a, b) => a + b, 0) / rets.length, sg = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / rets.length);
  const p = rows.at(-1)[1], lead = v => (yes ? v - k : k - v) / k, z = sg > 0 ? lead(p) / (sg * Math.sqrt(10)) : null, T = rows.slice(-20), end = T.at(-1)[0] + 600, L = fit(T), S3 = fit(T.slice(-4));
  if (z == null || !L || !S3) continue; n++;
  console.log('ROW ' + JSON.stringify([Math.round(c / 60), yes ? 1 : 0, Math.round(ask * 1000), (m.result === 'yes') === yes ? 1 : 0, Math.round(z * 100), Math.round(lead(L.at(end)) * 1e6), Math.round(lead(p + S3.b * 130 * (1 - Math.exp(-600 / 130))) * 1e6), k, Math.round(lead(p) * 1e6), Math.round(lead(T[0][1]) * 1e6), Math.round(lead(T[T.length - 4][1]) * 1e6), rows.slice(-31).map(q => Math.round(lead(q[1]) * 1e6))])); } }));
console.log(`RESULT ${S} markets=${ms.length} rows=${n} noCoinbase=${noCb}`);
