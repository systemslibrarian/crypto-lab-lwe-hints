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
const ANCHOR = { n: 2 ** 15, h: 32, hintsNew: 320 };

let h = 32;
let nExp = 15; // n = 2^nExp

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (x: number) => Math.round(x).toLocaleString('en-US');
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
  if (Number.isInteger(hp) && hp >= 1 && hp <= 256) h = hp;
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

// ---------------------------------------------------------------------------
// Render: calculator
// ---------------------------------------------------------------------------
function renderCalc(): void {
  const rate = Math.max(0, Number(el<HTMLInputElement>('calc-rate').value) || 0);
  const ops = Math.max(0, Number(el<HTMLInputElement>('calc-ops').value) || 0);
  const available = rate * ops;
  const res = effectiveScenario(n(), h, available);
  const box = el('calc-result');

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
      `<tr><td>${s.label}</td><td>2^${Math.round(Math.log2(s.n))}</td>` +
      `<td>${s.log2q}</td><td>${s.h}</td>` +
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
    const yv = hintsNew(Math.max(1, hv));
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

  // anchor marker (h=32, 320) — only meaningful when n == anchor n
  const ax = xPix(ANCHOR.h);
  const ay = yPix(ANCHOR.hintsNew);
  ctx.fillStyle = cAnchor;
  ctx.beginPath();
  const s = 6;
  ctx.moveTo(ax, ay - s);
  ctx.lineTo(ax + s, ay);
  ctx.lineTo(ax, ay + s);
  ctx.lineTo(ax - s, ay);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = text;
  ctx.textAlign = 'left';
  ctx.font = '11px sans-serif';
  ctx.fillText('paper anchor (32, 320)', ax + 10, ay - 6);

  // current-selection marker on the new curve
  const cx = xPix(h);
  const cy = yPix(hintsNew(h));
  ctx.fillStyle = cNew;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  // legend
  ctx.textAlign = 'left';
  ctx.font = '12px sans-serif';
  ctx.fillStyle = cNew;
  ctx.fillText('● this method  C·h·log₂h', padL + 8, padT + 14);
  ctx.fillStyle = cPrior;
  ctx.fillText('– – prior baseline  n/2', padL + 8, padT + 30);
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

function renderAll(): void {
  syncControls();
  renderReadout();
  renderCalc();
  renderVerify();
  draw();
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

function init(): void {
  setupThemeToggle();
  readUrlState();
  buildPresets();
  renderTable();

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
