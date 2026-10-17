import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { Plus, Trash2, ExternalLink, AlertTriangle } from 'lucide-react'
import { CUTPAY_ABI, CUTPAY_ADDRESS, USDC_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../contract'
import { formatUsdc, parseUsdc, parseOnchainError, txExplorerUrl, REVIEW_WINDOWS } from '../utils'
import Card, { SectionLabel } from '../components/Card'
import TxButton from '../components/TxButton'

interface MilestoneRow {
  name: string
  amount: string
}

const DEFAULT_MILESTONES: MilestoneRow[] = [
  { name: 'Draft', amount: '' },
  { name: 'Revision', amount: '' },
  { name: 'Final', amount: '' },
]

export default function NewJobPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const [editor, setEditor] = useState(searchParams.get('editor') ?? '')
  const [title, setTitle] = useState('')
  const [milestones, setMilestones] = useState<MilestoneRow[]>(DEFAULT_MILESTONES)
  const [reviewWindow, setReviewWindow] = useState(REVIEW_WINDOWS[1].value)
  const [step, setStep] = useState<'idle' | 'approving' | 'creating'>('idle')

  // USDC balance
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  })

  // Approve tx
  const { writeContract: approveWrite, data: approveHash, isPending: approvePending } = useWriteContract({
    mutation: {
      onError: (e) => { toast.error(parseOnchainError(e)); setStep('idle') },
    },
  })
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })

  // Create tx
  const { writeContract: createWrite, data: createHash, isPending: createPending } = useWriteContract({
    mutation: {
      onError: (e) => { toast.error(parseOnchainError(e)); setStep('idle') },
    },
  })
  const { isLoading: createConfirming, isSuccess: createSuccess } = useWaitForTransactionReceipt({ hash: createHash })

  const totalRaw = milestones.reduce((acc, m) => {
    const n = parseUsdc(m.amount)
    return acc + n
  }, 0n)

  const validMilestones = milestones.every((m) => m.name.trim() && parseUsdc(m.amount) > 0n)
  const canProceed =
    address &&
    editor.startsWith('0x') &&
    editor.length === 42 &&
    title.trim() &&
    validMilestones &&
    totalRaw > 0n

  const isWrongChain = chainId !== ARC_TESTNET_CHAIN_ID

  const updateMilestone = (idx: number, field: keyof MilestoneRow, value: string) => {
    setMilestones((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)))
  }

  const addMilestone = () => {
    if (milestones.length >= 20) return
    setMilestones((prev) => [...prev, { name: '', amount: '' }])
  }

  const removeMilestone = (idx: number) => {
    setMilestones((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleApprove = useCallback(() => {
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return }
    if (!canProceed) return
    setStep('approving')
    approveWrite({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [CUTPAY_ADDRESS, totalRaw],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }, [approveWrite, canProceed, isWrongChain, switchChain, totalRaw])

  const handleCreate = useCallback(() => {
    if (!canProceed) return
    setStep('creating')
    const amounts = milestones.map((m) => parseUsdc(m.amount))
    createWrite(
      {
        address: CUTPAY_ADDRESS,
        abi: CUTPAY_ABI,
        functionName: 'createJob',
        args: [editor as `0x${string}`, title, amounts, BigInt(reviewWindow)],
        chainId: ARC_TESTNET_CHAIN_ID,
      },
      {
        onSuccess: (hash) => {
          toast.success('Job created!', {
            description: (
              <a href={txExplorerUrl(hash)} target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>
                View on explorer
              </a>
            ) as unknown as string,
          })
        },
      },
    )
  }, [createWrite, canProceed, editor, title, milestones, reviewWindow])

  useEffect(() => {
    if (createSuccess) void navigate('/me')
  }, [createSuccess, navigate])

  const showCreateButton = approveSuccess || step === 'creating'

  return (
    <main style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px 80px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 className="display" style={{ fontSize: 32, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
          New Job
        </h1>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>
          Fund the full budget up front. USDC releases per milestone.
        </p>
      </div>

      {!address ? (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: 'var(--muted)', marginBottom: 16 }}>Connect your wallet to post a job.</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Job details */}
          <Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <SectionLabel>Job Title</SectionLabel>
                <input
                  style={inputStyle}
                  placeholder="e.g. YouTube Series Edit — Q4"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <SectionLabel>Editor Address</SectionLabel>
                <input
                  style={inputStyle}
                  placeholder="0x..."
                  value={editor}
                  onChange={(e) => setEditor(e.target.value)}
                />
              </div>
              <div>
                <SectionLabel>Review Window</SectionLabel>
                <select
                  style={inputStyle}
                  value={reviewWindow}
                  onChange={(e) => setReviewWindow(Number(e.target.value))}
                >
                  {REVIEW_WINDOWS.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          {/* Milestones */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <SectionLabel>Milestones</SectionLabel>
              {milestones.length < 20 && (
                <button onClick={addMilestone} style={ghostBtnStyle}>
                  <Plus size={14} /> Add
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {milestones.map((m, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 36px', gap: 8, alignItems: 'center' }}>
                  <input
                    style={inputStyle}
                    placeholder={`Milestone ${i + 1}`}
                    value={m.name}
                    onChange={(e) => updateMilestone(i, 'name', e.target.value)}
                  />
                  <div style={{ position: 'relative' }}>
                    <input
                      style={{ ...inputStyle, paddingLeft: 28 }}
                      placeholder="0.00"
                      value={m.amount}
                      onChange={(e) => updateMilestone(i, 'amount', e.target.value)}
                      type="number"
                      min="0"
                      step="0.01"
                    />
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                      $
                    </span>
                  </div>
                  <button
                    onClick={() => removeMilestone(i)}
                    disabled={milestones.length <= 1}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'transparent',
                      color: 'var(--danger)',
                      cursor: milestones.length <= 1 ? 'not-allowed' : 'pointer',
                      opacity: milestones.length <= 1 ? 0.3 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Total */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Total budget</span>
              <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                ${formatUsdc(totalRaw)}
              </span>
            </div>
            {usdcBalance !== undefined && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Balance: ${formatUsdc(usdcBalance)}
                </span>
              </div>
            )}
          </Card>

          {/* Zero-balance notice */}
          {address && !isWrongChain && usdcBalance !== undefined && usdcBalance === 0n && (
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                background: 'rgba(245,178,39,0.06)',
                border: '1px solid rgba(245,178,39,0.2)',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 13,
                color: 'var(--ink-2)',
                lineHeight: 1.6,
              }}
            >
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2, color: 'var(--accent)' }} />
              <span>
                Your USDC balance is 0. Add USDC to this address to pay for gas and escrow —
                on Arc, one USDC balance covers both.
              </span>
            </div>
          )}

          {/* Action area */}
          <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {isWrongChain ? (
              <TxButton onClick={() => switchChain({ chainId: ARC_TESTNET_CHAIN_ID })} fullWidth>
                Switch to Arc Testnet
              </TxButton>
            ) : showCreateButton && approveSuccess ? (
              <TxButton
                onClick={handleCreate}
                pending={createPending}
                confirming={createConfirming}
                disabled={!canProceed}
                fullWidth
              >
                Create Job
              </TxButton>
            ) : (
              <TxButton
                onClick={handleApprove}
                pending={approvePending}
                confirming={approveConfirming}
                disabled={!canProceed}
                fullWidth
              >
                Approve ${formatUsdc(totalRaw)} USDC
              </TxButton>
            )}

            {approveHash && !approveSuccess && (
              <a href={txExplorerUrl(approveHash)} target="_blank" rel="noopener" style={explorerLinkStyle}>
                <ExternalLink size={12} /> Approval tx
              </a>
            )}
            {createHash && (
              <a href={txExplorerUrl(createHash)} target="_blank" rel="noopener" style={explorerLinkStyle}>
                <ExternalLink size={12} /> Creation tx
              </a>
            )}
            {createSuccess && (
              <button onClick={() => void navigate('/me')} style={{ ...ghostBtnStyle, width: '100%', justifyContent: 'center' }}>
                View my jobs
              </button>
            )}
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, textAlign: 'center' }}>
              Step 1: Allow CutPay to spend your USDC &nbsp;&middot;&nbsp; Step 2: Create job
            </p>
          </Card>
        </div>
      )}
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: '#0B0B0C',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--ink)',
  fontSize: 14,
  fontFamily: 'DM Sans, sans-serif',
  outline: 'none',
  marginTop: 6,
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 99,
  color: 'var(--ink-2)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'DM Sans, sans-serif',
}

const explorerLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 12,
  color: 'var(--accent)',
  textDecoration: 'none',
  justifyContent: 'center',
}
