import { Link } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { motion } from 'framer-motion'
import { Plus, ArrowRight, Lock } from 'lucide-react'
import { CUTPAY_ABI, CUTPAY_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../contract'
import { formatUsdc, formatAddress, jobStatusLabel } from '../utils'
import Timeline, { type Clip, statusFromCode } from '../components/Timeline'

export default function DashboardPage() {
  const { address } = useAccount()
  const { data: clientJobIds } = useReadContract({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'jobsByClient', args: address ? [address] : undefined, chainId: ARC_TESTNET_CHAIN_ID, query: { enabled: !!address } }) as { data: bigint[] | undefined }
  const { data: editorJobIds } = useReadContract({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'jobsByEditor', args: address ? [address] : undefined, chainId: ARC_TESTNET_CHAIN_ID, query: { enabled: !!address } }) as { data: bigint[] | undefined }

  if (!address) {
    return (
      <main className="wrap" style={{ padding: '80px 0', textAlign: 'center' }}>
        <Lock size={18} color="var(--muted)" />
        <p style={{ color: 'var(--ink-2)', margin: '10px 0 16px' }}>Connect a wallet to see your jobs and your passport.</p>
        <button onClick={() => window.dispatchEvent(new Event('cutpay:connect'))} className="btn btn-primary">Connect wallet</button>
      </main>
    )
  }

  const asClient = [...(clientJobIds ?? [])].reverse()
  const asEditor = [...(editorJobIds ?? [])].reverse()

  return (
    <main className="wrap" style={{ paddingTop: 36, paddingBottom: 96 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 26 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Signed in as <span className="mono" style={{ color: 'var(--ink)' }}>{formatAddress(address)}</span></div>
          <h1 className="display" style={{ fontSize: 'clamp(32px, 4.5vw, 48px)', lineHeight: 1, margin: 0 }}>My <em>jobs.</em></h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`/editor/${address}`} className="btn btn-ghost">My passport</Link>
          <Link to="/new" className="btn btn-primary"><Plus size={15} /> New job</Link>
        </div>
      </div>

      <Section title="Hired me" sub="jobs where you are the editor" ids={asEditor} empty="No one has hired you here yet. Share your passport link with a client." me={address} />
      <Section title="I'm paying" sub="jobs you funded" ids={asClient} empty="You haven't funded a job yet." me={address} />
    </main>
  )
}

function Section({ title, sub, ids, empty, me }: { title: string; sub: string; ids: bigint[]; empty: string; me: `0x${string}` }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{sub} · {ids.length}</span>
      </div>
      {ids.length === 0 ? (
        <div className="panel panel-pad" style={{ color: 'var(--muted)', fontSize: 14 }}>{empty}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {ids.map((id, i) => <JobRow key={id.toString()} jobId={id} me={me} delay={i * 0.04} />)}
        </div>
      )}
    </section>
  )
}

function JobRow({ jobId, me, delay }: { jobId: bigint; me: `0x${string}`; delay: number }) {
  const { data: job } = useReadContract({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'getJob', args: [jobId], chainId: ARC_TESTNET_CHAIN_ID }) as {
    data: { title: string; client: string; editor: string; totalFunded: bigint; totalReleased: bigint; status: number; milestones: { status: number; amount: bigint }[] } | undefined
  }
  if (!job) return <div className="panel" style={{ height: 96, opacity: 0.4 }} />

  const clips: Clip[] = job.milestones.map((m, i) => ({ name: `M${i + 1}`, amount: Number(m.amount) / 1e6, status: statusFromCode(m.status) }))
  const other = job.client.toLowerCase() === me.toLowerCase() ? job.editor : job.client
  const needsYou = job.milestones.some((m) => (m.status === 1 && job.client.toLowerCase() === me.toLowerCase()) || (m.status === 5 && job.editor.toLowerCase() === me.toLowerCase()))
    || (job.status === 0 && job.editor.toLowerCase() === me.toLowerCase() && job.milestones.some((m) => m.status === 0) && !job.milestones.some((m) => m.status === 1 || m.status === 5))

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Link to={`/job/${jobId.toString()}`} className="panel" style={{ display: 'block', padding: '14px 16px', textDecoration: 'none', transition: 'border-color .15s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 2 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.title}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>#{jobId.toString()} · with <span className="mono">{formatAddress(other)}</span> · {jobStatusLabel(job.status)}</div>
          </div>
          <div style={{ textAlign: 'right', flex: 'none' }}>
            <div className="mono" style={{ fontSize: 15, color: 'var(--money)' }}>${formatUsdc(job.totalReleased)}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>of ${formatUsdc(job.totalFunded)}</div>
          </div>
        </div>
        <Timeline clips={clips} compact showMoney={false} minWidth={0} playhead={job.totalFunded > 0n ? Number(job.totalReleased) / Number(job.totalFunded) : 0} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          {needsYou ? <span className="chip chip-accent" style={{ height: 22, fontSize: 11 }}>Your move</span> : <span />}
          <span style={{ fontSize: 12, color: 'var(--ink-2)', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Open review room <ArrowRight size={12} /></span>
        </div>
      </Link>
    </motion.div>
  )
}
