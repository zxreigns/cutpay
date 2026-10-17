/**
 * New job — build the cut. Milestones become clips as you type; fund it once in USDC.
 */
import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Plus, Trash2, ArrowUpRight, Check, Lock } from 'lucide-react'
import { CUTPAY_ABI, CUTPAY_ADDRESS, USDC_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../contract'
import { formatUsdc, parseUsdc, parseOnchainError, txExplorerUrl, REVIEW_WINDOWS } from '../utils'
import { NETWORK_LABEL } from '../chain'
import Timeline, { type Clip } from '../components/Timeline'
import TxButton from '../components/TxButton'

interface MilestoneRow { name: string; amount: string }

const PRESETS: { label: string; rows: MilestoneRow[] }[] = [
  { label: 'Short-form batch', rows: [{ name: 'Draft', amount: '150' }, { name: 'Revision', amount: '100' }, { name: 'Final', amount: '250' }] },
  { label: 'Single edit', rows: [{ name: 'Draft', amount: '60' }, { name: 'Final', amount: '90' }] },
  { label: 'Testnet try', rows: [{ name: 'Draft', amount: '0.02' }, { name: 'Revision', amount: '0.02' }, { name: 'Final', amount: '0.02' }] },
]

const DEFAULT_MILESTONES: MilestoneRow[] = [{ name: 'Draft', amount: '' }, { name: 'Revision', amount: '' }, { name: 'Final', amount: '' }]

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

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: address ? [address] : undefined, chainId: ARC_TESTNET_CHAIN_ID, query: { enabled: !!address },
  })

  const { writeContract: approveWrite, data: approveHash, isPending: approvePending } = useWriteContract({ mutation: { onError: (e) => { toast.error(parseOnchainError(e)); setStep('idle') } } })
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })
  const { writeContract: createWrite, data: createHash, isPending: createPending } = useWriteContract({ mutation: { onError: (e) => { toast.error(parseOnchainError(e)); setStep('idle') } } })
  const { isLoading: createConfirming, isSuccess: createSuccess } = useWaitForTransactionReceipt({ hash: createHash })

  const totalRaw = milestones.reduce((acc, m) => acc + parseUsdc(m.amount), 0n)
  const validMilestones = milestones.every((m) => m.name.trim() && parseUsdc(m.amount) > 0n)
  const editorOk = editor.startsWith('0x') && editor.length === 42
  const selfHire = !!address && editorOk && editor.toLowerCase() === address.toLowerCase()
  const enough = usdcBalance === undefined || (usdcBalance) >= totalRaw
  const canProceed = !!address && editorOk && !selfHire && !!title.trim() && validMilestones && totalRaw > 0n
  const isWrongChain = chainId !== ARC_TESTNET_CHAIN_ID

  const updateMilestone = (idx: number, field: keyof MilestoneRow, value: string) => setMilestones((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)))
  const addMilestone = () => { if (milestones.length < 20) setMilestones((prev) => [...prev, { name: `Cut ${prev.length + 1}`, amount: '' }]) }
  const removeMilestone = (idx: number) => setMilestones((prev) => prev.filter((_, i) => i !== idx))

  const handleApprove = useCallback(() => {
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return }
    if (!canProceed) return
    setStep('approving')
    approveWrite({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [CUTPAY_ADDRESS, totalRaw], chainId: ARC_TESTNET_CHAIN_ID })
  }, [approveWrite, canProceed, isWrongChain, switchChain, totalRaw])

  const handleCreate = useCallback(() => {
    if (!canProceed) return
    setStep('creating')
    const amounts = milestones.map((m) => parseUsdc(m.amount))
    createWrite(
      { address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'createJob', args: [editor as `0x${string}`, title, amounts, BigInt(reviewWindow)], chainId: ARC_TESTNET_CHAIN_ID },
      { onSuccess: (hash) => toast.success('Job funded', { action: { label: 'View tx', onClick: () => window.open(txExplorerUrl(hash), '_blank') } }) },
    )
  }, [createWrite, canProceed, editor, title, milestones, reviewWindow])

  useEffect(() => { if (createSuccess) void navigate('/me') }, [createSuccess, navigate])

  const showCreate = approveSuccess || step === 'creating'
  const clips: Clip[] = milestones.map((m, i) => ({ name: m.name || `Cut ${i + 1}`, amount: Number(parseUsdc(m.amount)) / 1e6 || 0.0001, status: i === 0 ? 'submitted' : 'pending' }))

  return (
    <main className="wrap" style={{ paddingTop: 36, paddingBottom: 120 }}>
      <div className="new-grid">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>New job · {NETWORK_LABEL}</div>
          <h1 className="display" style={{ fontSize: 'clamp(34px, 5vw, 56px)', lineHeight: 1, margin: '0 0 10px' }}>Build the <em>cut.</em></h1>
          <p style={{ fontSize: 15, color: 'var(--ink-2)', margin: '0 0 24px', maxWidth: 520, lineHeight: 1.5 }}>
            Lay the milestones on the timeline, fund the whole budget once. Each cut your editor lands gets released the moment you approve it.
          </p>

          {/* Timeline preview */}
          <div className="panel" style={{ padding: '6px 16px 14px', marginBottom: 18 }}>
            <Timeline clips={clips} playhead={0} durationSec={Math.max(60, milestones.length * 30)} minWidth={440} />
          </div>

          {!address ? (
            <div className="panel panel-pad" style={{ textAlign: 'center' }}>
              <Lock size={18} color="var(--muted)" />
              <p style={{ color: 'var(--ink-2)', margin: '10px 0 16px' }}>Connect a wallet to fund a job. The instant wallet takes one click — no extension.</p>
              <button onClick={() => window.dispatchEvent(new Event('cutpay:connect'))} className="btn btn-primary">Connect wallet</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="panel panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Project</label>
                  <input className="field" placeholder="e.g. Product teaser — 30s, 3 cuts" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Editor's wallet</label>
                  <input className="field mono" placeholder="0x…" value={editor} onChange={(e) => setEditor(e.target.value)} style={{ fontSize: 13 }} />
                  {selfHire && <span style={{ fontSize: 12, color: 'var(--danger)' }}>That's your own address — the editor must be someone else.</span>}
                </div>
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Review window · auto-release if you go quiet</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {REVIEW_WINDOWS.map((w) => (
                      <button key={w.value} type="button" onClick={() => setReviewWindow(w.value)} className="btn btn-sm" style={{ flex: 1, background: reviewWindow === w.value ? 'var(--ink)' : 'var(--bg-2)', color: reviewWindow === w.value ? 'var(--bg)' : 'var(--ink-2)', border: '1px solid var(--border)' }}>
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="panel panel-pad">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <span className="eyebrow">Milestones · USDC</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {PRESETS.map((p) => (
                      <button key={p.label} type="button" onClick={() => setMilestones(p.rows)} className="chip" style={{ cursor: 'pointer' }}>{p.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {milestones.map((m, i) => (
                    <motion.div key={i} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 120px auto', gap: 8, alignItems: 'center' }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', width: 22 }}>{String(i + 1).padStart(2, '0')}</span>
                      <input className="field" placeholder="Milestone" value={m.name} onChange={(e) => updateMilestone(i, 'name', e.target.value)} style={{ height: 42 }} />
                      <div style={{ position: 'relative' }}>
                        <span className="mono" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13 }}>$</span>
                        <input className="field mono" placeholder="0.00" inputMode="decimal" value={m.amount} onChange={(e) => updateMilestone(i, 'amount', e.target.value)} style={{ height: 42, paddingLeft: 24 }} />
                      </div>
                      <button type="button" onClick={() => removeMilestone(i)} disabled={milestones.length <= 1} style={{ background: 'none', border: 0, color: 'var(--muted)', padding: 6 }} aria-label="remove"><Trash2 size={14} /></button>
                    </motion.div>
                  ))}
                </div>
                {milestones.length < 20 && (
                  <button type="button" onClick={addMilestone} className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}><Plus size={13} /> Add a cut</button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Summary rail */}
        <div className="summary">
          <div className="panel panel-pad" style={{ position: 'sticky', top: 76 }}>
            <div className="eyebrow">Total to lock</div>
            <div style={{ fontSize: 36, fontWeight: 600, marginTop: 4 }}><span className="mono">${formatUsdc(totalRaw)}</span></div>
            <div style={{ fontSize: 12, color: enough ? 'var(--muted)' : 'var(--danger)', marginBottom: 16 }}>
              {address ? `Your balance: $${usdcBalance !== undefined ? formatUsdc(usdcBalance) : '—'} USDC` : 'Connect to see your balance'}
              {!enough && ' · not enough USDC'}
            </div>
            <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[['Approve', 'let CutPay move the budget', approveSuccess], ['Fund', 'lock it in escrow, job goes live', createSuccess]].map(([t, d, done], i) => (
                <li key={t as string} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ width: 22, height: 22, borderRadius: 99, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: done ? 'var(--money)' : 'var(--bg-2)', color: done ? '#04150e' : 'var(--ink-2)', border: '1px solid var(--border)', flex: 'none' }}>{done ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
                  <span style={{ fontSize: 13 }}><strong style={{ fontWeight: 600 }}>{t}</strong> <span style={{ color: 'var(--muted)' }}>— {d}</span></span>
                </li>
              ))}
            </ol>
            {!showCreate ? (
              <TxButton onClick={handleApprove} pending={approvePending} confirming={approveConfirming} disabled={!canProceed || !enough} variant="accent" size="lg" style={{ width: '100%' }}>
                {isWrongChain && address ? `Switch to ${NETWORK_LABEL}` : `Approve $${formatUsdc(totalRaw)}`}
              </TxButton>
            ) : (
              <TxButton onClick={handleCreate} pending={createPending} confirming={createConfirming} disabled={!canProceed} variant="money" size="lg" style={{ width: '100%' }}>
                <Lock size={15} /> Fund & go live
              </TxButton>
            )}
            {(approveHash || createHash) && (
              <a href={txExplorerUrl((createHash ?? approveHash) as string)} target="_blank" rel="noopener" className="mono" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', marginTop: 12 }}>view transaction <ArrowUpRight size={11} /></a>
            )}
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '14px 0 0', lineHeight: 1.5 }}>Funds sit in the CutPay contract, not with us. Cancel any time before a cut is submitted and it all comes back.</p>
          </div>
        </div>
      </div>
      <style>{`
        .new-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
        @media (min-width: 960px) { .new-grid { grid-template-columns: minmax(0, 1fr) 320px; align-items: start; } }
      `}</style>
    </main>
  )
}
