import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, keccak256, toBytes } from 'viem'
import { toast } from 'sonner'
import { ExternalLink, Lock, Unlock, Clock, AlertTriangle, Copy } from 'lucide-react'
import { CUTPAY_ABI, CUTPAY_ADDRESS, USDC_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../contract'
import {
  formatUsdc,
  parseUsdc,
  parseOnchainError,
  txExplorerUrl,
  addrExplorerUrl,
  formatAddress,
  milestoneStatusLabel,
  jobStatusLabel,
} from '../utils'

import Card, { SectionLabel } from '../components/Card'
import TxButton from '../components/TxButton'

// Numeric status constants — match Solidity enum values
const JOB_OPEN = 0
const JOB_COMPLETED = 1
const MS_PENDING = 0
const MS_SUBMITTED = 1
const MS_RELEASED = 2
const MS_DISPUTED = 5

type MilestoneData = {
  amount: bigint
  status: number
  submittedAt: bigint
  deliverableHash: `0x${string}`
  deliverableURI: string
}

type JobData = {
  id: bigint
  client: `0x${string}`
  editor: `0x${string}`
  title: string
  reviewWindow: bigint
  createdAt: bigint
  totalFunded: bigint
  totalReleased: bigint
  status: number
  milestones: MilestoneData[]
}

function useNowSeconds() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function Countdown({ submittedAt, reviewWindow }: { submittedAt: bigint; reviewWindow: bigint }) {
  const now = useNowSeconds()
  const deadline = Number(submittedAt) + Number(reviewWindow)
  const remaining = deadline - now
  if (remaining <= 0) return <span style={{ color: 'var(--success)' }}>Window expired — auto-release available</span>
  const h = Math.floor(remaining / 3600)
  const m = Math.floor((remaining % 3600) / 60)
  const s = remaining % 60
  const fmt = (n: number) => String(n).padStart(2, '0')
  return (
    <span className="mono" style={{ color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
      {h}:{fmt(m)}:{fmt(s)} remaining
    </span>
  )
}

export default function JobPage() {
  const { id } = useParams<{ id: string }>()
  const jobId = BigInt(id ?? '0')
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const { data: job, refetch } = useReadContract({
    address: CUTPAY_ADDRESS,
    abi: CUTPAY_ABI,
    functionName: 'getJob',
    args: [jobId],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: jobId > 0n },
  }) as { data: JobData | undefined; refetch: () => void }

  const { data: pendingWithdraw, refetch: refetchPW } = useReadContract({
    address: CUTPAY_ADDRESS,
    abi: CUTPAY_ABI,
    functionName: 'pendingWithdrawals',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  }) as { data: bigint | undefined; refetch: () => void }

  const nowSec = useNowSeconds()
  const isClient = address && job && address.toLowerCase() === job.client.toLowerCase()
  const isEditor = address && job && address.toLowerCase() === job.editor.toLowerCase()
  const isWrongChain = chainId !== ARC_TESTNET_CHAIN_ID

  // Submit state
  const [deliverableUrl, setDeliverableUrl] = useState('')
  const [submitIdx, setSubmitIdx] = useState<number | null>(null)

  // Reveal state
  const [revealUrl, setRevealUrl] = useState('')
  const [revealIdx, setRevealIdx] = useState<number | null>(null)

  // Tip state
  const [tipAmount, setTipAmount] = useState('')

  // Generic write hook
  const { writeContract, data: txHash, isPending, reset } = useWriteContract({
    mutation: { onError: (e) => toast.error(parseOnchainError(e)) },
  })
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (!isSuccess) return
    refetch()
    refetchPW()
    // Reset form fields after external state (wagmi) settles
    const t = setTimeout(() => {
      setSubmitIdx(null)
      setRevealIdx(null)
      setDeliverableUrl('')
      setRevealUrl('')
      setTipAmount('')
      reset()
    }, 0)
    toast.success('Transaction confirmed')
    return () => clearTimeout(t)
  }, [isSuccess, refetch, refetchPW, reset])

  const exec = useCallback(
    (fn: () => void) => {
      if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return }
      fn()
    },
    [isWrongChain, switchChain],
  )

  const approve = (idx: number) =>
    exec(() =>
      writeContract({
        address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'approveMilestone',
        args: [jobId, BigInt(idx)], chainId: ARC_TESTNET_CHAIN_ID,
      }),
    )

  const claimAuto = (idx: number) =>
    exec(() =>
      writeContract({
        address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'claimAutoRelease',
        args: [jobId, BigInt(idx)], chainId: ARC_TESTNET_CHAIN_ID,
      }),
    )

  const openDispute = (idx: number) =>
    exec(() =>
      writeContract({
        address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'openDispute',
        args: [jobId, BigInt(idx)], chainId: ARC_TESTNET_CHAIN_ID,
      }),
    )

  const acceptSplit = (idx: number) =>
    exec(() =>
      writeContract({
        address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'acceptSplit',
        args: [jobId, BigInt(idx)], chainId: ARC_TESTNET_CHAIN_ID,
      }),
    )

  const releaseDisputed = (idx: number) =>
    exec(() =>
      writeContract({
        address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'releaseDisputed',
        args: [jobId, BigInt(idx)], chainId: ARC_TESTNET_CHAIN_ID,
      }),
    )

  const cancelJob = () =>
    exec(() =>
      writeContract({
        address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'cancelJob',
        args: [jobId], chainId: ARC_TESTNET_CHAIN_ID,
      }),
    )

  const declineJob = () =>
    exec(() =>
      writeContract({
        address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'declineJob',
        args: [jobId], chainId: ARC_TESTNET_CHAIN_ID,
      }),
    )

  const submitMilestone = (idx: number) => {
    if (!deliverableUrl.trim()) { toast.error('Enter a deliverable URL'); return }
    const hash = keccak256(toBytes(deliverableUrl.trim()))
    exec(() =>
      writeContract({
        address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'submitMilestone',
        args: [jobId, BigInt(idx), hash], chainId: ARC_TESTNET_CHAIN_ID,
      }),
    )
  }

  const revealDeliverable = (idx: number) => {
    if (!revealUrl.trim()) { toast.error('Enter the deliverable URL to reveal'); return }
    exec(() =>
      writeContract({
        address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'revealDeliverable',
        args: [jobId, BigInt(idx), revealUrl.trim()], chainId: ARC_TESTNET_CHAIN_ID,
      }),
    )
  }

  // Tip — needs separate approve + tip
  const { writeContract: tipWrite, data: tipHash, isPending: tipPending } = useWriteContract({
    mutation: { onError: (e) => { toast.error(parseOnchainError(e)); setTipStep('idle') } },
  })
  const { isLoading: tipConfirming, isSuccess: tipSuccess } = useWaitForTransactionReceipt({ hash: tipHash })
  const [tipStep, setTipStep] = useState<'idle' | 'approving' | 'tipping'>('idle')
  const { writeContract: tipApproveWrite, data: tipApproveHash, isPending: tipApprovePending } = useWriteContract({
    mutation: { onError: (e) => { toast.error(parseOnchainError(e)); setTipStep('idle') } },
  })
  const { isSuccess: tipApproveSuccess } = useWaitForTransactionReceipt({ hash: tipApproveHash })

  const doTipApprove = () => {
    const raw = parseUsdc(tipAmount)
    if (raw === 0n) { toast.error('Enter a tip amount'); return }
    setTipStep('approving')
    exec(() =>
      tipApproveWrite({
        address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve',
        args: [CUTPAY_ADDRESS, raw], chainId: ARC_TESTNET_CHAIN_ID,
      }),
    )
  }

  const doTip = () => {
    const raw = parseUsdc(tipAmount)
    setTipStep('tipping')
    exec(() =>
      tipWrite({
        address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'tip',
        args: [jobId, raw], chainId: ARC_TESTNET_CHAIN_ID,
      }),
    )
  }

  useEffect(() => {
    if (!tipSuccess) return
    refetch()
    const t = setTimeout(() => { setTipStep('idle'); setTipAmount('') }, 0)
    return () => clearTimeout(t)
  }, [tipSuccess, refetch])

  // Withdraw
  const { writeContract: withdrawWrite, data: withdrawHash, isPending: withdrawPending } = useWriteContract({
    mutation: { onError: (e) => toast.error(parseOnchainError(e)) },
  })
  const { isLoading: withdrawConfirming, isSuccess: withdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawHash })
  useEffect(() => { if (withdrawSuccess) { refetchPW(); toast.success('Withdrawn to wallet') } }, [withdrawSuccess, refetchPW])

  const doWithdraw = () =>
    exec(() =>
      withdrawWrite({
        address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'withdraw',
        args: [], chainId: ARC_TESTNET_CHAIN_ID,
      }),
    )

  const copyLink = () => {
    void navigator.clipboard.writeText(window.location.href)
    toast.success('Job link copied')
  }

  if (!job) {
    return (
      <main style={{ maxWidth: 700, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Loading job...</p>
      </main>
    )
  }

  const progressPct = job.totalFunded > 0n ? Number((job.totalReleased * 100n) / job.totalFunded) : 0
  const statusInfo = milestoneStatusLabel

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 className="display" style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)', marginBottom: 6, lineHeight: 1.1 }}>
              {job.title}
            </h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  background: job.status === JOB_OPEN ? 'rgba(245,178,39,0.12)' : job.status === JOB_COMPLETED ? 'rgba(123,216,143,0.12)' : 'rgba(154,154,159,0.12)',
                  color: job.status === JOB_OPEN ? 'var(--accent)' : job.status === JOB_COMPLETED ? 'var(--success)' : 'var(--muted)',
                  border: '1px solid',
                  borderColor: job.status === JOB_OPEN ? 'rgba(245,178,39,0.3)' : job.status === JOB_COMPLETED ? 'rgba(123,216,143,0.3)' : 'var(--border)',
                }}
              >
                {jobStatusLabel(job.status)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Job #{id}</span>
            </div>
          </div>
          <button onClick={copyLink} style={ghostBtn}>
            <Copy size={13} /> Copy link
          </button>
        </div>

        {/* Parties */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
          {[
            { label: 'Client', addr: job.client },
            { label: 'Editor', addr: job.editor },
          ].map((p) => (
            <div key={p.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px' }}>
              <SectionLabel>{p.label}</SectionLabel>
              <a
                href={addrExplorerUrl(p.addr)}
                target="_blank"
                rel="noopener"
                className="mono"
                style={{ display: 'block', fontSize: 13, color: 'var(--accent)', textDecoration: 'none', marginTop: 4 }}
              >
                {formatAddress(p.addr)}
                {address && p.addr.toLowerCase() === address.toLowerCase() && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--muted)' }}>(you)</span>
                )}
              </a>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Progress</span>
            <span className="mono" style={{ fontSize: 13, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
              ${formatUsdc(job.totalReleased)} / ${formatUsdc(job.totalFunded)} USDC
            </span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--accent)', borderRadius: 99, transition: 'width 0.4s' }} />
          </div>
        </div>
      </div>

      {/* Pending withdrawals notice */}
      {pendingWithdraw !== undefined && pendingWithdraw > 0n && (
        <Card style={{ marginBottom: 16, borderColor: 'rgba(245,178,39,0.4)', background: 'rgba(245,178,39,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                ${formatUsdc(pendingWithdraw)} USDC available to withdraw
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Earned from milestones and splits</div>
            </div>
            <TxButton onClick={doWithdraw} pending={withdrawPending} confirming={withdrawConfirming} size="sm">
              Withdraw
            </TxButton>
          </div>
          {withdrawHash && (
            <a href={txExplorerUrl(withdrawHash)} target="_blank" rel="noopener" style={explorerLink}>
              <ExternalLink size={11} /> View tx
            </a>
          )}
        </Card>
      )}

      {/* Milestone timeline */}
      <div style={{ marginBottom: 24 }}>
        <SectionLabel>Milestones</SectionLabel>
      </div>
      <div style={{ position: 'relative' }}>
        {/* Rail */}
        <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 2, background: 'var(--border)', borderRadius: 99 }} />
        {/* Progress rail */}
        <div
          style={{
            position: 'absolute',
            left: 15,
            top: 0,
            width: 2,
            height: `${progressPct}%`,
            background: 'var(--accent)',
            borderRadius: 99,
            transition: 'height 0.4s',
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 40 }}>
          {job.milestones.map((m, i) => {
            const { label, color } = statusInfo(m.status)
            const isReleased = m.status === MS_RELEASED || m.status === 4
            const isSubmitted = m.status === MS_SUBMITTED
            const isDisputed = m.status === MS_DISPUTED
            const isPending = m.status === MS_PENDING
            const canAutoRelease =
              isSubmitted &&
              nowSec >= Number(m.submittedAt) + Number(job.reviewWindow)

            return (
              <div key={i} style={{ position: 'relative' }}>
                {/* Dot */}
                <div
                  style={{
                    position: 'absolute',
                    left: -28,
                    top: 20,
                    width: 10,
                    height: 10,
                    borderRadius: 99,
                    background: color,
                    border: '2px solid var(--bg)',
                  }}
                />

                <Card style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                        Milestone {i + 1}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        className="mono"
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: 'var(--ink)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        ${formatUsdc(m.amount)}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 99,
                          fontSize: 11,
                          fontWeight: 700,
                          color,
                          background: `${color}18`,
                          border: `1px solid ${color}44`,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                        }}
                      >
                        {label}
                      </span>
                    </div>
                  </div>

                  {/* Submitted countdown */}
                  {isSubmitted && (
                    <div style={{ marginTop: 10, fontSize: 12 }}>
                      <Countdown submittedAt={m.submittedAt} reviewWindow={job.reviewWindow} />
                    </div>
                  )}

                  {/* Revealed link */}
                  {isReleased && m.deliverableURI && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        background: 'rgba(123,216,143,0.06)',
                        border: '1px solid rgba(123,216,143,0.2)',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <Unlock size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
                      <a
                        href={m.deliverableURI}
                        target="_blank"
                        rel="noopener"
                        style={{ fontSize: 12, color: 'var(--success)', textDecoration: 'none', wordBreak: 'break-all' }}
                      >
                        {m.deliverableURI}
                      </a>
                    </div>
                  )}

                  {/* Lock: pending/submitted last milestone — file unlocks on release */}
                  {!isReleased && i === job.milestones.length - 1 && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        color: 'var(--muted)',
                      }}
                    >
                      <Lock size={13} style={{ flexShrink: 0 }} /> Final file unlocks on release
                    </div>
                  )}

                  {/* Lock icon: released but not yet revealed */}
                  {isReleased && !m.deliverableURI && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        color: 'var(--muted)',
                      }}
                    >
                      <Lock size={13} style={{ flexShrink: 0 }} /> Final file not yet revealed — editor can reveal now
                    </div>
                  )}

                  {/* Action area */}
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Editor: submit */}
                    {isEditor && isPending && (
                      <>
                        {submitIdx === i ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              style={{ ...miniInput, flex: 1 }}
                              placeholder="Deliverable URL (will be hashed)"
                              value={deliverableUrl}
                              onChange={(e) => setDeliverableUrl(e.target.value)}
                            />
                            <TxButton onClick={() => submitMilestone(i)} pending={isPending} confirming={isConfirming} size="sm">
                              Submit
                            </TxButton>
                          </div>
                        ) : (
                          <TxButton onClick={() => setSubmitIdx(i)} size="sm" variant="ghost">
                            Submit delivery
                          </TxButton>
                        )}
                      </>
                    )}

                    {/* Client: approve / dispute */}
                    {isClient && isSubmitted && !canAutoRelease && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <TxButton onClick={() => approve(i)} pending={isPending} confirming={isConfirming} size="sm">
                          Approve
                        </TxButton>
                        <TxButton onClick={() => openDispute(i)} size="sm" variant="danger">
                          <AlertTriangle size={13} /> Dispute
                        </TxButton>
                      </div>
                    )}

                    {/* Anyone: auto-release */}
                    {isSubmitted && canAutoRelease && (
                      <TxButton onClick={() => claimAuto(i)} pending={isPending} confirming={isConfirming} size="sm">
                        <Clock size={13} /> Claim auto-release
                      </TxButton>
                    )}

                    {/* Editor: accept split */}
                    {isEditor && isDisputed && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <TxButton onClick={() => acceptSplit(i)} pending={isPending} confirming={isConfirming} size="sm">
                          Accept 50/50 split
                        </TxButton>
                        <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>
                          You get ${formatUsdc(m.amount / 2n + (m.amount % 2n))}
                        </span>
                      </div>
                    )}

                    {/* Client: release disputed in full */}
                    {isClient && isDisputed && (
                      <TxButton onClick={() => releaseDisputed(i)} pending={isPending} confirming={isConfirming} size="sm">
                        Release in full
                      </TxButton>
                    )}

                    {/* Editor: reveal */}
                    {isEditor && isReleased && !m.deliverableURI && (
                      <>
                        {revealIdx === i ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              style={{ ...miniInput, flex: 1 }}
                              placeholder="Reveal deliverable URL"
                              value={revealUrl}
                              onChange={(e) => setRevealUrl(e.target.value)}
                            />
                            <TxButton onClick={() => revealDeliverable(i)} pending={isPending} confirming={isConfirming} size="sm">
                              Reveal
                            </TxButton>
                          </div>
                        ) : (
                          <TxButton onClick={() => setRevealIdx(i)} size="sm" variant="ghost">
                            <Unlock size={13} /> Reveal final file
                          </TxButton>
                        )}
                      </>
                    )}
                  </div>

                  {txHash && (
                    <a href={txExplorerUrl(txHash)} target="_blank" rel="noopener" style={{ ...explorerLink, marginTop: 8 }}>
                      <ExternalLink size={11} /> View tx
                    </a>
                  )}
                </Card>
              </div>
            )
          })}
        </div>
      </div>

      {/* Job actions (cancel / decline) */}
      {job.status === JOB_OPEN && (
        <div style={{ marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isClient && (
            <TxButton onClick={cancelJob} size="sm" variant="danger" pending={isPending} confirming={isConfirming}>
              Cancel job (refund pending)
            </TxButton>
          )}
          {isEditor && (
            <TxButton onClick={declineJob} size="sm" variant="danger" pending={isPending} confirming={isConfirming}>
              Decline job
            </TxButton>
          )}
        </div>
      )}

      {/* Tip jar */}
      {job.status === JOB_OPEN || job.status === JOB_COMPLETED ? (
        <Card style={{ marginTop: 32 }}>
          <SectionLabel>Tip the editor</SectionLabel>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {['5', '10', '25'].map((preset) => (
              <button
                key={preset}
                onClick={() => setTipAmount(preset)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 99,
                  border: tipAmount === preset ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: tipAmount === preset ? 'rgba(245,178,39,0.12)' : 'transparent',
                  color: tipAmount === preset ? 'var(--accent)' : 'var(--muted)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}
              >
                ${preset}
              </button>
            ))}
            <input
              style={{ ...miniInput, width: 100 }}
              placeholder="Custom"
              value={tipAmount}
              type="number"
              min="0"
              step="0.01"
              onChange={(e) => setTipAmount(e.target.value)}
            />
            {tipStep === 'idle' || tipStep === 'approving' ? (
              <TxButton onClick={doTipApprove} pending={tipApprovePending} size="sm">
                {tipApproveSuccess ? 'Approved' : 'Tip editor'}
              </TxButton>
            ) : (
              <TxButton onClick={doTip} pending={tipPending} confirming={tipConfirming} size="sm">
                Send tip
              </TxButton>
            )}
          </div>
          {tipApproveSuccess && tipStep === 'approving' && (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              Approval confirmed. Now click "Send tip" to complete.
            </p>
          )}
        </Card>
      ) : null}

      {/* Editor passport link */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link
          to={`/editor/${job.editor}`}
          style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
        >
          View editor passport
        </Link>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Built on Arc · settled in USDC</span>
      </div>
    </main>
  )
}

const miniInput: React.CSSProperties = {
  padding: '7px 10px',
  background: '#0B0B0C',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--ink)',
  fontSize: 13,
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
}

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 99,
  color: 'var(--muted)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'DM Sans, sans-serif',
}

const explorerLink: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  color: 'var(--accent)',
  textDecoration: 'none',
}
