// One React component per Board Script shape kind, written on a ruled notebook leaf. Geometry comes
// from rough.js (rough.ts): clean single strokes in the tutor's blue-black pen. Diagram boxes are
// cards whose leaf fill hides the rules; free text is Kalam handwriting whose baselines sit on the
// 40 px rules; code stays mono and formulas stay typeset (both libraries load on first use).
import { memo, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { ShapeStyle } from '@chalk/schema';
import { arrowGeometry, tableColumnWidths, gridToPx, type BoardPage, type ShapeState } from '@chalk/board';
import { rect, ellipse, line, curve, linear, FILL, type RPath } from './rough';
import { useHljs, useKatex } from './lazy';
import { openSource, useMaterials } from '../features/materials/store';
import { ErrorBoundary, ErrorSlip } from '../ui/ErrorBoundary';
import './citeTag.css';
import './board.css';

export const STROKE: Record<ShapeStyle, string> = {
  default: 'var(--pen)', accent: 'var(--fig-accent)', muted: 'var(--fig-muted)',
  good: 'var(--fig-good)', warn: 'var(--fig-warn)', bad: 'var(--fig-bad)',
};
const colorOf = (s: ShapeState) => STROKE[s.style ?? 'default'] ?? STROKE.default;

export function Paths({ paths, color, fill, width = 2.2, fillOpacity = 0.32, solidOpacity = 0.16 }: { paths: RPath[]; color: string; fill?: string; width?: number; fillOpacity?: number; solidOpacity?: number }) {
  return (
    <>
      {paths.map((p, i) => p.kind === 'solid'
        ? <path key={i} className="fillpath" d={p.d} style={{ fill: fill ?? color, stroke: 'none', fillOpacity: solidOpacity }} />
        : <path key={i} className="stroke" d={p.d} pathLength={1}
            style={p.kind === 'sketch' ? { stroke: fill ?? color, strokeWidth: 1.1, opacity: fillOpacity } : { stroke: color, strokeWidth: width }} />)}
    </>
  );
}

/** The rule pitch of the leaf, in board px: half a Board Script cell, so cell centres sit on it. */
export const RULE = 40;
/** The baseline sits this far above its rule, so descenders cross the rule like real writing. */
const BASE_LIFT = 3;
/** Average Kalam advance per em (regular, bold): enough to keep a line inside its shape. */
const ADV = { 400: 0.46, 700: 0.5 } as const;

/** Line pitch on the open leaf: whole rules, never tighter than the type (a 44 px title takes two). */
const snapPitch = (fs: number) => RULE * Math.max(1, Math.ceil((fs * 1.25) / RULE - 0.05));

/** Shrink a hand size until the longest line fits maxW (never below 70 percent). */
function fitSize(lines: string[], size: number, maxW: number, weight = 400) {
  const chars = Math.max(1, ...lines.map((l) => l.length));
  const k = weight >= 700 ? ADV[700] : ADV[400];
  return chars * size * k <= maxW ? size : Math.max(size * 0.7, maxW / (chars * k));
}

/**
 * Handwritten lines. Baselines are alphabetic. On the open leaf (snap) every baseline lands on a
 * rule; inside a card the block is centred on y. While the shape is being drawn each line is
 * written on in turn (a clip sweep), sharing the window [from, from + span] of the draw time.
 */
function Lines({ text, x, y, size = 28, anchor = 'middle', color = 'var(--pen)', weight = 400, snap = false, from = 0, span = 1, maxW }: {
  text: string; x: number; y: number; size?: number; anchor?: 'start' | 'middle' | 'end'; color?: string; weight?: number;
  snap?: boolean; from?: number; span?: number; maxW?: number;
}) {
  const lines = text.split('\n');
  const fs = maxW ? fitSize(lines, size, maxW, weight) : size;
  const lh = snap ? snapPitch(fs) : Math.round(fs * 1.32);
  // the em box centre is 0.28 em above the baseline with the hand faces' metric overrides
  let base = y - ((lines.length - 1) * lh) / 2 + fs * 0.3;
  if (snap) base = Math.round((base + BASE_LIFT) / RULE) * RULE - BASE_LIFT;
  const total = lines.reduce((n, l) => n + Math.max(1, l.length), 0);
  let done = 0;
  return (
    <g className="hw" style={{ fontSize: fs, fill: color, fontWeight: weight }}>
      {lines.map((l, i) => {
        const n = Math.max(1, l.length);
        const style = { '--ws': from + (span * done) / total, '--wl': (span * n) / total } as CSSProperties;
        done += n;
        return <text key={i} x={x} y={base + i * lh} textAnchor={anchor} dominantBaseline="alphabetic" style={style}>{l || ' '}</text>;
      })}
    </g>
  );
}

/** A card: the leaf colour under a figure, so the rules stop at its edge like pasted paper. */
const Card = ({ x, y, w, h, round }: { x: number; y: number; w: number; h: number; round?: boolean }) => round
  ? <ellipse className="card" cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} />
  : <rect className="card" x={x} y={y} width={w} height={h} />;

