/* Drink Tracker — hand-rolled SVG charts (no libraries).
   Specs: bars ≤24px, 4px rounded data-end / square baseline, ≥2px surface gaps,
   hairline solid gridlines, single-hue for magnitude, fixed category colors. */
'use strict';

function catColorVar(catId) {
  return `var(--s${catById(catId).slot})`;
}

/* Clean y-axis ticks: pick a step so we get 2–4 gridlines with round values. */
function niceScale(maxValue) {
  if (!(maxValue > 0)) return { top: 2, ticks: [1, 2] };
  const steps = [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const s of steps) {
    if (maxValue / s <= 4 + 1e-9) {
      const top = Math.ceil(maxValue / s) * s;
      const ticks = [];
      for (let v = s; v <= top + 1e-9; v += s) ticks.push(Math.round(v * 100) / 100);
      return { top, ticks };
    }
  }
  const s = Math.pow(10, Math.ceil(Math.log10(maxValue / 4)));
  const top = Math.ceil(maxValue / s) * s;
  const ticks = [];
  for (let v = s; v <= top; v += s) ticks.push(v);
  return { top, ticks };
}

function fmtTick(v) {
  return v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 100) / 100);
}

/* Single-series column chart. buckets: [{label, tick, std, count, detail}]
   selected: index of tapped bucket (emphasis), or -1. */
function barChartSVG(buckets, opts = {}) {
  const W = 360, H = opts.height || 175;
  const padL = 30, padR = 6, padT = 16, padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = buckets.length;
  if (!n) return '';
  const max = Math.max(...buckets.map((b) => b.std));
  const { top, ticks } = niceScale(max);
  const selected = opts.selected ?? -1;

  const y = (v) => padT + plotH - (v / top) * plotH;
  const band = plotW / n;
  const barW = Math.min(24, Math.max(2, band - 2));
  let maxIdx = -1, maxV = 0;
  buckets.forEach((b, i) => { if (b.std > maxV) { maxV = b.std; maxIdx = i; } });

  let g = '';
  // gridlines + tick labels (hairline, solid, recessive)
  for (const t of ticks) {
    const ty = y(t);
    g += `<line x1="${padL}" y1="${ty.toFixed(1)}" x2="${W - padR}" y2="${ty.toFixed(1)}" stroke="var(--grid)" stroke-width="1"/>`;
    g += `<text x="${padL - 5}" y="${(ty + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)" style="font-variant-numeric:tabular-nums">${fmtTick(t)}</text>`;
  }
  // baseline
  const baseY = padT + plotH;
  g += `<line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" stroke="var(--baseline)" stroke-width="1"/>`;

  const todayIdx = buckets.findIndex((b) => Date.now() >= b.t0 && Date.now() < b.t1);

  buckets.forEach((b, i) => {
    const cx = padL + band * i + band / 2;
    const x0 = cx - barW / 2;
    if (b.std > 0) {
      const topY = y(b.std);
      const h = baseY - topY;
      const r = Math.min(4, barW / 2, h);
      const dim = selected >= 0 && selected !== i;
      // rounded top corners, square baseline
      const path =
        `M${x0.toFixed(1)} ${baseY} L${x0.toFixed(1)} ${(topY + r).toFixed(1)} ` +
        `Q${x0.toFixed(1)} ${topY.toFixed(1)} ${(x0 + r).toFixed(1)} ${topY.toFixed(1)} ` +
        `L${(x0 + barW - r).toFixed(1)} ${topY.toFixed(1)} ` +
        `Q${(x0 + barW).toFixed(1)} ${topY.toFixed(1)} ${(x0 + barW).toFixed(1)} ${(topY + r).toFixed(1)} ` +
        `L${(x0 + barW).toFixed(1)} ${baseY} Z`;
      g += `<path d="${path}" fill="var(--s1)"${dim ? ' opacity="0.35"' : ''}/>`;
      // selective direct label: the max bar only (or the selected one)
      const labelIdx = selected >= 0 ? selected : maxIdx;
      if (i === labelIdx && h > 6) {
        g += `<text x="${cx.toFixed(1)}" y="${(topY - 4).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--text-2)" style="font-variant-numeric:tabular-nums">${fmtStd(b.std)}</text>`;
      }
    }
    // x labels (subsampled via bucket.tick)
    if (b.tick) {
      const isToday = i === todayIdx;
      g += `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="${isToday ? 'var(--text-2)' : 'var(--muted)'}"${isToday ? ' font-weight="600"' : ''}>${esc(b.label)}</text>`;
    }
    // tap target: full-height invisible column
    g += `<rect x="${(padL + band * i).toFixed(1)}" y="${padT}" width="${band.toFixed(1)}" height="${plotH + padB}" fill="transparent" data-i="${i}"/>`;
  });

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(opts.ariaLabel || 'Bar chart')}">${g}</svg>`;
}

/* Donut: slices [{label, value, colorVar}], centre value + caption.
   2px surface-color gaps between segments; full circle when one slice. */
function donutSVG(slices, centerValue, centerLabel) {
  const size = 168, cx = size / 2, cy = size / 2;
  const r = 62, stroke = 24;
  const total = slices.reduce((s, x) => s + x.value, 0);
  let g = '';
  if (total <= 0 || !slices.length) {
    g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${stroke}"/>`;
  } else if (slices.length === 1) {
    g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${slices[0].colorVar}" stroke-width="${stroke}"/>`;
  } else {
    const gapAngle = 2.5 / r; // ≈2px surface gap between segments
    let a = -Math.PI / 2;
    for (const s of slices) {
      const frac = s.value / total;
      const sweep = frac * Math.PI * 2;
      const a0 = a + gapAngle / 2;
      const a1 = a + sweep - gapAngle / 2;
      a += sweep;
      if (a1 <= a0) continue; // sliver thinner than the gap
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      g += `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${s.colorVar}" stroke-width="${stroke}" stroke-linecap="butt"/>`;
    }
  }
  g += `<text x="${cx}" y="${cy - 1}" text-anchor="middle" font-size="24" font-weight="650" fill="var(--text)">${esc(centerValue)}</text>`;
  g += `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="10" fill="var(--muted)">${esc(centerLabel)}</text>`;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Breakdown by drink type">${g}</svg>`;
}
