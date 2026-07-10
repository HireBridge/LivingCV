/*
 * ─────────────────────────────────────────────────────────────────────────────
 * HeroDiagram — data-driven SVG node diagram for the Classic template
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * JSON CONTRACT  (stored in site_content, section_key = 'hero')
 * ─────────────────────────────────────────────────────────────
 * The full hero JSON may include a top-level "diagram" object:
 *
 *   {
 *     "eyebrow": "...", "name": "...", "roleLine": "...", "links": [...],
 *     "diagram": {
 *       "enabled":     true,          // false → hides the entire diagram
 *       "centerLabel": "Mohith",      // center-node text; falls back to
 *                                     // diagramCenterLabel, then first name
 *       "nodes": [                    // 1–6 nodes; omit to auto-derive
 *                                     // from featured projects (up to 6)
 *         { "label": "jobops",    "sublabel": "npm",  "href": "#jobops",    "accent": "signal" },
 *         { "label": "HireBridge","sublabel": "Go",   "href": "#hirebridge","accent": "rust"   },
 *         { "label": "portfolio", "sublabel": "Next", "href": "#portfolio", "accent": "ink"    }
 *       ],
 *       "layout":  "corners",         // "corners" (default) | "arc" | "radial"
 *       "animate": true               // draw-in animation; always off when
 *                                     // prefers-reduced-motion: reduce
 *     }
 *   }
 *
 * ACCENT values: "signal" (green stroke) | "rust" (terracotta) | "ink" (dark)
 * LAYOUT values:
 *   "corners" — up to 4 nodes in top-left / bottom-left / top-right /
 *               bottom-right corners (legacy layout, max 4 visible)
 *   "arc"     — nodes arranged in a left/right semicircle (up to 6)
 *   "radial"  — nodes evenly distributed on a full circle (up to 6)
 *
 * SQL EXAMPLE (MCP agent):
 *   UPDATE site_content
 *   SET content = json_patch(content, '{"diagram":{"enabled":true,"layout":"arc",
 *     "nodes":[{"label":"jobops","sublabel":"npm","href":"#jobops","accent":"signal"}]}}')
 *   WHERE template_slug = 'classic' AND section_key = 'hero'
 *   ORDER BY id DESC LIMIT 1;
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { ProjectProps, HeroDiagramConfig, DiagramNodeSpec } from '@livingcv/shared';
import { HeroDiagramConfigSchema } from '@livingcv/shared';

// ── Layout geometry ──────────────────────────────────────────────────────────

const W = 820;
const H = 220;
const NODE_W = 150;
const NODE_H = 34;
const CENTER_W = 110;
const CENTER_H = 34;
const CX = W / 2 - CENTER_W / 2;   // center rect x
const CY = H / 2 - CENTER_H / 2;   // center rect y
const CCX = W / 2;                   // center-circle x
const CCY = H / 2;                   // center-circle y

// "corners" layout — legacy 4 slots (original positions, kept exactly)
const CORNERS: { x: number; y: number; side: 'left' | 'right' }[] = [
  { x: 20,  y: 10,  side: 'left'  },
  { x: 20,  y: 160, side: 'left'  },
  { x: 650, y: 10,  side: 'right' },
  { x: 650, y: 160, side: 'right' },
];

/** Return slot positions for "arc" layout (left semi-circle for first half,
 *  right semi-circle for second half) with up to 6 nodes. */
function arcSlots(n: number): { x: number; y: number; side: 'left' | 'right' }[] {
  const slots: { x: number; y: number; side: 'left' | 'right' }[] = [];
  const leftCount = Math.ceil(n / 2);
  const rightCount = n - leftCount;

  // left arc: angles from 210° to 150° (bottom-left to top-left)
  const leftAngles = distribute(leftCount, 210, 150);
  for (const a of leftAngles) {
    const rad = (a * Math.PI) / 180;
    const rx = 260; const ry = 90;
    const nx = CCX + rx * Math.cos(rad) - NODE_W / 2;
    const ny = CCY + ry * Math.sin(rad) - NODE_H / 2;
    slots.push({ x: Math.round(nx), y: Math.round(ny), side: 'left' });
  }
  // right arc: angles from -30° to 30° (top-right to bottom-right)
  const rightAngles = distribute(rightCount, -30, 30);
  for (const a of rightAngles) {
    const rad = (a * Math.PI) / 180;
    const rx = 260; const ry = 90;
    const nx = CCX + rx * Math.cos(rad) - NODE_W / 2;
    const ny = CCY + ry * Math.sin(rad) - NODE_H / 2;
    slots.push({ x: Math.round(nx), y: Math.round(ny), side: 'right' });
  }
  return slots;
}

/** Distribute n angles evenly between startDeg and endDeg (inclusive). */
function distribute(n: number, startDeg: number, endDeg: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(startDeg + endDeg) / 2];
  return Array.from({ length: n }, (_, i) => startDeg + (i / (n - 1)) * (endDeg - startDeg));
}

/** Return slot positions for "radial" layout — evenly on a full ellipse. */
function radialSlots(n: number): { x: number; y: number; side: 'left' | 'right' }[] {
  return Array.from({ length: n }, (_, i) => {
    const angleDeg = -90 + (360 / n) * i;
    const rad = (angleDeg * Math.PI) / 180;
    const rx = 280; const ry = 88;
    const nx = CCX + rx * Math.cos(rad) - NODE_W / 2;
    const ny = CCY + ry * Math.sin(rad) - NODE_H / 2;
    const side: 'left' | 'right' = Math.cos(rad) < 0 ? 'left' : 'right';
    return { x: Math.round(nx), y: Math.round(ny), side };
  });
}

