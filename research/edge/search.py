# Edge search: looks for a playbook that beats the reference rule, or a new one that adds money alongside it, on the last 90
# days of 15-minute crypto markets. Usage: python3 search.py DATA_BRANCH_DIR [daily|deep]
#
# How it guards against luck (every rule tried is a chance to fool ourselves):
#  - The 90 days are split. The first 60 pick the candidates, the last 30 (the holdout) judge them and are never used to pick.
#  - A candidate has to make money in every 20-day stretch of the first 60, not just on the total.
#  - Only the top few go to the holdout, and the holdout test is a day-by-day bootstrap corrected for how many went (Holm).
#  - "Better" means beating the reference rule on the same holdout days, paired day by day, by at least $1 a day and 10%.
#  - "New" means the trades the reference rule does not take make money on their own in the holdout.
# Prices are the quoted ask at that minute, $20 a trade, Kalshi's fee, at most 4 trades a window.
import sys, os, glob, gzip, json, math, hashlib, datetime, collections
import numpy as np

ROOT = sys.argv[1]; MODE = sys.argv[2] if len(sys.argv) > 2 else 'daily'
DATA = os.path.join(ROOT, 'data'); OUT = os.path.join(ROOT, 'edges'); os.makedirs(OUT, exist_ok=True)
SIZE, CAP, DAYS, HOLD, BLOCK = 20.0, 4, 90, 30, 20
ET = datetime.timezone(datetime.timedelta(hours=-5))
COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'HYPE', 'ZEC', 'NEAR']
QS = list(range(2, 13))   # minutes after the open held in the data; 5 is the trade check
# The reference rule: Claude's pick, later watched, as Mitchell runs it (Nov 19): trade check 90 to under 95c, cushion 1.2+,
# dip above -2, straightness under 0.7; later buys 8 to 4 minutes left at cushion 1.75+, margin 0.2, crowd rule on.
BASE = dict(q=5, lo=0.90, hi=0.95, z=1.2, dp=-2.0, r2=0.7, side='both', late=dict(z=1.75, m=0.2, crowd=True))
try:
    o = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'baseline.json'))); BASE.update(o)
except Exception: pass

# ---------- data ----------
rows = []
for f in sorted(glob.glob(os.path.join(DATA, '*.jsonl.gz'))):
    with gzip.open(f, 'rt') as g:
        for line in g:
            try: rows.append(json.loads(line))
            except Exception: pass
etday = lambda cm: datetime.datetime.fromtimestamp(cm * 60, ET).date()
today = datetime.datetime.now(ET).date()
alld = sorted({etday(r[1]) for r in rows if etday(r[1]) < today})
days = alld[-DAYS:]
if len(days) < 45: print('not enough days yet:', len(days)); sys.exit(0)
dset = {d: i for i, d in enumerate(days)}
rows = [r for r in rows if etday(r[1]) in dset]
N, J = len(rows), len(QS)
coin = np.array([COINS.index(r[0]) if r[0] in COINS else -1 for r in rows]); cm = np.array([r[1] for r in rows]); yes = np.array([r[2] for r in rows], bool)
tick = [r[3] for r in rows]; day = np.array([dset[etday(r[1])] for r in rows]); ND = len(days)
X = np.zeros((N, J, 6), float); V = np.zeros((N, J), bool)
for i, r in enumerate(rows):
    for j, m in enumerate(r[4][:J]):
        if m: X[i, j] = m; V[i, j] = True
ya, yb, zY, dY, dN, r2 = (X[:, :, k] for k in range(6))
L = ya >= 1000 - yb                                   # the leader at each minute, as the tracker picks it
A = np.where(L, ya, 1000 - yb) / 1000                 # the leader's ask
Z = np.where(L, zY, -zY) / 100; DP = np.where(L, dY, dN) / 100; R2 = r2 / 100
WON = (L == yes[:, None])
_, win = np.unique(cm, return_inverse=True)
# crowd: the average cushion of the other coins leading the same way in the same window at the same minute (asks 80c and up)
CZ = np.zeros((N, J))
for j in range(J):
    ok = V[:, j] & (A[:, j] >= 0.8)
    for s in (True, False):
        m = ok & (L[:, j] == s); S = np.bincount(win[m], Z[m, j], minlength=win.max() + 1); C = np.bincount(win[m], minlength=win.max() + 1)
        sel = V[:, j] & (L[:, j] == s); own = m[sel]
        tot = S[win[sel]] - np.where(own, Z[sel, j], 0); cnt = C[win[sel]] - own
        CZ[np.where(sel)[0], j] = np.where(cnt > 0, tot / np.maximum(cnt, 1), 0)

