// Live books on Kalshi subaccounts.
//
// MC 2026-11-11 asked to run several live bankrolls side by side (four to start, no fixed number), each at up to $50 a trade, on
// subaccounts of one Kalshi account. Kalshi gives an account up to 63 numbered subaccounts, each with its own cash and positions,
// and lets an API key be locked to one of them: a locked key can trade only its subaccount and can't move money anywhere else.
//   - Adding a book uses the account's main key (the one the dashboard already has) to create the subaccount and generate a key
//     locked to it. Kalshi hands the private key over once; it goes straight into this worker's storage, encrypted, and is never
//     sent to the page. Linking an existing subaccount with a locked key pasted on the dashboard is the fallback.
//   - Money goes in and out with the main key (subaccount transfers stay inside the Kalshi account). The page asks for a hold.
//   - Each book has its own playbook, $ per trade (5 to 50), daily loss cap, cash floor and live switch, and its own trades.
//     Orders, balances and the move to the crypto shard all go through the book's own locked key.
//   - Paper settings that already govern the main live book (profit target, give-back, protect profit, bench, off hours) apply to
//     every book the same way, so a book differs from the main one only in what is set here.
// The main live book is left exactly as it was (its code is in kalshi-cloud.js); this file repeats its order logic per book
// rather than reshaping it, so nothing changes for the main book while this is new.

const enc = new TextEncoder(), dec = new TextDecoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = s => new Uint8Array(String(s).match(/../g).map(h => parseInt(h, 16)));
const B64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
export const BOOK_MAX = 50, BOOK_MIN = 5;
const LIMITS = { maxPerWindow: 9, maxPerDay: 150 };

