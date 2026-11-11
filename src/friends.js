// Friends, chat and shared dashboards between two copies of the dashboard.
//
// MC 2026-11-11 asked for a way to add Steven, talk to him on the dashboard and look at each other's dashboards. Each copy runs in
// its owner's own Cloudflare account, so there is no shared server: the two workers talk to each other directly.
//   - Pairing: one side makes an invite code (good for 24 hours, one use). It carries that dashboard's address and a random token.
//     The other side pastes it; its worker calls the first one's /f/join with the token, a pair id and a random 32-byte secret it
//     just made. Both sides keep the pair id and the secret; every call between them after that carries both, checked here.
//   - Chat: a message is kept on the sender's side and posted to the friend's /f/msg, which keeps its own copy and sends a push
//     notification to the owner's devices. A message that can't be delivered stays marked as not sent, with a retry.
//   - Sharing: each side decides for itself whether the friend may see its dashboard, and separately whether the live account
//     (Kalshi balance and live switch) is included. The friend's worker fetches /f/view on demand; nothing is copied or kept on
//     the friend's side. The view is the same read-only snapshot the owner's page shows, with the live part removed unless shared.
// Tried a token in the invite that the friend could use to read the dashboard straight from the page; dropped, because it put a
// reusable read key in a browser and gave no way to chat back. Kalshi keys, GitHub tokens and sign-in never leave either worker.

const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const same = (a, b) => { a = String(a || ''); b = String(b || ''); if (!a || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };
const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);
const okUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname.includes('.') && !/^[\d.]+$/.test(x.hostname) && !x.hostname.endsWith('.local') ? x.origin : null; } catch { return null; } };
const INV_MS = 24 * 3600000, MSG_MAX = 2000, KEEP = 400;
const rate = new Map();   // pair id -> [times], messages taken in the last minute (in memory; a restart only resets the count)

const getMe = async st => (await st.get('fme')) || { name: '' };
const getAll = async st => (await st.get('fl')) || {};
const putAll = (st, all) => st.put('fl', all);
const thread = async (st, id) => (await st.get('fm:' + id)) || [];
const pub = f => ({ id: f.id, name: f.alias || f.name || 'Friend', theirName: f.name || '', alias: f.alias || '', host: (() => { try { return new URL(f.url).host; } catch { return ''; } })(), share: !!f.share, live: !!f.live, tShare: !!f.tShare, tLive: !!f.tLive, at: f.at, last: f.last || null, lastText: f.lastText || '', unread: f.unread || 0, ok: f.ok !== false, gone: !!f.gone });

