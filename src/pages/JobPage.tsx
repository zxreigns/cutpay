/**
 * Review Room — a job is a timeline. Approve a cut, release the money.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, keccak256, toBytes } from 'viem'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowUpRight, Check, Copy, Film, Lock, Share2, Unlock, X, Clock3, MessageSquareText, Trash2 } from 'lucide-react'
import { CUTPAY_ABI, CUTPAY_ADDRESS, USDC_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../contract'
import { formatUsdc, parseUsdc, parseOnchainError, txExplorerUrl, addrExplorerUrl, formatAddress, jobStatusLabel } from '../utils'
import { NETWORK_LABEL, CHAIN_ID } from '../chain'
import Timeline, { type Clip, statusFromCode, STATUS_LABEL, fmtMoney } from '../components/Timeline'
import TxButton from '../components/TxButton'
import Counter from '../components/Counter'

const JOB_OPEN = 0
const JOB_COMPLETED = 1
const MS_PENDING = 0
const MS_SUBMITTED = 1
const MS_RELEASED = 2
const MS_SPLIT = 4
const MS_DISPUTED = 5

type MilestoneData = { amount: bigint; status: number; submittedAt: bigint; deliverableHash: `0x${string}`; deliverableURI: string }
type JobData = { id: bigint; client: `0x${string}`; editor: `0x${string}`; title: string; reviewWindow: bigint; createdAt: bigint; totalFunded: bigint; totalReleased: bigint; status: number; milestones: MilestoneData[] }
type Note = { id: string; tc: string; text: string; at: number }

const MS_NAMES = ['Draft', 'Revision', 'Final']
function msName(i: number, n: number) {
  if (n <= 3) return MS_NAMES[i] ?? `Cut ${i + 1}`
  if (i === n - 1) return 'Final'
  return i === 0 ? 'Draft' : `Cut ${i + 1}`
}

function useNowSeconds() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => { const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(id) }, [])
  return now
}

function Countdown({ submittedAt, reviewWindow }: { submittedAt: bigint; reviewWindow: bigint }) {
  const now = useNowSeconds()
  const remaining = Number(submittedAt) + Number(reviewWindow) - now
  if (remaining <= 0) return <span style={{ color: 'var(--money)' }}>Review window closed · auto-release unlocked</span>
  const h = Math.floor(remaining / 3600), m = Math.floor((remaining % 3600) / 60), s = remaining % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return <span className="mono" style={{ color: 'var(--ink)' }}>{h}:{p(m)}:{p(s)} <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-ui)' }}>until auto-release</span></span>
}

function isVideoUrl(u: string) { return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u) }
function embedUrl(u: string): string | null {
  const yt = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{6,})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vm = u.match(/vimeo\.com\/(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  return null
}

export default function JobPage() {
  const { id } = useParams<{ id: string }>()
  const jobId = BigInt(id ?? '0')
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const { data: job, refetch } = useReadContract({
    address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'getJob', args: [jobId], chainId: ARC_TESTNET_CHAIN_ID, query: { enabled: jobId > 0n, refetchInterval: 8000 },
  }) as { data: JobData | undefined; refetch: () => void }

  const { data: pendingWithdraw, refetch: refetchPW } = useReadContract({
    address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'pendingWithdrawals', args: address ? [address] : undefined, chainId: ARC_TESTNET_CHAIN_ID, query: { enabled: !!address },
  }) as { data: bigint | undefined; refetch: () => void }

  const nowSec = useNowSeconds()
  const isClient = !!(address && job && address.toLowerCase() === job.client.toLowerCase())
  const isEditor = !!(address && job && address.toLowerCase() === job.editor.toLowerCase())
  const isWrongChain = chainId !== ARC_TESTNET_CHAIN_ID

  // Selected milestone: default to the one the playhead sits on
  const [selIdx, setSelIdx] = useState<number | null>(null)
  const autoIdx = useMemo(() => {
    if (!job) return 0
    const i = job.milestones.findIndex((m) => m.status !== MS_RELEASED && m.status !== MS_SPLIT && m.status !== 3)
    return i === -1 ? job.milestones.length - 1 : i
  }, [job])
  const sel = selIdx ?? autoIdx

  // Form state
  const [deliverableUrl, setDeliverableUrl] = useState('')
  const [revealUrl, setRevealUrl] = useState('')
  const [tipAmount, setTipAmount] = useState('')
  const [celebrate, setCelebrate] = useState<{ idx: number; amount: bigint; hash?: string } | null>(null)
  const [lastAction, setLastAction] = useState<string | null>(null)

  const { writeContract, data: txHash, isPending, reset } = useWriteContract({ mutation: { onError: (e) => { toast.error(parseOnchainError(e)); setLastAction(null) } } })
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (!isSuccess) return
    refetch(); refetchPW()
    const action = lastAction
    const t = setTimeout(() => {
      setDeliverableUrl(''); setRevealUrl(''); setTipAmount(''); reset(); setLastAction(null)
    }, 0)
    if (action?.startsWith('approve:') || action?.startsWith('auto:') || action?.startsWith('release:')) {
      const idx = Number(action.split(':')[1])
      const amt = job?.milestones[idx]?.amount ?? 0n
      setCelebrate({ idx, amount: action.startsWith('release:') ? amt / 2n : amt, hash: txHash })
    } else {
      toast.success('Confirmed on Arc', { description: txHash ? 'View on explorer' : undefined, action: txHash ? { label: 'Open', onClick: () => window.open(txExplorerUrl(txHash), '_blank') } : undefined })
    }
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess])

  const exec = useCallback((fn: () => void) => {
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_CHAIN_ID }); return }
    fn()
  }, [isWrongChain, switchChain])

  const call = (functionName: 'approveMilestone' | 'claimAutoRelease' | 'openDispute' | 'acceptSplit' | 'releaseDisputed', idx: number, tag: string) => {
    setLastAction(`${tag}:${idx}`)
    exec(() => writeContract({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName, args: [jobId, BigInt(idx)], chainId: ARC_TESTNET_CHAIN_ID }))
  }
  const cancelJob = () => { setLastAction('cancel'); exec(() => writeContract({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'cancelJob', args: [jobId], chainId: ARC_TESTNET_CHAIN_ID })) }
  const declineJob = () => { setLastAction('decline'); exec(() => writeContract({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'declineJob', args: [jobId], chainId: ARC_TESTNET_CHAIN_ID })) }
  const submitMilestone = (idx: number) => {
    if (!deliverableUrl.trim()) { toast.error('Paste the link to your cut first'); return }
    const hash = keccak256(toBytes(deliverableUrl.trim()))
    setLastAction(`submit:${idx}`)
    exec(() => writeContract({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'submitMilestone', args: [jobId, BigInt(idx), hash], chainId: ARC_TESTNET_CHAIN_ID }))
  }
  const revealDeliverable = (idx: number) => {
    if (!revealUrl.trim()) { toast.error('Paste the exact link you submitted'); return }
    setLastAction(`reveal:${idx}`)
    exec(() => writeContract({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'revealDeliverable', args: [jobId, BigInt(idx), revealUrl.trim()], chainId: ARC_TESTNET_CHAIN_ID }))
  }

  // Tip: approve then tip
  const [tipStep, setTipStep] = useState<'idle' | 'approving' | 'tipping'>('idle')
  const { writeContract: tipApproveWrite, data: tipApproveHash, isPending: tipApprovePending } = useWriteContract({ mutation: { onError: (e) => { toast.error(parseOnchainError(e)); setTipStep('idle') } } })
  const { isLoading: tipApproveConfirming, isSuccess: tipApproveSuccess } = useWaitForTransactionReceipt({ hash: tipApproveHash })
  const { writeContract: tipWrite, data: tipHash, isPending: tipPending } = useWriteContract({ mutation: { onError: (e) => { toast.error(parseOnchainError(e)); setTipStep('idle') } } })
  const { isLoading: tipConfirming, isSuccess: tipSuccess } = useWaitForTransactionReceipt({ hash: tipHash })
  const doTipApprove = () => {
    const raw = parseUsdc(tipAmount)
    if (raw === 0n) { toast.error('Enter a tip amount'); return }
    setTipStep('approving')
    exec(() => tipApproveWrite({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [CUTPAY_ADDRESS, raw], chainId: ARC_TESTNET_CHAIN_ID }))
  }
  const doTip = () => {
    const raw = parseUsdc(tipAmount)
    setTipStep('tipping')
    exec(() => tipWrite({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'tip', args: [jobId, raw], chainId: ARC_TESTNET_CHAIN_ID }))
  }
  useEffect(() => { if (tipSuccess) { refetch(); toast.success('Tip sent to the editor'); const t = setTimeout(() => { setTipStep('idle'); setTipAmount('') }, 0); return () => clearTimeout(t) } }, [tipSuccess, refetch])

  // Withdraw
  const { writeContract: withdrawWrite, data: withdrawHash, isPending: withdrawPending } = useWriteContract({ mutation: { onError: (e) => toast.error(parseOnchainError(e)) } })
  const { isLoading: withdrawConfirming, isSuccess: withdrawSuccess } = useWaitForTransactionReceipt({ hash: withdrawHash })
  useEffect(() => { if (withdrawSuccess) { refetchPW(); toast.success('Withdrawn to your wallet') } }, [withdrawSuccess, refetchPW])
  const doWithdraw = () => exec(() => withdrawWrite({ address: CUTPAY_ADDRESS, abi: CUTPAY_ABI, functionName: 'withdraw', args: [], chainId: ARC_TESTNET_CHAIN_ID }))

  // Notes (local to this browser)
  const notesKey = `cutpay-notes-${CHAIN_ID}-${id}`
  const [notes, setNotes] = useState<Note[]>(() => { try { return JSON.parse(localStorage.getItem(notesKey) ?? '[]') as Note[] } catch { return [] } })
  const [noteTc, setNoteTc] = useState('00:00')
  const [noteText, setNoteText] = useState('')
  useEffect(() => { localStorage.setItem(notesKey, JSON.stringify(notes)) }, [notes, notesKey])
  const addNote = () => {
    if (!noteText.trim()) return
    setNotes((n) => [...n, { id: Math.random().toString(36).slice(2), tc: noteTc || '00:00', text: noteText.trim(), at: Date.now() }])
    setNoteText('')
  }
  const copyNotes = () => {
    const txt = notes.map((n) => `${n.tc} — ${n.text}`).join('\n')
    void navigator.clipboard.writeText(txt || '(no notes)')
    toast.success('Notes copied — paste them to your editor')
  }
  const copyLink = () => { void navigator.clipboard.writeText(window.location.href); toast.success('Review Room link copied') }

  if (!job) {
    return (
      <main className="wrap" style={{ padding: '80px 0', textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>loading job #{id} from Arc…</div>
      </main>
    )
  }

  const clips: Clip[] = job.milestones.map((m, i) => ({ name: msName(i, job.milestones.length), amount: Number(m.amount) / 1e6, status: statusFromCode(m.status) }))
  const total = Number(job.totalFunded) / 1e6
  const releasedN = Number(job.totalReleased) / 1e6
  const doneCount = job.milestones.filter((m) => m.status === MS_RELEASED || m.status === MS_SPLIT || m.status === 3).length
  const playhead = job.milestones.length ? Math.min(1, clips.slice(0, doneCount).reduce((a, c) => a + c.amount, 0) / (total || 1)) : 0
  const m = job.milestones[sel]
  const canAutoRelease = m && m.status === MS_SUBMITTED && nowSec >= Number(m.submittedAt) + Number(job.reviewWindow)
  const embed = m?.deliverableURI ? embedUrl(m.deliverableURI) : null
  const role = isClient ? 'client' : isEditor ? 'editor' : null
  const jobOpen = job.status === JOB_OPEN

  return (
    <main className="wrap" style={{ paddingTop: 22, paddingBottom: 96 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <Link to="/me" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', textDecoration: 'none', marginBottom: 10 }}><ArrowLeft size={14} /> My jobs</Link>
          <h1 className="display" style={{ fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.02, margin: '0 0 10px' }}>{job.title}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`chip ${job.status === JOB_COMPLETED ? 'chip-money' : jobOpen ? 'chip-accent' : ''}`}>{jobStatusLabel(job.status)}</span>
            <span className="chip mono">#{id}</span>
            <span className="chip">{NETWORK_LABEL}</span>
            {role && <span className="chip">you are the {role}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={copyLink} className="btn btn-ghost btn-sm"><Share2 size={13} /> Share room</button>
        </div>
      </div>

      <div className="review-grid">
        {/* ── Viewer + timeline ── */}
          <div className="panel" style={{ overflow: 'hidden', gridArea: 'viewer', minWidth: 0 }}>
            {/* Viewer */}
            <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000', borderBottom: '1px solid var(--border)' }}>
              {m?.deliverableURI && isVideoUrl(m.deliverableURI) ? (
                <video src={m.deliverableURI} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              ) : m?.deliverableURI && embed ? (
                <iframe src={embed} title="deliverable" allow="autoplay; fullscreen" allowFullScreen style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
              ) : (
                <Poster milestone={m} name={msName(sel, job.milestones.length)} role={role} />
              )}
              {m?.deliverableURI && !isVideoUrl(m.deliverableURI) && !embed && (
                <a href={m.deliverableURI} target="_blank" rel="noopener" className="btn btn-primary" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
                  <Film size={15} /> Open the master <ArrowUpRight size={14} />
                </a>
              )}
              <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 6 }}>
                <span className="chip" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', borderColor: 'rgba(255,255,255,0.12)' }}>{msName(sel, job.milestones.length)}</span>
                {m && <span className={`chip ${m.status === MS_RELEASED || m.status === MS_SPLIT ? 'chip-money' : m.status === MS_SUBMITTED ? 'chip-accent' : m.status === MS_DISPUTED ? 'chip-danger' : ''}`} style={{ backdropFilter: 'blur(6px)' }}>{STATUS_LABEL[statusFromCode(m.status)]}</span>}
              </div>
            </div>
            {/* Timeline */}
            <div style={{ padding: '10px 16px 14px' }}>
              <Timeline clips={clips} playhead={playhead} activeIdx={sel} onSelect={(i) => setSelIdx(i)} durationSec={Math.max(60, job.milestones.length * 30)} flashIdx={celebrate?.idx ?? null} />
            </div>
          </div>

          {/* Notes */}
          <div className="panel panel-pad" style={{ gridArea: 'notes', minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MessageSquareText size={15} color="var(--accent)" />
                <span style={{ fontSize: 14, fontWeight: 600 }}>Timecoded notes</span>
              </div>
              <button onClick={copyNotes} className="btn btn-ghost btn-sm"><Copy size={12} /> Copy notes</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Stay in this browser. Approval is the on-chain signal — copy these to your editor with the next round.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="field mono" value={noteTc} onChange={(e) => setNoteTc(e.target.value)} placeholder="00:12" style={{ width: 88, flex: 'none', textAlign: 'center', height: 42 }} />
              <input className="field" value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addNote() }} placeholder="e.g. tighten the intro, hold the logo 1s longer" style={{ height: 42 }} />
              <button onClick={addNote} className="btn btn-ghost btn-sm" style={{ height: 42, flex: 'none' }}>Add</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
              <AnimatePresence initial={false}>
                {notes.map((n) => (
                  <motion.div key={n.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--play)', flex: 'none' }}>{n.tc}</span>
                    <span style={{ fontSize: 14, flex: 1 }}>{n.text}</span>
                    <button onClick={() => setNotes((xs) => xs.filter((x) => x.id !== n.id))} style={{ background: 'none', border: 0, color: 'var(--muted)', padding: 4 }} aria-label="delete note"><Trash2 size={13} /></button>
                  </motion.div>
                ))}
              </AnimatePresence>
              {notes.length === 0 && <span style={{ fontSize: 13, color: 'var(--muted)' }}>No notes yet. Scrub the cut, drop a timecode, say what to change.</span>}
            </div>
          </div>

        {/* ── The deck ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, gridArea: 'deck' }}>
          {/* Money */}
          <div className="panel panel-pad" style={{ background: 'linear-gradient(180deg, var(--surface) 0%, #0f1a17 100%)' }}>
            <div className="eyebrow">Released to editor</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 34, fontWeight: 600, color: 'var(--money)' }}><Counter value={releasedN} prefix="$" decimals={2} /></span>
              <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>of ${fmtMoney(total)} USDC</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
              <Party label="Client" addr={job.client} you={isClient} />
              <Party label="Editor" addr={job.editor} you={isEditor} passport />
            </div>
          </div>

          {/* Selected milestone actions */}
          {m && (
            <motion.div key={sel} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="panel panel-pad">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className="eyebrow">Milestone {sel + 1} of {job.milestones.length}</span>
                <span className="mono" style={{ fontSize: 13 }}>${formatUsdc(m.amount)}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{msName(sel, job.milestones.length)}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 14 }}>
                {m.status === MS_SUBMITTED && <Countdown submittedAt={m.submittedAt} reviewWindow={job.reviewWindow} />}
                {m.status === MS_PENDING && (sel > 0 && !(job.milestones[sel - 1].status === MS_RELEASED || job.milestones[sel - 1].status === MS_SPLIT) ? 'Unlocks after the previous cut is paid.' : 'Waiting for the editor to submit this cut.')}
                {(m.status === MS_RELEASED) && <span style={{ color: 'var(--money)', display: 'inline-flex', gap: 6, alignItems: 'center' }}><Check size={14} /> Paid to the editor.</span>}
                {m.status === MS_SPLIT && <span style={{ color: 'var(--money)' }}>Settled 50/50 — half to each side.</span>}
                {m.status === MS_DISPUTED && <span style={{ color: 'var(--danger)' }}>Disputed. Editor can accept a 50/50 split; client can still release in full.</span>}
                {m.status === 3 && 'Refunded to the client.'}
              </div>
              {m.deliverableHash && m.deliverableHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14, wordBreak: 'break-all' }}>fingerprint {m.deliverableHash.slice(0, 18)}…{m.deliverableHash.slice(-6)}</div>
              )}

              {!address && <button onClick={() => window.dispatchEvent(new Event('cutpay:connect'))} className="btn btn-ghost" style={{ width: '100%' }}>Connect a wallet to act on this job</button>}

              {/* Editor: submit */}
              {isEditor && jobOpen && m.status === MS_PENDING && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input className="field" placeholder="Link to this cut (Frame.io, Drive, mp4…)" value={deliverableUrl} onChange={(e) => setDeliverableUrl(e.target.value)} />
                  <TxButton onClick={() => submitMilestone(sel)} pending={isPending} confirming={isConfirming} variant="accent" size="lg">Submit cut for review</TxButton>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Only a fingerprint of the link goes on-chain. Share the preview with your client off-chain.</span>
                </div>
              )}

              {/* Client: approve / dispute */}
              {isClient && jobOpen && m.status === MS_SUBMITTED && !canAutoRelease && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <TxButton onClick={() => call('approveMilestone', sel, 'approve')} pending={isPending} confirming={isConfirming} variant="money" size="lg" style={{ fontSize: 16 }}>
                    <Unlock size={16} /> Approve · release ${formatUsdc(m.amount)}
                  </TxButton>
                  <button onClick={() => call('openDispute', sel, 'dispute')} className="btn btn-danger btn-sm" disabled={isPending || isConfirming}>Open a dispute</button>
                </div>
              )}

              {/* Anyone: auto-release */}
              {jobOpen && m.status === MS_SUBMITTED && canAutoRelease && (
                <TxButton onClick={() => call('claimAutoRelease', sel, 'auto')} pending={isPending} confirming={isConfirming} variant="money" size="lg"><Clock3 size={15} /> Claim auto-release · ${formatUsdc(m.amount)}</TxButton>
              )}

              {/* Disputed */}
              {isEditor && jobOpen && m.status === MS_DISPUTED && (
                <TxButton onClick={() => call('acceptSplit', sel, 'split')} pending={isPending} confirming={isConfirming} variant="accent">Accept 50/50 split · ${formatUsdc(m.amount / 2n)}</TxButton>
              )}
              {isClient && jobOpen && m.status === MS_DISPUTED && (
                <TxButton onClick={() => call('releaseDisputed', sel, 'approve')} pending={isPending} confirming={isConfirming} variant="money">Release in full anyway</TxButton>
              )}

              {/* Editor: reveal */}
              {isEditor && (m.status === MS_RELEASED || m.status === MS_SPLIT) && !m.deliverableURI && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>Paid. Publish the master link so it matches the fingerprint and unlocks for the client.</div>
                  <input className="field" placeholder="The exact link you submitted" value={revealUrl} onChange={(e) => setRevealUrl(e.target.value)} />
                  <TxButton onClick={() => revealDeliverable(sel)} pending={isPending} confirming={isConfirming} variant="accent"><Unlock size={14} /> Unlock the master</TxButton>
                </div>
              )}

              {txHash && <a href={txExplorerUrl(txHash)} target="_blank" rel="noopener" className="mono" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', marginTop: 12 }}>last tx {txHash.slice(0, 10)}… <ArrowUpRight size={11} /></a>}
            </motion.div>
          )}

          {/* Withdraw */}
          {pendingWithdraw !== undefined && pendingWithdraw > 0n && (
            <div className="panel panel-pad" style={{ borderColor: 'rgba(62,224,160,0.4)' }}>
              <div className="eyebrow" style={{ color: 'var(--money)' }}>Waiting for you</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 600 }}>${formatUsdc(pendingWithdraw)} USDC</span>
                <TxButton onClick={doWithdraw} pending={withdrawPending} confirming={withdrawConfirming} size="sm" variant="money">Withdraw</TxButton>
              </div>
            </div>
          )}

          {/* Tip */}
          {isClient && (
            <div className="panel panel-pad">
              <div className="eyebrow">Tip the editor</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input className="field mono" placeholder="5.00" value={tipAmount} onChange={(e) => setTipAmount(e.target.value)} inputMode="decimal" style={{ height: 42 }} />
                {tipStep !== 'tipping' && !tipApproveSuccess ? (
                  <TxButton onClick={doTipApprove} pending={tipApprovePending} confirming={tipApproveConfirming} size="sm" variant="ghost" style={{ height: 42, flex: 'none' }}>Approve</TxButton>
                ) : (
                  <TxButton onClick={doTip} pending={tipPending} confirming={tipConfirming} size="sm" variant="money" style={{ height: 42, flex: 'none' }}>Send tip</TxButton>
                )}
              </div>
            </div>
          )}

          {/* Rules of this job */}
          <div className="panel panel-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>How this job pays</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--ink-2)' }}>
              <li style={{ display: 'flex', gap: 8 }}><Check size={14} color="var(--money)" style={{ flex: 'none', marginTop: 2 }} /> Approve a cut and its USDC leaves escrow for the editor in the same block.</li>
              <li style={{ display: 'flex', gap: 8 }}><Clock3 size={14} color="var(--accent)" style={{ flex: 'none', marginTop: 2 }} /> {Math.round(Number(job.reviewWindow) / 3600)}h review window — a cut nobody answers auto-releases.</li>
              <li style={{ display: 'flex', gap: 8 }}><Lock size={14} color="var(--ink-2)" style={{ flex: 'none', marginTop: 2 }} /> The master file link unlocks only after its milestone is paid.</li>
              <li style={{ display: 'flex', gap: 8 }}><X size={14} color="var(--danger)" style={{ flex: 'none', marginTop: 2 }} /> Disagree? A dispute offers a 50/50 split; the client can still release in full.</li>
            </ul>
          </div>

          {/* Danger zone */}
          {jobOpen && (isClient || isEditor) && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {isClient && <button onClick={cancelJob} className="btn btn-danger btn-sm" disabled={isPending || isConfirming}><X size={12} /> Cancel job & refund</button>}
              {isEditor && doneCount === 0 && <button onClick={declineJob} className="btn btn-danger btn-sm" disabled={isPending || isConfirming}><X size={12} /> Decline job</button>}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .review-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; grid-template-areas: 'viewer' 'deck' 'notes'; }
        @media (min-width: 980px) { .review-grid { grid-template-columns: minmax(0, 1fr) 360px; grid-template-areas: 'viewer deck' 'notes deck'; align-items: start; } }
      `}</style>

      {/* Release moment */}
      <AnimatePresence>
        {celebrate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCelebrate(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(5,8,7,0.66)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <Burst />
            <motion.div initial={{ scale: 0.86, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }} onClick={(e) => e.stopPropagation()} className="panel" style={{ padding: 32, width: 'min(440px, 100%)', textAlign: 'center', borderColor: 'rgba(62,224,160,0.5)', boxShadow: '0 0 80px rgba(62,224,160,0.25)' }}>
              <div style={{ width: 64, height: 64, borderRadius: 99, margin: '0 auto 16px', background: 'var(--money)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#04150e' }}><Check size={32} strokeWidth={3} /></div>
              <div className="eyebrow" style={{ color: 'var(--money)' }}>{msName(celebrate.idx, job.milestones.length)} approved</div>
              <div className="display" style={{ fontSize: 48, lineHeight: 1, margin: '8px 0 6px' }}>${formatUsdc(celebrate.amount)}</div>
              <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>USDC released to <span className="mono">{formatAddress(job.editor)}</span> on Arc.</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 22 }}>
                {celebrate.hash && <a href={txExplorerUrl(celebrate.hash)} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">View transaction <ArrowUpRight size={13} /></a>}
                <button onClick={() => setCelebrate(null)} className="btn btn-primary btn-sm">Back to the cut</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}

function Party({ label, addr, you, passport }: { label: string; addr: `0x${string}`; you: boolean; passport?: boolean }) {
  const inner = (
    <>
      <div className="eyebrow" style={{ fontSize: 10 }}>{label}{you ? ' · you' : ''}</div>
      <div className="mono" style={{ fontSize: 13, marginTop: 4, color: passport ? 'var(--accent)' : 'var(--ink)' }}>{formatAddress(addr)}</div>
    </>
  )
  const style: React.CSSProperties = { display: 'block', padding: '10px 12px', borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--border)', textDecoration: 'none' }
  return passport ? <Link to={`/editor/${addr}`} style={style}>{inner}</Link> : <a href={addrExplorerUrl(addr)} target="_blank" rel="noopener" style={style}>{inner}</a>
}

function Poster({ milestone, name, role }: { milestone?: MilestoneData; name: string; role: 'client' | 'editor' | null }) {
  const st = milestone?.status ?? MS_PENDING
  const paid = st === MS_RELEASED || st === MS_SPLIT
  const headline = st === MS_PENDING ? `${name} hasn't been submitted yet` : st === MS_SUBMITTED ? `${name} is in review` : st === MS_DISPUTED ? `${name} is disputed` : paid ? `${name} is paid · master not published yet` : `${name}`
  const sub = st === MS_SUBMITTED
    ? (role === 'client' ? 'Your editor shared the preview off-chain. Approve to release the money and unlock the master.' : 'The client is reviewing. Approval releases your USDC instantly.')
    : st === MS_PENDING ? 'The viewer lights up once the cut is submitted.' : paid ? 'The editor publishes the master link to match the on-chain fingerprint.' : ''
  return (
    <div className="grain" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(600px 300px at 50% 120%, rgba(109,141,255,0.18), transparent), linear-gradient(180deg, #0b0c10, #000)' }}>
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, display: 'flex' }}>
        {['#1b2440', '#17323a', '#0f2a24', '#2a1b1b', '#1b1b2a', '#242424', '#101010'].map((c) => <span key={c} style={{ flex: 1, background: c }} />)}
      </div>
      <div style={{ textAlign: 'center', padding: 24, maxWidth: 420 }}>
        <div style={{ width: 52, height: 52, borderRadius: 99, margin: '0 auto 14px', border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: st === MS_SUBMITTED ? 'var(--accent)' : 'var(--ink-2)' }} className={st === MS_SUBMITTED ? 'pulse' : ''}>
          {paid ? <Unlock size={20} /> : st === MS_SUBMITTED ? <Film size={20} /> : <Lock size={20} />}
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{headline}</div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{sub}</div>
      </div>
    </div>
  )
}

function Burst() {
  const parts = Array.from({ length: 22 })
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {parts.map((_, i) => {
        const a = (i / parts.length) * Math.PI * 2
        const r = 180 + (i % 5) * 40
        return (
          <motion.span key={i} initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: Math.cos(a) * r, y: Math.sin(a) * r, opacity: 0, scale: 0.4 }} transition={{ duration: 1.1 + (i % 3) * 0.2, ease: 'easeOut' }}
            style={{ position: 'absolute', left: '50%', top: '50%', width: i % 3 === 0 ? 10 : 6, height: i % 3 === 0 ? 10 : 6, borderRadius: i % 2 ? 99 : 2, background: i % 4 === 0 ? 'var(--accent)' : 'var(--money)' }} />
        )
      })}
    </div>
  )
}