def fee(n, p): return np.ceil(0.07 * n * p * (1 - p) * 100 - 1e-9) / 100
def pnl(p, w):
    n = np.floor(SIZE / p); c = n * p + fee(n, p); return np.where(w, n - c, -c)
PNL = np.where(V, pnl(np.clip(A, 0.01, 0.99), WON), 0.0)
jq = lambda q: QS.index(q)
J5 = jq(5); LATEJ = [jq(q) for q in range(7, 12)]       # later buys: 8 to 4 minutes left
cpk = lambda j: V[:, j] & (A[:, j] >= 0.90) & (A[:, j] < 0.95 - 1e-9) & (Z[:, j] >= 1) & (DP[:, j] > -2) & (R2[:, j] < 0.7)
BASE5 = cpk(J5)
hold0 = ND - HOLD; disc = np.arange(ND) < hold0

def chk_mask(s):
    j = jq(s['q']); m = V[:, j] & (A[:, j] >= s['lo'] - 1e-9) & (A[:, j] < s['hi'] - 1e-9) & (Z[:, j] >= s['z'] - 1e-9) & (DP[:, j] > s['dp']) & (R2[:, j] < s['r2'])
    if s['side'] == 'yes': m &= L[:, j]
    elif s['side'] == 'no': m &= ~L[:, j]
    return m

def late_pick(lt, excl):
    # the first later minute that passes Claude's pick and the later settings, for markets the check did not take
    got = np.full(N, -1); left = ~excl & ~BASE5
    for j in LATEJ:
        m = left & cpk(j) & (Z[:, j] >= lt['z'] - 1e-9) & (Z[:, j] >= 1 + lt['m'] - 1e-9) & (DP[:, j] > -2 + lt['m']) & (R2[:, j] < 0.7 - lt['m'])
        if lt['crowd']: m &= ~(CZ[:, j] > 1.5)
        got[m] = j; left &= ~m
    return got

def trades(s):
    """every trade the spec takes, after the 4-a-window cap: arrays of market index, minute index, pnl"""
    c = chk_mask(s); j0 = jq(s['q'])
    idx = list(np.where(c)[0]); J_ = [j0] * len(idx); key = [(0, -Z[i, j0]) for i in idx]
    if s.get('late') and s['q'] == 5:
        g = late_pick(s['late'], c); li = np.where(g >= 0)[0]
        idx += list(li); J_ += list(g[li]); key += [(1 + g[i], -Z[i, g[i]]) for i in li]
    if not idx: return np.array([], int), np.array([], int), np.array([])
    idx = np.array(idx); J_ = np.array(J_)
    order = sorted(range(len(idx)), key=lambda k: (win[idx[k]], key[k]))
    keep, cnt = [], collections.Counter()
    for k in order:
        w = win[idx[k]]
        if cnt[w] < CAP: cnt[w] += 1; keep.append(k)
    keep = np.array(keep); I, JJ = idx[keep], J_[keep]
    return I, JJ, PNL[I, JJ]

def daily(I, P): return np.bincount(day[I], P, minlength=ND)

def stats(I, JJ, P, sel=None):
    d = daily(I, P); m = np.ones(ND, bool) if sel is None else sel; keep = m[day[I]]
    n = int(keep.sum()); w = int(WON[I[keep], JJ[keep]].sum()) if n else 0; ap = float(A[I[keep], JJ[keep]].mean()) if n else 0
    dd = d[m]; eq = np.cumsum(dd)
    return dict(days=int(m.sum()), n=n, perDay=round(n / max(1, m.sum()), 1), won=round(100 * w / n, 1) if n else None, paid=round(100 * ap, 1) if n else None,
                edge=round(100 * (w / n - ap), 1) if n else None, usdDay=round(float(dd.mean()), 2), green=round(100 * float((dd > 0).mean()), 0),
                worst=round(float(dd.min()), 0), drop=round(float(np.max(np.maximum.accumulate(eq) - eq)) if len(eq) else 0, 0))

