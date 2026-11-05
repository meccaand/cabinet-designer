import { useId, type ReactNode } from 'react';
import type { Drawing } from '../../core/drawing';
import styles from './DrawingSvg.module.css';

/**
 * Renders core drawing primitives as SVG (y up in the drawing, y down on screen). `children`
 * are drawn on top in the same flipped coordinates via `flipY`.
 */
export function DrawingSvg({
  drawing,
  label,
  children,
  tall = false,
  className,
}: {
  drawing: Drawing;
  label: string;
  children?: ReactNode;
  /** Fill the available height (main-area views) instead of a compact panel drawing. */
  tall?: boolean;
  /** Replaces the default sizing class. */
  className?: string | undefined;
}) {
  const hatch = useId();
  const { x0, y0, x1, y1 } = drawing.bounds;
  const size = Math.max(x1 - x0, y1 - y0);
  const font = drawing.textSize;
  const hasOffcut = drawing.primitives.some((p) => p.kind === 'rect' && p.fill === 'offcut');
  return (
    <svg
      className={`${className ?? (tall ? styles.tall : styles.svg)} ${styles.drawing}`}
      viewBox={`${x0} ${-y1} ${x1 - x0} ${y1 - y0}`}
      // With interactive children (openings, cabinets) it is a group of controls, not a picture.
      role={children ? 'group' : 'img'}
      aria-label={label}
      style={{ ['--stroke' as string]: `${size * 0.0018}` }}
    >
      {hasOffcut && (
        <defs>
          <pattern
            id={hatch}
            width={size * 0.015}
            height={size * 0.015}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2={size * 0.015} className={styles.hatch} />
          </pattern>
        </defs>
      )}
      {drawing.primitives.map((p, i) => {
        switch (p.kind) {
          case 'rect':
            return (
              <rect
                key={i}
                x={p.x}
                y={-(p.y + p.h)}
                width={p.w}
                height={p.h}
                className={styles[p.fill]}
                fill={p.fill === 'offcut' ? `url(#${CSS.escape(hatch)})` : undefined}
              />
            );
          case 'line':
            return (
              <line key={i} x1={p.x1} y1={-p.y1} x2={p.x2} y2={-p.y2} className={styles[p.style]} />
            );
          case 'text':
            return (
              <text
                key={i}
                x={p.x}
                y={-p.y}
                fontSize={p.size ?? font}
                textAnchor={p.anchor}
                dominantBaseline="middle"
                transform={p.rotate ? `rotate(${-p.rotate} ${p.x} ${-p.y})` : undefined}
                className={p.onFill ? styles.onFill : styles.text}
              >
                {p.text}
              </text>
            );
          case 'badge':
            return (
              <g key={i}>
                <circle cx={p.x} cy={-p.y} r={p.r} className={styles.badge} />
                <text
                  x={p.x}
                  y={-p.y}
                  fontSize={p.r * 1.2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={styles.badgeText}
                >
                  {p.text}
                </text>
              </g>
            );
        }
      })}
      {children}
    </svg>
  );
}

/** Screen y for a drawing y (drawings are y-up). */
export const flipY = (y: number) => -y;
