import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useReadContract, usePublicClient } from 'wagmi'
import { motion, useMotionValue, useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, Clock, Lock, Scale, Sparkles } from 'lucide-react'
import { CUTPAY_ABI, CUTPAY_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../contract'
import { formatAddress, addrExplorerUrl } from '../utils'
import { NETWORK_LABEL } from '../chain'
import Timeline, { type Clip, fmtMoney } from '../components/Timeline'
import Counter from '../components/Counter'

// ─── Live demo: the playhead pays the editor ────────────────────────────────

const DEMO_BASE: Clip[] = [
  { name: 'Draft', amount: 150, status: 'submitted' },
  { name: 'Revision', amount: 100, status: 'pending' },
  { name: 'Final', amount: 250, status: 'pending' },
]
const DEMO_TOTAL = 500
const LOOP_SEC = 16
const DEMO_REDUCED_CLIPS: Clip[] = [
  { ...DEMO_BASE[0], status: 'released' },
  { ...DEMO_BASE[1], status: 'released' },
  { ...DEMO_BASE[2], status: 'submitted' },
]

function useDemo() {
  const reduce = useReducedMotion()
  const mv = useMotionValue(reduce ? 0.62 : 0)
  const [clips, setClips] = useState<Clip[]>(reduce ? DEMO_REDUCED_CLIPS : DEMO_BASE)
  const [paid, setPaid] = useState(reduce ? 250 : 0)
  const [events, setEvents] = useState<string[]>([])
  const stage = useRef(0)

  useEffect(() => {
    if (reduce) {
      mv.set(0.62)
      return
    }
    let raf = 0
    let start = performance.now()
    const bounds = [0.3, 0.5, 1]
    const tick = (now: number) => {
      const t = ((now - start) / 1000) / LOOP_SEC
      if (t >= 1.12) {
        start = now
        stage.current = 0
        setClips(DEMO_BASE)
        setPaid(0)
        setEvents([])
        mv.set(0)
      } else {
        const p = Math.min(t, 1)
        mv.set(p)
        const s = stage.current
        if (s < 3 && p >= bounds[s]) {
          stage.current = s + 1
          setClips((prev) => prev.map((c, i) => (i === s ? { ...c, status: 'released' } : i === s + 1 ? { ...c, status: 'submitted' } : c)))
          setPaid((v) => v + DEMO_BASE[s].amount)
          setEvents((ev) => [`${DEMO_BASE[s].name} approved · $${DEMO_BASE[s].amount} USDC → editor · ${(1.4 + s * 0.3).toFixed(1)}s on Arc`, ...ev].slice(0, 3))
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mv, reduce])

  return { mv, clips, paid, events }
}

function DemoDeck() {
  const { mv, clips, paid, events } = useDemo()
  return (
    <div className="panel grain" style={{ position: 'relative', padding: 18, overflow: 'hidden', minWidth: 0, background: 'linear-gradient(180deg, #121318 0%, #0d0e11 100%)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--play)' }} className="blink" />
          <span className="eyebrow" style={{ color: 'var(--ink-2)' }}>Live demo · Product teaser 30s</span>
        </div>
        <span className="chip" style={{ height: 22, fontSize: 11, whiteSpace: 'nowrap' }}>Job #0042</span>
      </div>

      <Timeline clips={clips} playheadMV={mv} durationSec={30} minWidth={380} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
        <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
          <div className="eyebrow">Client escrow</div>
          <div style={{ fontSize: 26, fontWeight: 600, marginTop: 4 }}>
            <Counter value={DEMO_TOTAL - paid} prefix="$" />
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>locked in CutPay</div>
        </div>
        <div style={{ background: 'rgba(62,224,160,0.06)', border: '1px solid rgba(62,224,160,0.35)', borderRadius: 12, padding: '12px 14px', position: 'relative', overflow: 'hidden' }}>
          <div className="eyebrow" style={{ color: 'var(--money)' }}>Editor wallet</div>
          <div style={{ fontSize: 26, fontWeight: 600, marginTop: 4, color: 'var(--money)' }}>
            <Counter value={paid} prefix="+$" />
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>USDC, settled</div>
        </div>
      </div>

      <div style={{ marginTop: 12, minHeight: 54, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {events.map((e, i) => (
          <motion.div key={e} initial={{ opacity: 0, y: 6 }} animate={{ opacity: i === 0 ? 1 : 0.5, y: 0 }} className="mono" style={{ fontSize: 11, color: i === 0 ? 'var(--money)' : 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: 'currentColor' }} />{e}
          </motion.div>
        ))}
        {events.length === 0 && <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>waiting for the first approved cut…</span>}
      </div>
    </div>
  )
}

// ─── Live on-chain stats ────────────────────────────────────────────────────

function useUsdcStats(jobCount: bigint | undefined) {
  const client = usePublicClient({ chainId: ARC_TESTNET_CHAIN_ID })
  const [stats, setStats] = useState({ escrowed: 0, released: 0, editors: 0 })
  useEffect(() => {
    if (!jobCount || jobCount === 0n || !client) return
    let cancelled = false
    const limit = jobCount > 50n ? 50n : jobCount
    const start = jobCount - limit + 1n
    void (async () => {
      let escrowed = 0n, released = 0n
      const editors = new Set<string>()
      for (let id = start; id <= jobCount; id++) {
        try {
          const job = await client.readContract({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'getJob', args: [id] })
          escrowed += job.totalFunded
          released += job.totalReleased
          editors.add(job.editor.toLowerCase())
        } catch { /* skip */ }
      }
      if (!cancelled) setStats({ escrowed: Number(escrowed) / 1e6, released: Number(released) / 1e6, editors: editors.size })
    })()
    return () => { cancelled = true }
  }, [jobCount, client])
  return stats
}

// ─── Page ───────────────────────────────────────────────────────────────────

const fadeUp = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } }

export default function LandingPage() {
  const { data: jobCount } = useReadContract({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'jobCount', chainId: ARC_TESTNET_CHAIN_ID })
  const stats = useUsdcStats(jobCount)
  const latestJob = jobCount && jobCount > 0n ? jobCount.toString() : null

  return (
    <main>
      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(900px 420px at 20% -10%, rgba(109,141,255,0.16), transparent 60%), radial-gradient(700px 360px at 85% 10%, rgba(62,224,160,0.10), transparent 60%)' }} />
        <div className="wrap" style={{ position: 'relative', paddingTop: 56, paddingBottom: 48 }}>
          <div className="hero-grid minw0">
            <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.6 }}>
              <span className="chip chip-accent" style={{ marginBottom: 20 }}>
                <Sparkles size={12} /> Milestone escrow on {NETWORK_LABEL}
              </span>
              <h1 className="display" style={{ fontSize: 'clamp(44px, 7.2vw, 84px)', lineHeight: 0.98, margin: '0 0 22px', letterSpacing: '-0.025em' }}>
                Get paid at<br />
                <em style={{ color: 'var(--money)' }}>every cut.</em>
              </h1>
              <p style={{ fontSize: 'clamp(16px, 1.6vw, 19px)', lineHeight: 1.5, color: 'var(--ink-2)', margin: '0 0 28px', maxWidth: 520 }}>
                CutPay turns a video job into a timeline. The client funds it once in USDC; every approved cut — draft, revision, final — releases the editor's money on Arc in seconds. No invoices. No chasing. No “I'll pay you Friday.”
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link to="/new" className="btn btn-primary btn-lg">Start a job <ArrowRight size={16} /></Link>
                {latestJob ? (
                  <Link to={`/job/${latestJob}`} className="btn btn-ghost btn-lg">Watch a live job <ArrowUpRight size={16} /></Link>
                ) : (
                  <Link to="/me" className="btn btn-ghost btn-lg">I'm an editor</Link>
                )}
              </div>
              <div className="facts" style={{ marginTop: 28 }}>
                {[['72h', 'auto-release if the client goes quiet'], ['50/50', 'dispute split, one tap'], ['0 fees', 'from CutPay, ever']].map(([k, v]) => (
                  <div key={k} style={{ borderLeft: '1px solid var(--border-strong)', paddingLeft: 12 }}>
                    <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{k}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 24, rotateX: 6 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ duration: 0.8, delay: 0.15 }} style={{ perspective: 1200 }}>
              <DemoDeck />
            </motion.div>
          </div>
        </div>
        <style>{`
          .hero-grid { display: grid; grid-template-columns: 1fr; gap: 36px; align-items: center; }
          .facts { display: grid; grid-template-columns: repeat(3, auto); gap: 18px; max-width: 520px; }
          @media (max-width: 480px) { .facts { grid-template-columns: 1fr; gap: 10px; } }
          @media (min-width: 960px) { .hero-grid { grid-template-columns: 1.05fr 1fr; gap: 56px; } }
        `}</style>
      </section>

      {/* Live numbers */}
      <section className="wrap" style={{ paddingBottom: 56 }}>
        <div className="panel stats" style={{ overflow: 'hidden' }}>
          {[
            { label: 'Jobs on-chain', node: <Counter value={jobCount !== undefined ? Number(jobCount) : 0} /> },
            { label: 'USDC escrowed', node: <Counter value={stats.escrowed} prefix="$" decimals={2} /> },
            { label: 'USDC released to editors', node: <Counter value={stats.released} prefix="$" decimals={2} />, accent: true },
            { label: 'Editors paid', node: <Counter value={stats.editors} /> },
          ].map((s, i) => (
            <div key={s.label} className="stat" data-i={i} style={{ padding: '18px 20px' }}>
              <div className="eyebrow">{s.label}</div>
              <div style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 600, marginTop: 6, color: s.accent ? 'var(--money)' : 'var(--ink)' }}>{s.node}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Read live from the CutPay contract on {NETWORK_LABEL}.</span>
          <a href={addrExplorerUrl(CUTPAY_ADDRESS)} target="_blank" rel="noopener" className="mono" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {formatAddress(CUTPAY_ADDRESS)} <ArrowUpRight size={12} />
          </a>
        </div>
      </section>

      {/* How a cut gets paid */}
      <section className="wrap" style={{ paddingBottom: 72 }}>
        <div style={{ maxWidth: 640, marginBottom: 32 }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>How a cut gets paid</div>
          <h2 className="display" style={{ fontSize: 'clamp(32px, 4.5vw, 48px)', lineHeight: 1.05, margin: 0 }}>
            Three markers on the timeline. <em>Money moves when the playhead does.</em>
          </h2>
        </div>
        <div className="steps">
          {[
            { n: '01', t: 'Fund the cut', d: 'The client sets milestones — say Draft $150, Revision $100, Final $250 — and locks the whole budget in USDC. The editor sees the money before touching a frame.', icon: <Lock size={16} /> },
            { n: '02', t: 'Deliver & review', d: 'The editor submits each cut with a fingerprint of the file on-chain. The client reviews in the Review Room with timecoded notes, then approves.', icon: <Clock size={16} /> },
            { n: '03', t: 'Approve = paid', d: 'Approval releases that milestone to the editor instantly on Arc. The final master unlocks only after the final payment clears — pay-to-unlock, built in.', icon: <Sparkles size={16} /> },
            { n: '04', t: 'Nobody gets ghosted', d: 'If the client goes quiet, the cut auto-releases after the review window (72h by default). If they disagree, either side can take a 50/50 split in one tap.', icon: <Scale size={16} /> },
          ].map((s, i) => (
            <motion.div key={s.n} variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.5, delay: i * 0.06 }} className="panel panel-pad" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{s.n}</span>
                <span style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--money)' }}>{s.icon}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{s.t}</div>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 }}>{s.d}</p>
            </motion.div>
          ))}
        </div>
        <style>{`
          .stats { display: grid; grid-template-columns: repeat(2, 1fr); }
          .stat { border-bottom: 1px solid var(--border); }
          .stat[data-i="0"], .stat[data-i="2"] { border-right: 1px solid var(--border); }
          .stat[data-i="2"], .stat[data-i="3"] { border-bottom: none; }
          @media (min-width: 720px) {
            .stats { grid-template-columns: repeat(4, 1fr); }
            .stat { border-bottom: none !important; border-right: 1px solid var(--border) !important; }
            .stat[data-i="3"] { border-right: none !important; }
          }
          .steps { display: grid; grid-template-columns: 1fr; gap: 12px; }
          @media (min-width: 720px) { .steps { grid-template-columns: repeat(2, 1fr); } }
          @media (min-width: 1040px) { .steps { grid-template-columns: repeat(4, 1fr); } }
        `}</style>
      </section>

      {/* Passport teaser */}
      <section className="wrap" style={{ paddingBottom: 80 }}>
        <div className="panel grain" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(24px, 4vw, 44px)', background: 'linear-gradient(135deg, #121318 0%, #0e1322 60%, #0d1a17 100%)' }}>
          <div style={{ display: 'grid', gap: 24, alignItems: 'center' }} className="pass-grid">
            <div>
              <div className="eyebrow" style={{ marginBottom: 12, color: 'var(--money)' }}>Editor passport</div>
              <h3 className="display" style={{ fontSize: 'clamp(28px, 3.6vw, 40px)', lineHeight: 1.08, margin: '0 0 12px' }}>
                Your track record, <em>written by the chain.</em>
              </h3>
              <p style={{ fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.55, margin: '0 0 20px', maxWidth: 480 }}>
                Every job you finish, every USDC you earn, every on-time approval — stamped into a card you can share with the next client. No reviews to fake. No platform to lock you in.
              </p>
              <Link to="/me" className="btn btn-ghost">Open my passport <ArrowRight size={14} /></Link>
            </div>
            <PassportPreview />
          </div>
          <style>{`@media (min-width: 880px) { .pass-grid { grid-template-columns: 1.1fr 1fr; } }`}</style>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>CutPay · built on Arc with Arc Studio · settled in USDC</span>
          <a href="https://github.com/zxreigns/cutpay" target="_blank" rel="noopener" style={{ fontSize: 12, color: 'var(--ink-2)', textDecoration: 'none', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            Source on GitHub <ArrowUpRight size={12} />
          </a>
        </div>
      </section>
    </main>
  )
}

function PassportPreview() {
  return (
    <motion.div whileHover={{ rotateY: -6, rotateX: 4 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }} style={{ perspective: 1000 }}>
      <div style={{ borderRadius: 18, padding: 22, background: 'linear-gradient(135deg, #1b2440 0%, #0f1a2e 45%, #0f2a24 100%)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 30px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.08) 48%, transparent 60%)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26 }}>
          <span className="eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>CutPay passport</span>
          <span className="mono" style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>ARC · USDC</span>
        </div>
        <div className="display" style={{ fontSize: 30, lineHeight: 1, marginBottom: 4 }}>muse<em>priest</em></div>
        <div className="mono" style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginBottom: 24 }}>0x5fba…c48c</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[['12', 'jobs'], ['$' + fmtMoney(4820), 'earned'], ['100%', 'on time']].map(([v, l]) => (
            <div key={l}>
              <div className="mono" style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{v}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
