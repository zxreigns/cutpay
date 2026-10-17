/**
 * Editor passport — a shareable card written by the chain.
 */
import { useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowUpRight, Share2, BadgeCheck, Briefcase } from 'lucide-react'
import { CUTPAY_ABI, CUTPAY_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../contract'
import { formatUsdc, formatAddress, addrExplorerUrl, jobStatusLabel } from '../utils'
import { NETWORK_LABEL } from '../chain'

type Stats = { jobsCompleted: bigint; usdcEarned: bigint; tipsReceived: bigint; onTimeApprovals: bigint }

export default function EditorPassportPage() {
  const { address: paramAddr } = useParams<{ address: string }>()
  const { address: connectedAddr } = useAccount()
  const editorAddr = (paramAddr ?? '') as `0x${string}`
  const ok = editorAddr.startsWith('0x') && editorAddr.length === 42

  const { data: stats } = useReadContract({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'editorStats', args: [editorAddr], chainId: ARC_TESTNET_CHAIN_ID, query: { enabled: ok } }) as { data: Stats | undefined }
  const { data: jobIds } = useReadContract({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'jobsByEditor', args: [editorAddr], chainId: ARC_TESTNET_CHAIN_ID, query: { enabled: ok } }) as { data: bigint[] | undefined }
  const isOwn = !!connectedAddr && editorAddr.toLowerCase() === connectedAddr.toLowerCase()

  const share = () => { void navigator.clipboard.writeText(window.location.href); toast.success(isOwn ? 'Passport link copied — send it to your next client' : 'Passport link copied') }

  const jobs = stats ? Number(stats.jobsCompleted) : 0
  const onTime = stats && stats.jobsCompleted > 0n ? Math.round((Number(stats.onTimeApprovals) / Number(stats.jobsCompleted)) * 100) : null

  return (
    <main className="wrap" style={{ paddingTop: 36, paddingBottom: 96 }}>
      <div className="pp-grid">
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Editor passport · {NETWORK_LABEL}</div>
          <h1 className="display" style={{ fontSize: 'clamp(32px, 4.5vw, 52px)', lineHeight: 1, margin: '0 0 12px' }}>
            {isOwn ? <>Your record, <em>written by the chain.</em></> : <>An editor's record, <em>written by the chain.</em></>}
          </h1>
          <p style={{ fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 22px', maxWidth: 480 }}>
            Every number here comes from the CutPay contract: jobs finished, USDC actually released, tips, and how often the client approved inside the window. Nothing can be typed in.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={share} className="btn btn-primary"><Share2 size={14} /> {isOwn ? 'Share my passport' : 'Copy link'}</button>
            {!isOwn && <Link to={`/new?editor=${editorAddr}`} className="btn btn-accent"><Briefcase size={14} /> Hire this editor</Link>}
            <a href={addrExplorerUrl(editorAddr)} target="_blank" rel="noopener" className="btn btn-ghost">Explorer <ArrowUpRight size={14} /></a>
          </div>
        </div>
        <PassportCard addr={editorAddr} jobs={jobs} earned={stats ? formatUsdc(stats.usdcEarned) : '0.00'} tips={stats ? formatUsdc(stats.tipsReceived) : '0.00'} onTime={onTime} />
      </div>

      <section style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Work history</h2>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{jobIds?.length ?? 0} jobs on-chain</span>
        </div>
        {!jobIds || jobIds.length === 0 ? (
          <div className="panel panel-pad" style={{ fontSize: 14, color: 'var(--muted)' }}>No jobs yet. The first approved cut writes the first line.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {[...jobIds].reverse().map((id) => <HistoryRow key={id.toString()} jobId={id} />)}
          </div>
        )}
      </section>
      <style>{`
        .pp-grid { display: grid; grid-template-columns: 1fr; gap: 28px; align-items: center; }
        @media (min-width: 900px) { .pp-grid { grid-template-columns: 1.1fr 1fr; gap: 48px; } }
      `}</style>
    </main>
  )
}

function PassportCard({ addr, jobs, earned, tips, onTime }: { addr: string; jobs: number; earned: string; tips: string; onTime: number | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(0.5), my = useMotionValue(0.5)
  const rx = useSpring(useTransform(my, [0, 1], [8, -8]), { stiffness: 150, damping: 18 })
  const ry = useSpring(useTransform(mx, [0, 1], [-10, 10]), { stiffness: 150, damping: 18 })
  const sheen = useTransform(mx, [0, 1], ['-20%', '120%'])
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    mx.set((e.clientX - r.left) / r.width); my.set((e.clientY - r.top) / r.height)
  }
  const reset = () => { mx.set(0.5); my.set(0.5) }
  return (
    <div style={{ perspective: 1200 }} onMouseMove={onMove} onMouseLeave={reset}>
      <motion.div ref={ref} style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d', borderRadius: 22, padding: 'clamp(20px, 3vw, 28px)', background: 'linear-gradient(135deg, #1b2440 0%, #0f1a2e 45%, #0f2a24 100%)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 40px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)', position: 'relative', overflow: 'hidden', aspectRatio: '1.586', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <motion.div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: '40%', left: sheen, background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.10), transparent)', pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', right: -40, top: -40, width: 200, height: 200, borderRadius: 99, background: 'radial-gradient(circle, rgba(62,224,160,0.25), transparent 60%)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="eyebrow" style={{ color: 'rgba(255,255,255,0.7)', display: 'inline-flex', gap: 6, alignItems: 'center' }}><BadgeCheck size={13} color="var(--money)" /> CutPay passport</span>
          <span className="mono" style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>ARC · USDC</span>
        </div>
        <div>
          <div className="display" style={{ fontSize: 'clamp(26px, 3.2vw, 34px)', lineHeight: 1, color: '#fff' }}>Editor <em>{formatAddress(addr).slice(0, 6)}</em></div>
          <div className="mono" style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 6, wordBreak: 'break-all' }}>{addr}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[[String(jobs), 'jobs done'], ['$' + earned, 'earned'], ['$' + tips, 'tips'], [onTime === null ? '—' : `${onTime}%`, 'on time']].map(([v, l]) => (
            <div key={l}>
              <div className="mono" style={{ fontSize: 'clamp(14px, 1.8vw, 18px)', fontWeight: 600, color: l === 'earned' ? 'var(--money)' : '#fff', whiteSpace: 'nowrap' }}>{v}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{l}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function HistoryRow({ jobId }: { jobId: bigint }) {
  const { data: job } = useReadContract({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'getJob', args: [jobId], chainId: ARC_TESTNET_CHAIN_ID }) as { data: { title: string; client: string; totalFunded: bigint; totalReleased: bigint; status: number } | undefined }
  if (!job) return <div className="panel" style={{ height: 56, opacity: 0.4 }} />
  return (
    <Link to={`/job/${jobId.toString()}`} className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 16px', textDecoration: 'none' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.title}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>#{jobId.toString()} · client <span className="mono">{formatAddress(job.client)}</span> · {jobStatusLabel(job.status)}</div>
      </div>
      <div className="mono" style={{ fontSize: 14, color: 'var(--money)', flex: 'none' }}>${formatUsdc(job.totalReleased)}</div>
    </Link>
  )
}