// the friend's worker, called with this pair's id and secret
async function peer(f, path, body) {
  const r = await fetch(f.url + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-fr-id': f.id, 'x-fr-key': f.sec }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(9000) });
  let j = null; try { j = await r.json(); } catch { }
  return { status: r.status, ok: r.ok && j?.ok !== false, j };
}

// what a friend may see: the read-only dashboard snapshot, with the live account taken out unless the owner shared it
function sanitize(viewStr, live) {
  let v; try { v = JSON.parse(viewStr || 'null'); } catch { v = null; } if (!v) return null;
  if (!live) { if (v.live) v.live = { ...v.live, live: { on: false, hidden: true } }; v.keys = false; }
  delete v.push;
  return v;
}

// ---------- the friend's worker calling this one: /f/* (no sign-in; the pair id and secret are the check) ----------
export async function friendsPeer(st, req, ctx) {
  const u = new URL(req.url), p = u.pathname, post = req.method === 'POST';
  const body = post ? await req.json().catch(() => ({})) : {};
  if (p === '/f/join' && post) {
    const fails = (await st.get('fjfail')) || { n: 0, at: 0 }; if (Date.now() - fails.at < 3600000 && fails.n >= 20) return J({ ok: false, msg: 'Too many tries. Ask for a new code in an hour.' }, 429);
    const inv = ((await st.get('finv')) || []).filter(x => x.exp > Date.now()), h = await sha(String(body.t || '')), i = inv.findIndex(x => same(x.h, h));
    const url = okUrl(body.url), id = clean(body.id, 40), sec = String(body.sec || '');
    if (i < 0 || !url || !/^[0-9a-f]{24,40}$/.test(id) || !/^[0-9a-f]{64}$/.test(sec)) { await st.put('fjfail', Date.now() - fails.at < 3600000 ? { n: fails.n + 1, at: fails.at } : { n: 1, at: Date.now() }); return J({ ok: false, msg: 'That invite code is not valid any more. Ask for a new one.' }, 403); }
    inv.splice(i, 1); await st.put('finv', inv);
    const all = await getAll(st); if (all[id]) return J({ ok: false, msg: 'Already connected.' }, 409);
    all[id] = { id, sec, url, name: clean(body.name, 40) || 'Friend', share: true, live: false, tShare: !!body.share, tLive: !!body.live, at: Date.now() };
    await putAll(st, all); const me = await getMe(st);
    await ctx.notify?.([{ kind: 'chat', title: 'New friend', body: `${all[id].name} is connected. You can chat, and you each choose what to share.`, tag: 'friend-' + id, url: '/#kchat' }]);
    return J({ ok: true, name: me.name || 'Friend', share: true, live: false });
  }
  const all = await getAll(st), f = all[req.headers.get('x-fr-id') || ''];
  if (!f || !same(f.sec, req.headers.get('x-fr-key'))) return J({ ok: false, msg: 'Not connected.' }, 401);
  if (p === '/f/msg' && post) {
    const t = Date.now(), r = (rate.get(f.id) || []).filter(x => t - x < 60000); if (r.length >= 40) return J({ ok: false, msg: 'Slow down.' }, 429); r.push(t); rate.set(f.id, r);
    const text = clean(body.text, MSG_MAX), mid = clean(body.mid, 40); if (!text || !mid) return J({ ok: false, msg: 'Empty message.' }, 400);
    const th = await thread(st, f.id); if (!th.some(m => m.m === mid)) { th.push({ m: mid, f: 0, t: text, at: t }); await st.put('fm:' + f.id, th.slice(-KEEP)); f.last = t; f.lastText = text.slice(0, 80); f.unread = (f.unread || 0) + 1; f.gone = false; await putAll(st, all);
      await ctx.notify?.([{ kind: 'chat', title: f.alias || f.name || 'Friend', body: text.slice(0, 160), tag: 'chat-' + f.id, url: '/#kchat:' + f.id }]); }
    return J({ ok: true });
  }
  if (p === '/f/meta' && post) { if (body.name) f.name = clean(body.name, 40); if ('share' in body) f.tShare = !!body.share; if ('live' in body) f.tLive = !!body.live; if ('read' in body) f.tRead = +body.read || 0; f.gone = false; await putAll(st, all); return J({ ok: true }); }
  if (p === '/f/bye' && post) { f.gone = true; f.tShare = false; f.tLive = false; await putAll(st, all); return J({ ok: true }); }
  if (p === '/f/view') { if (!f.share) return J({ ok: false, msg: 'Not shared.' }, 403); const v = sanitize(await ctx.view(), f.live); return J({ ok: true, kx: v, at: Date.now() }); }
  if (p === '/f/live') { if (!f.share) return J({ ok: false, msg: 'Not shared.' }, 403); let k; try { k = JSON.parse((await ctx.live()) || 'null'); } catch { k = null; } if (k && !f.live) k.live = { on: false, hidden: true }; return J({ ok: true, live: k }); }
  return J({ ok: false, msg: 'not found' }, 404);
}

// ---------- the owner's page: /api/friends* (behind the dashboard's own sign-in) ----------
export async function friendsOwner(st, req, body, ctx) {
  const u = new URL(req.url), p = u.pathname, post = req.method === 'POST', q = k => u.searchParams.get(k) || '';
  const all = await getAll(st), me = await getMe(st);
  const list = () => J({ ok: true, me: { name: me.name || '' }, friends: Object.values(all).map(pub).sort((a, b) => (b.last || b.at) - (a.last || a.at)) });
  if (p === '/api/friends' && !post) return list();
  if (p === '/api/friends/thread') { const f = all[q('id')]; if (!f) return J({ ok: false, msg: 'No such friend.' }, 404); const th = await thread(st, f.id), since = +q('since') || 0;
    if (q('read') === '1' && f.unread) { f.unread = 0; f.readAt = Date.now(); await putAll(st, all); peer(f, '/f/meta', { read: f.readAt }).catch(() => { }); }
    return J({ ok: true, friend: pub(f), tRead: f.tRead || 0, msgs: th.filter(m => m.at > since || m.s === 'failed').map(m => ({ m: m.m, me: !!m.f, t: m.t, at: m.at, s: m.s || null })) }); }
  if (p === '/api/friends/view' || p === '/api/friends/live') {
    const f = all[q('id')]; if (!f) return J({ ok: false, msg: 'No such friend.' }, 404);
    if (!f.tShare) return J({ ok: false, msg: `${f.alias || f.name} is not sharing their dashboard with you.` }, 403);
    let r; try { r = await peer(f, p === '/api/friends/view' ? '/f/view' : '/f/live'); } catch { return J({ ok: false, msg: `Could not reach ${f.alias || f.name}'s dashboard. Try again in a minute.` }, 502); }
    if (r.status === 403) { f.tShare = false; await putAll(st, all); return J({ ok: false, msg: `${f.alias || f.name} stopped sharing their dashboard.` }, 403); }
    if (!r.ok) return J({ ok: false, msg: `${f.alias || f.name}'s dashboard answered ${r.status}. They may need to update.` }, 502);
    if (p === '/api/friends/live') return J(r.j.live || null);
    return J({ lite: { at: r.j.at || Date.now(), copyOff: true, mode: 'paper', edition: 'kalshi', friend: { id: f.id, name: f.alias || f.name, live: !!f.tLive } }, heavy: null, kx: r.j.kx });
  }
  if (p !== '/api/friends' || !post) return J({ ok: false, msg: 'not found' }, 404);
  const op = body.op, f = all[body.id];
  const meta = async (g, o) => { try { await peer(g, '/f/meta', o); } catch { } };
  if (op === 'name') { const n = clean(body.name, 40); if (!n) return J({ ok: false, msg: 'Type a name.' }, 400); await st.put('fme', { ...me, name: n }); for (const g of Object.values(all)) if (!g.gone) await meta(g, { name: n }); return J({ ok: true, msg: 'Saved. Friends see this name.' }); }
  if (op === 'invite') {
    if (!me.name) return J({ ok: false, msg: 'Set the name your friends will see first.' }, 400);
    const t = rand(24), inv = ((await st.get('finv')) || []).filter(x => x.exp > Date.now()).slice(-4); inv.push({ h: await sha(t), exp: Date.now() + INV_MS }); await st.put('finv', inv);
    return J({ ok: true, code: 'KR1.' + b64u(JSON.stringify({ u: ctx.origin, t, n: me.name })), exp: Date.now() + INV_MS });
  }
  if (op === 'join') {
    if (!me.name) return J({ ok: false, msg: 'Set the name your friends will see first.' }, 400);
    let c; try { const s = String(body.code || '').trim(); if (!s.startsWith('KR1.')) throw 0; c = JSON.parse(unb64u(s.slice(4))); } catch { return J({ ok: false, msg: 'That does not look like an invite code. It starts with KR1.' }, 400); }
    const url = okUrl(c.u); if (!url || !c.t) return J({ ok: false, msg: 'That invite code is damaged. Copy it again.' }, 400);
    if (url === okUrl(ctx.origin)) return J({ ok: false, msg: 'That is your own invite code. Send it to your friend instead.' }, 400);
    if (Object.values(all).some(g => g.url === url && !g.gone)) return J({ ok: false, msg: 'You are already connected to that dashboard.' }, 409);
    const g = { id: rand(16), sec: rand(32), url, name: clean(c.n, 40) || 'Friend', share: true, live: false, at: Date.now() };
    let r; try { const x = await fetch(url + '/f/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: c.t, id: g.id, sec: g.sec, url: ctx.origin, name: me.name, share: true, live: false }), signal: AbortSignal.timeout(9000) }); r = { status: x.status, j: await x.json().catch(() => null) }; }
    catch { return J({ ok: false, msg: 'Could not reach your friend\'s dashboard. Check they are online and try again.' }, 502); }
    if (r.status === 404 && !r.j) return J({ ok: false, msg: 'Your friend\'s dashboard does not have friends yet. They need to update first.' }, 502);
    if (!r.j?.ok) return J({ ok: false, msg: r.j?.msg || `Their dashboard answered ${r.status}.` }, 400);
    g.name = clean(r.j.name, 40) || g.name; g.tShare = !!r.j.share; g.tLive = !!r.j.live;
    for (const [k, v] of Object.entries(all)) if (v.url === url && v.gone) delete all[k];
    all[g.id] = g; await putAll(st, all); return J({ ok: true, msg: `Connected with ${g.name}.`, id: g.id });
  }
  if (!f) return J({ ok: false, msg: 'No such friend.' }, 404);
  if (op === 'send' || op === 'retry') {
    if (f.gone) return J({ ok: false, msg: `${f.alias || f.name} removed this connection.` }, 410);
    const th = await thread(st, f.id); let m;
    if (op === 'retry') { m = th.find(x => x.m === body.m && x.f); if (!m) return J({ ok: false, msg: 'Message not found.' }, 404); }
    else { const text = clean(body.text, MSG_MAX); if (!text) return J({ ok: false, msg: 'Type a message.' }, 400); m = { m: rand(12), f: 1, t: text, at: Date.now() }; th.push(m); }
    let r = null; try { r = await peer(f, '/f/msg', { mid: m.m, text: m.t }); } catch { }
    m.s = r?.ok ? null : 'failed'; if (r?.status === 401) f.ok = false; else if (r?.ok) f.ok = true;
    f.last = m.at; f.lastText = m.t.slice(0, 80); await st.put('fm:' + f.id, th.slice(-KEEP)); await putAll(st, all);
    return J({ ok: !!r?.ok, msg: r?.ok ? 'Sent.' : r?.status === 401 ? `${f.alias || f.name}'s dashboard no longer knows this connection.` : 'Not delivered. Their dashboard could not be reached; tap to retry.', m: { m: m.m, me: true, t: m.t, at: m.at, s: m.s } });
  }
  if (op === 'share') { if ('share' in body) f.share = !!body.share; if ('live' in body) f.live = !!body.live; if (!f.share) f.live = false; await putAll(st, all); await meta(f, { share: f.share, live: f.live }); return J({ ok: true, msg: f.share ? (f.live ? `${f.alias || f.name} can see your dashboard, live account included.` : `${f.alias || f.name} can see your dashboard. Your live account stays private.`) : `${f.alias || f.name} can no longer see your dashboard.` }); }
  if (op === 'rename') { f.alias = clean(body.alias, 40); await putAll(st, all); return J({ ok: true }); }
  if (op === 'remove') { try { await peer(f, '/f/bye', {}); } catch { } delete all[f.id]; await putAll(st, all); await st.delete('fm:' + f.id); return J({ ok: true, msg: 'Removed. Chat history with them is deleted here.' }); }
  return J({ ok: false, msg: 'Unknown request.' }, 400);
}
