import { keccak256, toBytes } from 'viem'
import { EXPLORER_BASE, CHAIN_ID } from './chain'

// Re-export for backward compat with existing page imports
export { EXPLORER_BASE }
export const ARC_TESTNET_CHAIN_ID = CHAIN_ID

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function formatUsdc(raw: bigint): string {
  const n = Number(raw) / 1_000_000
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function parseUsdc(val: string): bigint {
  // parse a decimal string like "10.50" into 6-decimal bigint
  const trimmed = val.trim()
  if (!trimmed || isNaN(Number(trimmed))) return 0n
  const [intPart, fracPart = ''] = trimmed.split('.')
  const frac = (fracPart + '000000').slice(0, 6)
  return BigInt(intPart) * 1_000_000n + BigInt(frac)
}

export function hashUri(uri: string): `0x${string}` {
  return keccak256(toBytes(uri))
}

export function txExplorerUrl(hash: string): string {
  return `${EXPLORER_BASE}/tx/${hash}`
}

export function addrExplorerUrl(addr: string): string {
  return `${EXPLORER_BASE}/address/${addr}`
}

export function parseOnchainError(err: unknown): string {
  if (!err) return 'Unknown error'
  const msg = (err as Error).message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || msg.includes('denied')) return 'Transaction cancelled.'
  if (msg.includes('insufficient funds') || msg.includes('insufficient balance') || msg.includes('gas required exceeds') || msg.includes('out of gas'))
    return 'Insufficient balance. Add USDC to this address to cover gas and escrow on Arc.'
  if (msg.includes('insufficient')) return 'Insufficient USDC balance.'
  if (msg.includes('onlyeditor')) return 'Only the editor can do this.'
  if (msg.includes('onlyclient')) return 'Only the client can do this.'
  if (msg.includes('jobnotopen')) return 'This job is no longer open.'
  if (msg.includes('milestonenotpending')) return 'This milestone is not pending.'
  if (msg.includes('milestonenotsubmitted')) return 'This milestone has not been submitted yet.'
  if (msg.includes('reviewwindowactive')) return 'Review window is still active.'
  if (msg.includes('reviewwindowpassed')) return 'Review window has already passed.'
  if (msg.includes('hashmismatch')) return 'File link does not match the submitted hash.'
  if (msg.includes('uriAlreadySet')) return 'Link already revealed.'
  if (msg.includes('milestoneinreview')) return 'A milestone is currently in review — cancel not allowed.'
  if (msg.includes('nothingToWithdraw')) return 'Nothing to withdraw.'
  if (msg.includes('reverted')) {
    const match = msg.match(/reason="([^"]+)"/)
    if (match) return `Failed: ${match[1]}`
    return 'Transaction reverted. Check the job state and try again.'
  }
  return 'Something went wrong. Please try again.'
}

export enum JobStatus {
  Open = 0,
  Completed = 1,
  Cancelled = 2,
}

export enum MilestoneStatus {
  Pending = 0,
  Submitted = 1,
  Released = 2,
  Refunded = 3,
  Split = 4,
  Disputed = 5,
}

export function jobStatusLabel(s: number): string {
  return ['Open', 'Completed', 'Cancelled'][s] ?? 'Unknown'
}

export function milestoneStatusLabel(s: number): { label: string; color: string } {
  const map: Record<number, { label: string; color: string }> = {
    0: { label: 'Pending', color: '#7c7e88' },
    1: { label: 'Submitted', color: '#6d8dff' },
    2: { label: 'Released', color: '#3ee0a0' },
    3: { label: 'Refunded', color: '#7c7e88' },
    4: { label: 'Split', color: '#3ee0a0' },
    5: { label: 'Disputed', color: '#ff6b6b' },
  }
  return map[s] ?? { label: 'Unknown', color: '#7c7e88' }
}

export const REVIEW_WINDOWS = [
  { label: '24 hours', value: 86400 },
  { label: '72 hours', value: 259200 },
  { label: '7 days', value: 604800 },
]
