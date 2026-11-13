// Profit vault: a Kalshi subaccount the tracker never trades from.
// MC 2026-11-13 asked for automatic and manual payouts to the bank. Kalshi's trading API has no withdrawal call for normal
// accounts (it only lists past deposits and withdrawals), so money cannot be sent to a bank from here. What the API can do is
// move cash between the account's own subaccounts with the main key. So profits are swept on a schedule into a vault
// subaccount that has no trading key and is never traded, and "Send to bank" brings an amount back to the main account, holds
// it there so live trading leaves it alone, and opens Kalshi to finish the withdrawal.
//   - Sweep rule, "share": a % of the period's realized live profit. With "make up losses" on, a losing period is carried and
//     the next profit pays it back before anything is swept. "above": everything over the keep amount.
//   - Both rules never take the main account under the keep amount, and a period with nothing to move just says why.
//   - Only the main live account is swept. Subaccount books keep their own money.
//   - Money on the crypto shard is brought back to shard 0 first, and only when no live trade is open (the 5 minutes between a
//     close and the next mark are enough), so an open position is never short.
//   - Turning it on and every manual move need a hold on the page, the same as the live switch.
const DAY = 86400000;
const errOf = r => r?.j?.error?.message || r?.j?.message || r?.j?.error || (typeof r?.t === 'string' ? r.t.slice(0, 120) : '') || '';

