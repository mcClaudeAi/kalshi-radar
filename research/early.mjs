// Kalshi 15-minute crypto: the leader and Claude's pick's three readings at each of the first five minutes of every market
// (minute 5 is the trade check), to test buying as soon as the playbook would, not only at the trade check.
// Public market data only, no keys. Usage: node early.mjs COIN DAYS
// ER: [close minute, 1 if YES won, [for minutes 1..5: 0 if no usable quote, else [1 if the leader is YES, ask in tenths of a cent,
//      cushion x100, worst dip x100, straightness x100]]]   (same formulas as the tracker's volCalc)
const B = 'https://api.elections.kalshi.com/trade-api/v2', CB = 'https://api.exchange.coinbase.com', [COIN, DAYS = '123', FLOOR = '0.85'] = process.argv.slice(2), S = `KX${COIN}15M`, PID = `${COIN}-USD`;
const END = Math.floor(Date.now() / 1000), START = END - +DAYS * 86400, sleep = ms => new Promise(r => setTimeout(r, ms));
async function j(u, base = B) { for (let i = 0; i < 6; i++) { try { const r = await fetch(base + u, { headers: { accept: 'application/json', 'user-agent': 'kalshi-radar-research' } }); if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue; } if (!r.ok) return { _err: r.status }; return await r.json(); } catch { await sleep(800 * (i + 1)); } } return { _err: 'gave up' }; }
// older markets come back from the historical endpoint priced in dollars under the plain key (0.93), newer ones in cents (93)
const px = (o, k) => { if (!o) return null; const d = o[k + '_dollars']; if (d != null) return +d; const v = o[k]; return v == null ? null : (String(v).includes('.') || +v <= 1) ? +v : +v / 100; };
const ts = m => Math.floor(new Date(m.close_time).getTime() / 1000);
// Coinbase 1-minute closes for the whole stretch, 300 a request
const C = new Map(); { let bad = 0; for (let e = END; e > START - 7200; e -= 300 * 60) { const s = e - 299 * 60, r = await j(`/products/${PID}/candles?granularity=60&start=${new Date(s * 1000).toISOString()}&end=${new Date(e * 1000).toISOString()}`, CB);
    if (Array.isArray(r)) for (const k of r) { if (+k[4] > 0) C.set(+k[0], +k[4]); } else bad++; await sleep(130); } console.log(S, 'coinbase minutes', C.size, 'failed requests', bad); }
const all = []; for (const path of ['/markets?status=settled&', '/historical/markets?']) { let cur = ''; for (let k = 0; k < 400; k++) { const r = await j(`${path}series_ticker=${S}&min_close_ts=${START}&max_close_ts=${END}&limit=1000${cur ? '&cursor=' + cur : ''}`); if (r._err) break; all.push(...(r.markets || [])); cur = r.cursor; if (!cur || !(r.markets || []).length) break; } }
const byT = {}; for (const m of all) byT[m.ticker] = byT[m.ticker] || m;
const ms = Object.values(byT).filter(m => (m.result === 'yes' || m.result === 'no') && ts(m) >= START && ts(m) <= END).sort((a, b) => ts(b) - ts(a));
console.log(S, ms.length, 'markets');
let i = 0, n = 0; await Promise.all(Array.from({ length: 6 }, async () => { while (i < ms.length) { const m = ms[i++], c = ts(m), open = c - 900, mark = c - 600, k = m.floor_strike ?? m.cap_strike ?? null; if (!(k > 0)) continue;
  let r = await j(`/series/${S}/markets/${m.ticker}/candlesticks?start_ts=${open - 60}&end_ts=${mark}&period_interval=1`); if (r._err) r = await j(`/historical/markets/${m.ticker}/candlesticks?start_ts=${open - 60}&end_ts=${mark}&period_interval=1`);
  const K = r.candlesticks || [], mins = []; let any = false;
  for (let q = 1; q <= 5; q++) { const t = open + q * 60, kc = K.filter(x => x.end_period_ts <= t && x.end_period_ts > t - 120).pop(), ya = kc && px(kc.yes_ask, 'close'), yb = kc && px(kc.yes_bid, 'close'); if (ya == null || yb == null) { mins.push(0); continue; }
    const na = +(1 - yb).toFixed(4), yes = ya >= na, ask = yes ? ya : na; if (!(ask >= 0.8 && ask < 1)) { mins.push(0); continue; }
    const rows = []; for (let u = t - 61 * 60; u <= t - 60; u += 60) { const v = C.get(u); if (v != null) rows.push(v); } if (rows.length < 40) { mins.push(0); continue; }
    const rets = []; for (let a = 1; a < rows.length; a++) rets.push(Math.log(rows[a] / rows[a - 1])); const mu = rets.reduce((a, b) => a + b, 0) / rets.length, sg = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / rets.length), u10 = sg * Math.sqrt(10); if (!(u10 > 0)) { mins.push(0); continue; }
    const P = rows.slice(-31).map(v => (yes ? v - k : k - v) / k / u10), z = P.at(-1), dp = Math.min(0, ...P), Y = P.slice(-15), nn = Y.length, mx = (nn - 1) / 2, my = Y.reduce((a, b) => a + b, 0) / nn; let sxy = 0, sxx = 0, syy = 0; Y.forEach((y, a) => { sxy += (a - mx) * (y - my); sxx += (a - mx) ** 2; syy += (y - my) ** 2; });
    mins.push([yes ? 1 : 0, Math.round(ask * 1000), Math.round(z * 100), Math.round(dp * 100), Math.round((syy > 0 ? sxy * sxy / (sxx * syy) : 0) * 100)]); if (ask >= 0.85) any = true; }
  if (!any) continue; n++; console.log('ER ' + JSON.stringify([Math.round(c / 60), m.result === 'yes' ? 1 : 0, mins])); } }));
console.log(`RESULT ${S} markets=${ms.length} rows=${n}`);
