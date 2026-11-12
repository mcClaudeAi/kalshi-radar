// Kalshi hourly crypto strikes: every strike's price 10 minutes before the hour closes, from Kalshi's public 1-minute candles.
// Tests whether the 15-minute rule (buy the leader at 90c and up) also pays on the hourly markets. Public market data only, no keys.
// Usage: node hourly.mjs find                 lists the crypto series and a sample event, to see what is there
//        node hourly.mjs SERIES DAYS [LEFT]   prints one ROW line per strike in play, LEFT minutes before the close (default 10)
const B = 'https://api.elections.kalshi.com/trade-api/v2', [S, DAYS = '45', LEFT = '10'] = process.argv.slice(2);
const END = Math.floor(Date.now() / 1000), START = END - +DAYS * 86400, sleep = ms => new Promise(r => setTimeout(r, ms));
async function j(u) { for (let i = 0; i < 6; i++) { try { const r = await fetch(B + u); if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue; } if (!r.ok) return { _err: r.status }; return await r.json(); } catch { await sleep(800 * (i + 1)); } } return { _err: 'gave up' }; }
const px = (o, k) => { if (!o) return null; const d = o[k + '_dollars']; if (d != null) return +d; return o[k] != null ? o[k] / 100 : null; };
const ts = m => Math.floor(new Date(m.close_time).getTime() / 1000);
if (S === 'find') {
  const r = await j('/series?category=Crypto'); const ss = (r.series || []).filter(s => /BTC|ETH|SOL|XRP|DOGE|BNB|HYPE|bitcoin|ethereum/i.test(s.ticker + ' ' + s.title));
  for (const s of ss) console.log('SERIES ' + JSON.stringify({ t: s.ticker, title: s.title, freq: s.frequency }));
  for (const t of ['KXBTCD', 'KXBTC', 'KXETHD', 'KXETH', 'KXSOLD', 'KXXRPD', 'KXDOGED']) {
    const m = await j(`/markets?series_ticker=${t}&status=settled&limit=200`); const ms = m.markets || []; if (!ms.length) { console.log('NONE ' + t, m._err || ''); continue; }
    const ev = {}; for (const x of ms) (ev[x.event_ticker] ||= []).push(x);
    console.log('SAMPLE ' + t, 'events in page', Object.keys(ev).length, Object.entries(ev).slice(0, 6).map(([e, a]) => `${e}:${a.length}@${a[0].close_time}`).join(' '));
    const a = Object.values(ev)[0].sort((p, q) => (p.floor_strike ?? 0) - (q.floor_strike ?? 0)); for (const x of a.slice(0, 4).concat(a.slice(-2))) console.log('  MKT ' + JSON.stringify({ tk: x.ticker, title: x.title, sub: x.yes_sub_title, type: x.strike_type, floor: x.floor_strike, cap: x.cap_strike, open: x.open_time, close: x.close_time, result: x.result, exp: x.expiration_value, vol: x.volume ?? x.volume_fp }));
  }
  process.exit(0);
}
const all = []; const pull = async (path, max) => { let cur = ''; for (let k = 0; k < max; k++) { const r = await j(`${path}series_ticker=${S}&min_close_ts=${START}&max_close_ts=${END}&limit=1000${cur ? '&cursor=' + cur : ''}`); if (r._err) break; const page = r.markets || []; all.push(...page); cur = r.cursor; if (!cur || !page.length) break; if (max < 3000 && page.every(m => ts(m) < START - 7 * 86400)) break; } };
await pull('/markets?status=settled&', 3000);
// the archive list ignores the date filter and is very long, so it is only walked when the live list stops short of the window
const oldest = all.reduce((a, m) => Math.min(a, ts(m)), END); console.log(S, 'live list', all.length, 'oldest', new Date(oldest * 1000).toISOString());
if (oldest > START + 2 * 86400) await pull('/historical/markets?', 600);
const byT = {}; for (const m of all) byT[m.ticker] = byT[m.ticker] || m;
const ms = Object.values(byT).filter(m => (m.result === 'yes' || m.result === 'no') && ts(m) >= START && ts(m) <= END);
// one event = one closing hour. Only strikes near where the hour settled can have been priced 85 to 99c ten minutes out,
// so candles are read for the strikes within 1.5% of the settled value and the rest are skipped.
const ev = {}; for (const m of ms) (ev[m.event_ticker] ||= []).push(m);
const jobs = []; for (const [e, a] of Object.entries(ev)) { const fin = +a.find(m => m.expiration_value != null && isFinite(+m.expiration_value))?.expiration_value; if (!(fin > 0)) continue;
  for (const m of a) { if (m.strike_type === 'between' || m.strike_type === 'less') continue; const k = m.floor_strike ?? +(m.ticker.match(/-T([\d.]+)$/)?.[1]); if (!(k > 0) || Math.abs(k - fin) / fin > 0.015) continue; jobs.push({ m, fin, k }); } }
console.log(S, ms.length, 'markets', Object.keys(ev).length, 'events', jobs.length, 'strikes in play');
let i = 0, n = 0; await Promise.all(Array.from({ length: 6 }, async () => { while (i < jobs.length) { const { m, fin, k: K } = jobs[i++], c = ts(m) - +LEFT * 60;
  let r = await j(`/series/${S}/markets/${m.ticker}/candlesticks?start_ts=${c - 180}&end_ts=${c + 60}&period_interval=1`); if (r._err) r = await j(`/historical/markets/${m.ticker}/candlesticks?start_ts=${c - 180}&end_ts=${c + 60}&period_interval=1`);
  const k = (r.candlesticks || []).filter(x => x.end_period_ts <= c).pop(); if (!k) continue;
  const ya = px(k.yes_ask, 'close'), yb = px(k.yes_bid, 'close'); if (ya == null || yb == null) continue;
  n++; console.log('ROW ' + JSON.stringify({ tk: m.ticker, ev: m.event_ticker, at: k.end_period_ts, close: ts(m), open: Math.floor(new Date(m.open_time).getTime() / 1000), ya, yb, res: m.result, type: m.strike_type, k: K, fin, vol: k.volume ?? k.volume_fp ?? null, oi: k.open_interest ?? k.open_interest_fp ?? null })); } }));
console.log(`RESULT ${S} markets=${ms.length} rows=${n}`);
