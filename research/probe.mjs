// one-off: how far back Coinbase Advanced Trade's public market trades answer for a start/end window, and how many come back
const now = Math.floor(Date.now() / 1000);
for (const pid of ['BTC-USD', 'NEAR-USD']) for (const ago of [600, 3 * 3600, 14 * 3600, 3 * 86400]) for (const lim of [1000, 5000]) {
  const s = now - ago, e = s + 120, u = `https://api.coinbase.com/api/v3/brokerage/market/products/${pid}/ticker?limit=${lim}&start=${s}&end=${e}`;
  try { const r = await fetch(u, { headers: { accept: 'application/json', 'user-agent': 'curve-radar' } }); const j = await r.json().catch(() => null); const t = j?.trades || [];
    const ts = t.map(x => Date.parse(x.time) / 1000); console.log('PROBE', pid, 'ago', ago, 'limit', lim, 'status', r.status, 'n', t.length, 'span', ts.length ? `${Math.min(...ts) - s}..${Math.max(...ts) - s}s` : '-', t.length ? '' : JSON.stringify(j).slice(0, 160));
  } catch (x) { console.log('PROBE', pid, ago, 'error', x.message); } }