def boot_p(x, n=4000, seed=7):
    # chance the true daily mean is 0 or less, resampling whole days
    if len(x) < 5: return 1.0
    r = np.random.default_rng(seed); s = r.choice(x, (n, len(x))).mean(1); return float((s <= 0).mean())

def holm(ps):
    o = np.argsort(ps); m = len(ps); adj = np.empty(m); run = 0
    for k, i in enumerate(o): run = max(run, (m - k) * ps[i]); adj[i] = min(1, run)
    return adj

def sid(s): return hashlib.sha1(json.dumps(s, sort_keys=True).encode()).hexdigest()[:10]
def c_(x): return f'{round(x * 100)}¢'
def label(s):
    t = (f"Claude's pick at the trade check" if s['q'] == 5 else f"Claude's pick's test at minute {s['q']} ({15 - s['q']} min left)")
    t += f": {c_(s['lo'])} to under {c_(s['hi'])}, cushion {s['z']:g}+"
    if s['dp'] > -50: t += f", dip above {s['dp']:g}"
    if s['r2'] < 1: t += f", straightness under {s['r2']:g}"
    if s['side'] != 'both': t += f", {s['side'].upper()} only"
    if s.get('late'): lt = s['late']; t += f"; later buys at cushion {lt['z']:g}+, margin {lt['m']:g}, crowd rule {'on' if lt['crowd'] else 'off'}"
    return t

# ---------- the grid ----------
deep = MODE == 'deep'
grid = []
LO = [0.85, 0.88, 0.90, 0.92] if deep else [0.88, 0.90, 0.92]
HI = [0.93, 0.95, 0.97, 0.99] if deep else [0.95, 0.97]
ZB = [0.8, 1, 1.2, 1.35, 1.5, 1.75, 2, 2.5] if deep else [1, 1.2, 1.5, 1.75, 2]
DPB = [-3, -2, -1.5, -1] if deep else [-2, -1.5]
R2B = [0.5, 0.7, 0.9, 1.01] if deep else [0.5, 0.7]
SIDE = ['both', 'yes', 'no'] if deep else ['both']
LATE = [None] + [dict(z=z, m=m, crowd=c) for z in ([1.25, 1.5, 1.75, 2, 2.5] if deep else [1.5, 1.75, 2]) for m in ([0, 0.1, 0.2, 0.3] if deep else [0, 0.2]) for c in ([True, False] if deep else [True])]
for lo in LO:
    for hi in HI:
        if hi <= lo + 0.02: continue
        for z in ZB:
            for dp in DPB:
                for r in R2B:
                    for sd in SIDE: grid.append(dict(q=5, lo=lo, hi=hi, z=z, dp=dp, r2=r, side=sd))
gridB = []
if deep:   # other minutes and other price bands: found ones need a playbook built before they can run
    for q in [2, 3, 4, 6, 7, 8, 9, 10, 11, 12]:
        for lo, hi in [(0.6, 0.7), (0.7, 0.8), (0.8, 0.85), (0.85, 0.9), (0.9, 0.95), (0.95, 0.99)]:
            for z in [0, 0.5, 1, 1.5, 2, 2.5]:
                for dp in [-99, -2, -1]:
                    for r in [1.01, 0.7]: gridB.append(dict(q=q, lo=lo, hi=hi, z=z, dp=dp, r2=r, side='both'))
    for lo, hi in [(0.6, 0.7), (0.7, 0.8), (0.8, 0.85)]:
        for z in [0, 0.5, 1, 1.5, 2]:
            for dp in [-99, -2, -1]:
                for r in [1.01, 0.7]: gridB.append(dict(q=5, lo=lo, hi=hi, z=z, dp=dp, r2=r, side='both'))

