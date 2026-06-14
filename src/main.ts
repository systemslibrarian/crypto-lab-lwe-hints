/**
 * main.ts — DOM glue for crypto-lab-lwe-hints.
 *
 * No model math lives here: everything numeric comes from ./model.ts so it stays
 * auditable and testable. This file only reads inputs, renders, and draws.
 */
import './styles.css';
import {
  C,
  hintsNew,
  hintsPrior,
  reductionFactor,
  effectiveScenario,
  PARAM_SETS,
} from './model';

// ---------------------------------------------------------------------------
// Theme toggle (Part A) — self-contained, writes localStorage['theme'].
// ---------------------------------------------------------------------------
function setupThemeToggle(): void {
  const btn = document.getElementById('theme-toggle') as HTMLButtonElement | null;
  if (!btn) return;

  const apply = (theme: 'light' | 'dark') => {
    document.documentElement.setAttribute('data-theme', theme);
    const goingTo = theme === 'dark' ? 'light' : 'dark';
    btn.textContent = theme === 'dark' ? '🌙' : '☀️';
    btn.setAttribute('aria-label', `Switch to ${goingTo} theme`);
  };

  const current =
    (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'dark';
  apply(current);

  btn.addEventListener('click', () => {
    const now =
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('theme', now);
    } catch {
      /* ignore storage failures */
    }
    apply(now);
    draw(); // chart colors are theme-derived
  });
}

// ---------------------------------------------------------------------------
// State + helpers
// ---------------------------------------------------------------------------
let h = 32;
let nExp = 15; // n = 2^nExp

// Pixel positions of the paper Table-1 points on the chart, for click hit-testing.
// Populated each draw(); read by the canvas click handler.
let paperPoints: Array<{ x: number; y: number; nExp: number; h: number }> = [];

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (x: number) => Math.round(x).toLocaleString('en-US');
/** Signed integer with a true Unicode minus, e.g. +3 / −1. */
const signed = (x: number) => (x >= 0 ? `+${x}` : `−${Math.abs(x)}`);
const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function n(): number {
  return 2 ** nExp;
}

// ---------------------------------------------------------------------------
// URL state (?h=..&nexp=..) — deep-linkable
// ---------------------------------------------------------------------------
function readUrlState(): void {
  const p = new URLSearchParams(location.search);
  const hp = Number(p.get('h'));
  const np = Number(p.get('nexp'));
  // h starts at 2: h=1 makes log2(h)=0 (zero hints / infinite ratio), a
  // pedagogical distraction, so the teaching range is h >= 2.
  if (Number.isInteger(hp) && hp >= 2 && hp <= 256) h = hp;
  if (Number.isInteger(np) && np >= 8 && np <= 18) nExp = np;
  // keep the sparse invariant h <= n
  if (h > n()) h = Math.min(h, n());
}

function writeUrlState(): void {
  const p = new URLSearchParams();
  p.set('h', String(h));
  p.set('nexp', String(nExp));
  history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
}

// ---------------------------------------------------------------------------
// Render: live readout
// ---------------------------------------------------------------------------
function renderReadout(): void {
  el('ro-n').textContent = `2^${nExp} = ${fmt(n())}`;
  el('ro-h').textContent = String(h);
  el('ro-new').textContent = `${fmt(hintsNew(h))} hints`;
  el('ro-prior').textContent = `${fmt(hintsPrior(n()))} hints`;
  const r = reductionFactor(n(), h);
  el('ro-ratio').textContent = Number.isFinite(r) ? `${r.toFixed(1)}×` : '∞';
}

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Render: sticky headline (the persistent core result)
// ---------------------------------------------------------------------------
function renderHeadline(): void {
  el('sh-new').textContent = fmt(hintsNew(h));
  el('sh-prior').textContent = fmt(hintsPrior(n()));
  const r = reductionFactor(n(), h);
  el('sh-ratio').textContent = Number.isFinite(r) ? `${r.toFixed(1)}×` : '∞';
}

function pulseHeadline(): void {
  if (prefersReducedMotion()) return;
  const bar = el('sticky-headline');
  bar.classList.remove('pulse');
  // force reflow so the animation restarts
  void bar.offsetWidth;
  bar.classList.add('pulse');
}