const filled = (s: ShapeState) => s.style && s.style !== 'default' && s.style !== 'muted';

// a label inside a figure is written once the pen has drawn most of the outline
const LABEL_FROM = 0.4, LABEL_SPAN = 0.6;

function Box({ s }: { s: ShapeState }) {
  const c = colorOf(s);
  const p = useMemo(() => rect(s.id, s.x, s.y, s.w, s.h, filled(s) ? { fill: FILL, fillStyle: 'hachure', hachureGap: 9 } : {}), [s.id, s.x, s.y, s.w, s.h, s.style]);
  return (
    <>
      <Card x={s.x} y={s.y} w={s.w} h={s.h} />
      <Paths paths={p} color={c} width={2.4} solidOpacity={0.12} />
      {s.text && <Lines text={s.text} x={s.x + s.w / 2} y={s.y + s.h / 2} maxW={s.w - 20} from={LABEL_FROM} span={LABEL_SPAN} />}
    </>
  );
}

function Circle({ s }: { s: ShapeState }) {
  const c = colorOf(s);
  const p = useMemo(() => ellipse(s.id, s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, filled(s) ? { fill: FILL, fillStyle: 'hachure', hachureGap: 9 } : {}), [s.id, s.x, s.y, s.w, s.h, s.style]);
  return (
    <>
      <Card x={s.x} y={s.y} w={s.w} h={s.h} round />
      <Paths paths={p} color={c} width={2.6} solidOpacity={0.12} />
      {s.text && <Lines text={s.text} x={s.x + s.w / 2} y={s.y + s.h / 2} maxW={s.w * 0.8} weight={filled(s) ? 700 : 400} from={LABEL_FROM} span={LABEL_SPAN} />}
    </>
  );
}

function Sticky({ s }: { s: ShapeState }) {
  const tilt = ((s.id.charCodeAt(0) % 5) - 2) * 0.7;
  const cx = s.x + s.w / 2;
  return (
    <g className="b-sticky" transform={`rotate(${tilt} ${cx} ${s.y + s.h / 2})`}>
      <g className="b-sticky-in">
        <rect x={s.x} y={s.y} width={s.w} height={s.h} className="b-sticky-paper" />
        <path d={`M${s.x} ${s.y + s.h} H${s.x + s.w} V${s.y + 10}`} className="b-sticky-curl" />
        <rect x={cx - 34} y={s.y - 10} width={68} height={20} className="b-sticky-tape" transform={`rotate(-4 ${cx} ${s.y})`} />
        <foreignObject x={s.x} y={s.y} width={s.w} height={s.h}><div className="fo-sticky b-sticky-text">{s.text}</div></foreignObject>
      </g>
    </g>
  );
}

