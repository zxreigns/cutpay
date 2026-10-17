/**
 * Timeline — the escrow drawn as an NLE timeline.
 * Milestones are clips on a track; the playhead marks where the job is; released clips glow.
 */
import { useEffect, type CSSProperties } from 'react'
import { motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { Check, Lock, AlertTriangle } from 'lucide-react'

export type ClipStatus = 'pending' | 'submitted' | 'released' | 'refunded' | 'split' | 'disputed'
export type Clip = { name: string; amount: number; status: ClipStatus; note?: string }

export function statusFromCode(code: number): ClipStatus {
  return (['pending', 'submitted', 'released', 'refunded', 'split', 'disputed'] as ClipStatus[])[code] ?? 'pending'
}

export function fmtTc(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(sec)}`
}

export function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: n < 10 ? 2 : 0, maximumFractionDigits: 2 })
}

const CLIP_STYLE: Record<ClipStatus, CSSProperties> = {
  pending: { background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--ink-2)' },
  submitted: { background: 'rgba(109,141,255,0.16)', border: '1px solid rgba(109,141,255,0.8)', color: 'var(--ink)' },
  released: { background: 'linear-gradient(180deg, #52ecb3 0%, #2fcf8f 100%)', border: '1px solid #7ff5c8', color: '#04150e' },
  split: { background: 'linear-gradient(180deg, rgba(62,224,160,0.55) 0%, rgba(62,224,160,0.35) 100%)', border: '1px solid rgba(62,224,160,0.8)', color: '#04150e' },
  disputed: { background: 'rgba(255,107,107,0.16)', border: '1px solid rgba(255,107,107,0.8)', color: 'var(--ink)' },
  refunded: { background: 'repeating-linear-gradient(135deg, #16181e 0 6px, #1d2027 6px 12px)', border: '1px solid var(--border-strong)', color: 'var(--muted)' },
}

export const STATUS_LABEL: Record<ClipStatus, string> = {
  pending: 'Not submitted', submitted: 'In review', released: 'Released', split: 'Split 50/50', disputed: 'Disputed', refunded: 'Refunded',
}

type Props = {
  clips: Clip[]
  /** 0..1 position of the playhead */
  playhead?: number
  playheadMV?: MotionValue<number>
  activeIdx?: number | null
  onSelect?: (idx: number) => void
  durationSec?: number
  compact?: boolean
  showMoney?: boolean
  flashIdx?: number | null
  minWidth?: number
}

export default function Timeline({
  clips, playhead = 0, playheadMV, activeIdx = null, onSelect, durationSec = 90, compact = false, showMoney = true, flashIdx = null, minWidth = 520,
}: Props) {
  const internal = useMotionValue(playhead)
  useEffect(() => { if (!playheadMV) internal.set(playhead) }, [playhead, playheadMV, internal])
  const mv = playheadMV ?? internal
  const left = useTransform(mv, (v) => `${Math.min(100, Math.max(0, v * 100))}%`)
  const tc = useTransform(mv, (v) => fmtTc(v * durationSec))

  const total = clips.reduce((a, c) => a + Math.max(c.amount, 0), 0) || 1
  const released = clips.filter((c) => c.status === 'released' || c.status === 'split').reduce((a, c) => a + (c.status === 'split' ? c.amount / 2 : c.amount), 0)
  const trackH = compact ? 34 : 64
  const ticks = minWidth >= 500 ? [0, 0.2, 0.4, 0.6, 0.8, 1] : [0, 0.5, 1]

  return (
    <div className="hscroll" style={{ width: '100%' }}>
      <div style={{ position: 'relative', minWidth, padding: compact ? '18px 0 4px' : '44px 0 6px', userSelect: 'none' }}>
        {/* Ruler */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: compact ? 0 : 18, height: compact ? 14 : 20 }}>
          {ticks.map((t) => (
            <div key={t} style={{ position: 'absolute', left: `${t * 100}%`, top: 0, transform: t === 1 ? 'translateX(-100%)' : t === 0 ? 'none' : 'translateX(-50%)' }}>
              <span className="mono" style={{ fontSize: compact ? 9 : 10, color: 'var(--muted)', letterSpacing: '0.04em' }}>{fmtTc(t * durationSec)}</span>
            </div>
          ))}
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: 'var(--border)' }} />
          {Array.from({ length: 41 }).map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: `${(i / 40) * 100}%`, bottom: 0, width: 1, height: i % 5 === 0 ? 6 : 3, background: i % 5 === 0 ? 'var(--border-strong)' : 'var(--border)' }} />
          ))}
        </div>

        {/* Clip track */}
        <div style={{ display: 'flex', gap: 3, height: trackH, marginTop: compact ? 2 : 6 }}>
          {clips.map((c, i) => {
            const pct = (Math.max(c.amount, 0) / total) * 100
            const active = activeIdx === i
            const st = CLIP_STYLE[c.status]
            return (
              <motion.button
                key={i}
                type="button"
                onClick={onSelect ? () => onSelect(i) : undefined}
                layout
                initial={false}
                animate={flashIdx === i ? { scale: [1, 1.03, 1] } : { scale: 1 }}
                transition={{ duration: 0.5 }}
                style={{
                  flex: `${pct} 1 0px`, minWidth: compact ? 18 : 54, borderRadius: compact ? 6 : 10, position: 'relative', overflow: 'hidden',
                  textAlign: 'left', padding: compact ? 0 : '8px 10px', cursor: onSelect ? 'pointer' : 'default',
                  outline: active ? '2px solid var(--ink)' : 'none', outlineOffset: 1,
                  boxShadow: c.status === 'released' ? '0 0 24px rgba(62,224,160,0.25)' : c.status === 'submitted' ? '0 0 18px rgba(109,141,255,0.18)' : 'none',
                  ...st,
                }}
                title={`${c.name} · $${fmtMoney(c.amount)} · ${STATUS_LABEL[c.status]}`}
              >
                {c.status === 'released' && <span className="shimmer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />}
                {!compact && (
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.status === 'released' && <Check size={13} strokeWidth={3} />}
                      {c.status === 'pending' && <Lock size={12} style={{ opacity: 0.6 }} />}
                      {c.status === 'disputed' && <AlertTriangle size={12} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                    </div>
                    <div className="mono" style={{ fontSize: 12, opacity: 0.85 }}>${fmtMoney(c.amount)}</div>
                  </div>
                )}
                {/* frame ticks texture */}
                {!compact && (
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundImage: 'repeating-linear-gradient(90deg, rgba(0,0,0,.18) 0 1px, transparent 1px 9px)', opacity: 0.7 }} />
                )}
              </motion.button>
            )
          })}
        </div>

        {/* Money track */}
        {showMoney && (
          <div style={{ marginTop: 8 }}>
            <div style={{ position: 'relative', height: compact ? 4 : 6, borderRadius: 99, background: 'var(--surface-2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <motion.div
                initial={false}
                animate={{ width: `${(released / total) * 100}%` }}
                transition={{ type: 'spring', stiffness: 60, damping: 18 }}
                style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: 'linear-gradient(90deg, #2fcf8f, #52ecb3)', boxShadow: '0 0 12px rgba(62,224,160,0.6)' }}
              />
            </div>
            {!compact && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span className="eyebrow" style={{ fontSize: 10 }}>USDC in escrow</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--money)' }}>${fmtMoney(released)} released · ${fmtMoney(total - released)} locked</span>
              </div>
            )}
          </div>
        )}

        {/* Playhead */}
        <motion.div style={{ position: 'absolute', top: compact ? 2 : 29, bottom: showMoney ? (compact ? 6 : 26) : 4, left, width: 0, pointerEvents: 'none', zIndex: 3 }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: -1, width: 2, background: 'var(--play)', boxShadow: '0 0 10px rgba(255,77,77,0.8)' }} />
          <div style={{ position: 'absolute', top: -2, left: -7, width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '9px solid var(--play)' }} />
          {!compact && (
            <motion.span className="mono" style={{ position: 'absolute', top: -27, left: 6, fontSize: 10, color: '#fff', background: 'var(--play)', padding: '2px 5px', borderRadius: 4, whiteSpace: 'nowrap', fontWeight: 600 }}>
              {tc}
            </motion.span>
          )}
        </motion.div>
      </div>
    </div>
  )
}
