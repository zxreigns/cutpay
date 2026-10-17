import { type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface TxButtonProps {
  onClick: () => void
  disabled?: boolean
  pending?: boolean
  confirming?: boolean
  success?: boolean
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  fullWidth?: boolean
  children: ReactNode
}

export default function TxButton({
  onClick,
  disabled,
  pending,
  confirming,
  variant = 'primary',
  size = 'md',
  fullWidth,
  children,
}: TxButtonProps) {
  const isLoading = pending || confirming
  const isDisabled = disabled || isLoading

  const bg =
    variant === 'primary'
      ? 'var(--accent)'
      : variant === 'danger'
        ? 'rgba(242,107,107,0.15)'
        : 'rgba(255,255,255,0.06)'

  const textColor =
    variant === 'primary' ? '#0B0B0C' : variant === 'danger' ? 'var(--danger)' : 'var(--ink-2)'

  const hoverBg =
    variant === 'primary'
      ? 'var(--accent-hover)'
      : variant === 'danger'
        ? 'rgba(242,107,107,0.22)'
        : 'rgba(255,255,255,0.10)'

  const padding = size === 'sm' ? '7px 14px' : '10px 20px'
  const fontSize = size === 'sm' ? 13 : 14

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        padding,
        borderRadius: 99,
        border: variant === 'ghost' ? '1px solid var(--border)' : variant === 'danger' ? '1px solid rgba(242,107,107,0.4)' : 'none',
        background: isDisabled ? 'rgba(255,255,255,0.04)' : bg,
        color: isDisabled ? 'var(--muted)' : textColor,
        fontSize,
        fontWeight: 600,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        fontFamily: 'DM Sans, sans-serif',
        width: fullWidth ? '100%' : undefined,
        transition: 'background 0.15s, opacity 0.15s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) (e.currentTarget).style.background = hoverBg
      }}
      onMouseLeave={(e) => {
        if (!isDisabled) (e.currentTarget).style.background = isDisabled ? 'rgba(255,255,255,0.04)' : bg
      }}
    >
      {isLoading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
      {pending ? 'Confirm in wallet...' : confirming ? 'Confirming...' : children}
    </button>
  )
}
