import type { ReactNode } from 'react'

interface Props {
  /** 0–1 */
  progress: number
  size?: number
  stroke?: number
  color?: string
  track?: string
  children?: ReactNode
}

export default function ProgressRing({
  progress,
  size = 92,
  stroke = 9,
  color = 'var(--accent)',
  track = 'var(--surface-2)',
  children,
}: Props) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, progress))
  const dash = c * p

  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      {children && <div className="ring-center">{children}</div>}
    </div>
  )
}
