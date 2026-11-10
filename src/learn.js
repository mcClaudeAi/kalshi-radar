// MC 2026-11-10 the self-learning model. One small logistic regression that starts from "Kalshi's price is right" and learns
// only how far, and in which situations, that has been wrong. The same code runs in the cloud tracker (refit once a day on
// every settled trade) and in the research scripts (the four-month backfill), so a number on the dashboard and a number in a
// backtest can never drift apart. Kept deliberately small: with a 94% base rate there are only a few hundred losses to learn
// from, and anything bigger memorises them. Tried and dropped: hour of day and per-coin terms (noise on the walk-forward).
export const LEARN_F = ['bias', 'margin', 'drift', 'heat', 'same', 'price'];
export const LEARN_NAME = { bias: 'Overall lean', margin: 'Margin past the target', drift: 'Price moving against us', heat: 'Volatility picking up', same: 'Coins on the same side', price: 'Kalshi price' };
const clip = (v, a, b) => Math.max(a, Math.min(b, v));
export const logit = p => Math.log(p / (1 - p)), sig = v => 1 / (1 + Math.exp(-v));
// readings at the trade check -> feature row, or null when the 10-minute reading is missing. All roughly unit scale.
export function feats(t) {
  if (t.z10 == null || !(t.px > 0 && t.px < 1)) return null;
  const s10 = t.s10 > 0 ? t.s10 : null;
  return [1,
    clip(t.z10, 0, 6) - 2.5,
    s10 && t.drift != null ? clip(Math.min(0, t.drift) / s10, -2, 0) : 0,
    t.s15 > 0 && t.s1 > 0 ? clip(Math.log(t.s15 / t.s1), -1, 1) : 0,
    ((t.same ?? 5) - 5) / 2,
    (clip(t.px, 0.85, 0.99) - 0.93) * 20];
}
// rows: [{x, o (market logit), y (1 won, 0 lost)}]. Ridge pulls every weight toward zero, which is "the market is right".
export function fit(rows, lam = 20) {
  const k = LEARN_F.length, w = new Array(k).fill(0);
  for (let it = 0; it < 25; it++) {
    const g = new Array(k).fill(0), H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (const r of rows) { const p = sig(r.o + r.x.reduce((a, v, i) => a + v * w[i], 0)), e = r.y - p, v = p * (1 - p); for (let i = 0; i < k; i++) { g[i] += e * r.x[i]; for (let j = 0; j <= i; j++) H[i][j] += v * r.x[i] * r.x[j]; } }
    for (let i = 0; i < k; i++) { g[i] -= lam * w[i]; H[i][i] += lam; for (let j = 0; j < i; j++) H[j][i] = H[i][j]; }
    const d = solve(H, g); if (!d) break; let mx = 0; for (let i = 0; i < k; i++) { w[i] += d[i]; mx = Math.max(mx, Math.abs(d[i])); } if (mx < 1e-6) break;
  }
  return w.map(v => +v.toFixed(4));
}
export const predict = (w, x, o) => sig(o + x.reduce((a, v, i) => a + v * w[i], 0));
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; } }
  return M.map((r, i) => r[n] / r[i]);
}
