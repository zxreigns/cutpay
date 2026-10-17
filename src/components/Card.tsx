import { type ReactNode, type CSSProperties } from 'react'

interface CardProps { children: ReactNode; style?: CSSProperties; className?: string }

export default function Card({ children, style, className }: CardProps) {
  return (
    <div className={`panel panel-pad ${className ?? ''}`} style={style}>
      {children}
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="eyebrow">{children}</span>
}

export function StatPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="panel" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="eyebrow">{label}</span>
      <span className="mono" style={{ fontSize: 22, fontWeight: 600, color: accent ?? 'var(--ink)' }}>{value}</span>
    </div>
  )
}