// ---------------------------------------------------------------------------
// Render: calculator
// ---------------------------------------------------------------------------
function renderCalc(): void {
  const rate = Math.max(0, Number(el<HTMLInputElement>('calc-rate').value) || 0);
  const ops = Math.max(0, Number(el<HTMLInputElement>('calc-ops').value) || 0);
  const available = rate * ops;
  const res = effectiveScenario(n(), h, available);
  const box = el('calc-result');

  // Prominent Safe / Manageable / Dangerous verdict — the card's headline.
  const VLABEL: Record<typeof res.verdict, string> = {
    safe: 'Safe',
    manageable: 'Manageable',
    dangerous: 'Dangerous',
  };
  const VTEXT: Record<typeof res.verdict, string> = {
    safe: `well under the new-method hint budget for (n = 2^${nExp}, h = ${h}).`,
    manageable:
      'within striking distance — a configuration change or a longer campaign could cross the budget.',
    dangerous: `the new-method hint budget is met or exceeded for (n = 2^${nExp}, h = ${h}).`,
  };
  const verdictBox = el('calc-verdict');
  verdictBox.className = 'calc-verdict';
  verdictBox.innerHTML =
    `<span class="verdict-chip ${res.verdict}">${VLABEL[res.verdict]}</span>` +
    `<span class="verdict-text">${VTEXT[res.verdict]}</span>`;

  // progress bar: scale so both the fill and the threshold marker are visible,
  // including overshoot when available > threshold.
  const barMax = Math.max(res.threshold, available, 1);
  const fill = el<HTMLDivElement>('calc-bar-fill');
  fill.style.width = `${Math.min(100, (available / barMax) * 100)}%`;
  fill.className = `calc-bar-fill${res.status === 'recoverable' ? ' over' : ''}`;
  el('calc-bar-threshold').style.left = `${(res.threshold / barMax) * 100}%`;

  const pct = Math.min(999, Math.round(res.fractionOfThreshold * 100));
  if (res.status === 'recoverable') {
    box.className = 'calc-result recoverable';
    const opsToCross = rate > 0 ? Math.ceil(res.threshold / rate) : Infinity;
    box.innerHTML =
      `<strong>Hint budget met.</strong> ~${fmt(available)} hints leaked vs a ` +
      `threshold of ~${fmt(res.threshold)} (${pct}%). Under this paper's law, the ` +
      `secret would be <em>recoverable</em> after ~${fmt(opsToCross)} operations. ` +
      `<span class="badge badge-heuristic">heuristic · GAA</span> ` +
      `<span class="muted">(hint budget met — not a claim an attack was run.)</span>`;
  } else {
    box.className = 'calc-result not-yet';
    const shortfall = res.threshold - available;
    const opsNeeded = rate > 0 ? Math.ceil(shortfall / rate) : Infinity;
    box.innerHTML =
      `<strong>Not yet.</strong> ~${fmt(available)} hints leaked vs a threshold of ` +
      `~${fmt(res.threshold)} (${pct}%). Need ~${fmt(shortfall)} more — about ` +
      `${Number.isFinite(opsNeeded) ? fmt(opsNeeded) : '∞'} more operations at this ` +
      `leak rate. <span class="badge badge-heuristic">heuristic · GAA</span>`;
  }
}

// ---------------------------------------------------------------------------
// Render: param table + verify block
// ---------------------------------------------------------------------------
function renderTable(): void {
  const tbody = document.querySelector('#param-table tbody') as HTMLTableSectionElement;
  tbody.innerHTML = PARAM_SETS.map((s) => {
    const badge =
      s.provenance === 'paper'
        ? '<span class="badge badge-paper">paper</span>'
        : '<span class="badge badge-heuristic">model</span>';
    return (
      `<tr><td>${s.label}</td><td>2^${Math.round(Math.log2(s.n))}</td><td>${s.h}</td>` +
      `<td>${fmt(s.hintsPrior)}</td><td>${fmt(s.hintsNew)}</td>` +
      `<td>${s.validatedHints}</td>` +
      `<td>${badge}<br><span class="muted">${s.cite}</span></td></tr>`
    );
  }).join('');
}