/** Free text on the open leaf: handwriting on the rules. An accent line is a title, underlined in the segment hue. */
function Text({ s }: { s: ShapeState }) {
  const accent = s.style === 'accent';
  const text = s.text ?? '';
  const lines = text.split('\n');
  const size = accent ? 44 : 28;
  const weight = accent ? 700 : 400;
  const maxW = s.w + 40;
  const fs = fitSize(lines, size, maxW, weight);
  const color = accent || !s.style ? 'var(--pen)' : colorOf(s);
  let underline: ReactNode = null;
  if (accent) {
    const chars = Math.max(1, ...lines.map((l) => l.length));
    const w = Math.min(maxW, chars * fs * ADV[700]);
    const cx = s.x + s.w / 2, x0 = cx - w / 2, x1 = cx + w / 2;
    // just under the last baseline, with the slight wave of a hand-drawn rule
    const lh = snapPitch(fs);
    const first = Math.round((s.y + s.h / 2 - ((lines.length - 1) * lh) / 2 + fs * 0.3 + BASE_LIFT) / RULE) * RULE - BASE_LIFT;
    const y = first + (lines.length - 1) * lh + 11;
    underline = <path className="b-underline" pathLength={1} d={`M${x0} ${y} C ${x0 + w * 0.3} ${y - 4}, ${x0 + w * 0.65} ${y + 3}, ${x1} ${y - 2}`} />;
  }
  return (
    <>
      <Lines text={text} x={s.x + s.w / 2} y={s.y + s.h / 2} size={size} weight={weight} color={color} snap maxW={maxW} span={accent ? 0.82 : 1} />
      {underline}
    </>
  );
}

function Formula({ s }: { s: ShapeState }) {
  const { lib: katex, failed } = useKatex();
  const src = s.latex ?? s.text ?? '';
  const html = useMemo(() => (katex ? katex.renderToString(src, { throwOnError: false, displayMode: true, output: 'html' }) : ''), [katex, src]);
  const pad = 40;
  return (
    <foreignObject x={s.x - pad} y={s.y - 8} width={s.w + pad * 2} height={s.h + 16}>
      {html
        ? <div className="fo-formula b-formula" style={{ color: s.style ? colorOf(s) : undefined }} dangerouslySetInnerHTML={{ __html: html }} />
        : <div className={`fo-formula b-formula pending${failed ? ' failed' : ''}`}>{src}</div>}
    </foreignObject>
  );
}

function Code({ s }: { s: ShapeState }) {
  const { lib: hljs } = useHljs();
  const code = s.code ?? s.text ?? '';
  const html = useMemo(() => {
    if (!hljs) return escapeHtml(code);
    try {
      return s.lang && hljs.getLanguage(s.lang) ? hljs.highlight(code, { language: s.lang }).value : hljs.highlightAuto(code).value;
    } catch { return escapeHtml(code); }
  }, [hljs, code, s.lang]);
  const p = useMemo(() => rect(s.id, s.x, s.y, s.w, s.h, { roughness: 0.7, strokeWidth: 1.5 }), [s.id, s.x, s.y, s.w, s.h]);
  return (
    <>
      <Card x={s.x} y={s.y} w={s.w} h={s.h} />
      <Paths paths={p} color="var(--fig-muted)" width={1.5} />
      <foreignObject x={s.x} y={s.y} width={s.w} height={s.h}><pre className="fo-code b-code" dangerouslySetInnerHTML={{ __html: html }} /></foreignObject>
    </>
  );
}

