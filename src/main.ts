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
  riskVerdict,
  bisectSteps,
  PARAM_SETS,
} from './model';
import { recoverSecret, sweepHammingWeights } from './attack';
import { observeGaa, probeVariance, type GaaObservation } from './gaa';
import { parseLeakageProfile, profileOutcome } from './profile';

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
    // Every canvas takes its colours from CSS custom properties, so all three
    // have to be repainted, not just the first one.
    draw();
    renderGaa();
    renderProfile();
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

  // Reduction-factor gap: a vertical double-headed line from the new curve up to
  // the prior baseline at the current h, annotated with the ratio. This ties the
  // headline number (e.g. 51x) to the GEOMETRY of the distance between the lines.
  const cx = xPix(h);
  const cy = yPix(hintsNew(h));
  const gapTopY = priorY; // dashed baseline
  const gapBotY = cy; // new curve
  if (Math.abs(gapBotY - gapTopY) > 14) {
    ctx.strokeStyle = cAnchor;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, gapTopY);
    ctx.lineTo(cx, gapBotY);
    ctx.stroke();
    ctx.setLineDash([]);
    // little end caps
    ctx.beginPath();
    ctx.moveTo(cx - 4, gapTopY);
    ctx.lineTo(cx + 4, gapTopY);
    ctx.moveTo(cx - 4, gapBotY);
    ctx.lineTo(cx + 4, gapBotY);
    ctx.stroke();
    // ratio label at the middle of the gap
    const r = reductionFactor(n(), h);
    const label = Number.isFinite(r) ? `${r.toFixed(0)}× fewer` : '∞× fewer';
    ctx.font = 'bold 12px sans-serif';
    const midY = (gapTopY + gapBotY) / 2;
    // keep the label on-canvas: flip to the left if too close to the right edge
    const onRight = cx < padL + plotW - 90;
    ctx.textAlign = onRight ? 'left' : 'right';
    const lx = onRight ? cx + 8 : cx - 8;
    // subtle backing so the label stays legible over gridlines
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = cssVar('--bg-elev-2');
    ctx.globalAlpha = 0.85;
    ctx.fillRect(onRight ? lx - 2 : lx - tw - 2, midY - 9, tw + 4, 16);
    ctx.globalAlpha = 1;
    ctx.fillStyle = cAnchor;
    ctx.fillText(label, lx, midY + 4);
  }

  // current-selection marker on the new curve (drawn on top)
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
// A fixed, honest WINDOW of coordinates. Rather than scaling h/n down to the
// whole strip (which lights ~1 cell at the anchor and reads as "broken"), we show
// one representative window of the secret and light the *expected* number of
// nonzeros for that window — usually a fraction of one — so the drama is "in a
// window this size you'd expect almost no nonzero at all." Emptiness becomes the
// message, not an artifact.
function drawSecret(): void {
  const canvas = el<HTMLCanvasElement>('secret-strip');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const Hc = canvas.height;
  ctx.clearRect(0, 0, W, Hc);

  const cols = 90;
  const rows = 6;
  const cells = cols * rows; // 540
  const pad = 6;
  const gap = 1;
  const cw = (W - 2 * pad) / cols;
  const ch = (Hc - 2 * pad) / rows;

  // Expected nonzeros in a window of this many coordinates, at the real density h/n.
  const density = h / n();
  const expected = density * cells;
  // Light up round(expected) cells, but always show at least one so the learner
  // sees WHAT a nonzero looks like. The caption makes the "expected < 1" case
  // explicit so the single lit cell is never mistaken for the true rate.
  const lit = Math.max(1, Math.min(cells, Math.round(expected)));
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

  const pct = density * 100;
  const pctStr = pct < 0.01 ? '<0.01%' : `${pct.toPrecision(2)}%`;
  const expStr = expected < 1 ? expected.toPrecision(2) : Math.round(expected).toLocaleString('en-US');
  const drama =
    expected < 1
      ? `In a ${cells}-coordinate window like this you'd expect only ~${expStr} nonzero — ` +
        `usually none at all. The one cell lit here is drawn so you can see what a nonzero ` +
        `looks like; the true density is far sparser. That is how extreme h ≪ n is.`
      : `In a ${cells}-coordinate window like this you'd expect ~${expStr} nonzeros.`;
  el('secret-caption').textContent =
    `h = ${h} nonzero of n = ${fmt(n())} total (${pctStr} of all coordinates are nonzero). ` +
    `Highlighted = ±1, dim = 0. ${drama} Only the highlighted entries carry information — ` +
    `which is why work scales with h, not n.`;
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
  // The learner's profile is measured against C·h·log₂h, so moving h moves the
  // line it has to cross — the whole point of letting them supply the profile.
  renderProfile();
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

// ---------------------------------------------------------------------------
// "Why log h?" — position-identification interactive.
// A fixed tiny secret (h=3 nonzeros among n=16). Each "locating hint" is one
// yes/no bisection step applied to EVERY not-yet-resolved nonzero at once. The
// learner watches ambiguous candidate cells collapse — SEEING that finding the
// POSITIONS (not the values) is the log-factor cost. Deterministic: positions and
// the search are fixed, all narrowing comes from ./model bisectSteps.
// ---------------------------------------------------------------------------
const WL_N = 16;
const WL_TARGETS = [2, 9, 13]; // the h=3 secretly-nonzero positions (fixed)
const WL_SIGNS = ['+1', '−1', '+1']; // ternary values, revealed once located
let wlStep = 0;

function wlWorstCase(): number {
  return Math.ceil(Math.log2(WL_N)); // 4 hints to isolate one position among 16
}

function renderWhyLog(): void {
  const strip = el('wl-strip');
  const status = el('wl-status');
  const count = el('wl-count');

  // For each still-ambiguous target, the surviving candidate window at this step.
  const states = WL_TARGETS.map((t) => bisectSteps(WL_N, t, wlStep));

  // A position is "ambiguous" if it is inside some target's window that has NOT
  // yet collapsed to a single cell. It is "found" if it is a target whose window
  // has collapsed to exactly it.
  const ambiguous = new Set<number>();
  const found = new Set<number>();
  states.forEach((s, i) => {
    if (s.resolved) found.add(WL_TARGETS[i]);
    else for (const c of s.candidates) ambiguous.add(c);
  });

  let html = '';
  for (let i = 0; i < WL_N; i++) {
    const ti = WL_TARGETS.indexOf(i);
    let cls = 'wl-cell';
    let label = '?';
    if (found.has(i)) {
      cls += ' wl-found';
      label = WL_SIGNS[ti]; // reveal the ternary value once the position is pinned
    } else if (ambiguous.has(i)) {
      cls += ' wl-amb';
      label = '?';
    } else {
      cls += ' wl-ruled'; // ruled out — provably zero here
      label = '0';
    }
    html += `<span class="${cls}"><span class="wl-idx">${i}</span><span class="wl-val">${label}</span></span>`;
  }
  strip.innerHTML = html;

  const foundCount = found.size;
  const worst = wlWorstCase();
  count.textContent = `Locating hints used: ${wlStep} · positions pinned down: ${foundCount} of ${WL_TARGETS.length}`;

  if (wlStep === 0) {
    status.textContent =
      `Zero hints so far: every one of the ${WL_N} coordinates is still a suspect — any could be one of the ${WL_TARGETS.length} nonzeros. Add a locating hint to start ruling positions out.`;
  } else if (foundCount < WL_TARGETS.length) {
    const ambCount = ambiguous.size;
    status.textContent =
      `After ${wlStep} locating hint${wlStep === 1 ? '' : 's'}: ${ambCount} coordinate${ambCount === 1 ? '' : 's'} still ambiguous, ${foundCount} position${foundCount === 1 ? '' : 's'} pinned down. Each hint roughly halves the suspects — a binary search per nonzero.`;
  } else {
    status.textContent =
      `Done in ${wlStep} locating hints (~log₂${WL_N} = ${worst} per nonzero). All ${WL_TARGETS.length} positions found — and only NOW are the ternary values (${WL_SIGNS.join(', ')}) worth reading off. Locating the positions was the expensive part: that is the log₂h.`;
  }

  el<HTMLButtonElement>('wl-add').disabled = foundCount === WL_TARGETS.length;
}

function setupWhyLog(): void {
  const add = el<HTMLButtonElement>('wl-add');
  const reset = el<HTMLButtonElement>('wl-reset');
  const max = wlWorstCase();
  add.addEventListener('click', () => {
    if (wlStep < max) wlStep += 1;
    renderWhyLog();
  });
  reset.addEventListener('click', () => {
    wlStep = 0;
    renderWhyLog();
  });
  renderWhyLog();
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

// ---------------------------------------------------------------------------
// Exhibit: the attack, actually run.
// ---------------------------------------------------------------------------
// Every string written below is read off the RecoveryResult that recoverSecret()
// just produced. The verdict line in particular is derived from exactMatch and
// the residual check, never written ahead of them.

function runAttack(): void {
  const atkN = Number(el<HTMLSelectElement>('atk-n').value);
  const atkH = Number(el<HTMLSelectElement>('atk-h').value);
  const seed = Math.max(1, Math.floor(Number(el<HTMLInputElement>('atk-seed').value) || 1));
  const r = recoverSecret(atkN, atkH, seed);

  el('atk-instance').textContent =
    `n = ${r.n}, q = ${r.q}, 48 LWE samples, |e| ≤ ${r.errorBound}, ` +
    `secret weight h = ${r.h} · seed ${r.seed}`;
  el('atk-support').textContent =
    `${r.supportHints} hints of adaptive binary splitting → ` +
    `${r.foundSupport.length} position${r.foundSupport.length === 1 ? '' : 's'} ` +
    `${r.supportExact ? 'matching the planted support exactly' : 'NOT matching the planted support'}` +
    (r.falseNegatives > 0
      ? ` · ${r.falseNegatives} group test(s) returned 0 by chance (probability 1/q each)`
      : '');
  el('atk-values').textContent =
    `${r.valueHints} hints, then Gaussian elimination over GF(${r.q}) on a ` +
    `${r.foundSupport.length}×${r.foundSupport.length} system`;
  el('atk-total').textContent =
    `${fmt(r.totalHints)} hints · prior-work threshold n/2 = ${fmt(r.priorHints)} · ` +
    `this procedure's own prediction h·⌈log₂(n/h)⌉ + h = ${fmt(r.groupTestingPrediction)} · ` +
    `the paper's estimator for this h = ${fmt(r.estimatorHints)} (a different method — shown for scale only)`;
  el('atk-match').textContent = r.exactMatch
    ? `identical in all ${fmt(r.n)} coordinates`
    : `MISMATCH — the recovered vector differs from the planted secret`;
  el('atk-residual').textContent = `max |b − A·ŝ| = ${r.maxResidual} ${
    r.maxResidual <= r.errorBound
      ? `≤ ${r.errorBound}, so every sample is explained by the recovered secret`
      : `> ${r.errorBound}, so it does not explain the samples`
  }`;
  el('atk-control').textContent =
    `max |b − A·s'| = ${fmt(r.controlMaxResidual)} for a different weight-${r.h} secret — ` +
    `${r.controlMaxResidual > r.errorBound ? 'rejected, as it must be' : 'unexpectedly accepted'}`;

  const box = el('atk-verdict');
  const ok = r.exactMatch && r.maxResidual <= r.errorBound && r.controlMaxResidual > r.errorBound;
  box.className = `calc-result ${ok ? 'recoverable' : 'not-yet'}`;
  box.innerHTML = ok
    ? `<strong>SECRET RECOVERED.</strong> ${fmt(r.totalHints)} perfect hints — ` +
      `${Math.round((r.priorHints / r.totalHints) * 10) / 10}× fewer than the prior ` +
      `n/2 = ${fmt(r.priorHints)} threshold — reconstructed all ${r.h} nonzero coordinates of a ` +
      `${r.n}-dimensional secret exactly, and the recovered vector explains every LWE sample ` +
      `while a different sparse secret does not. <span class="badge badge-paper">computed, not estimated</span> ` +
      `<span class="muted">(toy parameters: q = ${r.q}, n = ${r.n}.)</span>`
    : `<strong>Recovery failed on this run.</strong> Reported as it happened rather than ` +
      `re-rolled: support exact = ${r.supportExact}, exact match = ${r.exactMatch}, ` +
      `false negatives = ${r.falseNegatives}.`;
}

function runSweep(): void {
  const atkN = Number(el<HTMLSelectElement>('atk-n').value);
  const seed = Math.max(1, Math.floor(Number(el<HTMLInputElement>('atk-seed').value) || 1));
  const rows = sweepHammingWeights(atkN, [2, 4, 8, 16, 32], seed);
  el('atk-sweep-body').innerHTML = rows
    .map(
      (r) =>
        `<tr><td>${r.h}</td><td>${r.supportHints}</td><td>${r.valueHints}</td>` +
        `<td><strong>${r.totalHints}</strong></td>` +
        `<td>${(r.totalHints / r.h).toFixed(1)}</td>` +
        `<td>${fmt(r.priorHints)}</td>` +
        `<td class="${r.exactMatch ? 'sweep-ok' : 'sweep-bad'}">${r.exactMatch ? 'yes' : 'NO'}</td></tr>`,
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Exhibit: the GAA, measured.
// ---------------------------------------------------------------------------
const GAA_WEIGHTS = [1, 2, 8, 32, 64, 192];
const GAA_SAMPLES = 4000;
let gaaH = 32;

function drawGaa(obs: GaaObservation): void {
  const canvas = el<HTMLCanvasElement>('gaa-chart');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const padL = 60;
  const padR = 20;
  const padT = 18;
  const padB = 44;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  ctx.clearRect(0, 0, W, H);

  const yMax = Math.max(
    1,
    ...obs.histogram.map((b) => b.count),
    ...obs.expected.map((b) => b.density),
  );
  const span = 4 * obs.predictedSd;
  const xPix = (v: number) => padL + ((v + span) / (2 * span)) * plotW;
  const yPix = (v: number) => padT + plotH - (v / yMax) * plotH;

  const text = cssVar('--text');
  const muted = cssVar('--text-muted');
  const border = cssVar('--border');
  const cBar = cssVar('--accent');
  const cCurve = cssVar('--accent-2');

  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  const barW = plotW / obs.histogram.length;
  ctx.fillStyle = cBar;
  ctx.globalAlpha = 0.55;
  for (const b of obs.histogram) {
    const x = xPix(b.center) - barW / 2;
    const y = yPix(b.count);
    ctx.fillRect(x, y, Math.max(1, barW - 1), padT + plotH - y);
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = cCurve;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  obs.expected.forEach((p, i) => {
    const x = xPix(p.center);
    const y = yPix(p.density);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = muted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const frac of [-1, -0.5, 0, 0.5, 1]) {
    const v = frac * span;
    ctx.fillText(Math.round(v).toLocaleString('en-US'), xPix(v), padT + plotH + 18);
  }
  ctx.fillStyle = text;
  ctx.fillText('hint value  l = ⟨v, s⟩', padL + plotW / 2, H - 8);
}

function renderGaa(): void {
  const seed = Math.max(1, Math.floor(Number(el<HTMLInputElement>('gaa-seed').value) || 1));
  const obs = observeGaa(gaaH, GAA_SAMPLES, seed);
  el('gaa-predicted').textContent =
    `${obs.predictedSd.toFixed(2)}  (√(${obs.h} × ${probeVariance(obs.probeBound)}))`;
  el('gaa-sd').textContent =
    `${obs.sd.toFixed(2)}  ·  mean ${obs.mean.toFixed(2)} (predicted 0)`;
  el('gaa-ks').textContent = obs.ks.toFixed(4);
  el('gaa-crit').textContent = `${obs.ksCritical.toFixed(4)}  (N = ${fmt(obs.samples)})`;

  const box = el('gaa-verdict');
  box.className = `calc-result ${obs.rejected ? 'not-yet' : 'recoverable'}`;
  box.innerHTML = obs.rejected
    ? `<strong>Gaussian fit REJECTED at h = ${obs.h}.</strong> D = ${obs.ks.toFixed(4)} exceeds ` +
      `the 5% critical value ${obs.ksCritical.toFixed(4)}. The sampled hints are not ` +
      `distributed the way the assumption says they are.`
    : `<strong>Gaussian fit not rejected at h = ${obs.h}.</strong> D = ${obs.ks.toFixed(4)} sits ` +
      `under the 5% critical value ${obs.ksCritical.toFixed(4)}, and the measured spread ` +
      `${obs.sd.toFixed(2)} lands within ` +
      `${Math.abs(100 * (obs.sd / obs.predictedSd - 1)).toFixed(1)}% of the ` +
      `${obs.predictedSd.toFixed(2)} the assumption predicted from h alone.`;

  el<HTMLCanvasElement>('gaa-chart').setAttribute(
    'aria-label',
    `Histogram of ${fmt(obs.samples)} sampled hint values at Hamming weight ${obs.h}, with the ` +
      `Gaussian the assumption predicts drawn over it. Kolmogorov-Smirnov D is ` +
      `${obs.ks.toFixed(4)} against a 5% critical value of ${obs.ksCritical.toFixed(4)}: the fit is ` +
      `${obs.rejected ? 'rejected' : 'not rejected'}.`,
  );
  drawGaa(obs);
}

function buildGaaWeights(): void {
  const box = el('gaa-weights');
  box.innerHTML = '';
  for (const w of GAA_WEIGHTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `scenario-btn${w === gaaH ? ' active' : ''}`;
    b.dataset.gaaH = String(w);
    b.setAttribute('aria-pressed', String(w === gaaH));
    b.textContent = `h = ${w}`;
    b.addEventListener('click', () => {
      gaaH = w;
      buildGaaWeights();
      renderGaa();
    });
    box.appendChild(b);
  }
}

// ---------------------------------------------------------------------------
// Exhibit: the learner's own leakage profile.
// ---------------------------------------------------------------------------
const PROFILE_PRESETS: { label: string; text: string }[] = [
  {
    label: 'Steady low-rate capture',
    text: '# hints observed per day, masked implementation\nday 1: 12\nday 2: 11\nday 3: 14\nday 4: 9\nday 5: 13\nday 6: 10\nday 7: 12',
  },
  {
    label: 'Quiet, then a burst',
    text: '# a key rotation window opens on day 5\n2\n1\n3\n2\n180\n140\n4\n2',
  },
  {
    label: 'Masking switched on midway',
    text: '# countermeasure deployed after period 4\nwk 1: 90\nwk 2: 85\nwk 3: 95\nwk 4: 88\nwk 5: 3\nwk 6: 2\nwk 7: 4',
  },
];

function drawProfile(entries: { hints: number; cumulative: number }[], threshold: number): void {
  const canvas = el<HTMLCanvasElement>('profile-chart');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const padL = 70;
  const padR = 20;
  const padT = 18;
  const padB = 38;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  ctx.clearRect(0, 0, W, H);

  const border = cssVar('--border');
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  if (entries.length === 0) return;

  const yMax =
    Math.max(threshold, entries[entries.length - 1].cumulative, ...entries.map((e) => e.hints)) *
      1.1 || 1;
  const xPix = (i: number) => padL + ((i + 0.5) / entries.length) * plotW;
  const yPix = (v: number) => padT + plotH - (v / yMax) * plotH;
  const barW = Math.max(2, (plotW / entries.length) * 0.6);

  ctx.fillStyle = cssVar('--accent');
  ctx.globalAlpha = 0.5;
  entries.forEach((e, i) => {
    const y = yPix(e.hints);
    ctx.fillRect(xPix(i) - barW / 2, y, barW, padT + plotH - y);
  });
  ctx.globalAlpha = 1;

  ctx.strokeStyle = cssVar('--accent-2');
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  entries.forEach((e, i) => {
    const x = xPix(i);
    const y = yPix(e.cumulative);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = cssVar('--text-muted');
  ctx.lineWidth = 1.5;
  const ty = yPix(threshold);
  ctx.beginPath();
  ctx.moveTo(padL, ty);
  ctx.lineTo(padL + plotW, ty);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = cssVar('--text-muted');
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`threshold ${fmt(threshold)}`, padL + 6, Math.max(padT + 12, ty - 6));
}

function renderProfile(): void {
  const text = el<HTMLTextAreaElement>('profile-input').value;
  const parsed = parseLeakageProfile(text);
  const threshold = hintsNew(h);
  const out = profileOutcome(parsed, threshold);

  const errBox = el('profile-errors');
  errBox.innerHTML = parsed.errors.length
    ? `<p class="profile-error"><strong>${parsed.errors.length} line${
        parsed.errors.length === 1 ? '' : 's'
      } could not be read</strong> (skipped, not counted as zero): ` +
      parsed.errors
        .slice(0, 6)
        .map((e) => `line ${e.line} “${escapeHtml(e.text)}” — ${e.message}`)
        .join('; ') +
      `</p>`
    : '';

  el('profile-periods').textContent = String(out.periods);
  el('profile-total').textContent = fmt(out.total);
  el('profile-threshold').textContent =
    `${fmt(threshold)}  (C·h·log₂h at h = ${h}, n = 2^${nExp})`;
  el('profile-peak').textContent = out.peak
    ? `${fmt(out.peak.hints)} in period ${out.peak.index}${
        out.peak.label ? ` (${escapeHtml(out.peak.label)})` : ''
      }`
    : '—';

  const box = el('profile-verdict');
  if (out.periods === 0) {
    box.className = 'calc-result';
    box.textContent = 'Paste or type a profile above — one number per period.';
  } else if (out.crossingIndex !== null) {
    const e = out.crossingEntry!;
    box.className = 'calc-result recoverable';
    box.innerHTML =
      `<strong>Budget crossed at period ${out.crossingIndex}` +
      `${e.label ? ` (${escapeHtml(e.label)})` : ''}.</strong> The running total reached ` +
      `${fmt(e.cumulative)} against a threshold of ${fmt(threshold)}, with ` +
      `${out.periods - out.crossingIndex} period${out.periods - out.crossingIndex === 1 ? '' : 's'} ` +
      `still to go. Verdict: <strong>${riskVerdict(out.fractionOfThreshold)}</strong>. ` +
      `<span class="badge badge-heuristic">heuristic · GAA</span> ` +
      `<span class="muted">(hint budget met — not a claim an attack was run.)</span>`;
  } else {
    box.className = 'calc-result not-yet';
    box.innerHTML =
      `<strong>Never crossed.</strong> ${fmt(out.total)} hints over ${out.periods} periods ` +
      `against a threshold of ${fmt(threshold)} — short by ${fmt(-out.margin)} ` +
      `(${Math.round(out.fractionOfThreshold * 100)}% of budget). Verdict: ` +
      `<strong>${riskVerdict(out.fractionOfThreshold)}</strong>. ` +
      `<span class="badge badge-heuristic">heuristic · GAA</span>`;
  }

  el<HTMLCanvasElement>('profile-chart').setAttribute(
    'aria-label',
    `Cumulative hints across ${out.periods} periods, totalling ${fmt(out.total)}, against a ` +
      `threshold of ${fmt(threshold)}. ` +
      (out.crossingIndex === null
        ? 'The threshold is never crossed.'
        : `The threshold is crossed at period ${out.crossingIndex}.`),
  );
  drawProfile(parsed.entries, threshold);
}

function buildProfilePresets(): void {
  const box = el('profile-presets');
  box.innerHTML = '';
  for (const p of PROFILE_PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'scenario-btn';
    b.textContent = p.label;
    b.addEventListener('click', () => {
      el<HTMLTextAreaElement>('profile-input').value = p.text;
      renderProfile();
    });
    box.appendChild(b);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  setupWhyLog();
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

  // The attack runs once on load so the section is never an empty promise.
  el<HTMLButtonElement>('atk-run').addEventListener('click', runAttack);
  el<HTMLButtonElement>('atk-sweep-run').addEventListener('click', runSweep);
  el<HTMLButtonElement>('atk-reroll').addEventListener('click', () => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    el<HTMLInputElement>('atk-seed').value = String((buf[0] % 2_000_000_000) + 1);
    runAttack();
  });
  el<HTMLSelectElement>('atk-n').addEventListener('change', runAttack);
  el<HTMLSelectElement>('atk-h').addEventListener('change', runAttack);
  el<HTMLInputElement>('atk-seed').addEventListener('change', runAttack);
  runAttack();

  buildGaaWeights();
  el<HTMLInputElement>('gaa-seed').addEventListener('change', renderGaa);
  el<HTMLInputElement>('gaa-seed').addEventListener('input', renderGaa);
  renderGaa();

  buildProfilePresets();
  el<HTMLTextAreaElement>('profile-input').value = PROFILE_PRESETS[1].text;
  el<HTMLTextAreaElement>('profile-input').addEventListener('input', renderProfile);
  renderProfile();

  renderAll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