export function createVault(D) {
  const { kv, say } = D;
  let V = null;
  const DEF = { sub: null, made: null, on: false, when: 'weekly', dow: 5, mode: 'share', pct: 50, keep: 1000, carry: true, owed: 0, from: null, next: null, last: null, log: [], bal: null, balAt: 0, hold: null, wait: null };
  async function load() { if (!V) V = { ...DEF, ...((await kv.get('kvault')) || {}) }; return V; }
  const save = () => kv.put('kvault', V);
  const note = (kind, amt, why) => { V.last = { at: Date.now(), kind, amt: +(+amt || 0).toFixed(2), why }; V.log = [V.last, ...(V.log || [])].slice(0, 40); };

  // 00:05 Eastern on a given ET date, so the last window of the day (closes at midnight) has settled
  const at005 = ds => { const [y, m, d] = ds.split('-').map(Number), t = Date.UTC(y, m - 1, d, 5, 5); return D.etHour(t) === 1 ? t - 3600000 : t; };
  const addDay = (ds, n) => new Date(Date.parse(ds + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
  const dowOf = ds => new Date(ds + 'T12:00:00Z').getUTCDay();
  function nextAfter(ts, when = V.when, dow = V.dow) {
    const d0 = D.etDay(ts);
    for (let i = 0; i < 70; i++) { const ds = addDay(d0, i), t = at005(ds); if (t <= ts) continue;
      if (when === 'daily') return t;
      if (when === 'weekly' && dowOf(addDay(ds, -1)) === dow) return t;
      if (when === 'monthly' && ds.endsWith('-01')) return t; }
    return ts + 7 * DAY;
  }

  async function vaultBal(force) {
    if (!V.sub) return null; if (!force && Date.now() - V.balAt < 120000) return V.bal;
    const r = await D.mainReq('GET', `/portfolio/balance?subaccount=${V.sub}`);
    if (r?.ok) { const j = r.j || {}; V.bal = j.balance_dollars != null ? +j.balance_dollars : j.balance != null ? j.balance / 100 : null; V.balAt = Date.now(); }
    return V.bal;
  }
  // free cash on the main account's shard 0, after bringing crypto-shard money back when nothing is open
  async function free0(need) {
    const m = await D.mainBal(true); if (!m) return { ok: false, why: 'Kalshi did not return the balance.' };
    let s0 = m.shard[0] ?? 0; const sx = m.shard[D.XI] ?? 0;
    if (s0 + 0.005 < need && sx >= 0.01) {
      if (D.openLive()) return { ok: false, wait: true, why: 'a live trade is open; it moves once it settles' };
      const back = await D.mainReq('POST', '/portfolio/intra_exchange_instance_transfer', { source: 'event_contract', destination: 'event_contract', amount: Math.floor(sx * 100) * 100, source_exchange_shard: D.XI, destination_exchange_shard: 0, client_transfer_id: crypto.randomUUID() });
      if (!back?.ok) return { ok: false, why: `could not bring money back from the crypto shard: ${back?.status} ${errOf(back)}` };
      const m2 = await D.mainBal(true); s0 = m2?.shard?.[0] ?? s0 + sx;
    }
    return { ok: true, s0, total: m.bal };
  }
  async function move(fromSub, toSub, cents) {
    return D.mainReq('POST', '/portfolio/subaccounts/transfer', { client_transfer_id: crypto.randomUUID(), from_subaccount: fromSub, to_subaccount: toSub, amount_cents: cents });
  }
  const liveIn = (a, b) => D.liveTrades().filter(x => x.pnl != null && x.close >= a && x.close < b);
  const heldNow = () => V?.hold && V.hold.until > Date.now() ? V.hold.amt : 0;

  // what the scheduled sweep would move for the period [from, to), and why
  function plan(to, cash) {
    const xs = liveIn(V.from ?? 0, to), profit = +xs.reduce((a, x) => a + x.pnl, 0).toFixed(2), room = Math.max(0, cash - V.keep - heldNow());
    let amt = 0, owed = V.owed || 0, why;
    if (V.mode === 'above') { amt = room; why = amt >= 1 ? `everything over your $${V.keep} keep amount` : `the account is not over your $${V.keep} keep amount`; }
    else if (V.carry) {
      const net = profit - owed;
      if (net > 0) { amt = net * V.pct / 100; why = `${V.pct}% of ${owed > 0 ? `$${net.toFixed(2)} (this period's $${profit.toFixed(2)} after $${owed.toFixed(2)} of earlier losses)` : `this period's $${profit.toFixed(2)}`}`; owed = 0; }
      else { owed = +(owed - profit).toFixed(2); amt = 0; why = profit < 0 ? `the period lost $${(-profit).toFixed(2)}; ${owed > 0 ? `the next $${owed.toFixed(2)} of profit pays it back first` : 'nothing to move'}` : profit > 0 ? `this period's $${profit.toFixed(2)} went to earlier losses; $${owed.toFixed(2)} still to make back` : 'no settled live trades this period'; }
    } else { amt = profit > 0 ? profit * V.pct / 100 : 0; why = profit > 0 ? `${V.pct}% of this period's $${profit.toFixed(2)}` : profit < 0 ? `the period lost $${(-profit).toFixed(2)}, so nothing to move` : 'no settled live trades this period'; }
    if (amt > room) { why += amt >= 1 ? `; capped at $${room.toFixed(2)} so the account keeps $${V.keep}` : ''; amt = room; }
    amt = Math.floor(amt * 100) / 100;
    return { amt, why, profit, n: xs.length, owed };
  }

  async function upkeep(now) {
    await load(); if (!V.on || !V.sub || !D.mainKeys()) return;
    if (V.next == null) { V.next = nextAfter(now); V.from = V.from ?? now; await save(); return; }
    if (now < V.next) return;
    if (V.wait && now - V.wait < 60000) return;
    // trades from the period that have not settled yet hold the sweep back (up to an hour)
    const unsettled = D.liveTrades().some(x => x.fill > 0 && !x.result && x.close < V.next);
    if (unsettled && now - V.next < 3600000) return;
    const m = await D.mainBal(true); if (!m || m.bal == null) { V.wait = now; return; }
    const p = plan(V.next, m.bal), to = V.next;
    const done = async (amt, why) => { note('auto', amt, why); V.owed = p.owed; V.from = to; V.next = nextAfter(Math.max(now, to)); V.wait = null; await save(); D.viewDirty(); };
    if (p.amt < 1) { await done(0, `Nothing moved: ${p.why}.`); say(`VAULT nothing to move (${p.why})`); return; }
    const f = await free0(p.amt);
    if (!f.ok) { if (f.wait && now - to < 6 * 3600000) { V.wait = now; await save(); return; } await done(0, `Not moved: ${f.why}.`); D.fail?.(`vault sweep skipped: ${f.why}`); return; }
    const cents = Math.floor(Math.min(p.amt, f.s0) * 100);
    if (cents < 100) { await done(0, 'Nothing moved: under $1 free.'); return; }
    const r = await move(0, V.sub, cents);
    if (!r?.ok) { V.wait = now; await save(); D.fail?.(`vault sweep refused by Kalshi: ${r?.status} ${errOf(r)}`); if (now - to > 6 * 3600000) await done(0, `Not moved: Kalshi refused the transfer (${r?.status}).`); return; }
    V.balAt = 0; await vaultBal(true); await done(cents / 100, `Moved $${(cents / 100).toFixed(2)} to the vault: ${p.why}.`);
    say(`VAULT swept $${(cents / 100).toFixed(2)} (${p.why})`); D.notify?.({ title: 'Profit moved to the vault', body: `$${(cents / 100).toFixed(2)}, ${p.why}.`, url: '/#klive' });
  }

  function view() {
    if (!V) return null; const cash = D.mainCash();
    return { sub: V.sub, made: V.made, on: V.on, when: V.when, dow: V.dow, mode: V.mode, pct: V.pct, keep: V.keep, carry: V.carry, owed: V.owed, from: V.from, next: V.on ? V.next : null, last: V.last, log: (V.log || []).slice(0, 12), bal: V.bal, balAt: V.balAt, hold: heldNow() ? V.hold : null,
      preview: V.sub && cash != null ? (() => { const p = plan(Date.now(), cash); return { amt: p.amt, why: p.why, profit: p.profit, n: p.n }; })() : null };
  }

  async function command(a) {
    await load(); const op = a?.op, money = s => `$${(+s).toFixed(2)}`;
    if (!D.mainKeys()) return { ok: false, msg: 'Connect the main Kalshi key first. The vault moves money with it.' };
    if (op === 'make') {
      if (V.sub) return { ok: false, msg: `The vault is already subaccount ${V.sub}.` };
      const c = await D.mainReq('POST', '/portfolio/subaccounts', {});
      if (!c?.ok || !(c.j?.subaccount_number > 0)) return { ok: false, msg: `Kalshi would not create a subaccount: ${c?.status} ${errOf(c)}. Subaccounts need the Advanced API level (see Kalshi API level above).` };
      V.sub = c.j.subaccount_number; V.made = 'auto'; await save(); await vaultBal(true); say(`VAULT made on subaccount ${V.sub}`);
      return { ok: true, msg: `Your vault is subaccount ${V.sub}. It has no trading key, so nothing ever trades from it.` };
    }
    if (op === 'link') {
      const sub = Math.round(+a.sub); if (!(sub >= 1 && sub <= 63)) return { ok: false, msg: 'Subaccount numbers run from 1 to 63.' };
      if (D.bookSubs().includes(sub)) return { ok: false, msg: `Subaccount ${sub} is a live book. Use a subaccount nothing trades from.` };
      V.sub = sub; V.made = 'linked'; V.balAt = 0; const b = await vaultBal(true); if (b == null) { V.sub = null; return { ok: false, msg: `Kalshi did not return a balance for subaccount ${sub}.` }; }
      await save(); return { ok: true, msg: `Subaccount ${sub} is your vault. It holds ${money(b)}.` };
    }
    if (!V.sub) return { ok: false, msg: 'Make the vault first.' };
    if (op === 'set') {
      const ch = [];
      if (['daily', 'weekly', 'monthly'].includes(a.when) && a.when !== V.when) { V.when = a.when; ch.push(a.when); }
      if (a.dow != null && Number.isInteger(+a.dow) && +a.dow >= 0 && +a.dow <= 6 && +a.dow !== V.dow) { V.dow = +a.dow; ch.push('day ' + a.dow); }
      if (['share', 'above'].includes(a.mode) && a.mode !== V.mode) { V.mode = a.mode; ch.push(a.mode === 'share' ? 'share of profit' : 'everything over the keep amount'); }
      if (a.pct != null && isFinite(+a.pct)) { const v = Math.min(100, Math.max(5, Math.round(+a.pct))); if (v !== V.pct) { V.pct = v; ch.push(`${v}%`); } }
      if (a.keep != null && isFinite(+a.keep)) { const v = Math.min(1000000, Math.max(0, Math.round(+a.keep))); if (v !== V.keep) { V.keep = v; ch.push(`keep $${v}`); } }
      if (a.carry === true || a.carry === false) { if (a.carry !== V.carry) { V.carry = a.carry; if (!a.carry) V.owed = 0; ch.push(a.carry ? 'make up losses first' : 'losses not carried'); } }
      if (a.on === true || a.on === false) { if (a.on !== V.on) { V.on = a.on; ch.push(a.on ? 'automatic sweep ON' : 'automatic sweep OFF'); if (a.on) { V.from = Date.now(); V.owed = 0; } } }
      if (V.on && ch.length) V.next = nextAfter(Date.now());
      if (!ch.length) return { ok: false, msg: 'Nothing changed.' };
      await save(); say(`VAULT ${ch.join(', ')}`); D.viewDirty();
      return { ok: true, msg: V.on ? `Saved. Next sweep ${new Date(V.next).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET.` : 'Saved. Automatic sweeps are off.' };
    }
    if (op === 'in') {   // main -> vault, now
      const m = await D.mainBal(true); if (!m) return { ok: false, msg: 'Kalshi did not return the balance.' };
      const want = a.amount === 'over' ? Math.max(0, m.bal - V.keep - heldNow()) : +a.amount;
      if (!(want >= 1)) return { ok: false, msg: a.amount === 'over' ? `The account is not $1 over your $${V.keep} keep amount.` : 'Move at least $1.' };
      const f = await free0(want); if (!f.ok) return { ok: false, msg: `Not moved: ${f.why}.` };
      if (want > f.s0 + 0.005) return { ok: false, msg: `Only ${money(f.s0)} is free to move right now.` };
      const cents = Math.floor(want * 100), r = await move(0, V.sub, cents);
      if (!r?.ok) return { ok: false, msg: `Kalshi refused the transfer: ${r?.status} ${errOf(r)}` };
      V.balAt = 0; await vaultBal(true); note('in', cents / 100, 'Moved by hand.'); await save(); say(`VAULT moved in ${money(cents / 100)} by hand`); D.viewDirty();
      return { ok: true, msg: `${money(cents / 100)} moved to the vault.` };
    }
    if (op === 'out' || op === 'bank') {   // vault -> main; 'bank' also holds it for a withdrawal
      const b = await vaultBal(true); if (b == null) return { ok: false, msg: 'Kalshi did not return the vault balance.' };
      const want = a.amount === 'all' ? b : +a.amount; if (!(want >= 1)) return { ok: false, msg: 'Move at least $1.' };
      if (want > b + 0.005) return { ok: false, msg: `The vault holds ${money(b)}.` };
      const cents = Math.floor(want * 100), r = await move(V.sub, 0, cents);
      if (!r?.ok) return { ok: false, msg: `Kalshi refused the transfer: ${r?.status} ${errOf(r)}` };
      V.balAt = 0; await vaultBal(true);
      if (op === 'bank') { V.hold = { amt: +((heldNow() + cents / 100)).toFixed(2), at: Date.now(), until: Date.now() + 3 * DAY }; note('bank', cents / 100, 'Sent to the main account for a withdrawal; held from trading for 3 days.'); }
      else note('out', cents / 100, 'Moved back to the main account for trading.');
      await save(); say(`VAULT ${op === 'bank' ? 'to bank' : 'moved out'} ${money(cents / 100)}`); D.viewDirty();
      return { ok: true, msg: op === 'bank' ? `${money(cents / 100)} is on your main account and held from trading for 3 days. Finish the withdrawal in Kalshi.` : `${money(cents / 100)} moved back to the main account.` };
    }
    if (op === 'release') { if (!V.hold) return { ok: false, msg: 'Nothing is held.' }; V.hold = null; await save(); D.viewDirty(); return { ok: true, msg: 'Released. Live trading can use that money again.' }; }
    if (op === 'forget') {
      if (V.on) return { ok: false, msg: 'Turn automatic sweeps off first.' };
      const b = await vaultBal(true); if ((b ?? 0) >= 1) return { ok: false, msg: `The vault still holds ${money(b)}. Move it out first.` };
      const s = V.sub; V = { ...DEF }; await save(); D.viewDirty(); return { ok: true, msg: `Subaccount ${s} is no longer the vault.` };
    }
    return { ok: false, msg: 'Unknown vault request.' };
  }
  return { load, upkeep, view, command, vaultBal, held: heldNow, _t: { nextAfter, plan, V: () => V } };
}