function Table({ s }: { s: ShapeState }) {
  const rows = s.rows ?? [[s.text ?? '']];
  const natural = tableColumnWidths(rows);
  const total = natural.reduce((a, b) => a + b, 0) || 1;
  const widths = natural.map((w) => (w / total) * s.w);
  const rh = s.h / rows.length;
  const paths = useMemo(() => {
    const out: RPath[] = [...rect(s.id, s.x, s.y, s.w, s.h, { roughness: 0.8 })];
    for (let r = 1; r < rows.length; r++) out.push(...line(`${s.id}r${r}`, s.x, s.y + r * rh, s.x + s.w, s.y + r * rh, { roughness: 0.6, strokeWidth: r === 1 ? 2 : 1 }));
    let x = s.x;
    for (let c = 0; c < widths.length - 1; c++) { x += widths[c]; out.push(...line(`${s.id}c${c}`, x, s.y, x, s.y + s.h, { roughness: 0.6, strokeWidth: 1 })); }
    return out;
  }, [s.id, s.x, s.y, s.w, s.h, rows.length, widths.join(',')]);
  const cells = rows.length * Math.max(1, widths.length);
  return (
    <>
      <Card x={s.x} y={s.y} w={s.w} h={s.h} />
      <Paths paths={paths} color={s.style ? colorOf(s) : 'var(--pen)'} width={1.6} />
      {rows.map((row, r) => {
        let x = s.x;
        return row.map((cell, c) => {
          const cx = x + widths[c] / 2;
          x += widths[c];
          const k = r * widths.length + c;
          return <Lines key={`${r}-${c}`} text={cell} x={cx} y={s.y + r * rh + rh / 2} size={22} maxW={widths[c] - 10} weight={r === 0 ? 700 : 400}
            color={r === 0 ? 'var(--fig-accent)' : 'var(--pen)'} from={0.3 + (0.7 * k) / cells} span={0.7 / cells} />;
        });
      })}
    </>
  );
}

function Chart({ s }: { s: ShapeState }) {
  const spec = s.chart;
  const pad = { l: 52, r: 12, t: 26, b: 38 };
  const iw = s.w - pad.l - pad.r, ih = s.h - pad.t - pad.b;
  const ox = s.x + pad.l, oy = s.y + pad.t + ih;
  const data = spec?.data ?? [];
  const max = Math.max(1e-9, ...data.map((d) => d.y));
  const paths = useMemo(() => {
    const out: RPath[] = [...line(`${s.id}ax`, ox, oy, ox + iw, oy, { roughness: 0.5 }), ...line(`${s.id}ay`, ox, oy, ox, oy - ih, { roughness: 0.5 })];
    if (spec?.type === 'line') {
      const pts = data.map((d, i): [number, number] => [ox + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw), oy - (d.y / max) * ih]);
      if (pts.length > 1) out.push(...linear(`${s.id}ln`, pts, { strokeWidth: 2.4 }));
    }
    return out;
  }, [s.id, s.x, s.y, s.w, s.h, JSON.stringify(spec)]);
  const bw = data.length ? (iw / data.length) * 0.62 : 0;
  return (
    <>
      <Card x={s.x} y={s.y} w={s.w} h={s.h} />
      <Paths paths={paths} color="var(--pen)" />
      {spec?.type !== 'line' && data.map((d, i) => {
        const h = (d.y / max) * ih;
        const x = ox + (i + 0.19) * (iw / data.length);
        return <Paths key={i} paths={rect(`${s.id}b${i}`, x, oy - h, bw, h, { fill: FILL, fillStyle: 'hachure', hachureGap: 6 })} color="var(--fig-accent)" />;
      })}
      {data.map((d, i) => {
        const x = spec?.type === 'line' ? ox + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw) : ox + (i + 0.5) * (iw / data.length);
        return <text key={`x${i}`} className="label b-hand" x={x} y={oy + 24} textAnchor="middle" style={{ fontSize: 19 }}>{String(d.x)}</text>;
      })}
      <text className="label b-num" x={ox - 8} y={oy - ih} textAnchor="end" dominantBaseline="central">{fmt(max)}</text>
      <text className="label b-num" x={ox - 8} y={oy} textAnchor="end" dominantBaseline="central">0</text>
      {spec?.yLabel && <text className="label b-hand muted" x={ox + 8} y={s.y + 18} style={{ fontSize: 19 }}>{spec.yLabel}</text>}
      {spec?.xLabel && <text className="label b-hand muted" x={ox + iw} y={s.y + s.h - 4} textAnchor="end" style={{ fontSize: 19 }}>{spec.xLabel}</text>}
    </>
  );
}