// ── Connector path ────────────────────────────────────────────────────────────

/** Build the cubic-bezier connector from a node's center to the center node
 *  edge. Works for all three layouts. */
function connectorPath(
  slot: { x: number; y: number; side: 'left' | 'right' },
  nodeIndex: number,
): string {
  const nodeCX = slot.x + NODE_W / 2;
  const nodeCY = slot.y + NODE_H / 2;

  // Pick the nearest edge of the center rect
  const targetX = slot.side === 'left' ? CX : CX + CENTER_W;
  const targetY = CY + CENTER_H / 2 + (nodeIndex % 2 === 0 ? -6 : 6);

  const cp1x = nodeCX + (slot.side === 'left' ? 60 : -60);
  const cp1y = nodeCY;
  const cp2x = targetX + (slot.side === 'left' ? -60 : 60);
  const cp2y = targetY;

  return `M${nodeCX} ${nodeCY} C${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetX} ${targetY}`;
}

// ── Accent color helper ───────────────────────────────────────────────────────

function accentColor(accent: DiagramNodeSpec['accent']): string {
  if (accent === 'rust') return 'var(--rust)';
  if (accent === 'ink')  return 'var(--ink)';
  return 'var(--signal)';
}

// ── Sub-component: a single diagram node ─────────────────────────────────────

function DiagramNode({
  slot,
  node,
  index,
  animate,
}: {
  slot: { x: number; y: number; side: 'left' | 'right' };
  node: DiagramNodeSpec;
  index: number;
  animate: boolean;
}) {
  const stroke = accentColor(node.accent);
  const path   = connectorPath(slot, index);
  const delay  = `${index * 0.08}s`;

  const rectEl = (
    <rect
      x={slot.x}
      y={slot.y}
      width={NODE_W}
      height={NODE_H}
      rx={4}
      fill="none"
      stroke={stroke}
      strokeWidth={1.4}
      className={animate ? 'hd-node-rect' : undefined}
      style={animate ? { animationDelay: delay } : undefined}
    />
  );

  const textY = slot.y + 14;
  const textEl = (
    <>
      <text
        x={slot.x + NODE_W / 2}
        y={textY}
        textAnchor="middle"
        className="node-label"
      >
        {node.label}
      </text>
      {node.sublabel && (
        <text
          x={slot.x + NODE_W / 2}
          y={textY + 13}
          textAnchor="middle"
          className="node-sub"
        >
          {node.sublabel}
        </text>
      )}
    </>
  );

  const inner = (
    <g
      className={animate ? 'hd-node' : undefined}
      style={animate ? { animationDelay: delay } : undefined}
    >
      {rectEl}
      {textEl}
      <path
        d={path}
        fill="none"
        stroke="var(--rule)"
        strokeWidth={1.2}
        className={animate ? 'hd-connector' : undefined}
        style={animate ? { animationDelay: delay } : undefined}
      />
    </g>
  );

  if (node.href) {
    return (
      <a key={node.label} href={node.href} style={{ textDecoration: 'none' }}>
        {inner}
      </a>
    );
  }
  return <g key={node.label}>{inner}</g>;
}

// ── Public component ──────────────────────────────────────────────────────────

export function HeroDiagram({
  centerLabel,
  projects,
  diagramConfig,
}: {
  centerLabel: string;
  projects: ProjectProps[];
  diagramConfig?: HeroDiagramConfig;
}) {
  // Safe-parse the config so a malformed object never crashes the page.
  const cfgResult = HeroDiagramConfigSchema.safeParse(diagramConfig ?? undefined);
  const cfg = cfgResult.success ? cfgResult.data : undefined;

  // enabled: false → render nothing
  if (cfg && cfg.enabled === false) return null;

  const layout  = cfg?.layout  ?? 'corners';
  const animate = cfg?.animate ?? true;

  // Resolve the effective center label
  const label = cfg?.centerLabel || centerLabel;

  // Resolve nodes:
  //   • If diagram.nodes is provided, use them (already validated 1–6).
  //   • Otherwise fall back to featured projects, up to 6, with href="#<slug>".
  const resolvedNodes: DiagramNodeSpec[] = cfg?.nodes
    ? cfg.nodes
    : projects.slice(0, 6).map((p, i): DiagramNodeSpec => ({
        label: p.name,
        sublabel: undefined,
        href: `#${p.slug}`,
        accent: i % 2 === 0 ? 'signal' : 'rust',
      }));

  // Cap corners layout at 4 (its geometry only has 4 slots)
  const visibleNodes = layout === 'corners' ? resolvedNodes.slice(0, 4) : resolvedNodes.slice(0, 6);

  // Compute slot positions
  let slots: { x: number; y: number; side: 'left' | 'right' }[];
  if (layout === 'arc')    slots = arcSlots(visibleNodes.length);
  else if (layout === 'radial') slots = radialSlots(visibleNodes.length);
  else slots = CORNERS;

  return (
    <div className="hero-diagram">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ overflow: 'visible' }}
      >
        {/* Center node */}
        <rect
          x={CX}
          y={CY}
          width={CENTER_W}
          height={CENTER_H}
          rx={4}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1.4}
        />
        <text
          x={CCX}
          y={CY + CENTER_H / 2 + 4}
          textAnchor="middle"
          className="node-label"
          fontWeight={600}
        >
          {label}
        </text>

        {/* Peripheral nodes */}
        {visibleNodes.map((node, i) => {
          const slot = slots[i];
          if (!slot) return null;
          return (
            <DiagramNode
              key={`${node.label}-${i}`}
              slot={slot}
              node={node}
              index={i}
              animate={animate}
            />
          );
        })}
      </svg>
    </div>
  );
}
