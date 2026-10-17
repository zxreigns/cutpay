import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReadContract, usePublicClient } from 'wagmi'
import { ArrowRight, Clock, CheckCircle, Zap, Lock } from 'lucide-react'
import { CUTPAY_ABI, CUTPAY_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../contract'
import { formatUsdc } from '../utils'
import { NETWORK_LABEL } from '../chain'

// ─── Static hero job card illustration ──────────────────────────────────────

const SAMPLE_MILESTONES = [
  { name: 'Draft',    amount: '$150', status: 'Released',  color: '#7BD88F' },
  { name: 'Revision', amount: '$100', status: 'Submitted', color: '#F5B227', countdown: '71h 12m' },
  { name: 'Final',    amount: '$250', status: 'Pending',   color: '#9A9A9F' },
]

function HeroJobCard() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 22px',
        width: '100%',
        maxWidth: 340,
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Card header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div className="display" style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2, marginBottom: 4 }}>
            Brand film — 60s cut
          </div>
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 99,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              background: 'rgba(245,178,39,0.12)',
              color: 'var(--accent)',
              border: '1px solid rgba(245,178,39,0.3)',
            }}
          >
            Open
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 2 }}>Total</div>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>$500</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ width: '30%', height: '100%', background: 'var(--accent)', borderRadius: 99 }} />
      </div>

      {/* Milestone rail */}
      <div style={{ position: 'relative' }}>
        {/* Background rail */}
        <div style={{ position: 'absolute', left: 7, top: 6, bottom: 6, width: 2, background: 'var(--border)', borderRadius: 99 }} />
        {/* Amber progress fill (first milestone done) */}
        <div style={{ position: 'absolute', left: 7, top: 6, width: 2, height: '37%', background: 'var(--accent)', borderRadius: 99 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 24 }}>
          {SAMPLE_MILESTONES.map((m) => (
            <div
              key={m.name}
              style={{
                position: 'relative',
                background: '#0B0B0C',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '10px 12px',
              }}
            >
              {/* dot */}
              <div
                style={{
                  position: 'absolute',
                  left: -18,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 8,
                  height: 8,
                  borderRadius: 99,
                  background: m.color,
                  border: '2px solid var(--bg)',
                  flexShrink: 0,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{m.name}</div>
                  {m.countdown && (
                    <div style={{ fontSize: 10, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={9} /> Auto-release in {m.countdown}
                    </div>
                  )}
                  {m.status === 'Pending' && (
                    <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Lock size={9} /> Final file unlocks on release
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                    {m.amount}
                  </span>
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: 99,
                      fontSize: 9,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: m.color,
                      background: `${m.color}18`,
                      border: `1px solid ${m.color}44`,
                    }}
                  >
                    {m.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
        <span>72h review window</span>
        <span style={{ color: 'var(--accent)' }}>$150 released · $350 in escrow</span>
      </div>
    </div>
  )
}

// ─── USDC stats hook ─────────────────────────────────────────────────────────

function useUsdcStats(jobCount: bigint | undefined) {
  const [escrowed, setEscrowed] = useState<bigint | null>(null)
  const [released, setReleased] = useState<bigint | null>(null)
  const client = usePublicClient({ chainId: ARC_TESTNET_CHAIN_ID })

  useEffect(() => {
    if (!jobCount || jobCount === 0n || !client) return

    let cancelled = false
    const limit = jobCount > 50n ? 50n : jobCount
    const start = jobCount - limit + 1n

    async function fetchStats() {
      if (!client) return
      let totalFunded = 0n
      let totalReleased = 0n

      for (let id = start; id <= jobCount!; id++) {
        if (cancelled) return
        try {
          const job = await client.readContract({
            address: CUTPAY_ADDRESS,
            abi: CUTPAY_ABI,
            functionName: 'getJob',
            args: [id],
          }) as { totalFunded: bigint; totalReleased: bigint }
          totalFunded += job.totalFunded
          totalReleased += job.totalReleased
        } catch {
          // contract unreachable or job doesn't exist — skip silently
        }
      }

      if (!cancelled) {
        setEscrowed(totalFunded - totalReleased)
        setReleased(totalReleased)
      }
    }

    void fetchStats()
    return () => { cancelled = true }
  }, [jobCount, client])

  return { escrowed, released }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { data: jobCount } = useReadContract({
    address: CUTPAY_ADDRESS,
    abi: CUTPAY_ABI,
    functionName: 'jobCount',
    chainId: ARC_TESTNET_CHAIN_ID,
  })

  const { escrowed, released } = useUsdcStats(jobCount)

  const steps = [
    { icon: <Zap size={16} />, label: 'Fund', desc: 'Client deposits total USDC up front' },
    { icon: <CheckCircle size={16} />, label: 'Deliver', desc: 'Editor submits each milestone with a file hash' },
    { icon: <CheckCircle size={16} />, label: 'Approve', desc: 'Client approves and USDC releases instantly' },
    { icon: <Clock size={16} />, label: 'Auto-pay', desc: 'No response? Auto-releases after review window' },
  ]

  return (
    <main style={{ maxWidth: 1120, margin: '0 auto', padding: '0 20px' }}>
      {/* Hero — two-column on desktop */}
      <section
        style={{
          paddingTop: 80,
          paddingBottom: 60,
          display: 'flex',
          gap: 48,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {/* Left: copy */}
        <div style={{ flex: '1 1 340px', minWidth: 0 }}>
          <div
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              background: 'rgba(245,178,39,0.12)',
              border: '1px solid rgba(245,178,39,0.3)',
              borderRadius: 99,
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--accent)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 24,
            }}
          >
            Escrow for Video Editors
          </div>

          <h1
            className="display"
            style={{
              fontSize: 'clamp(36px, 6vw, 64px)',
              fontWeight: 700,
              lineHeight: 1.08,
              color: 'var(--ink)',
              marginBottom: 20,
              textWrap: 'balance',
            }}
          >
            Get paid per cut.
            <br />
            <span style={{ color: 'var(--accent)' }}>Settled in USDC.</span>
          </h1>

          <p
            style={{
              fontSize: 17,
              lineHeight: 1.6,
              color: 'var(--ink-2)',
              maxWidth: 520,
              marginBottom: 36,
              textWrap: 'pretty',
            }}
          >
            CutPay holds the client's full budget in escrow, then releases each
            milestone the moment it's approved — or automatically if the client
            goes quiet.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link to="/new">
              <button
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '12px 24px',
                  background: 'var(--accent)',
                  color: '#0B0B0C',
                  borderRadius: 99,
                  border: 'none',
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                Post a job <ArrowRight size={16} />
              </button>
            </Link>
            <Link
              to="/me"
              style={{
                padding: '12px 24px',
                border: '1px solid var(--border)',
                color: 'var(--ink-2)',
                borderRadius: 99,
                fontSize: 15,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              My jobs
            </Link>
          </div>
        </div>

        {/* Right: static job card illustration */}
        <div
          style={{
            flex: '0 1 340px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <HeroJobCard />
        </div>
      </section>

      {/* Stats strip */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 1,
          background: 'var(--border)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
          marginBottom: 60,
        }}
      >
        {[
          { label: 'Jobs created',     value: jobCount !== undefined ? jobCount.toString() : '—' },
          { label: 'USDC in escrow',   value: escrowed !== null ? `$${formatUsdc(escrowed)}` : '—' },
          { label: 'USDC released',    value: released !== null ? `$${formatUsdc(released)}` : '—' },
          { label: 'Network',          value: NETWORK_LABEL },
        ].map((s) => (
          <div
            key={s.label}
            style={{ padding: '20px 24px', background: 'var(--surface)' }}
          >
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
              {s.label}
            </div>
            <div
              className="mono"
              style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}
            >
              {s.value}
            </div>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section style={{ marginBottom: 80 }}>
        <h2
          className="display"
          style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)', marginBottom: 32 }}
        >
          How it works
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {steps.map((step, i) => (
            <div
              key={step.label}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '20px 20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 99,
                    background: 'rgba(245,178,39,0.15)',
                    border: '1px solid rgba(245,178,39,0.3)',
                    color: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{step.label}</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer badge */}
      <footer style={{ paddingBottom: 40, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          Built on Arc &middot; settled in USDC
        </span>
      </footer>
    </main>
  )
}