const fmt = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n * 100) / 100));

let mermaidSeq = 0;
function Mermaid({ s }: { s: ShapeState }) {
  const [svg, setSvg] = useState<string>('');
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    (async () => {
      const { default: mermaid } = await import('mermaid');
      const cs = getComputedStyle(document.documentElement);
      const v = (name: string) => cs.getPropertyValue(name).trim();
      mermaid.initialize({
        startOnLoad: false, securityLevel: 'strict', theme: 'base',
        fontFamily: "'Archivo Variable', sans-serif",
        themeVariables: {
          darkMode: false, background: 'transparent', fontSize: '18px',
          primaryColor: v('--leaf'), primaryTextColor: v('--pen'),
          primaryBorderColor: v('--pen'), lineColor: v('--pen'),
          secondaryColor: v('--leaf-edge'), tertiaryColor: v('--leaf'),
          actorBkg: v('--leaf'), actorBorder: v('--pen'), actorTextColor: v('--pen'),
          signalColor: v('--pen'), signalTextColor: v('--pen'), noteBkgColor: v('--note'),
        },
      });
      try {
        const out = await mermaid.render(`mmd-${++mermaidSeq}`, s.code ?? '');
        if (alive) setSvg(out.svg);
      } catch (e) {
        if (alive) setErr(String((e as Error).message ?? e).slice(0, 200));
      }
    })().catch((e: unknown) => { if (alive) setErr(String((e as Error)?.message ?? e).slice(0, 200)); });
    return () => { alive = false; };
  }, [s.code]);
  return (
    <>
      <Card x={s.x} y={s.y} w={s.w} h={s.h} />
      <foreignObject x={s.x} y={s.y} width={s.w} height={s.h}>
        {err ? <pre className="fo-code" style={{ color: 'var(--fig-bad)', whiteSpace: 'pre-wrap' }}>Diagram error: {err}</pre>
          : <div className="fo-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />}
      </foreignObject>
    </>
  );
}

function Image({ s }: { s: ShapeState }) {
  if (s.lang === 'mermaid') return <Mermaid s={s} />;
  return <Picture s={s} />;
}

function Picture({ s }: { s: ShapeState }) {
  const src = s.src ?? '';
  // TODO(frontend): resolve course resources from Supabase Storage once PDFs land (P1)
  const href = src.startsWith('data:image/') || /^https:\/\//.test(src) ? src : '';
  const p = useMemo(() => rect(s.id, s.x, s.y, s.w, s.h, { roughness: 0.5, strokeWidth: 1.2 }), [s.id, s.x, s.y, s.w, s.h]);
  return (
    <>
      <Card x={s.x} y={s.y} w={s.w} h={s.h} />
      {href ? <image href={href} x={s.x} y={s.y} width={s.w} height={s.h} preserveAspectRatio="xMidYMid meet" className="label" />
        : <text className="label b-ui" x={s.x + s.w / 2} y={s.y + s.h / 2} textAnchor="middle" dominantBaseline="central">{`Image: ${src || 'missing source'}`}</text>}
      <Paths paths={p} color="var(--fig-muted)" width={1.2} />
    </>
  );
}

function PathShape({ s }: { s: ShapeState }) {
  const pts = (s.points ?? []).map((p): [number, number] => { const q = gridToPx(p); return [q.x, q.y]; });
  const p = useMemo(() => (pts.length > 1 ? curve(s.id, pts, { strokeWidth: s.user ? 3 : 2.4 }) : []), [s.id, JSON.stringify(s.points)]);
  return <Paths paths={p} color={s.user ? STROKE[s.style ?? 'warn'] : colorOf(s)} width={s.user ? 3 : 2.4} />;
}

