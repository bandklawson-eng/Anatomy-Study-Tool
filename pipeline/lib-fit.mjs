// Affine ICP: finds A (3x4) so that A·src ≈ dst surfaces.
function sub(pos, n) {
  const step = Math.max(1, Math.floor(pos.length / 3 / n));
  const out = [];
  for (let i = 0; i < pos.length / 3; i += step) out.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
  return out;
}
export const apply = (A, p) => [
  A[0] * p[0] + A[1] * p[1] + A[2] * p[2] + A[3],
  A[4] * p[0] + A[5] * p[1] + A[6] * p[2] + A[7],
  A[8] * p[0] + A[9] * p[1] + A[10] * p[2] + A[11],
];
function nearest(pts, q) {
  let best = Infinity, bi = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
    if (d < best) { best = d; bi = i; }
  }
  return [bi, best];
}
function solve(M, b) {
  // Gaussian elimination, M n×n
  const n = b.length;
  const a = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c] / a[c][c]; for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k]; }
  }
  return a.map((r, i) => r[n] / r[i]);
}
/** pairs: [[src, dst]] -> affine, with a pull toward `prior` (weight lambda) to keep it well-behaved */
function fitAffine(pairs, prior, lambda) {
  const A = [];
  for (let row = 0; row < 3; row++) {
    const M = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], b = [0, 0, 0, 0];
    for (const [s, d] of pairs) {
      const x = [s[0], s[1], s[2], 1];
      for (let i = 0; i < 4; i++) { b[i] += x[i] * d[row]; for (let j = 0; j < 4; j++) M[i][j] += x[i] * x[j]; }
    }
    // regularise toward the prior's linear part
    for (let i = 0; i < 3; i++) { M[i][i] += lambda; b[i] += lambda * prior[row * 4 + i]; }
    A.push(...solve(M, b));
  }
  return A;
}
export function icpAffine(srcPos, dstPos, A0, { n = 2500, iters = 30, lambda = 0.05, log = false } = {}) {
  const S = sub(srcPos, n), D = sub(dstPos, n);
  let A = A0.slice();
  let rms = 0;
  for (let it = 0; it < iters; it++) {
    const T = S.map((p) => apply(A, p));
    const pairs = [];
    let err = 0;
    for (let i = 0; i < S.length; i++) { const [j, d] = nearest(D, T[i]); pairs.push([S[i], D[j]]); err += d; }
    for (let j = 0; j < D.length; j++) { const [i, d] = nearest(T, D[j]); pairs.push([S[i], D[j]]); err += d; }
    rms = Math.sqrt(err / pairs.length);
    if (log) console.log(`  icp ${it} rms ${(rms * 1000).toFixed(1)} mm`);
    A = fitAffine(pairs, A0, lambda * pairs.length * 1e-3);
  }
  return { A, rms };
}
