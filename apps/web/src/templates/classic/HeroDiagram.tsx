import type { ProjectProps } from '@portfolio/shared';

// Data-driven hero node diagram (faithful port of the docs/index.html hero
// SVG, but the four surrounding nodes come from the featured projects list and
// the center label from the hero config). Renders up to 4 project nodes around
// a center node; fewer projects → fewer nodes, no broken layout.

const W = 820;
const H = 190;
const NODE_W = 150;
const NODE_H = 34;
const CENTER_W = 100;
const CENTER_H = 34;
const CENTER_X = 360;
const CENTER_Y = 80;

// Top-left, bottom-left, top-right, bottom-right — matching the original.
const SLOTS = [
  { x: 20, y: 10, side: 'left' as const },
  { x: 20, y: 146, side: 'left' as const },
  { x: 650, y: 10, side: 'right' as const },
  { x: 650, y: 146, side: 'right' as const },
];

export function HeroDiagram({
  centerLabel,
  projects,
}: {
  centerLabel: string;
  projects: ProjectProps[];
}) {
  const nodes = projects.slice(0, 4);
  return (
    <div className="hero-diagram">
      <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {/* center node */}
        <rect
          x={CENTER_X}
          y={CENTER_Y}
          width={CENTER_W}
          height={CENTER_H}
          rx={4}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1.4}
        />
        <text
          x={CENTER_X + CENTER_W / 2}
          y={CENTER_Y + 21}
          textAnchor="middle"
          className="node-label"
          fontWeight={600}
        >
          {centerLabel}
        </text>

        {nodes.map((p, i) => {
          const slot = SLOTS[i];
          if (!slot) return null;
          const cx = slot.x + NODE_W / 2;
          const stroke = slot.side === 'left' ? 'var(--signal)' : 'var(--rust)';
          // Curve from the node to the center node edge.
          const targetX = slot.side === 'left' ? CENTER_X : CENTER_X + CENTER_W;
          const targetY = CENTER_Y + (i % 2 === 0 ? 8 : 26);
          const startY = slot.side === 'left' ? (slot.y < 80 ? slot.y + NODE_H : slot.y) : slot.y < 80 ? slot.y + NODE_H : slot.y;
          const midX = slot.side === 'left' ? 300 : 520;
          const path = `M${cx} ${startY} C ${cx} ${slot.y < 80 ? 70 : 120}, ${midX} ${
            slot.y < 80 ? 70 : 120
          }, ${targetX} ${targetY}`;
          return (
            <g key={p.slug}>
              <rect
                x={slot.x}
                y={slot.y}
                width={NODE_W}
                height={NODE_H}
                rx={4}
                fill="none"
                stroke={stroke}
                strokeWidth={1.4}
              />
              <text
                x={cx}
                y={slot.y + 21}
                textAnchor="middle"
                className="node-label"
              >
                {p.name}
              </text>
              <path d={path} fill="none" stroke="var(--rule)" strokeWidth={1.2} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