# fast screen: check part and later part scored apart (no cap), then the best go through the full replay
blocks = [np.arange(ND)[k * BLOCK:(k + 1) * BLOCK] for k in range(hold0 // BLOCK)]
def screen_chk(s):
    m = chk_mask(s); j = jq(s['q']); return np.bincount(day[m], PNL[m, j], minlength=ND), np.bincount(day[m], minlength=ND)
lateD = {}
for lt in LATE:
    if lt is None: lateD[None] = (np.zeros(ND), np.zeros(ND)); continue
    g = late_pick(lt, np.zeros(N, bool)); i = np.where(g >= 0)[0]
    lateD[json.dumps(lt, sort_keys=True)] = (np.bincount(day[i], PNL[i, g[i]], minlength=ND), np.bincount(day[i], minlength=ND))
cand = []
for s in [dict(g, _a=1) for g in grid] + gridB:
    a = s.pop('_a', 0); d0, n0 = screen_chk(s)
    for lt in (LATE if a else [None]):
        dl, nl = lateD[None if lt is None else json.dumps(lt, sort_keys=True)]
        d = d0 + dl; n = (n0 + nl)[disc].sum()
        if n < hold0: continue                                    # under 1 trade a day
        if any(d[b].sum() <= 0 for b in blocks): continue          # has to make money in every 20-day stretch
        cand.append((float(d[disc].mean()), dict(s, late=lt)))
tested = len(grid) * len(LATE) + len(gridB)
cand.sort(key=lambda x: -x[0]); TOP = 600 if deep else 300
print(f'{MODE}: {N} markets over {ND} days, {tested} rules tried, {len(cand)} kept by the screen')

bI, bJ, bP = trades(BASE); bD = daily(bI, bP); bset = set(bI.tolist())
hsel = ~disc
res = []
for _, s in cand[:TOP]:
    I, JJ, P = trades(s); d = daily(I, P)
    if any(d[b].sum() <= 0 for b in blocks): continue
    extra = np.array([i not in bset for i in I]); dx = daily(I[extra], P[extra]) if extra.any() else np.zeros(ND)
    res.append(dict(s=s, I=I, JJ=JJ, P=P, d=d, dx=dx, nx=int(extra.sum()), disc=float(d[disc].mean()), discx=float(dx[disc].mean())))
# drop near copies (the same days, nearly the same results)
def dedupe(lst, keyf, k):
    out = []
    for r in sorted(lst, key=keyf, reverse=True):
        if any(np.corrcoef(r['d'], o['d'])[0, 1] > 0.97 for o in out if r['d'].std() > 0 and o['d'].std() > 0): continue
        out.append(r)
        if len(out) >= k: break
    return out
bdisc = float(bD[disc].mean())
better = dedupe([r for r in res if r['disc'] > bdisc + 1], lambda r: r['disc'], 12)
newer = dedupe([r for r in res if r['nx'] >= hold0 and r['discx'] > 0.5 and all(r['dx'][b].sum() > 0 for b in blocks)], lambda r: r['discx'], 12)

found, near = [], []
bh = bD[hsel]
if better:
    ps = holm([boot_p(r['d'][hsel] - bh) for r in better])
    for r, p in zip(better, ps):
        h = stats(r['I'], r['JJ'], r['P'], hsel); hb = stats(bI, bJ, bP, hsel); up = h['usdDay'] - hb['usdDay']
        why = []
        if p >= 0.05: why.append(f'holdout gain could be luck (p {p:.2f})')
        if up < max(1, 0.1 * abs(hb['usdDay'])): why.append(f'holdout gain ${up:.2f} a day is too small')
        if h['green'] < hb['green'] - 3: why.append('fewer green days')
        if h['worst'] < 1.25 * hb['worst']: why.append('worse worst day')
        e = dict(id=sid(r['s']), kind='better', family='A' if r['s']['q'] == 5 else 'B', label=label(r['s']), spec=r['s'], p=round(float(p), 3),
                 hold=h, holdBase=hb, all=stats(r['I'], r['JJ'], r['P']), gain=round(up, 2))
        (near if why else found).append(dict(e, why=why) if why else e)
if newer:
    ps = holm([boot_p(r['dx'][hsel]) for r in newer])
    for r, p in zip(newer, ps):
        ex = np.array([i not in bset for i in r['I']]); I, JJ, P = r['I'][ex], r['JJ'][ex], r['P'][ex]
        h = stats(I, JJ, P, hsel); why = []
        if p >= 0.05: why.append(f'holdout result could be luck (p {p:.2f})')
        if h['n'] < HOLD: why.append('under 1 extra trade a day in the holdout')
        if h['usdDay'] <= 0.5: why.append('extra trades made under $0.50 a day in the holdout')
        e = dict(id=sid(r['s']) + 'x', kind='new', family='A' if r['s']['q'] == 5 else 'B', label=label(r['s']), spec=r['s'], p=round(float(p), 3),
                 hold=h, all=stats(I, JJ, P), overlap=round(100 * (1 - len(I) / max(1, len(r['I']))), 0))
        (near if why else found).append(dict(e, why=why) if why else e)

# the reference rule's own health, plus the whole market at the trade check (every leader 90 to 95c), last 7 and 30 days
last = lambda k: np.arange(ND) >= ND - k
allck = V[:, J5] & (A[:, J5] >= 0.9) & (A[:, J5] < 0.95); ai = np.where(allck)[0]; aj = np.full(len(ai), J5)
health = dict(rule={k: stats(bI, bJ, bP, last(n)) for k, n in (('d7', 7), ('d30', 30), ('d90', ND))},
              market={k: stats(ai, aj, PNL[ai, J5], last(n)) for k, n in (('d7', 7), ('d30', 30))})
found.sort(key=lambda e: (e['kind'] != 'better', -(e.get('gain') or e['hold']['usdDay'])))
near.sort(key=lambda e: e['p'])
out = dict(v=1, at=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'), mode=MODE, days=[str(days[0]), str(days[-1])], holdFrom=str(days[hold0]),
           markets=N, tested=tested, screened=len(cand), base=dict(spec=BASE, label=label(BASE), hold=stats(bI, bJ, bP, hsel)), health=health,
           found=found[:5], near=near[:3])
json.dump(out, open(os.path.join(OUT, 'latest.json'), 'w'), indent=1)
if deep: json.dump(out, open(os.path.join(OUT, 'deep.json'), 'w'), indent=1)
with open(os.path.join(OUT, 'history.jsonl'), 'a') as f: f.write(json.dumps(dict(at=out['at'], mode=MODE, tested=tested, found=[e['id'] for e in found], rule7=health['rule']['d7'], rule30=health['rule']['d30'])) + '\n')
# a short report for reading on GitHub
L_ = [f"# Edge search, {MODE}, {out['at'][:16].replace('T', ' ')} UTC", '', f"{N:,} markets, {days[0]} to {days[-1]}. Picked on the first {hold0} days, judged on the last {HOLD} (from {days[hold0]}). {tested:,} rules tried.", '',
      f"Reference rule: {label(BASE)}", '']
for k, n in (('d7', '7 days'), ('d30', '30 days'), ('d90', f'{ND} days')):
    s = health['rule'][k]; L_.append(f"- Last {n}: {s['n']} trades, won {s['won']}% at {s['paid']}c (edge {s['edge']:+}), ${s['usdDay']} a day at $20, {s['green']:.0f}% green days")
L_ += ['', '## Found' if found else '## Found: nothing that holds up this time', '']
for e in found[:5]:
    h = e['hold']; L_.append(f"- **{'Better than the reference' if e['kind'] == 'better' else 'New, alongside the reference'}** ({'can run as a Labs line' if e['family'] == 'A' else 'needs a playbook built'}): {e['label']}. Holdout: {h['n']} trades, won {h['won']}%, ${h['usdDay']} a day, {h['green']:.0f}% green (p {e['p']}).")
if near:
    L_ += ['', '## Closest that did not pass', '']
    for e in near[:5]: L_.append(f"- {e['label']}: {'; '.join(e['why'])}.")
open(os.path.join(OUT, 'report.md'), 'w').write('\n'.join(L_) + '\n')
print('\n'.join(L_))
