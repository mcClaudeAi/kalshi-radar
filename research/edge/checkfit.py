# MC 2026-11-22 the buy check's weights, refitted every night. Mitchell asked whether the check learned from each day's charts.
# It did not: its weights were worked out once and typed into the dashboard. A walk-forward test over Aug 21 to Nov 20 (fit on
# the days before, score the day after, last 47 days scored) had the frozen weights fall from +1.70c to +1.09c a contract on
# the buys rated +1c or better as they aged, and a nightly refit on the last 60 days hold +1.55c. 30 days was jumpy (weights
# moved three times as much night to night and it passed on too many buys), 90 was slower to follow and made less (+1.48c).
# The typed-in weights were not a plain fit though: the readings came from the long window and the price curve (how often an
# 85c or a 93c favourite wins, the constant and the lp weight) from the most recent 30 days, because favourites had been doing
# worse lately than before. Rolled nightly the same way, that beat the plain 60-day fit in the same test: +1.90c a contract
# against +1.57c, steady across both halves (+1.92c, +1.87c), 72% of days green, and +1.77c in the Mitch pick zone (85c to
# 96.5c, cushion 1 or more) against +1.25c frozen. A 14-day price curve was tried and swung too much (+1.45c one half, +2.71c
# the other); readings from 90 days were a touch better (+1.98c) but inside the noise, and Mitchell asked for 60.
# So: every night after the pull, readings from the last 60 days and the price curve from the last 30 are fitted again and
# written to edges/check.json, which the dashboards read. It is a rolling window: each night the oldest day drops off.
# The same model as before: win chance of the leader from its price (lp), cushion (z), spread, last window the same way (pv),
# deepest dip (dp) and minutes left (lf), a plain logistic fit with a light ridge. r is the usual reading at each price and b
# the last 30 days by price band, both shown on the check. No weight may move more than 10% a night from the one before (in
# the test this cost nothing and it stops one odd day from swinging real buys), and a fit that fails the sanity bounds is not
# written, so the dashboards keep the last good one. score is each new day rated by the weights that were live for it, beside
# the typed-in ones, so there is a running record of whether refitting is paying.
# Usage: python3 checkfit.py RD_DIR   (RD_DIR has data/YYYY-MM-DD.jsonl.gz and edges/)
import sys, os, glob, gzip, json, math, datetime
import numpy as np
RD = sys.argv[1]; WIN, BAND, CAP = 60, 30, 0.10
BASE = dict(c0=.2929, lp=.7726, z=.6225, spr=-.0336, pv=-.0535, dp=.0956, lf=-.0397)
KEYS = ['c0', 'lp', 'z', 'spr', 'pv', 'dp', 'lf']
def lead(m):
    if not m: return None
    ya, yb, z, dY, dN, r2 = m[:6]
    if ya >= 500: return ('yes', ya / 1000, z / 100, dY / 100, (ya - yb) / 10)
    return ('no', (1000 - yb) / 1000, -z / 100, dN / 100, (ya - yb) / 10)
def rows_of(files):
    W = {}
    for f in files:
        d = os.path.basename(f)[:10]
        with gzip.open(f, 'rt') as g:
            for l in g:
                try: c, cm, yw, tk, M = json.loads(l)
                except Exception: continue
                W.setdefault(cm, {})[c] = (yw, M, d)
    out = []
    for cm, cs in W.items():
        prev = W.get(cm - 15, {})
        for coin, (yw, M, d) in cs.items():
            pv = prev.get(coin)
            for qi in range(len(M)):
                L = lead(M[qi])
                if not L: continue
                side, p, z, dp, spr = L
                if not (0.80 <= p <= 0.97): continue
                up = side == 'yes'
                out.append((d, p, 1.0 if (yw == 1) == up else 0.0, min(3, max(-1, z)), min(5, max(0, spr)), 0.5 if not pv else (1.0 if (pv[0] == 1) == up else 0.0), min(0, max(-4, dp)), min(13, max(3, 15 - (qi + 2)))))
    return out
def fit(X, y, C=10.0):
    # logistic regression, ridge 1/C on the weights (not the constant), Newton steps
    A = np.c_[np.ones(len(X)), X]; b = np.zeros(A.shape[1]); R = np.eye(A.shape[1]) / C; R[0, 0] = 0
    for _ in range(60):
        p = 1 / (1 + np.exp(-A @ b)); g = A.T @ (p - y) + R @ b; H = (A * (p * (1 - p))[:, None]).T @ A + R; s = np.linalg.solve(H, g); b = b - s
        if np.abs(s).max() < 1e-9: break
    return b
