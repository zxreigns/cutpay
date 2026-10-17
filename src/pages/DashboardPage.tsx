import { Link } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { Plus } from 'lucide-react'
import { CUTPAY_ABI, CUTPAY_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../contract'
import { formatUsdc, formatAddress, jobStatusLabel } from '../utils'
import Card, { SectionLabel } from '../components/Card'

export default function DashboardPage() {
  const { address } = useAccount()

  const { data: clientJobIds } = useReadContract({
    address: CUTPAY_ADDRESS,
    abi: CUTPAY_ABI,
    functionName: 'jobsByClient',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: bigint[] | undefined }

  const { data: editorJobIds } = useReadContract({
    address: CUTPAY_ADDRESS,
    abi: CUTPAY_ABI,
    functionName: 'jobsByEditor',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: bigint[] | undefined }

  if (!address) {
    return (
      <main style={{ maxWidth: 700, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Connect your wallet to see your jobs.</p>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 className="display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
            Dashboard
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
            {formatAddress(address)}
          </p>
        </div>
        <Link
          to="/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 16px',
            background: 'var(--accent)',
            color: '#0B0B0C',
            borderRadius: 99,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <Plus size={15} /> New Job
        </Link>
      </div>

      {/* Jobs as client */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel>As Client</SectionLabel>
        <div style={{ marginTop: 12 }}>
          {!clientJobIds || clientJobIds.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: '28px 20px' }}>
              <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>No jobs posted yet.</p>
              <Link
                to="/new"
                style={{ display: 'inline-block', marginTop: 12, fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
              >
                Post your first job
              </Link>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...clientJobIds].reverse().map((id) => (
                <DashJobCard key={id.toString()} jobId={id} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Jobs as editor */}
      <div>
        <SectionLabel>As Editor</SectionLabel>
        <div style={{ marginTop: 12 }}>
          {!editorJobIds || editorJobIds.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: '28px 20px' }}>
              <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>No editing jobs yet.</p>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...editorJobIds].reverse().map((id) => (
                <DashJobCard key={id.toString()} jobId={id} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Built on Arc · settled in USDC</span>
      </div>
    </main>
  )
}

function DashJobCard({ jobId }: { jobId: bigint }) {
  const { data: job } = useReadContract({
    address: CUTPAY_ADDRESS,
    abi: CUTPAY_ABI,
    functionName: 'getJob',
    args: [jobId],
    chainId: ARC_TESTNET_CHAIN_ID,
  }) as { data: {
    title: string
    client: string
    editor: string
    totalFunded: bigint
    totalReleased: bigint
    status: number
    milestones: { status: number }[]
  } | undefined }

  if (!job) {
    return (
      <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, opacity: 0.5 }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>Loading...</span>
      </div>
    )
  }

  const releasedCount = job.milestones.filter((m) => m.status === 2 || m.status === 4).length
  const progressPct = job.totalFunded > 0n ? Number((job.totalReleased * 100n) / job.totalFunded) : 0

  return (
    <Link
      to={`/job/${jobId}`}
      style={{
        display: 'block',
        padding: '14px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        textDecoration: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{job.title}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            #{jobId.toString()} &nbsp;·&nbsp; {releasedCount}/{job.milestones.length} milestones
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span
            className="mono"
            style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}
          >
            ${formatUsdc(job.totalFunded)}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: job.status === 1 ? 'var(--success)' : job.status === 0 ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            {jobStatusLabel(job.status)}
          </span>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--accent)', borderRadius: 99 }} />
      </div>
    </Link>
  )
}