function renderVerify(): void {
  el('verify-block').textContent =
    `const C = ${C};\n` +
    `const hintsNew  = (h) => C * h * Math.log2(h);\n` +
    `const hintsPrior = (n) => n / 2;\n\n` +
    `hintsNew(32);          // 320   (paper anchor — this method)\n` +
    `hintsPrior(2 ** 15);   // 16384 (paper anchor — prior work)\n` +
    `hintsPrior(2 ** 15) / hintsNew(32); // 51.2  (~50x reduction)\n\n` +
    `// current selection:\n` +
    `hintsNew(${h});  // ${fmt(hintsNew(h))}\n` +
    `hintsPrior(2 ** ${nExp});  // ${fmt(hintsPrior(n()))}`;
}

// ---------------------------------------------------------------------------
// Render: canvas chart (log x = h, linear y = hints)
// ---------------------------------------------------------------------------
function draw(): void {
  const canvas = el<HTMLCanvasElement>('chart');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  const padL = 70;
  const padR = 20;
  const padT = 20;
  const padB = 50;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  ctx.clearRect(0, 0, W, H);

  const hMin = 1;
  const hMax = 256;
  const logMin = Math.log2(hMin); // 0
  const logMax = Math.log2(hMax); // 8

  // y scale: cover the prior baseline for current n and the new curve at hMax.
  const yMax = Math.max(hintsPrior(n()), hintsNew(hMax)) * 1.05;

  const xPix = (hv: number) => padL + ((Math.log2(hv) - logMin) / (logMax - logMin)) * plotW;
  const yPix = (yv: number) => padT + plotH - (yv / yMax) * plotH;

  const text = cssVar('--text');
  const muted = cssVar('--text-muted');
  const border = cssVar('--border');
  const cNew = cssVar('--accent');
  const cPrior = cssVar('--accent-2');
  const cAnchor = cssVar('--accent-anchor');

  // axes
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // x gridlines at powers of 2
  ctx.fillStyle = muted;
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  for (let e = 0; e <= 8; e++) {
    const hv = 2 ** e;
    const x = xPix(hv);
    ctx.strokeStyle = border;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillText(String(hv), x, padT + plotH + 18);
  }
  ctx.fillText('Hamming weight h (log scale)', padL + plotW / 2, H - 6);

  // y ticks
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const yv = (yMax / 4) * i;
    const y = yPix(yv);
    ctx.fillStyle = muted;
    ctx.fillText(fmt(yv), padL - 8, y + 4);
    ctx.strokeStyle = border;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.save();
  ctx.translate(16, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = muted;
  ctx.fillText('hints needed', 0, 0);
  ctx.restore();

  // prior baseline (dashed, flat at n/2 for current n)
  const priorY = yPix(hintsPrior(n()));
  ctx.strokeStyle = cPrior;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(padL, priorY);
  ctx.lineTo(padL + plotW, priorY);
  ctx.stroke();
  ctx.setLineDash([]);

  // new method curve C*h*log2(h)
  ctx.strokeStyle = cNew;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  let first = true;
  for (let px = 0; px <= plotW; px++) {
    const logH = logMin + (px / plotW) * (logMax - logMin);
    const hv = 2 ** logH;
    const safeHv = Math.max(1, hv);
    const yv = C * safeHv * Math.log2(safeHv);
    const x = padL + px;
    const y = yPix(yv);
    if (first) {
      ctx.moveTo(x, y);
      first = false;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();

  // paper Table-1 points (h = 32, 64, 128, 192) as clickable diamonds on the
  // new curve. They lie on the curve regardless of n (hintsNew depends on h only).
  paperPoints = [];
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  for (const set of PARAM_SETS) {
    const px = xPix(set.h);
    const py = yPix(hintsNew(set.h));
    paperPoints.push({ x: px, y: py, nExp: Math.round(Math.log2(set.n)), h: set.h });
    const sz = 6;
    ctx.fillStyle = cAnchor;
    ctx.beginPath();
    ctx.moveTo(px, py - sz);
    ctx.lineTo(px + sz, py);
    ctx.lineTo(px, py + sz);
    ctx.lineTo(px - sz, py);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = text;
    ctx.fillText(`h=${set.h}`, px + 9, py - 6);
  }

  // current-selection marker on the new curve (drawn on top)
  const cx = xPix(h);
  const cy = yPix(hintsNew(h));
  ctx.fillStyle = cNew;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = text;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // legend
  ctx.textAlign = 'left';
  ctx.font = '12px sans-serif';
  ctx.fillStyle = cNew;
  ctx.fillText('● this method  C·h·log₂h', padL + 8, padT + 14);
  ctx.fillStyle = cPrior;
  ctx.fillText('– – prior baseline  n/2', padL + 8, padT + 30);
}

// ---------------------------------------------------------------------------
// Render: sparse-secret strip — makes "h of n nonzero" concrete
// ---------------------------------------------------------------------------
function drawSecret(): void {
  const canvas = el<HTMLCanvasElement>('secret-strip');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const Hc = canvas.height;
  ctx.clearRect(0, 0, W, Hc);

  const cols = 90;
  const rows = 6;
  const cells = cols * rows;
  const pad = 6;
  const gap = 1;
  const cw = (W - 2 * pad) / cols;
  const ch = (Hc - 2 * pad) / rows;

  // how many of the displayed cells to light up (scaled from real h/n), >=1
  const lit = Math.max(1, Math.min(cells, Math.round((h / n()) * cells)));
  const litSet = new Set<number>();
  for (let k = 0; k < lit; k++) {
    litSet.add(Math.floor((k + 0.5) * (cells / lit)));
  }

  const zero = cssVar('--border');
  const pos = cssVar('--accent');
  const neg = cssVar('--accent-2');

  for (let i = 0; i < cells; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = pad + c * cw;
    const y = pad + r * ch;
    if (litSet.has(i)) {
      ctx.fillStyle = i % 2 === 0 ? pos : neg; // alternate +1 / -1 (ternary)
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = zero;
      ctx.globalAlpha = 0.5;
    }
    ctx.fillRect(x, y, cw - gap, ch - gap);
  }
  ctx.globalAlpha = 1;

  const pct = (h / n()) * 100;
  const pctStr = pct < 0.01 ? '<0.01%' : `${pct.toPrecision(2)}%`;
  el('secret-caption').textContent =
    `h = ${h} nonzero coordinates out of n = ${fmt(n())} (${pctStr}). ` +
    `Highlighted = ±1, dim = 0. Only the highlighted entries matter — that is ` +
    `why work scales with h, not n. (Shown scaled to ${cells} cells.)`;
}

// ---------------------------------------------------------------------------
// Render: "what one hint is" — a fixed, worked linear-equation example.
// Deterministic illustration (NOT random, NOT tied to the (n,h) sliders): a tiny
// secret of weight 3 in dimension 8, dotted with a known probe vector v.
// ---------------------------------------------------------------------------
const HE_SECRET = [0, 1, 0, 0, -1, 0, 1, 0]; // ternary, h = 3 of n = 8
const HE_PROBE = [3, -1, 2, 0, 4, 1, -2, 5]; // known probe vector v
const HE_NOISE = 1; // fixed small error e for the approximate illustration
let heKind: 'perfect' | 'approx' = 'perfect';

function renderHintEquation(): void {
  const grid = el('he-grid');
  // Each coordinate: probe value on top, secret value below; nonzero highlighted.
  grid.innerHTML = HE_SECRET.map((s, i) => {
    const cls = s > 0 ? 'pos' : s < 0 ? 'neg' : 'zero';
    return (
      `<span class="he-cell ${cls}">` +
      `<span class="he-v">${signed(HE_PROBE[i])}</span>` +
      `<span class="he-s">${s === 0 ? '0' : signed(s)}</span></span>`
    );
  }).join('');

  const nz = HE_SECRET.map((_, i) => i).filter((i) => HE_SECRET[i] !== 0);
  const terms = nz.map((i) => `(${signed(HE_PROBE[i])})(${signed(HE_SECRET[i])})`);
  const exact = nz.reduce((acc, i) => acc + HE_PROBE[i] * HE_SECRET[i], 0);

  const eq = el('he-equation');
  const note = el('he-note');
  if (heKind === 'perfect') {
    eq.innerHTML =
      `l = ⟨v, s⟩ = ${terms.join(' + ')} = ` +
      `<span class="he-result">${signed(exact)}</span>`;
    note.innerHTML =
      'Perfect hint: an <em>exact</em> inner product — one clean linear equation on the ' +
      'h unknown nonzero coordinates.';
  } else {
    const noisy = exact + HE_NOISE;
    eq.innerHTML =
      `l = ⟨v, s⟩ + e = ${signed(exact)} + e ≈ ` +
      `<span class="he-result">${signed(noisy)}</span>`;
    note.innerHTML =
      'Approximate hint: the <em>same</em> equation, blurred by a small unknown error ' +
      '<code>e</code>. Realistic side-channel leakage looks like this — and the paper ' +
      'shows it is still enough.';
  }
}

function setupHintEquation(): void {
  const tabs = Array.from(document.querySelectorAll('.he-tab')) as HTMLButtonElement[];
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      heKind = tab.dataset.kind === 'approx' ? 'approx' : 'perfect';
      tabs.forEach((t) => t.setAttribute('aria-pressed', String(t === tab)));
      renderHintEquation();
    });
  }
  renderHintEquation();
}