function Frame({ s }: { s: ShapeState }) {
  const p = useMemo(() => rect(s.id, s.x, s.y, s.w, s.h, { roughness: 0.8, strokeWidth: 1.4, strokeLineDash: [10, 8] }), [s.id, s.x, s.y, s.w, s.h]);
  const title = s.title ?? s.text;
  return (
    <>
      <Paths paths={p} color="var(--fig-muted)" width={1.4} />
      {title && <Lines text={title} x={s.x + 10} y={s.y - 16} size={22} anchor="start" color="var(--ink-3)" maxW={s.w - 20} />}
    </>
  );
}

function Arrow({ s, page }: { s: ShapeState; page: BoardPage }) {
  const g = arrowGeometry(page, s);
  const key = g ? `${g.x1.toFixed(1)},${g.y1.toFixed(1)},${g.x2.toFixed(1)},${g.y2.toFixed(1)}` : '';
  const paths = useMemo(() => {
    if (!g) return [];
    const ang = Math.atan2(g.y2 - g.y1, g.x2 - g.x1), L = 15, spread = 0.42;
    return [
      ...line(s.id, g.x1, g.y1, g.x2, g.y2, { roughness: 0.9 }),
      ...line(`${s.id}h1`, g.x2, g.y2, g.x2 - L * Math.cos(ang - spread), g.y2 - L * Math.sin(ang - spread), { roughness: 0.4 }),
      ...line(`${s.id}h2`, g.x2, g.y2, g.x2 - L * Math.cos(ang + spread), g.y2 - L * Math.sin(ang + spread), { roughness: 0.4 }),
    ];
  }, [s.id, key]);
  if (!g) return null;
  const mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2;
  const lw = (s.label?.length ?? 0) * 20 * ADV[400];
  return (
    <>
      <Paths paths={paths} color={colorOf(s)} width={2.4} />
      {s.label && (
        <g>
          <rect className="card b-arrow-label" x={mx - lw / 2 - 8} y={my - 17} width={lw + 16} height={30} rx={6} />
          <Lines text={s.label} x={mx} y={my - 2} size={20} color="var(--ink-2)" from={LABEL_FROM} span={LABEL_SPAN} />
        </g>
      )}
    </>
  );
}

/** A shape's `source` ("res:<source id>#p<page>", page optional), or null. */
export function parseSource(source: string | undefined): { id: string; page: number | null } | null {
  const m = source ? /^res:([\w.-]+)(?:#p(\d+))?$/.exec(source) : null;
  if (!m) return null;
  const page = m[2] ? Number(m[2]) : null;
  return { id: m[1], page: page && page > 0 ? page : null };
}

const TAG_H = 40;
const TAG_MAX_W = 380;

/**
 * Lane Q: a printed citation tag on the shape's top right corner. Named from the materials
 * cache when the title is known, else "Source"; pressing it opens the source in the Materials
 * tab, like the citation chips in chat. Only the tag takes the pointer, never the box around it.
 */
function CiteTag({ s }: { s: ShapeState }) {
  const cite = parseSource(s.source);
  const title = useMaterials((st) => (cite ? st.titles[cite.id] : undefined));
  if (!cite || s.kind === 'arrow' || s.kind === 'group') return null;
  const name = title || 'Source';
  const label = `Open source: ${name}${cite.page ? `, page ${cite.page}` : ''}`;
  // right edge on the shape's right edge, sitting on its top rule
  const x = s.x + s.w - TAG_MAX_W;
  const y = s.y - TAG_H / 2;
  return (
    <foreignObject className="cite-tag-fo" x={x} y={y} width={TAG_MAX_W} height={TAG_H}>
      <div className="cite-tag-row">
        <button type="button" className="cite-tag" aria-label={label} title={label}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); openSource(cite.id, cite.page); }}>
          <span className="cite-tag-title">{name}</span>
          {cite.page && <span className="cite-tag-page">p. {cite.page}</span>}
        </button>
      </div>
    </foreignObject>
  );
}