// PEM to PKCS#8 bytes; an RSA key in PKCS#1 ("BEGIN RSA PRIVATE KEY", what Kalshi's site hands out) is wrapped first
function pkcs8(pem) {
  const s = String(pem).replace(/\\n/g, '\n'), rsa1 = /BEGIN RSA PRIVATE KEY/.test(s), b = atob(s.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  if (!rsa1) return u;
  const len = n => n < 128 ? [n] : n < 256 ? [0x81, n] : n < 65536 ? [0x82, n >> 8, n & 255] : [0x83, n >> 16, (n >> 8) & 255, n & 255];
  const oct = [0x04, ...len(u.length), ...u], alg = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00], body = [0x02, 0x01, 0x00, ...alg, ...oct];
  return new Uint8Array([0x30, ...len(body.length), ...body]);
}
async function importPem(pem) {
  const der = pkcs8(pem);
  try { return { k: await crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']), alg: { name: 'Ed25519' } }; }
  catch { return { k: await crypto.subtle.importKey('pkcs8', der, { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['sign']), alg: { name: 'RSA-PSS', saltLength: 32 } }; }
}

export function createBooks(D) {
  // D: { state, env, say, HOSTS, API, XI, coin, etDay, etHour, fee, stratAt, stratSince, mainReq, mainKeys, labName, cfg }
  const { state, env } = D, sql = state.storage.sql, kv = state.storage;
  sql.exec('CREATE TABLE IF NOT EXISTS kb (bid TEXT, tk TEXT, at INTEGER, j TEXT, PRIMARY KEY (bid, tk))');
  let list = null;                         // [{ id, name, sub, keyEnd, on, size, loss, floor, strat: [], at, sellAt, sellDone }]
  const L = {}, S = {}, K = {};            // per book: trades Map, state, imported key

  async function aes() {
    let raw = env.ENC_KEY ? await crypto.subtle.digest('SHA-256', enc.encode(env.ENC_KEY)) : null;
    if (!raw) { let k = await kv.get('enck'); if (!k) { k = hex(crypto.getRandomValues(new Uint8Array(32))); await kv.put('enck', k); } raw = unhex(k); }
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  const seal = async o => { const iv = crypto.getRandomValues(new Uint8Array(12)); return { iv: hex(iv), ct: hex(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(), enc.encode(JSON.stringify(o)))) }; };
  const open = async b => JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unhex(b.iv) }, await aes(), unhex(b.ct))));

  async function load() {
    if (list) return;
    list = (await kv.get('kbooks')) || [];
    for (const b of list) { L[b.id] = new Map(); // MC 2026-11-15 after every restart (each release is one) a book showed a dash for cash until its next balance check, which
      // read as the money being gone. The last balance read is kept on the book and shown until the fresh one arrives.
      S[b.id] = S[b.id] || { bal: b.lastBal ?? null, balAt: 0, shard: b.lastBal != null && b.lastCx != null ? { 0: Math.max(0, +(b.lastBal - b.lastCx).toFixed(2)), [D.XI]: b.lastCx } : {}, keyOk: null, err: null, errAt: 0, stopped: null, xferAt: 0, lastXfer: null, host: 0 }; }
    for (const r of sql.exec('SELECT bid, j FROM kb')) { try { const j = JSON.parse(r.j); (L[r.bid] = L[r.bid] || new Map()).set(j.tk, j); } catch { } }
  }
  const saveList = () => kv.put('kbooks', list);
  const saveRow = (b, x) => sql.exec('INSERT OR REPLACE INTO kb (bid, tk, at, j) VALUES (?, ?, ?, ?)', b.id, x.tk, x.at, JSON.stringify(x));
  const fail = (b, m) => { S[b.id].err = m; S[b.id].errAt = Date.now(); D.say(`BOOK ${b.name}: ${m}`); };
  const errOf = r => r?.j?.error?.message || r?.j?.message || r?.j?.error || r?.t || 'no answer';

  // signed request with the book's own locked key
  async function key(b) { if (K[b.id]) return K[b.id]; const box = await kv.get('kbk:' + b.id); if (!box) throw new Error('no key saved for this book'); const k = await open(box); K[b.id] = { id: k.id, ...(await importPem(k.pem)) }; return K[b.id]; }
  async function breq1(b, method, p, body) {
    const k = await key(b), s = S[b.id]; let last = null;
    for (let i = 0; i < D.HOSTS.length; i++) {
      const h = D.HOSTS[(s.host + i) % D.HOSTS.length], full = D.API + p, ts = String(Date.now());
      const sig = await crypto.subtle.sign(k.alg, k.k, enc.encode(ts + method + full.split('?')[0]));
      try {
        const r = await fetch(h + full, { method, headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), 'KALSHI-ACCESS-KEY': k.id, 'KALSHI-ACCESS-TIMESTAMP': ts, 'KALSHI-ACCESS-SIGNATURE': B64(sig) }, body: body ? JSON.stringify(body) : undefined });
        const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { }
        last = { ok: r.ok, status: r.status, j, t: t.slice(0, 300) };
        if (r.status === 404 && i < D.HOSTS.length - 1) continue;
        if (r.ok) s.host = (s.host + i) % D.HOSTS.length;
        return last;
      } catch (e) { last = { ok: false, status: 0, t: e.message }; }
    }
    return last;
  }
  async function breq(b, m, p, body) { for (let a = 0; a < 4; a++) { const r = await breq1(b, m, p, body); if (r?.status !== 429 || a === 3) return r; await new Promise(z => setTimeout(z, 700 * (a + 1))); } }

  const today = b => { const d = D.etDay(Date.now()); return [...L[b.id].values()].filter(x => D.etDay(x.at) === d); };
  const realized = l => l.reduce((a, x) => a + (x.pnl ?? 0), 0);
  async function balance(b, force) {
    const s = S[b.id]; if (Date.now() - s.balAt < (force ? 30000 : 60000)) return s.bal;
    // MC 2026-11-15 Steven's second book showed "balance check failed: 0 Too many subrequests by single Worker invocation".
    // Cloudflare caps the outside calls one run may make (50 on the free plan), and the per-shard reads added today turned
    // every balance check into three calls, for the main account and for each book, every minute. The split is now read
    // again only when the total changed, when something set balAt to 0 (a fill, a settle, a transfer), or after 10 minutes;
    // otherwise the last split is kept. Running out of calls is also no longer shown as an error on the book: the last
    // figures stay and the next run reads again.
    const stale = !s.balAt, was = s.bal, keep = s.shard;
    const r = await breq(b, 'GET', '/portfolio/balance');
    if (r?.ok) { const j = r.j || {}; s.bal = j.balance_dollars != null ? +j.balance_dollars : j.balance != null ? j.balance / 100 : null; s.balAt = Date.now(); s.keyOk = true; if (/^balance check failed/.test(s.err || '')) s.err = null; s.shard = {}; for (const x of j.balance_breakdown || []) s.shard[x.exchange_index] = +x.balance;
      // MC 2026-11-15 Kalshi leaves balance_breakdown out for a key locked to one subaccount, which is every book's key. With no
      // breakdown the book saw nothing on either shard, so it never moved money to the crypto shard and its orders had no cash
      // behind them. Each shard is now asked for by itself with exchange_index whenever the breakdown is missing or does not
      // add up to the book's own balance.
      const sum = Object.values(s.shard).reduce((a, v) => a + v, 0);
      if (s.bal != null && (!(j.balance_breakdown || []).length || Math.abs(sum - s.bal) > 0.01)) {
        if (!stale && was === s.bal && keep && Object.keys(keep).length && Date.now() - (s.shAt || 0) < 600000) s.shard = keep; else {
        const val = q => q?.ok ? (q.j?.balance_dollars != null ? +q.j.balance_dollars : q.j?.balance != null ? q.j.balance / 100 : null) : null;
        const [a0, ax] = await Promise.all([breq(b, 'GET', '/portfolio/balance?exchange_index=0'), breq(b, 'GET', `/portfolio/balance?exchange_index=${D.XI}`)]), v0 = val(a0), vx = val(ax);
        if (v0 != null && vx != null) { s.shard = { 0: v0, [D.XI]: vx }; s.shAt = Date.now(); } else if (keep && Object.keys(keep).length) s.shard = keep; } } }
    // MC 2026-11-15 Steven's book showed "balance check failed: 429 too many requests". Kalshi turning a read away for a moment
    // is not a fault with the book, so it is handled like running out of calls: last figures kept, tried again next minute.
    else if (/subrequest/i.test(errOf(r) || '') || r?.status === 429) D.say(`BOOK ${b.name}: ${r?.status === 429 ? 'Kalshi asked to slow down' : 'out of calls this run'}, balance kept`);
    else { s.keyOk = r?.status === 401 || r?.status === 403 ? false : s.keyOk; fail(b, `balance check failed: ${r?.status} ${errOf(r)}`); }
    if (r?.ok && s.bal != null && (b.lastBal !== s.bal || b.lastCx !== (s.shard[D.XI] ?? null))) { b.lastBal = s.bal; b.lastCx = s.shard[D.XI] ?? null; try { await saveList(); } catch { } }
    return s.bal;
  }
  // the crypto markets trade on shard XI; keep about 12 trades' worth there, moved inside the book's own subaccount
  const subXfer = (b, amount, from, to) => ({ source: 'event_contract', destination: 'event_contract', amount, source_exchange_shard: from, destination_exchange_shard: to, source_subaccount: b.sub, destination_subaccount: b.sub });
  // MC 2026-11-17 The Retirement Plan stopped with "could not move $500.86 to the crypto shard: 400 insufficient balance" right
  // after money was moved out of it. A move out first brings the whole crypto balance back to the main balance, so the next
  // top-up asked for everything there. Kalshi fills at tenths of a cent, so a balance carries a fraction of a cent, and the
  // figure it reports is rounded: $500.86 can be $500.856, and asking for the full $500.86 is refused. Until now a top-up
  // almost never took the whole balance, which is why this had not shown. The top-up now leaves 2 cents behind. If Kalshi
  // still says there is not enough, the balances are read fresh and it tries once more leaving $1, and the account only
  // shows an error when the crypto side cannot cover the next order.
  async function fund(b, again) {
    const s = S[b.id]; if (!again && Date.now() - s.xferAt < 60000) return;
    const have = s.shard[D.XI] ?? 0, src = s.shard[0] ?? 0, want = Math.round(b.size * 12), low = b.size * 9;
    if (have >= low || src < 1) return; const amt = Math.floor(Math.min(src - (again ? 1 : 0.02), want - have) * 100) / 100; if (amt < 1) return;
    s.xferAt = Date.now();
    // MC 2026-11-15 the first book to go live showed ERROR with its $200 stuck off the crypto shard. For a numbered subaccount
    // Kalshi's docs say this call rejects client_transfer_id (primary accounts only) and that both subaccount fields must name the
    // key's own subaccount; the book was sending the main account's form of the request. subXfer builds the subaccount form.
    const res = await breq(b, 'POST', '/portfolio/intra_exchange_instance_transfer', subXfer(b, Math.round(amt * 100) * 100, 0, D.XI));
    if (!res?.ok) {
      if (!again && res?.status === 400 && /insufficient/i.test(errOf(res) || '')) { s.balAt = 0; s.shAt = 0; try { await balance(b, true); } catch { } return fund(b, true); }
      const m = `could not move $${amt.toFixed(2)} to the crypto shard: ${res?.status} ${errOf(res)}`; s.balAt = 0;
      if (have >= b.size + 1) D.say(`BOOK ${b.name}: ${m} (the crypto side still covers the next order)`); else fail(b, m); return; }
    s.lastXfer = { at: Date.now(), amt: +amt.toFixed(2) }; s.balAt = 0; if (/crypto shard/.test(s.err || '')) s.err = null; D.say(`BOOK ${b.name} moved $${amt.toFixed(2)} to the crypto shard`);
  }

  // MC 2026-11-20 same as Main: the riding kind clears when its window closes
  function skip(b, r, why) { if (L[b.id].has(r.ticker)) return; const x = { tk: r.ticker, coin: D.coin(r.series), side: r.side, at: Date.now(), close: r.close, paperPx: r.avgN || r.ask, skipped: why, strat: D.stratAt(b.strat, Date.now()) }; L[b.id].set(r.ticker, x); saveRow(b, x); S[b.id].stopped = why; S[b.id].stoppedDay = /^(daily |give-back|bank drawdown|cash)/.test(why) || (/^protecting/.test(why) && !/ riding /.test(why)); S[b.id].stoppedTo = S[b.id].stoppedDay ? null : r.close; }   // MC 2026-11-16 a one-window reason ends with its window, as on Main
  // the same checks and order as the main live book (kalshi-cloud.js onRule), with this book's size, loss cap and floor
  // MC 2026-11-14 like the main book: each book checks its orders one by one against its own limits (its own window cap, day,
  // loss cap, floor and fills), counting a planned order as if it filled, then sends them all at once. Books run side by side.
  const busy = x => x.fill > 0 || !!x.pend;
  async function buy(b, r, lab, cfgP, bench, later, missed) {
    const s = S[b.id], Lb = L[b.id]; if (Lb.has(r.ticker)) return; s.resv = s.resv || 0;
    const cn = D.coin(r.series), t = today(b), why = (() => {
      if (bench.has(cn)) return `${cn} is benched (down over its last ${cfgP.coldDays} days)`;
      if (realized(t) <= -b.loss) return `daily loss cap hit (${realized(t).toFixed(2)})`;
      if (cfgP.dailyWinUsd > 0 && realized(t) >= cfgP.dailyWinUsd) return `daily profit target hit (+$${realized(t).toFixed(2)})`;
      if (cfgP.giveBackPct > 0) { let run = 0, pk = 0; for (const x of t.filter(x => x.pnl != null).sort((a, z) => a.at - z.at)) { run += x.pnl; pk = Math.max(pk, run); } if (pk >= (cfgP.giveBackMin ?? 25) && run <= pk * cfgP.giveBackPct / 100) return `give-back stop: today peaked at +$${pk.toFixed(2)}`; }
      if (t.filter(busy).length >= LIMITS.maxPerDay) return 'daily order limit';
      { const cap = Math.min(LIMITS.maxPerWindow, cfgP.winCap ?? 9); if ([...Lb.values()].filter(x => x.close === r.close && busy(x)).length >= cap) return cap < LIMITS.maxPerWindow ? `window is full (${cap} a window, clearest first)` : 'window limit'; }
      return null; })();
    if (why) return skip(b, r, why);
    const bal = await balance(b, true); if (bal == null) { fail(b, `no order for ${r.ticker}: could not read the balance`); return; }
    if (bal - s.resv < b.floor) return skip(b, r, `cash $${bal.toFixed(2)} is under the $${b.floor} floor`);
    s.stopped = null;
    let rS = null; if (lab?.size) { let run = 0, pk = 0; for (const x of [...Lb.values()].filter(x => x.pnl != null).sort((a, z) => a.at - z.at)) { run += x.pnl; pk = Math.max(pk, run); } rS = { peak: bal + (pk - run), start: bal - run }; }
    let size = lab?.size ? Math.min(b.size, BOOK_MAX, Math.max(BOOK_MIN, lab.size(bal, { kf: r.kf, win: r.win }, rS))) : b.size;
    if (cfgP.lockAt > 0) { const t2 = t.filter(x => x.pnl != null).sort((a, z) => a.at - z.at); let run = 0, pk = 0; for (const x of t2) { run += x.pnl; pk = Math.max(pk, run); }
      if (pk >= cfgP.lockAt) { const riding = [...Lb.values()].filter(x => x.close === r.close && busy(x) && !x.result).reduce((a, x) => a + (x.cost || (x.pend ? x.size : 0) || 0), 0), room = run - pk * (cfgP.lockKeep || 0) / 100 - riding; if (room < BOOK_MIN) return skip(b, r, `protecting today's profit: $${Math.max(0, room).toFixed(2)} of room left${riding > 0 ? `, $${riding.toFixed(2)} riding on this window` : ''}`); size = Math.min(size, room); } }
    if ((s.shard[D.XI] ?? 0) - s.resv < size + 1) { s.xferAt = 0; await fund(b); }
    // MC 2026-11-14 same top price as the main book: live's room, never past the maximum price or the playbook's limit
    const lim = D.orderLimit(r, lab?.id || 'rule', cfgP), maxPx = lim.top; if (maxPx < r.ask - 1e-9) return skip(b, r, `the ${(r.ask * 100).toFixed(1)}c ask is over the limit (${lim.why})`);
    const n = Math.floor(size / maxPx); if (n < 1) return;
    // MC 2026-11-15 a book with $144 took two $50 trades in a window and would have sent a third with $44 left, which Kalshi
    // refuses and the row then shows as an error. The order is passed here instead when the book's cash, less what its other
    // orders this moment have set aside, does not cover the whole trade and its fee. A smaller order with what is left was the
    // other choice; Mitchell picked the plain skip.
    { const need = n * maxPx + D.fee(maxPx, n), free = (s.bal ?? bal) - s.resv; if (free < need - 0.005) return skip(b, r, `cash $${Math.max(0, free).toFixed(2)} does not cover a $${size.toFixed(0)} trade`); }
    const grid = p => (p < 0.1 || p >= 0.9) ? 0.001 : 0.01, down = p => +(Math.floor(p / grid(p) + 1e-9) * grid(p)).toFixed(4), up = p => +(Math.ceil(p / grid(p) - 1e-9) * grid(p)).toFixed(4);
    const cid = `cr${b.sub}-${r.ticker}`, body = r.side === 'yes'
      ? { ticker: r.ticker, side: 'bid', count: String(n), price: down(maxPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', client_order_id: cid }
      : { ticker: r.ticker, side: 'ask', count: String(n), price: up(1 - maxPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', client_order_id: cid };
    const row = { tk: r.ticker, coin: cn, side: r.side, at: Date.now(), close: r.close, paperPx: r.avgN || r.ask, ask: r.ask, read: r.at, want: n, limit: maxPx, limWhy: lim.why, size, fill: 0, strat: lab?.id || 'rule', pend: 1 };
    Lb.set(r.ticker, row); saveRow(b, row); s.resv += size;
    const send = async () => {
      const t0 = Date.now(); row.sent = t0 - (r.at || t0);
      let res; try { res = await breq(b, 'POST', '/portfolio/events/orders', body); } finally { delete row.pend; s.resv = Math.max(0, s.resv - size); }
      row.rtt = Date.now() - t0;
      if (!res?.ok) { row.err = `${res?.status} ${errOf(res)}`.slice(0, 200); saveRow(b, row); fail(b, `order ${r.ticker} refused: ${row.err}`); return; }
      const j = res.j?.order || res.j || {}, fill = +(j.fill_count ?? 0), avgYes = j.average_fill_price != null ? +j.average_fill_price : null, avgFee = j.average_fee_paid != null ? +j.average_fee_paid : 0;
      Object.assign(row, { id: j.order_id || null, fill, avgYes, px: avgYes == null ? null : +(r.side === 'yes' ? avgYes : 1 - avgYes).toFixed(4), fees: +(fill * avgFee).toFixed(4) });
      row.cost = row.px == null ? null : +(fill * row.px + row.fees).toFixed(2); saveRow(b, row);
      D.say(`BOOK ${b.name} ${r.ticker} ${r.side.toUpperCase()} ${fill}/${n} filled${row.px != null ? ` at ${(row.px * 100).toFixed(1)}c` : ''} (sent ${row.sent}ms after the price was read)`);
      if (row.cost) { if (s.bal != null) s.bal = +(s.bal - row.cost).toFixed(2); if (s.shard[D.XI] != null) s.shard[D.XI] = +(s.shard[D.XI] - row.cost).toFixed(2); }
      // MC 2026-11-17 the second try for a missed fill, as on Main (see missCheck): same top price, the contracts still wanted
      if (fill < n && missed) missed.push({ row, save: () => saveRow(b, row), retry: !!cfgP.retryFill, floor: Math.max(cfgP.minAsk ?? 0.9, r.ask - 0.01), again: async k => {
        const res2 = await breq(b, 'POST', '/portfolio/events/orders', { ...body, count: String(Math.floor(row.want - row.fill + 1e-9)), client_order_id: `${cid}-r${k}` });
        if (!res2?.ok) { D.say(`BOOK ${b.name} ${r.ticker} second try refused: ${res2?.status} ${errOf(res2)}`.slice(0, 200)); return 0; }
        const got = D.fillMerge(row, r.side, res2.j?.order || res2.j || {}); saveRow(b, row);
        if (got.cost) { if (s.bal != null) s.bal = +(s.bal - got.cost).toFixed(2); if (s.shard[D.XI] != null) s.shard[D.XI] = +(s.shard[D.XI] - got.cost).toFixed(2); }
        return got.fill; } });
    };
    if (later) later.push(send); else await send();
  }
  async function sellAll(b) {
    for (const x of [...L[b.id].values()].filter(x => x.fill > 0 && !x.result && !x.sold && x.close > Date.now())) {
      const body = x.side === 'yes'
        ? { ticker: x.tk, side: 'ask', count: String(x.fill), price: '0.0010', time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', reduce_only: true, client_order_id: `crs${b.sub}-${x.tk}-${Date.now()}` }
        : { ticker: x.tk, side: 'bid', count: String(x.fill), price: '0.9990', time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', reduce_only: true, client_order_id: `crs${b.sub}-${x.tk}-${Date.now()}` };
      const res = await breq(b, 'POST', '/portfolio/events/orders', body);
      if (!res?.ok) { fail(b, `sell ${x.tk} refused: ${res?.status} ${errOf(res)}`); continue; }
      const j = res.j?.order || res.j || {}, f = +(j.fill_count ?? 0), avg = j.average_fill_price != null ? +j.average_fill_price : null, fe = j.average_fee_paid != null ? +j.average_fee_paid * f : 0;
      if (f > 0 && avg != null) { const px = +(x.side === 'yes' ? avg : 1 - avg).toFixed(4); x.sold = { at: Date.now(), fill: f, px }; x.pnl = +(f * px - fe - (x.cost ?? 0) * f / x.fill).toFixed(2); x.result = 'sold'; saveRow(b, x); D.say(`BOOK ${b.name} sold ${x.tk}`); }
    }
    S[b.id].balAt = 0;
  }

  // ---------- hooks from the engine ----------
  // gate(sid, r) -> { ok, why, lab } is the engine's own playbook check, the one the main live book uses
  // MC 2026-11-15 asked for: the cash out rule and the rest of Live settings per subaccount. A book followed the main account's
  // live rules for everything but playbook, size, loss cap and floor. A book may now hold its own copy (b.cfg, the same keys as
  // the main account's live rules); without one it follows Main as before. own(b) hands back that book's trades to consider,
  // playbook check and benched coins worked out from its own rules, so its price band, coins, off hours, stops and window cap
  // are its own.
  const cfgOf = (b, main) => b.cfg ? { ...main, ...b.cfg } : main;
  async function onMark(hits0, now, gate0, cfg0, bench0, missed = null, own = null) {
    await load(); if (!hits0.length && !own) return;
    await Promise.all(list.filter(b => b.on).map(async b => {
      const sid = D.stratAt(b.strat, now), sends = [], o = b.cfg && own ? own(cfgOf(b, cfg0)) : null, hits = o ? o.hits : hits0, gate = o ? o.gate : gate0, cfgP = o ? o.cfg : cfg0, bench = o ? o.bench : bench0;
      const offNow = (cfgP.skipHours || []).includes(D.etHour(now));
      try {
        for (const r of hits) {
          if (offNow) { skip(b, r, `off schedule (${D.etHour(now)}:00 ET hour)`); continue; }
          const g = gate(sid, r); if (!g.ok) { skip(b, r, g.why); continue; }
          try { await buy(b, r, g.lab, cfgP, bench, sends, missed); } catch (e) { fail(b, 'order error: ' + e.message); }
        }
        await Promise.all(sends.map(f => f().catch(e => fail(b, 'order error: ' + e.message))));
      } finally { S[b.id].resv = 0; }
    }));
  }
  // MC 2026-11-18 a later-watched buy (kalshi-cloud.js lateLive) for the books. Only a book that is on, runs Claude's pick, later
  // watched, and has "Buy later-watched coins" on in the rules it follows (its own, or Main's). ok(cfg) is that setting plus the
  // price band, coins and off hours, read with the book's rules. The order goes through buy(), so the book's own size, loss cap,
  // floor, window cap and order limit hold. A market the book only has a skip note for can be bought; one where an order was
  // already sent is left alone.
  // a book that runs later watched with the setting on and has no order in this market yet (kalshi-cloud.js lateWants)
  const lateOpen = (tk, now, cfg0, pb = 'cpl') => (list || []).some(b => { if (!b.on || D.stratAt(b.strat, now) !== pb || cfgOf(b, cfg0).lateBuy !== 1) return false; const p = L[b.id]?.get(tk); return !p || !!p.skipped; });
  async function onLate(r, now, lab, cfg0, ok, benchOf, missed = null, pb = 'cpl') {
    await load();
    await Promise.all(list.filter(b => b.on && D.stratAt(b.strat, now) === pb && D.stratAt(b.strat, r.close - 600000) === pb).map(async b => {
      const cfgP = cfgOf(b, cfg0), Lb = L[b.id], sends = []; if (!ok(cfgP)) return;
      const prev = Lb.get(r.ticker); if (prev && !prev.skipped) return; if (prev) Lb.delete(r.ticker);
      try { await buy(b, r, lab, cfgP, benchOf(cfgP), sends, missed);
        const x = Lb.get(r.ticker); if (!x) { if (prev) Lb.set(r.ticker, prev); } else { x.late = 1; if (prev?.skipped && !x.skipped) x.was = prev.skipped; saveRow(b, x); }
        await Promise.all(sends.map(f => f().catch(e => fail(b, 'order error: ' + e.message))));
      } catch (e) { fail(b, 'order error: ' + e.message); } finally { S[b.id].resv = 0; }
    }));
  }
  // read every live book's balance ahead of the orders (called while the coins are being scanned)
  async function warm() { await load(); await Promise.all(list.filter(b => b.on).map(b => balance(b, true).catch(() => { }))); }
  // MC 2026-11-14 live cash out at minute 10, each book on its own key, same terms as the main book (kalshi-cloud.js cashLive)
  // MC 2026-11-15 want(cfg) is the cash out rule read with the book's own settings (or Main's when it follows Main)
  async function cashOut(r, best, want = null, main = null) {
    await load();
    for (const b of list) { if (!b.on) continue; if (want && !want(cfgOf(b, main))) continue; const x = L[b.id]?.get(r.ticker); if (!x || !(x.fill > 0) || x.result || x.sold || x.close <= Date.now()) continue;
      const minPx = Math.max(0.01, best - 0.03), grid = p => (p < 0.1 || p >= 0.9) ? 0.001 : 0.01, up = p => +(Math.ceil(p / grid(p) - 1e-9) * grid(p)).toFixed(4), down = p => +(Math.floor(p / grid(p) + 1e-9) * grid(p)).toFixed(4);
      const body = x.side === 'yes'
        ? { ticker: x.tk, side: 'ask', count: String(x.fill), price: up(minPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', reduce_only: true, client_order_id: `crx${b.sub}-${x.tk}` }
        : { ticker: x.tk, side: 'bid', count: String(x.fill), price: down(1 - minPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', reduce_only: true, client_order_id: `crx${b.sub}-${x.tk}` };
      const res = await breq(b, 'POST', '/portfolio/events/orders', body);
      if (!res?.ok) { fail(b, `cash out ${x.tk} refused: ${res?.status} ${errOf(res)}`); continue; }
      const j = res.j?.order || res.j || {}, f = +(j.fill_count ?? 0), avg = j.average_fill_price != null ? +j.average_fill_price : null, fe = j.average_fee_paid != null ? +j.average_fee_paid * f : 0;
      if (!(f > 0) || avg == null) continue;
      const px = +(x.side === 'yes' ? avg : 1 - avg).toFixed(4); x.sold = { at: Date.now(), fill: f, px, fee: +fe.toFixed(4), cash: 1 };
      if (f >= x.fill) { x.pnl = +(f * px - fe - (x.cost ?? 0)).toFixed(2); x.result = 'sold'; }
      saveRow(b, x); S[b.id].balAt = 0; D.say(`BOOK ${b.name} cashed out ${x.tk}: ${f}/${x.fill}`); }
  }
  // MC 2026-11-15 Mitchell bought XRP by hand and only the main account got it. Hand buys and sells can now name the books to
  // include. A hand buy skips the playbook (it is a hand buy) but keeps the book's own limits: one position a market, the daily
  // loss cap, the cash floor, and enough cash for the whole trade. Same ceiling price as the main order, the book's own size.
  const handWhy = (b, tk) => { const x = L[b.id]?.get(tk), t = today(b), s = S[b.id]; return !b.on ? 'not trading' : x && busy(x) ? 'already holds it' : realized(t) <= -b.loss ? 'daily loss cap hit' : s.bal != null && s.bal < Math.max(b.floor, 1) ? 'under its cash floor' : s.bal != null && s.bal < b.size ? `cash $${s.bal.toFixed(2)} does not cover $${b.size}` : null; };
  // MC 2026-11-20 room above the protected level for a hand buy, with the same sums as buy()'s protect check: today's run and
  // high, the share of the high kept, and what is already riding on that window. null when the account has no protection set.
  const lockRoom = (b, cfg0, close) => { const c = cfgOf(b, cfg0 || {}); if (!(c.lockAt > 0)) return null; let run = 0, pk = 0; for (const x of today(b).filter(x => x.pnl != null).sort((a, z) => a.at - z.at)) { run += x.pnl; pk = Math.max(pk, run); }
    const keep = c.lockKeep || 0; if (pk < c.lockAt) return { active: false, at: c.lockAt, keep, pk: +pk.toFixed(2) };
    const riding = close ? [...L[b.id].values()].filter(x => x.close === close && busy(x) && !x.result).reduce((a, x) => a + (x.cost || (x.pend ? x.size : 0) || 0), 0) : 0, floor = pk * keep / 100;
    return { active: true, at: c.lockAt, keep, pk: +pk.toFixed(2), floor: +floor.toFixed(2), riding: +riding.toFixed(2), room: +Math.max(0, run - floor - riding).toFixed(2), min: BOOK_MIN }; };
  const handList = (tk, cfg0, close) => (list || []).filter(b => b.on).map(b => { const why = handWhy(b, tk); return { id: b.id, name: b.name, sub: b.sub, size: b.size, cash: S[b.id].bal, ok: !why, why, prot: lockRoom(b, cfg0, close) }; });
  const heldList = tk => (list || []).map(b => { const x = L[b.id]?.get(tk); return x && x.fill > 0 && !x.result && x.close > Date.now() && x.fill - (x.sold?.fill || 0) > 0 ? { id: b.id, name: b.name, sub: b.sub, left: x.fill - (x.sold?.fill || 0), px: x.px } : null; }).filter(Boolean);
  async function handBuy(ids, o) {
    await load();
    return Promise.all(list.filter(b => ids.includes(b.id)).map(async b => { const s = S[b.id], Lb = L[b.id], nm = b.name;
      try {
        const w0 = handWhy(b, o.tk); if (w0) return { name: nm, ok: false, msg: w0 };
        const bal = await balance(b, true); if (bal == null) return { name: nm, ok: false, msg: 'could not read its balance' };
        let size = b.size;
        // MC 2026-11-20 "Hold to buy protected": the buy is cut to the room above the level this account keeps today, or not sent
        if (o.prot) { const lr = lockRoom(b, o.cfg, o.close); if (lr?.active) { if (lr.room < BOOK_MIN) return { name: nm, ok: false, msg: `not bought, protected: only $${lr.room.toFixed(2)} of room left above the $${lr.floor.toFixed(2)} it keeps today` }; size = Math.min(size, lr.room); } }
        const n = Math.floor(size / o.maxPx); if (n < 1) return { name: nm, ok: false, msg: o.prot ? 'not bought, protected: its room left is under one contract' : 'its size is too small for one contract' };
        if (bal < b.floor) return { name: nm, ok: false, msg: `cash $${bal.toFixed(2)} is under its $${b.floor} floor` };
        if (bal < n * o.maxPx + D.fee(o.maxPx, n) - 0.005) return { name: nm, ok: false, msg: `cash $${bal.toFixed(2)} does not cover a $${size} trade` };
        if ((s.shard[D.XI] ?? 0) < size + 1) { s.xferAt = 0; await fund(b); }
        const grid = p => (p < 0.1 || p >= 0.9) ? 0.001 : 0.01, down = p => +(Math.floor(p / grid(p) + 1e-9) * grid(p)).toFixed(4), up = p => +(Math.ceil(p / grid(p) - 1e-9) * grid(p)).toFixed(4), cid = `crh${b.sub}-${Date.now() % 100000}-${o.tk}`.slice(0, 60);
        const body = o.side === 'yes'
          ? { ticker: o.tk, side: 'bid', count: String(n), price: down(o.maxPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', client_order_id: cid }
          : { ticker: o.tk, side: 'ask', count: String(n), price: up(1 - o.maxPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', client_order_id: cid };
        const res = await breq(b, 'POST', '/portfolio/events/orders', body);
        if (!res?.ok) { const e = `${res?.status} ${errOf(res)}`.slice(0, 160); D.say(`BOOK ${nm} hand buy ${o.tk} refused: ${e}`); return { name: nm, ok: false, msg: `Kalshi refused it: ${e}` }; }
        const j = res.j?.order || res.j || {}, fill = +(j.fill_count ?? 0), avgYes = j.average_fill_price != null ? +j.average_fill_price : null, avgFee = j.average_fee_paid != null ? +j.average_fee_paid : 0;
        // MC 2026-11-18 with "Try again for a missed fill" on for this account, a short hand buy is sent for again (see handRetry
        // in kalshi-cloud.js). The row is only kept once something has filled.
        const prev = Lb.get(o.tk), got1 = fill > 0 && avgYes != null, px1 = got1 ? +(o.side === 'yes' ? avgYes : 1 - avgYes).toFixed(4) : null, fees1 = got1 ? +(fill * avgFee).toFixed(4) : 0;
        const row = { tk: o.tk, coin: o.coin, side: o.side, at: Date.now(), close: o.close, strike: o.strike ?? null, title: o.title || null, ask: o.ask ?? null, want: n, limit: o.maxPx, limWhy: 'the price you confirmed', size, fill: got1 ? fill : 0, ...(got1 ? { avgYes, px: px1, fees: fees1, cost: +(fill * px1 + fees1).toFixed(2) } : {}), id: j.order_id || null, strat: 'hand', hand: 1, ...(prev?.skipped ? { was: prev.skipped } : {}) };
        const spend = d => { if (!d) return; if (s.bal != null) s.bal = +(s.bal - d).toFixed(2); if (s.shard[D.XI] != null) s.shard[D.XI] = +(s.shard[D.XI] - d).toFixed(2); };
        if (got1) { Lb.set(o.tk, row); saveRow(b, row); spend(row.cost); }
        const retry = !!cfgOf(b, o.cfg || {}).retryFill && typeof o.retry === 'function'; let tried = 0;
        if (retry && row.fill < n) tried = await o.retry(o.tk, o.side, o.maxPx, o.ask || 0, o.close, () => Math.floor(n - row.fill + 1e-9), async k => {
          const r2 = await breq(b, 'POST', '/portfolio/events/orders', { ...body, count: String(Math.floor(n - row.fill + 1e-9)), client_order_id: `crh${b.sub}r${k}-${Date.now() % 100000}-${o.tk}`.slice(0, 60) });
          if (!r2?.ok) { D.say(`BOOK ${nm} hand buy ${o.tk} second try refused: ${r2?.status} ${errOf(r2)}`.slice(0, 200)); return; }
          const j2 = r2.j?.order || r2.j || {}, got = D.fillMerge(row, o.side, j2); if (got.fill > 0) { row.id = row.id || j2.order_id || null; row.tries = k; Lb.set(o.tk, row); saveRow(b, row); spend(got.cost); } });
        s.balAt = 0;
        if (!(row.fill > 0) || row.px == null) return { name: nm, ok: false, msg: 'nothing filled, the price moved' + (retry ? (tried ? `, and ${tried} more tr${tried === 1 ? 'y' : 'ies'} found nothing at your price` : ', and nothing was on offer at your price when it looked again') : '') };
        D.say(`BOOK ${nm} bought ${o.tk} ${o.side.toUpperCase()} by hand: ${row.fill}/${n} at ${(row.px * 100).toFixed(1)}c${row.again ? ` (${row.again} second tr${row.again === 1 ? 'y' : 'ies'} filled)` : ''}`);
        return { name: nm, ok: true, msg: `bought ${row.fill}${row.fill < n ? ` of ${n}` : ''} at ${(row.px * 100).toFixed(1)}¢ for $${row.cost.toFixed(2)}${row.again ? ' (with a second try)' : ''}` };
      } catch (e) { return { name: nm, ok: false, msg: e.message }; } }));
  }
  async function handSell(ids, tk, minPx) {
    await load();
    return Promise.all(list.filter(b => ids.includes(b.id)).map(async b => { const x = L[b.id]?.get(tk), nm = b.name;
      try {
        if (!x || !(x.fill > 0) || x.result || x.close <= Date.now()) return { name: nm, ok: false, msg: 'no open position' };
        const left = x.fill - (x.sold?.fill || 0); if (left <= 0) return { name: nm, ok: false, msg: 'nothing left to sell' };
        const grid = p => (p < 0.1 || p >= 0.9) ? 0.001 : 0.01, up = p => +(Math.ceil(p / grid(p) - 1e-9) * grid(p)).toFixed(4), down = p => +(Math.floor(p / grid(p) + 1e-9) * grid(p)).toFixed(4), cid = `crm${b.sub}-${Date.now() % 100000}-${tk}`.slice(0, 60);
        const body = x.side === 'yes'
          ? { ticker: tk, side: 'ask', count: String(left), price: up(minPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', reduce_only: true, client_order_id: cid }
          : { ticker: tk, side: 'bid', count: String(left), price: down(1 - minPx).toFixed(4), time_in_force: 'immediate_or_cancel', self_trade_prevention_type: 'taker_at_cross', reduce_only: true, client_order_id: cid };
        const res = await breq(b, 'POST', '/portfolio/events/orders', body);
        if (!res?.ok) return { name: nm, ok: false, msg: `Kalshi refused it: ${res?.status} ${errOf(res)}`.slice(0, 180) };
        const j = res.j?.order || res.j || {}, f = +(j.fill_count ?? 0), avg = j.average_fill_price != null ? +j.average_fill_price : null, fe = j.average_fee_paid != null ? +j.average_fee_paid * f : 0;
        if (!(f > 0) || avg == null) return { name: nm, ok: false, msg: 'nothing sold, the price moved' };
        const px = +(x.side === 'yes' ? avg : 1 - avg).toFixed(4), was = x.sold, tf = f + (was?.fill || 0);
        x.sold = { at: Date.now(), fill: tf, px: was ? +(((was.fill * was.px) + f * px) / tf).toFixed(4) : px, fee: +((was?.fee || 0) + fe).toFixed(4), cash: 1, manual: 1 };
        if (tf >= x.fill) { x.pnl = +(x.sold.fill * x.sold.px - x.sold.fee - (x.cost ?? 0)).toFixed(2); x.result = 'sold'; }
        saveRow(b, x); S[b.id].balAt = 0; D.say(`BOOK ${nm} sold ${tk} by hand: ${f}/${left}`);
        return { name: nm, ok: true, msg: `sold ${f} of ${left} at ${(px * 100).toFixed(1)}¢` };
      } catch (e) { return { name: nm, ok: false, msg: e.message }; } }));
  }
  function onSettle(r) {
    if (!list) return;
    for (const b of list) { const x = L[b.id]?.get(r.ticker); if (!x || x.result || !(x.fill > 0) || (x.sold && !x.sold.cash)) continue; const keep = x.fill - (x.sold?.fill || 0), sale = x.sold ? x.sold.fill * x.sold.px - (x.sold.fee || 0) : 0; x.result = r.result; x.won = r.result === x.side; x.pnl = +((x.won ? keep : 0) + sale - (x.cost ?? 0)).toFixed(2); if (x.final == null && typeof r.final === 'number') x.final = r.final; saveRow(b, x); S[b.id].balAt = 0; D.say(`BOOK ${b.name} settled ${r.ticker}: ${x.won ? 'won' : 'LOST'} ${x.pnl}`); }
  }
  // MC 2026-11-18 right after a win Main's cash was up to date and the sub accounts' was not, for up to a minute. The quick look
  // that settles a trade seconds after its close read Main's balance again but left the books for the next minute run.
  // afterSettle reads the balance of every book that has just had a trade settle (onSettle marks it with balAt 0).
  async function afterSettle() {
    if (!list) return 0; let n = 0;
    await Promise.all(list.filter(b => S[b.id] && !S[b.id].balAt && [...(L[b.id]?.values() || [])].some(x => x.fill > 0)).map(async b => { try { const was = S[b.id].bal; await balance(b); n++; if (S[b.id].bal === was) S[b.id].balAt = 0; } catch { } }));   // unchanged: Kalshi may not have paid yet, so the minute run reads again
    return n;
  }
  async function upkeep(now) {
    await load();
    for (const b of list) {
      try {
        if (b.sellAt && b.sellAt > (b.sellDone || 0)) { b.sellDone = b.sellAt; await saveList(); await sellAll(b); }
        if (b.on || now - S[b.id].balAt > 5 * 60000) await balance(b);
        if (b.on && S[b.id].balAt) await fund(b);
      } catch (e) { fail(b, e.message); }
    }
  }
  function view() {
    if (!list) return [];
    return list.map(b => { const s = S[b.id], all = [...L[b.id].values()].sort((a, z) => z.at - a.at), t = today(b).filter(x => x.fill > 0), done = t.filter(x => x.result);
      return { id: b.id, name: b.name, sub: b.sub, keyEnd: b.keyEnd || null, made: b.made || 'linked', on: !!b.on, size: b.size, loss: b.loss, floor: b.floor, since: b.at || null, cfg: b.cfg || null,
        bal: s.bal, balAt: s.balAt || null, crypto: s.shard[D.XI] ?? null, keyOk: s.keyOk, err: s.err && Date.now() - s.errAt < 3600000 ? s.err : null, stopped: s.stopped && (!s.stoppedTo || Date.now() < s.stoppedTo) ? s.stopped : null, stoppedDay: !!s.stoppedDay, xfer: s.lastXfer,
        playbook: { id: D.stratAt(b.strat, Date.now()), since: D.stratSince(b.strat, Date.now()) },
        // MC 2026-11-20 the same split Main sends (by hand, later buys, passed) so Today on Home can show any one account
        today: { n: done.length, won: done.filter(x => x.won).length, net: +realized(done).toFixed(2), open: t.filter(x => !x.result).length,
          hand: (h => ({ n: h.length, won: h.filter(x => x.won).length, net: +realized(h).toFixed(2) }))(done.filter(x => x.hand)),
          late: (h => ({ n: h.length, won: h.filter(x => x.won).length, net: +realized(h).toFixed(2) }))(done.filter(x => !x.hand && x.late)),
          ...(() => { const ps = today(b).filter(x => x.skipped && x.strat && !(x.fill > 0)), rs = ps.map(x => [x, D.resOf ? D.resOf(x.tk) : null]).filter(z => z[1]); return { passed: ps.length, pWon: rs.filter(z => z[1] === z[0].side).length, pLost: rs.filter(z => z[1] !== z[0].side).length }; })() },
        total: { n: all.filter(x => x.result && x.fill > 0).length, won: all.filter(x => x.won && x.fill > 0).length, net: +realized(all.filter(x => x.fill > 0)).toFixed(2) },
        open: all.filter(x => x.fill > 0 && !x.result).map(x => ({ tk: x.tk, coin: x.coin, side: x.side, fill: x.fill, px: x.px, cost: x.cost, close: x.close })),
        hist: all.filter(x => x.fill > 0 && x.result).slice(0, 1500).map(x => [x.close, x.coin, x.side, x.px, x.fill, x.pnl, x.won ? 1 : 0, 1, x.hand ? 1 : 0]),
        // MC 2026-11-20 150 rows (was 80): the live tiles up top now draw today from every account, and a busy day with its skips ran past 80
        recent: all.slice(0, 150).map(x => ({ mres: D.resOf ? D.resOf(x.tk) : null, tk: x.tk, coin: x.coin, side: x.side, at: x.at, close: x.close, want: x.want ?? null, fill: x.fill ?? 0, px: x.px ?? null, paperPx: x.paperPx, cost: x.cost ?? null, result: x.result || null, won: x.won ?? null, pnl: x.pnl ?? null, err: x.err || null, skipped: x.skipped || null, ask: x.ask ?? null, limit: x.limit ?? null, sent: x.sent ?? null, again: x.again || 0, missAsk: x.missAsk ?? null, missQty: x.missQty ?? null, hand: x.hand || null, late: x.late || null, strike: x.strike ?? null, title: x.title || null, final: x.final ?? null })) }; });
  }

  // ---------- commands from the dashboard (signed-in, unlocked device only; the engine checks that) ----------
  async function command(a, labIds) {
    await load(); const op = a.op, b = list.find(x => x.id === a.id), nm = s => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 30);
    const fresh = (name, sub, made, end) => ({ id: hex(crypto.getRandomValues(new Uint8Array(6))), name, sub, made, keyEnd: end, on: false, size: 10, loss: 100, floor: 0, strat: [], at: Date.now(), sellAt: 0, sellDone: 0 });
    // MC 2026-11-17 one "move money" for any pair of accounts. Kalshi only moves money between the main account and a
    // subaccount, so main to a book is the old 'fund', a book to main is the old 'withdraw', and book to book is those two in
    // a row through the main account. If the second half is refused the money is left on the main account and the answer says so.
    if (op === 'move') { const F = a.from === 'main' ? null : list.find(x => x.id === a.from), T = a.to === 'main' ? null : list.find(x => x.id === a.to);
      if ((a.from !== 'main' && !F) || (a.to !== 'main' && !T) || a.from === a.to) return { ok: false, msg: 'Pick two different accounts.' };
      if (!F) return command({ op: 'fund', id: T.id, amount: a.amount }, labIds);
      if (!T) return command({ op: 'withdraw', id: F.id, amount: a.amount }, labIds);
      const out = await command({ op: 'withdraw', id: F.id, amount: a.amount }, labIds); if (!out.ok) return out;
      const m = /^\$([\d.]+) moved/.exec(out.msg || ''), amt = m ? +m[1] : +a.amount; if (!(amt >= 1)) return { ok: false, msg: `The money left ${F.name} and is on the main account, but the amount could not be read back. Move it on to ${T.name} from there.` };
      const inn = await command({ op: 'fund', id: T.id, amount: amt }, labIds);
      if (!inn.ok) return { ok: false, msg: `$${amt.toFixed(2)} left ${F.name} and is now on the main account, but the second half to ${T.name} did not go through: ${inn.msg} Nothing is lost; move it from Main to ${T.name} when ready.` };
      return { ok: true, msg: `$${amt.toFixed(2)} moved from ${F.name} to ${T.name} (through the main account).` }; }
    if (op === 'add') {
      if (!D.mainKeys()) return { ok: false, msg: 'Connect the main Kalshi key first. Books are made from it.' };
      const name = nm(a.name) || `Book ${list.length + 1}`; if (list.some(x => x.name.toLowerCase() === name.toLowerCase())) return { ok: false, msg: 'There is already a book with that name.' };
      const c = await D.mainReq('POST', '/portfolio/subaccounts', {});
      if (!c?.ok || !(c.j?.subaccount_number > 0)) return { ok: false, msg: `Kalshi would not create a subaccount: ${c?.status} ${errOf(c)}. Subaccounts need a Direct account on Kalshi's Advanced API tier or above.` };
      const sub = c.j.subaccount_number;
      const g = await D.mainReq('POST', '/api_keys/generate', { name: `Kalshi Radar ${name} (sub ${sub})`.slice(0, 60), key_type: 'ed25519', scopes: ['read', 'write'], subaccount: sub });
      if (!g?.ok || !g.j?.private_key) return { ok: false, msg: `Subaccount ${sub} was created, but Kalshi would not make a key for it: ${g?.status} ${errOf(g)}. You can make one on Kalshi locked to subaccount ${sub} and link it with "Link a subaccount".` };
      const bk = fresh(name, sub, 'auto', String(g.j.api_key_id).slice(-4));
      await kv.put('kbk:' + bk.id, await seal({ id: g.j.api_key_id, pem: g.j.private_key }));
      list.push(bk); L[bk.id] = new Map(); S[bk.id] = { bal: null, balAt: 0, shard: {}, keyOk: null, err: null, errAt: 0, stopped: null, xferAt: 0, lastXfer: null, host: 0 }; await saveList();
      try { await balance(bk, true); } catch { }
      D.say(`BOOK added ${name} on subaccount ${sub}`);
      return { ok: true, msg: `${name} is ready on subaccount ${sub}, with its own key. Move money in, pick its playbook and size, then turn it on.`, id: bk.id };
    }
    if (op === 'link') {
      const name = nm(a.name) || `Book ${list.length + 1}`, sub = Math.round(+a.sub), id = String(a.keyId || '').trim(), pem = String(a.pem || '').trim();
      if (!(sub >= 1 && sub <= 63)) return { ok: false, msg: 'Subaccount numbers run from 1 to 63.' };
      if (list.some(x => x.sub === sub)) return { ok: false, msg: `Subaccount ${sub} already has a book.` };
      if (!id || !/PRIVATE KEY/.test(pem)) return { ok: false, msg: 'Paste the key ID and the whole private key, including the BEGIN and END lines.' };
      const bk = fresh(name, sub, 'linked', id.slice(-4));
      try { K[bk.id] = { id, ...(await importPem(pem)) }; } catch { return { ok: false, msg: 'That private key could not be read. Paste it again, all of it.' }; }
      L[bk.id] = new Map(); S[bk.id] = { bal: null, balAt: 0, shard: {}, keyOk: null, err: null, errAt: 0, stopped: null, xferAt: 0, lastXfer: null, host: 0 };
      const bal = await balance(bk, true); if (bal == null) { delete K[bk.id]; delete L[bk.id]; delete S[bk.id]; return { ok: false, msg: 'Kalshi did not accept that key. Check it is locked to this subaccount and has trading access.' }; }
      await kv.put('kbk:' + bk.id, await seal({ id, pem })); list.push(bk); await saveList();
      return { ok: true, msg: `${name} is linked to subaccount ${sub}. Cash there: $${bal.toFixed(2)}.`, id: bk.id };
    }
    // MC 2026-11-15 Steven: when a live setting changes on the main account, ask whether to carry it to every subaccount, then
    // update them all. The rule settings (coins, price band, schedule, window cap, profit target, price room) were already
    // shared: every book reads live's. What each book keeps for itself is its playbook, $ a trade, daily loss cap and cash
    // floor. 'match' copies the first three from the main live account to every book. The cash floor stays each book's own: it
    // depends on the money in that account, and the main account's floor on a small subaccount would stop it trading. With dry
    // it only lists what would change. It never switches a book on or off and never moves money.
    if (op === 'match') {
      const m = a.main || {}, out = [];
      for (const k of list) { const ch = [];
        if (m.strat && labIds.includes(m.strat) && D.stratAt(k.strat, Date.now()) !== m.strat) { ch.push(`playbook ${D.labName(m.strat)}`); if (!a.dry) k.strat = [...(k.strat || []), { at: Date.now(), id: m.strat, by: 'match' }].slice(-60); }
        if (isFinite(+m.size)) { const v = Math.min(BOOK_MAX, Math.max(BOOK_MIN, Math.round(+m.size))); if (v !== k.size) { ch.push(`$${k.size} -> $${v} a trade`); if (!a.dry) k.size = v; } }
        if (isFinite(+m.loss)) { const v = Math.min(1000, Math.max(10, Math.round(+m.loss))); if (v !== k.loss) { ch.push(`daily loss cap $${k.loss} -> $${v}`); if (!a.dry) k.loss = v; } }
        if (ch.length) out.push({ name: k.name, ch }); }
      if (a.dry) return { ok: true, dry: 1, books: list.length, changes: out };
      if (!out.length) return { ok: false, msg: list.length ? 'Every book already matches the main account.' : 'There are no books yet.' };
      await saveList(); D.say(`BOOKS matched to main: ${out.map(o => `${o.name} (${o.ch.join(', ')})`).join('; ')}`);
      return { ok: true, msg: `${out.length} book${out.length === 1 ? '' : 's'} now match${out.length === 1 ? 'es' : ''} the main account.` };
    }
    if (!b) return { ok: false, msg: 'No such book.' };
    if (op === 'follow') { if (!b.cfg) return { ok: false, msg: `${b.name} already follows the main account.` }; delete b.cfg; await saveList(); D.say(`BOOK ${b.name} follows the main account's live rules again`); return { ok: true, msg: `${b.name} follows the main account's live rules again, from the next trade check.` }; }
    if (op === 'set') {
      const ch = [];
      if (a.name != null) { const n = nm(a.name); if (n && n !== b.name) { if (list.some(x => x !== b && x.name.toLowerCase() === n.toLowerCase())) return { ok: false, msg: 'There is already a book with that name.' }; ch.push(`renamed to ${n}`); b.name = n; } }
      if (a.size != null && isFinite(+a.size)) { const v = Math.min(BOOK_MAX, Math.max(BOOK_MIN, Math.round(+a.size))); if (v !== b.size) { ch.push(`$${b.size} -> $${v} a trade`); b.size = v; } }
      if (a.loss != null && isFinite(+a.loss)) { const v = Math.min(1000, Math.max(10, Math.round(+a.loss))); if (v !== b.loss) { ch.push(`daily loss cap $${v}`); b.loss = v; } }
      if (a.floor != null && isFinite(+a.floor)) { const v = Math.min(100000, Math.max(0, Math.round(+a.floor))); if (v !== b.floor) { ch.push(`cash floor $${v}`); b.floor = v; } }
      if (a.on === true || a.on === false) { if (a.on && !(await kv.get('kbk:' + b.id))) return { ok: false, msg: 'This book has no key saved.' }; if (a.on !== b.on) { ch.push(a.on ? 'live ON' : 'live OFF'); b.on = a.on; if (a.on) b.onAt = Date.now(); } }
      if (a.strat != null) { const id = String(a.strat); if (!labIds.includes(id)) return { ok: false, msg: 'Unknown playbook.' }; if (D.stratAt(b.strat, Date.now()) !== id) { b.strat = [...(b.strat || []), { at: Date.now(), id, by: 'dashboard' }].slice(-60); ch.push(`playbook ${D.labName(id)}`); } }
      if (a.sellAll === true) { b.sellAt = Date.now(); ch.push('sell all open positions'); }
      if (!ch.length) return { ok: false, msg: 'Nothing changed.' };
      b.at = b.at || Date.now(); await saveList(); D.say(`BOOK ${b.name}: ${ch.join(', ')}`);
      if (a.sellAll === true) { b.sellDone = b.sellAt; await saveList(); try { await sellAll(b); } catch (e) { fail(b, 'sell-all error: ' + e.message); } }
      return { ok: true, msg: `${b.name}: ${ch.join(', ')}.` };
    }
    if (op === 'fund' || op === 'withdraw') {
      if (!D.mainKeys()) return { ok: false, msg: 'Money moves with the main Kalshi key, and it is not connected.' };
      let amt;
      if (op === 'withdraw') {
        // the book's money sits partly on the crypto shard; with nothing open, it is brought back to shard 0 (the book's own key)
        // first so all of it can move. While trades are open only shard 0 money moves.
        S[b.id].balAt = 0; await balance(b, true); const s = S[b.id], open = [...L[b.id].values()].some(x => x.fill > 0 && !x.result);
        const onX = s.shard[D.XI] ?? 0, want = a.amount === 'all' ? Infinity : +a.amount;
        if (!open && onX >= 0.01 && want > (s.shard[0] ?? 0) + 0.005) {
          const back = await breq(b, 'POST', '/portfolio/intra_exchange_instance_transfer', subXfer(b, Math.floor(onX * 100) * 100, D.XI, 0));
          if (!back?.ok) return { ok: false, msg: `Could not bring ${b.name}'s money back from the crypto shard: ${back?.status} ${errOf(back)}` };
          s.balAt = 0; await balance(b, true); }
        const free = s.shard[0] ?? 0; amt = Math.round((a.amount === 'all' ? free : Math.min(want, free + 0.005)) * 100);
        if (a.amount !== 'all' && want > free + 0.005) return { ok: false, msg: `Only $${free.toFixed(2)} is free to move out${open ? ' while trades are open' : ''}.` };
      } else amt = Math.round(+a.amount * 100);
      // MC 2026-11-15 moving $250 into a book was refused with "insufficient balance" while the main account showed $621. The
      // subaccount transfer only takes money from the main account's shard 0, and live keeps about twelve trades' worth on the
      // crypto shard, so shard 0 held about $21. When shard 0 is short, the shortfall is brought back from the crypto shard
      // first (the main account tops its crypto shard up again from what is left at the next trade check). If both together are
      // short, it says how much is there.
      if (op === 'fund' && amt >= 100 && D.mainShards) { const sh = await D.mainShards(), free = sh?.[0] ?? 0, onX = sh?.[D.XI] ?? 0, need = amt / 100;
        if (sh && need > free + 0.005) {
          if (need > free + onX + 0.005) return { ok: false, msg: `The main account has $${(free + onX).toFixed(2)} in cash that can move right now, less than $${need.toFixed(2)}.` };
          const mv = Math.ceil((need - free) * 100), back = await D.mainReq('POST', '/portfolio/intra_exchange_instance_transfer', { source: 'event_contract', destination: 'event_contract', amount: mv * 100, source_exchange_shard: D.XI, destination_exchange_shard: 0, client_transfer_id: crypto.randomUUID() });
          if (!back?.ok) return { ok: false, msg: `Could not bring $${(mv / 100).toFixed(2)} back from the main account's crypto shard: ${errOf(back)} (code ${back?.status})` };
          D.say(`LIVE moved $${(mv / 100).toFixed(2)} back from the crypto shard for a transfer to ${b.name}`);
          // MC 2026-11-15 the first version sent the subaccount transfer straight after and was still refused on the real account
          // (only "400" came back to the owner). The move between shards may not show on shard 0 at once, so wait for it, up to
          // about 8 seconds, and say so plainly if it has not landed.
          let landed = false; for (let i = 0; i < 6 && !landed; i++) { await new Promise(z => setTimeout(z, i ? 1500 : 600)); const s2 = await D.mainShards(); landed = !!s2 && (s2[0] ?? 0) >= need - 0.005; }
          if (!landed) return { ok: false, msg: `$${(mv / 100).toFixed(2)} was moved back from the crypto trading balance, but Kalshi is not showing it on the main balance yet. Wait a minute and try the move again.` }; } }
      if (!(amt >= 100)) return { ok: false, msg: op === 'withdraw' && a.amount === 'all' ? 'There is less than $1 to move out.' : 'Move at least $1.' }; if (amt > 10000000) return { ok: false, msg: 'That is more than this screen moves at once.' };
      const res = await D.mainReq('POST', '/portfolio/subaccounts/transfer', { client_transfer_id: crypto.randomUUID(), from_subaccount: op === 'fund' ? 0 : b.sub, to_subaccount: op === 'fund' ? b.sub : 0, amount_cents: amt });
      if (!res?.ok) { let seen = ''; if (op === 'fund' && D.mainShards) { try { const s3 = await D.mainShards(); if (s3) seen = ` Kalshi shows $${(s3[0] ?? 0).toFixed(2)} on the main balance and $${(s3[D.XI] ?? 0).toFixed(2)} on crypto trading.`; } catch { } }
        D.say(`BOOK ${b.name}: transfer of $${(amt / 100).toFixed(2)} refused: ${res?.status} ${errOf(res)}${seen}`); return { ok: false, msg: `Kalshi refused the transfer: ${errOf(res)} (code ${res?.status}).${seen}` }; }
      S[b.id].balAt = 0; try { await balance(b, true); } catch { } if (D.mainShards) try { await D.mainShards(); } catch { }
      D.say(`BOOK ${b.name}: ${op === 'fund' ? 'moved in' : 'moved out'} $${(amt / 100).toFixed(2)}`);
      return { ok: true, msg: `$${(amt / 100).toFixed(2)} moved ${op === 'fund' ? `from the main account to ${b.name}` : `from ${b.name} back to the main account`}.` };
    }
    if (op === 'remove') {
      if (b.on) return { ok: false, msg: 'Turn the book off first.' };
      if ([...L[b.id].values()].some(x => x.fill > 0 && !x.result)) return { ok: false, msg: 'This book still has open trades. Remove it after they settle.' };
      S[b.id].balAt = 0; await balance(b, true); const left = S[b.id].bal ?? 0;
      if (left >= 1 && !a.keepMoney) return { ok: false, msg: `${b.name} still holds $${left.toFixed(2)}. Move it out to the main account first.` };
      list = list.filter(x => x !== b); await saveList(); await kv.delete('kbk:' + b.id); delete K[b.id];
      sql.exec('DELETE FROM kb WHERE bid = ?', b.id); delete L[b.id]; delete S[b.id];
      D.say(`BOOK removed ${b.name} (subaccount ${b.sub})`);
      return { ok: true, msg: `${b.name} is removed from the dashboard.${left > 0.005 ? ` $${left.toFixed(2)} is still in subaccount ${b.sub} on Kalshi; add or link a book on it to move it back.` : ''} Its key still exists on Kalshi; you can delete it there.` };
    }
    return { ok: false, msg: 'Unknown book request.' };
  }
  const anyOn = () => !!list?.some(b => b.on);
  // the engine checks and bounds the values (the same checks as the main account's live rules) before handing them over
  async function setCfg(id, cfg, note) { await load(); const b = list.find(x => x.id === id); if (!b) return false; b.cfg = cfg; await saveList(); D.say(`BOOK ${b.name} own live rules: ${note}`); return true; }
  const get = id => (list || []).find(x => x.id === id) || null;
  // coins the books with their own rules trade (null = every coin), so the trade check reads them
  const ownCoins = () => { const o = (list || []).filter(b => b.on && b.cfg); if (!o.length) return []; if (o.some(b => !b.cfg.coins?.length)) return null; return [...new Set(o.flatMap(b => b.cfg.coins))]; };
  // positions past their close that still have no result, for the engine's settle pass
  // rows for one market across the books, every row (for the engine's target backfill), and saving a row the engine changed
  const rowsOf = tk => (list || []).map(b => L[b.id]?.get(tk)).filter(Boolean);
  const allRows = () => (list || []).flatMap(b => [...(L[b.id]?.values() || [])]);
  const nameOf = x => { for (const b of list || []) if (L[b.id]?.get(x.tk) === x) return b.name; return 'Book'; };
  const saveAny = x => { for (const b of list || []) if (L[b.id]?.get(x.tk) === x) { saveRow(b, x); return; } };
  const dueTks = now => { const o = []; for (const b of list || []) for (const x of L[b.id]?.values() || []) if (x.fill > 0 && !x.result && x.close <= now && x.close > now - 86400000 && !(x.sold && !x.sold.cash)) o.push(x.tk); return o; };
  return { load, onMark, onLate, lateOpen, onSettle, upkeep, afterSettle, view, command, anyOn, warm, cashOut, setCfg, get, ownCoins, handList, heldList, handBuy, handSell, dueTks, rowsOf, allRows, saveAny, nameOf };
}
