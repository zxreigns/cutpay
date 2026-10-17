import { useParams, Link } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { ExternalLink, UserCheck } from 'lucide-react'
import { CUTPAY_ABI, CUTPAY_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../contract'
import { formatUsdc, formatAddress, addrExplorerUrl, jobStatusLabel } from '../utils'
import Card, { SectionLabel, StatPill } from '../components/Card'

export default function EditorPassportPage() {
  const { address: paramAddr } = useParams<{ address: string }>()
  const { address: connectedAddr } = useAccount()
  const editorAddr = (paramAddr ?? '') as `0x${string}`

  const { data: stats } = useReadContract({
    address: CUTPAY_ADDRESS,
    abi: CUTPAY_ABI,
    functionName: 'editorStats',
    args: [editorAddr],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: editorAddr.startsWith('0x') },
  })

  const { data: jobIds } = useReadContract({
    address: CUTPAY_ADDRESS,
    abi: CUTPAY_ABI,
    functionName: 'jobsByEditor',
    args: [editorAddr],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: editorAddr.startsWith('0x') },
  })

  const isOwn = connectedAddr && editorAddr.toLowerCase() === connectedAddr.toLowerCase()

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 99,
              background: 'linear-gradient(135deg, var(--accent) 0%, #ff6b35 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UserCheck size={22} color="#0B0B0C" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="display" style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
              Editor Passport
            </h1>
            <a
              href={addrExplorerUrl(editorAddr)}
              target="_blank"
              rel="noopener"
              className="mono"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--accent)', textDecoration: 'none', marginTop: 2 }}
            >
              {formatAddress(editorAddr)} <ExternalLink size={11} />
            </a>
          </div>
        </div>
        {isOwn && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderRadius: 99,
              background: 'rgba(245,178,39,0.12)',
              border: '1px solid rgba(245,178,39,0.3)',
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Your passport
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 24 }}>
        <StatPill label="Jobs completed" value={stats ? stats.jobsCompleted.toString() : '—'} />
        <StatPill label="USDC earned" value={stats ? `$${formatUsdc(stats.usdcEarned)}` : '—'} />
        <StatPill label="Tips received" value={stats ? `$${formatUsdc(stats.tipsReceived)}` : '—'} />
        <StatPill label="On-time approvals" value={stats ? stats.onTimeApprovals.toString() : '—'} />
      </div>

      {/* Job history */}
      <Card>
        <SectionLabel>Job History</SectionLabel>
        {!jobIds || jobIds.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 12 }}>No jobs yet.</p>
        ) : (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...jobIds].reverse().map((jid) => (
              <JobRow key={jid.toString()} jobId={jid} />
            ))}
          </div>
        )}
      </Card>

      {/* Hire button */}
      {!isOwn && (
        <div style={{ marginTop: 24 }}>
          <Link
            to={`/new?editor=${editorAddr}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 24px',
              background: 'var(--accent)',
              color: '#0B0B0C',
              borderRadius: 99,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Hire this editor
          </Link>
        </div>
      )}

      <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Built on Arc · settled in USDC</span>
      </div>
    </main>
  )
}

function JobRow({ jobId }: { jobId: bigint }) {
  const { data: job } = useReadContract({
    address: CUTPAY_ADDRESS,
    abi: CUTPAY_ABI,
    functionName: 'getJob',
    args: [jobId],
    chainId: ARC_TESTNET_CHAIN_ID,
  }) as { data: { title: string; totalFunded: bigint; totalReleased: bigint; status: number } | undefined }

  if (!job) return null

  return (
    <Link
      to={`/job/${jobId}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 12px',
        background: '#0B0B0C',
        border: '1px solid var(--border)',
        borderRadius: 6,
        textDecoration: 'none',
        gap: 8,
      }}
    >
      <div>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{job.title}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>#{jobId.toString()}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="mono" style={{ fontSize: 13, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
          ${formatUsdc(job.totalFunded)}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: job.status === 1 ? 'var(--success)' : job.status === 0 ? 'var(--accent)' : 'var(--muted)',
          }}
        >
          {jobStatusLabel(job.status)}
        </span>
      </div>
    </Link>
  )
}