export const ShapeView = memo(function ShapeView({ s, page, animMs, selected, pulsing, onPointerDown, onKeyDown, onFocus, tabStop, tags = true }: {
  s: ShapeState; page: BoardPage; animMs?: number; selected?: boolean; pulsing?: boolean;
  onPointerDown?: (e: React.PointerEvent, id: string) => void;
  /** keyboard selection (Board): with these set the figure is focusable; tabStop marks the board's one tab stop */
  onKeyDown?: (e: React.KeyboardEvent, id: string) => void;
  onFocus?: (id: string) => void;
  tabStop?: boolean;
  /** citation tags; off in page thumbnails (no buttons inside a button) */
  tags?: boolean;
}) {
  let body: React.ReactNode;
  switch (s.kind) {
    case 'box': body = <Box s={s} />; break;
    case 'circle': body = <Circle s={s} />; break;
    case 'sticky': body = <Sticky s={s} />; break;
    case 'text': body = <Text s={s} />; break;
    case 'formula': body = <Formula s={s} />; break;
    case 'code': body = <Code s={s} />; break;
    case 'table': body = <Table s={s} />; break;
    case 'chart': body = <Chart s={s} />; break;
    case 'image': body = <Image s={s} />; break;
    case 'path': body = <PathShape s={s} />; break;
    case 'frame': body = <Frame s={s} />; break;
    case 'arrow': body = <Arrow s={s} page={page} />; break;
    default: body = null;
  }
  const cls = ['shape', animMs ? 'draw' : '', s.faded ? 'faded' : '', selected ? 'selected' : '', pulsing ? 'pulse' : ''].filter(Boolean).join(' ');
  const style = animMs ? ({ '--dur': `${animMs}ms` } as CSSProperties) : undefined;
  const label = [s.text, s.label, s.latex, s.title].filter(Boolean).join(' ') || s.kind;
  return (
    <g className={cls} style={style} data-id={s.id} onPointerDown={onPointerDown ? (e) => onPointerDown(e, s.id) : undefined}
      tabIndex={onKeyDown ? (tabStop ? 0 : -1) : undefined}
      onKeyDown={onKeyDown ? (e) => { if (e.target === e.currentTarget) onKeyDown(e, s.id); } : undefined}
      onFocus={onFocus ? (e) => { if (e.target === e.currentTarget) onFocus(s.id); } : undefined}
      role="group" aria-label={`${s.kind}: ${label}${selected ? ', selected' : ''}`}>
      {s.kind !== 'arrow' && s.kind !== 'group' && <rect className="sel" x={s.x - 6} y={s.y - 6} width={s.w + 12} height={s.h + 12} rx={8} />}
      {/* invisible hit area so thin strokes are easy to click */}
      {s.kind !== 'arrow' && s.kind !== 'group' && s.kind !== 'frame' && <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="transparent" />}
      <ErrorBoundary what={`Board figure ${s.id} (${s.kind})`} resetKeys={[s]} fallback={(_e, reset) => <ShapeSlip s={s} onRetry={reset} />}>{body}</ErrorBoundary>
      {tags && s.source && <CiteTag s={s} />}
    </g>
  );
// onPointerDown is part of the comparison: Board keeps it stable and reads the live selection
// itself, so a re-render here only happens when the shape or its state changes.
}, (a, b) => a.s === b.s && a.animMs === b.animMs && a.selected === b.selected && a.pulsing === b.pulsing && a.tags === b.tags
  && a.onPointerDown === b.onPointerDown && a.onKeyDown === b.onKeyDown && a.onFocus === b.onFocus && a.tabStop === b.tabStop
  && (a.s.kind !== 'arrow' || a.page === b.page));

/** A figure that failed to render (a KaTeX or mermaid error): a small slip in its place. */
function ShapeSlip({ s, onRetry }: { s: ShapeState; onRetry: () => void }) {
  const w = Math.max(s.w, 260), h = Math.max(s.h, 96);
  return (
    <foreignObject x={s.x + s.w / 2 - w / 2} y={s.y + s.h / 2 - h / 2} width={w} height={h}>
      <div className="b-slip" onPointerDown={(e) => e.stopPropagation()}><ErrorSlip what="This figure" compact onRetry={onRetry} /></div>
    </foreignObject>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
