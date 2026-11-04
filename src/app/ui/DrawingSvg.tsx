import type { ReactNode } from 'react';
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
}: {
  drawing: Drawing;
  label: string;
  children?: ReactNode;
}) {
  const { x0, y0, x1, y1 } = drawing.bounds;
  const size = Math.max(x1 - x0, y1 - y0);
  const font = drawing.textSize;
  return (
    <svg
      className={styles.svg}
      viewBox={`${x0} ${-y1} ${x1 - x0} ${y1 - y0}`}
      role="img"
      aria-label={label}
      style={{ ['--stroke' as string]: `${size * 0.0018}` }}
    >
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
                fontSize={font}
                textAnchor={p.anchor}
                dominantBaseline="middle"
                transform={p.rotate ? `rotate(${-p.rotate} ${p.x} ${-p.y})` : undefined}
                className={styles.text}
              >
                {p.text}
              </text>
            );
        }
      })}
      {children}
    </svg>
  );
}

/** Screen y for a drawing y (drawings are y-up). */
export const flipY = (y: number) => -y;
