/** TxButton — a button that knows about the two waits of a transaction. */
import { type ReactNode } from 'react'

interface TxButtonProps {
  onClick: () => void
  pending?: boolean
  confirming?: boolean
  disabled?: boolean
  children: ReactNode
  variant?: 'primary' | 'accent' | 'money' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  style?: React.CSSProperties
  pendingLabel?: string
  confirmingLabel?: string
}

export default function TxButton({ onClick, pending, confirming, disabled, children, variant = 'accent', size = 'md', style, pendingLabel = 'Confirm in wallet…', confirmingLabel = 'Settling on Arc…' }: TxButtonProps) {
  const busy = pending || confirming
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : ''}`}
      style={style}
    >
      {busy && <span style={{ width: 14, height: 14, borderRadius: 99, border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin .8s linear infinite', display: 'inline-block' }} />}
      {pending ? pendingLabel : confirming ? confirmingLabel : children}
    </button>
  )
}