// ---------------------------------------------------------------------------
// Calculator scenario presets — ILLUSTRATIVE leak rates (not from the paper),
// chosen to land in the Safe / Manageable / Dangerous bands against the (2^15,32)
// anchor threshold of 320 hints.
// ---------------------------------------------------------------------------
interface CalcScenario {
  label: string;
  rate: number;
  ops: number;
  h: number;
  nExp: number;
}
const CALC_SCENARIOS: CalcScenario[] = [
  { label: 'Hardened / masked deployment', rate: 0.01, ops: 3000, h: 32, nExp: 15 }, //  30 → safe
  { label: 'EM campaign, partial masking', rate: 0.05, ops: 4000, h: 32, nExp: 15 }, // 200 → manageable
  { label: 'Unprotected DPA capture', rate: 0.2, ops: 3000, h: 32, nExp: 15 }, // 600 → dangerous
];

function buildScenarios(): void {
  const box = el('calc-scenarios');
  box.innerHTML = '';
  for (const sc of CALC_SCENARIOS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'scenario-btn';
    b.textContent = sc.label;
    b.addEventListener('click', () => {
      h = sc.h;
      nExp = sc.nExp;
      el<HTMLInputElement>('calc-rate').value = String(sc.rate);
      el<HTMLInputElement>('calc-ops').value = String(sc.ops);
      renderAll();
    });
    box.appendChild(b);
  }
}

