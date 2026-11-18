// Kalshi 15-minute crypto: what traded in the last 90 seconds of every settled market, for testing a "buy the leader in the
// last 30 seconds" rule. Public market data only, no keys.
// Usage: node lastsec.mjs COIN DAYS   (prints one LS line per market)
// LS: [close minute, coin, 1 if YES won, pre, trades]
//   pre    = the last trade before 30 seconds left: [seconds left, YES price in tenths of a cent], or null
//   trades = every trade from 90 seconds left to the close, oldest first: [seconds left, YES price in tenths of a cent,
//            contracts, 1 if the buyer of YES was the one who crossed the spread]   (200 at most, then totals only)
const B = 'https://api.elections.kalshi.com/trade-api/v2', COIN = process.argv[2], DAYS = Math.min(120, +process.argv[3] || 30), S = `KX${COIN}15M`, sleep = ms => new Promise(r => setTimeout(r, ms));
const END = Math.floor(Date.now() / 1000) - 1800, START = END - DAYS * 86400;
async function j(u) { for (let i = 0; i < 7; i++) { try { const r = await fetch(B + u, { headers: { accept: 'application/json', 'user-agent': 'kalshi-radar-research' } }); if (r.status === 429 || r.status >= 500) { await sleep(700 * (i + 1)); continue; } if (!r.ok) return { _err: r.status }; return await r.json(); } catch { await sleep(700 * (i + 1)); } } return { _err: 'gave up' }; }
const px = (o, k) => { if (!o) return null; const d = o[k + '_dollars']; if (d != null) return +d; const v = o[k]; return v == null ? null : (String(v).includes('.') || +v <= 1) ? +v : +v / 100; };
const M = []; { const seen = new Set(); for (const path of ['/markets?status=settled&', '/historical/markets?']) { let cur = ''; for (let k = 0; k < 400; k++) { const r = await j(`${path}series_ticker=${S}&min_close_ts=${START}&max_close_ts=${END}&limit=1000${cur ? '&cursor=' + cur : ''}`);
    for (const m of r.markets || []) if ((m.result === 'yes' || m.result === 'no') && !seen.has(m.ticker)) { seen.add(m.ticker); M.push(m); } cur = r.cursor; if (!cur || !(r.markets || []).length) break; await sleep(150); } } }
M.sort((a, b) => Date.parse(a.close_time) - Date.parse(b.close_time)); console.log(S, M.length, 'settled markets over', DAYS, 'days');
let i = 0, n = 0, none = 0, shown = 0;
await Promise.all(Array.from({ length: 4 }, async () => { while (i < M.length) { const m = M[i++], close = Math.floor(Date.parse(m.close_time) / 1000);
  let T = [], cur = '', path = '/markets/trades?';
  for (let pg = 0; pg < 6; pg++) { let r = await j(`${path}ticker=${m.ticker}&min_ts=${close - 240}&max_ts=${close + 5}&limit=1000${cur ? '&cursor=' + cur : ''}`);
    if (pg === 0 && (r._err || !(r.trades || []).length)) { path = '/historical/trades?'; r = await j(`${path}ticker=${m.ticker}&min_ts=${close - 240}&max_ts=${close + 5}&limit=1000`); }
    if (shown < 2 && (r.trades || []).length) { shown++; console.log('RAW', JSON.stringify(r.trades[0])); }
    T.push(...(r.trades || [])); cur = r.cursor; if (!cur || !(r.trades || []).length) break; }
  if (!T.length) { none++; continue; }
  const rows = T.map(t => { const at = Date.parse(t.created_time) / 1000, y = px(t, 'yes_price'), c = +(t.count_fp ?? t.count ?? 0); return [+(close - at).toFixed(1), y == null ? null : Math.round(y * 1000), Math.round(c), t.taker_side === 'yes' ? 1 : 0]; }).filter(r => r[1] != null && r[0] >= 0).sort((a, b) => b[0] - a[0]);
  const before = rows.filter(r => r[0] > 30), pre = before.length ? [before.at(-1)[0], before.at(-1)[1]] : null, last = rows.filter(r => r[0] <= 90);
  n++; console.log('LS ' + JSON.stringify([Math.round(close / 60), COIN, m.result === 'yes' ? 1 : 0, pre, last.slice(-200), last.length > 200 ? last.length : 0])); await sleep(60); } }));
console.log(`RESULT ${S} markets=${M.length} withTrades=${n} noTrades=${none}`);
