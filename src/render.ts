/**
 * Drawing the cascade.
 *
 * Three colours carry the whole argument: vermilion for a paper that builds on
 * the retraction and never says so, ink for one that cites the retraction, and
 * a faded grey for work published before the retraction existed and cannot be
 * blamed. Everything else is a hairline.
 */

import { PAD_LEFT, PAD_TOP, type CascadeLayout } from './cascade';

export interface RenderOptions {
  layout: CascadeLayout;
  edges: Array<[string, string]>;
  selected: string | null;
  /** ids along the selected paper's shortest path back to the retraction */
  path: string[];
  /** the year the retraction was published: the line the whole picture turns on */
  noticeYear?: number | null;
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderCascade(root: Element, options: RenderOptions): void {
  const { layout, edges, selected, path, noticeYear } = options;
  const { placed, width, height, years } = layout;
  const onPath = new Set(path);
  const parts: string[] = [];

  parts.push(
    `<svg class="cascade" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="citation cascade">`,
  );

  // the time axis: one column per year, numbered where there is room
  const span = years.max - years.min;
  const every = span > 22 ? 3 : span > 12 ? 2 : 1;
  for (let year = years.min; year <= years.max; year += 1) {
    const sample = [...placed.values()].find((spot) => spot.work.year === year);
    if (!sample) continue;
    const x = sample.x;
    parts.push(`<line class="year-rule" x1="${x}" y1="44" x2="${x}" y2="${height - 52}" />`);
    if ((year - years.min) % every === 0 || year === years.max) {
      parts.push(`<text class="year-tick" x="${x}" y="${height - 32}">${year}</text>`);
    }
  }

  if (typeof noticeYear === 'number') {
    const span = Math.max(1, years.max - years.min);
    const x = PAD_LEFT + ((noticeYear - years.min) / span) * (width - PAD_LEFT - 60);
    parts.push(
      `<line class="retracted-rule" x1="${x}" y1="36" x2="${x}" y2="${height - 52}" />`,
      `<text class="retracted-label" x="${x - 6}" y="30" text-anchor="end">retracted ${noticeYear}</text>`,
    );
  }

  // the vertical axis is how much each paper is itself cited
  for (const tick of layout.ticks) {
    const label = tick.value >= 1000 ? `${tick.value / 1000}k` : String(tick.value);
    parts.push(`<line class="row-rule" x1="70" y1="${tick.y}" x2="${width - 40}" y2="${tick.y}" />`);
    parts.push(`<text class="row-label" x="62" y="${tick.y + 3}">${label}</text>`);
  }
  parts.push(`<text class="axis-label" x="62" y="${PAD_TOP - 18}" text-anchor="end">citations</text>`);

  // citation edges, drawn under the papers
  const lines: string[] = [];
  for (const [from, to] of edges) {
    const child = placed.get(from);
    const parent = placed.get(to);
    if (!child || !parent) continue;
    const dx = Math.max(24, Math.abs(child.x - parent.x) * 0.45);
    const d = `M ${parent.x} ${parent.y} C ${parent.x + dx} ${parent.y}, ${child.x - dx} ${child.y}, ${child.x} ${child.y}`;
    // every paper here cites the retracted one, so drawing those edges would
    // be 600 identical lines; only the selected chain is worth a line
    if (!(onPath.has(from) && onPath.has(to))) continue;
    lines.push(`<path class="edge is-hot" d="${d}" />`);
  }
  parts.push(`<g class="edges">${lines.join('')}</g>`);

  // papers
  for (const spot of placed.values()) {
    const { work, x, y, r } = spot;
    const classes = ['work'];
    if (work.role === 'seed') classes.push('is-seed');
    else if (work.role === 'notice') classes.push('is-notice');
    else if (work.silent) classes.push('is-silent');
    else if (work.predates) classes.push('is-predates');
    if (selected === work.id) classes.push('is-selected');
    if (onPath.has(work.id)) classes.push('is-on-path');
    const radius = work.role === 'seed' ? r + 4 : work.role === 'notice' ? r + 1.5 : r;
    parts.push(
      `<g class="${classes.join(' ')}" data-id="${esc(work.id)}" transform="translate(${x} ${y})">`,
      `<circle class="dot" r="${radius.toFixed(1)}" />`,
      `<circle class="hit" r="${Math.max(9, radius + 4).toFixed(1)}" />`,
      work.role === 'seed' || work.role === 'notice'
        ? `<text class="mark" y="${(-radius - 6).toFixed(1)}" text-anchor="middle">${work.role === 'seed' ? 'retracted paper' : 'retraction notice'}</text>`
        : '',
      `<title>${esc(work.title.slice(0, 120))}${work.year ? ` (${work.year})` : ''}</title>`,
      `</g>`,
    );
  }

  // the selected chain, on top of everything
  for (let i = 0; i < path.length - 1; i += 1) {
    const child = placed.get(path[i] as string);
    const parent = placed.get(path[i + 1] as string);
    if (!child || !parent) continue;
    const dx = Math.max(24, Math.abs(child.x - parent.x) * 0.45);
    parts.push(
      `<path class="edge is-hot" d="M ${parent.x} ${parent.y} C ${parent.x + dx} ${parent.y}, ${child.x - dx} ${child.y}, ${child.x} ${child.y}" />`,
    );
  }

  parts.push('</svg>');
  root.innerHTML = parts.join('');
}