// ---------------------------------------------------------------------------
// Wire up
// ---------------------------------------------------------------------------
function syncControls(): void {
  const hSlider = el<HTMLInputElement>('h-slider');
  const nSlider = el<HTMLInputElement>('n-slider');
  hSlider.value = String(h);
  nSlider.value = String(nExp);
  el('h-out').textContent = String(h);
  el('n-exp-out').textContent = String(nExp);
  el('n-out').textContent = fmt(n());
}

// Render everything except URL state (used during animation to avoid spamming
// history.replaceState every frame).
function renderLive(): void {
  syncControls();
  renderReadout();
  renderHeadline();
  renderCalc();
  renderVerify();
  drawSecret();
  draw();
}

function renderAll(): void {
  renderLive();
  writeUrlState();
}

function buildPresets(): void {
  const box = el('presets');
  box.innerHTML = '';
  for (const set of PARAM_SETS) {
    const b = document.createElement('button');
    b.className = 'preset-btn';
    const tag =
      set.provenance === 'paper'
        ? '<span class="badge badge-paper">paper</span>'
        : '<span class="badge badge-heuristic">model</span>';
    b.innerHTML = `${set.label} <code>(2^${Math.round(Math.log2(set.n))}, ${set.h})</code> ${tag}`;
    b.addEventListener('click', () => {
      nExp = Math.round(Math.log2(set.n));
      h = set.h;
      renderAll();
    });
    box.appendChild(b);
  }
}