def edge(m, T):
    L = m['c0'] + m['lp'] * T[:, 0] + m['z'] * T[:, 1] + m['spr'] * T[:, 2] + m['pv'] * T[:, 3] + m['dp'] * T[:, 4] + m['lf'] * T[:, 5]
    return L
files = sorted(glob.glob(os.path.join(RD, 'data', '*.jsonl.gz')))
today = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d'); files = [f for f in files if os.path.basename(f)[:10] < today]   # whole days only
use = files[-WIN:]
if len(use) < 40: print('check fit: only', len(use), 'days, not fitted'); sys.exit(0)
rows = rows_of(use); D = np.array([r[0] for r in rows]); N = np.array([r[1:] for r in rows], float)
p, won = N[:, 0], N[:, 1]; lp = np.log(p / (1 - p)); T = np.c_[lp, N[:, 2:]]; fee = 0.07 * p * (1 - p); real = (won - p - fee) * 100
if len(rows) < 80000: print('check fit: only', len(rows), 'rows, not fitted'); sys.exit(0)
out = os.path.join(RD, 'edges', 'check.json'); old = None
try: old = json.load(open(out))
except Exception: pass
# score the newest day with the weights that were live for it (the last file's, fitted before that day) and the typed-in ones
score = (old or {}).get('score', [])
if old and old.get('to') and old['to'] < os.path.basename(use[-1])[:10]:
    for d in sorted(set(D[D > old['to']])):
        k = D == d; row = {'d': d}
        for nm, m in (('live', old['m']), ('base', BASE)):
            e = (1 / (1 + np.exp(-edge(m, T[k]))) - p[k] - fee[k]) * 100; b = e >= 1; row[nm] = [int(b.sum()), round(float(real[k][b].sum()), 1)]
        score = [s for s in score if s['d'] != d] + [row]
score = sorted(score, key=lambda s: s['d'])[-60:]
b = fit(T, won); k30 = np.isin(D, sorted(set(D))[-BAND:])
p0 = fit(T[:, :1], won); pr = fit(T[k30][:, :1], won[k30]); b[0] += pr[0] - p0[0]; b[1] += pr[1] - p0[1]   # the price curve re-anchored on the last 30 days
m = dict(zip(KEYS, [float(x) for x in b]))
ok = all(math.isfinite(v) for v in m.values()) and 0.4 <= m['lp'] <= 1.3 and 0.2 <= m['z'] <= 1.2 and -0.5 <= m['c0'] <= 1.2 and abs(m['spr']) <= 0.3 and abs(m['pv']) <= 0.5 and abs(m['dp']) <= 0.5 and abs(m['lf']) <= 0.2
if not ok: print('check fit: outside the sanity bounds, not written', m); sys.exit(0)
raw = dict(m)
if old and old.get('m'):   # no more than 10% a night from the weights before (at least 0.005, so one near zero can still move)
    for k in KEYS: lim = max(CAP * abs(old['m'][k]), 0.005); m[k] = old['m'][k] + min(lim, max(-lim, m[k] - old['m'][k]))
lin = lambda v: [round(float(x), 4) for x in np.polyfit(lp, v, 1)[::-1]]
r = {'z': lin(T[:, 1]), 'spr': lin(T[:, 2]), 'pv': [round(float(T[:, 3].mean()), 4), 0], 'dp': lin(T[:, 4])}
bands = []
for lo, hi in ((80, 84), (85, 89), (90, 93), (94, 97)):
    c = np.round(p * 100); k = k30 & (c >= lo) & (c <= hi)
    if k.sum(): bands.append([lo, hi, int(k.sum()), round(float(won[k].mean() * 100), 1), round(float(p[k].mean() * 100), 1), round(float(real[k].mean()), 2)])
e = (1 / (1 + np.exp(-edge(m, T))) - p - fee) * 100
res = {'v': 1, 'at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'from': os.path.basename(use[0])[:10], 'to': os.path.basename(use[-1])[:10], 'days': len(use), 'curve': BAND, 'n': len(rows),
       'm': {k: round(v, 4) for k, v in m.items()}, 'raw': {k: round(v, 4) for k, v in raw.items()}, 'r': r, 'b': bands, 'buy': round(float((e >= 1).mean() * 100), 1), 'score': score}
os.makedirs(os.path.dirname(out), exist_ok=True); json.dump(res, open(out, 'w'), separators=(',', ':'))
print('check fit:', res['days'], 'days', res['from'], 'to', res['to'], res['n'], 'rows', res['m'], 'rates', res['buy'], '% a buy')