// Click a paper diamond on the chart to load that regime.
function setupChartClick(): void {
  const canvas = el<HTMLCanvasElement>('chart');
  canvas.style.cursor = 'pointer';
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);
    let best: (typeof paperPoints)[number] | null = null;
    let bestD = 20 * 20; // hit radius in canvas units
    for (const p of paperPoints) {
      const d = (p.x - px) ** 2 + (p.y - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) {
      nExp = best.nExp;
      h = best.h;
      renderAll();
      pulseHeadline();
    }
  });
}

// Guided "aha": sweep h down from dense to the sparse anchor and watch the
// new-method threshold collapse while the prior baseline holds.
let ahaRunning = false;
function runAha(): void {
  if (ahaRunning) return;
  const btn = el<HTMLButtonElement>('aha-btn');
  const step = el('aha-step');
  ahaRunning = true;
  btn.disabled = true;

  nExp = 15;
  const startH = 256;
  const endH = 32;

  const finish = () => {
    h = endH;
    renderAll();
    pulseHeadline();
    step.textContent =
      `Sparse h=${endH}: only ${fmt(hintsNew(endH))} hints vs ${fmt(hintsPrior(n()))} ` +
      `prior — the threshold collapses (~${reductionFactor(n(), endH).toFixed(0)}×).`;
    btn.disabled = false;
    ahaRunning = false;
  };

  h = startH;
  renderAll();
  step.textContent = `Dense secret (h=${startH}): little advantage over prior work.`;

  if (prefersReducedMotion()) {
    finish();
    return;
  }

  const durationMs = 1400;
  let startTs: number | null = null;
  const frame = (ts: number) => {
    if (startTs === null) startTs = ts;
    const t = Math.min(1, (ts - startTs) / durationMs);
    const ease = 1 - Math.pow(1 - t, 3);
    const logH = Math.log2(startH) + (Math.log2(endH) - Math.log2(startH)) * ease;
    h = Math.max(endH, Math.round(2 ** logH));
    renderLive();
    step.textContent = `Dropping h → new threshold falls: h=${h} needs ${fmt(hintsNew(h))} hints…`;
    if (t < 1) requestAnimationFrame(frame);
    else finish();
  };
  requestAnimationFrame(frame);
}

function setupSelfCheck(): void {
  const opts = Array.from(document.querySelectorAll('.sc-opt')) as HTMLButtonElement[];
  const fb = el('sc-feedback');
  for (const opt of opts) {
    opt.addEventListener('click', () => {
      opts.forEach((o) => o.classList.remove('correct', 'incorrect'));
      if (opt.dataset.correct === 'true') {
        opt.classList.add('correct');
        fb.className = 'sc-feedback correct';
        fb.textContent =
          'Correct — this method needs ~C·h·log₂h, which depends only on h. Double n and it barely moves; the prior n/2 baseline is what doubles. Try dragging n above.';
      } else {
        opt.classList.add('incorrect');
        opts.find((o) => o.dataset.correct === 'true')?.classList.add('correct');
        fb.className = 'sc-feedback incorrect';
        fb.textContent =
          'Not quite — hintsNew depends on h, not n. Doubling n leaves it ~unchanged; only the prior n/2 baseline doubles.';
      }
    });
  }
}

function init(): void {
  setupThemeToggle();
  readUrlState();
  buildPresets();
  buildScenarios();
  renderTable();
  setupChartClick();
  setupSelfCheck();
  setupHintEquation();
  el<HTMLButtonElement>('aha-btn').addEventListener('click', runAha);

  el<HTMLInputElement>('h-slider').addEventListener('input', (e) => {
    h = Number((e.target as HTMLInputElement).value);
    if (h > n()) h = n();
    renderAll();
  });
  el<HTMLInputElement>('n-slider').addEventListener('input', (e) => {
    nExp = Number((e.target as HTMLInputElement).value);
    if (h > n()) h = n();
    renderAll();
  });
  el<HTMLInputElement>('calc-rate').addEventListener('input', renderCalc);
  el<HTMLInputElement>('calc-ops').addEventListener('input', renderCalc);

  renderAll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
