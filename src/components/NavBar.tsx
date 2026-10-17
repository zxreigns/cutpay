import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAccount, useDisconnect } from 'wagmi'
import { Scissors } from 'lucide-react'
import { formatAddress } from '../utils'
import { NETWORK_LABEL, ARC_NETWORK } from '../chain'
import { INSTANT_CONNECTOR_ID } from '../instantWallet'
import { ConnectModal, WalletPanel } from './WalletMenu'

export default function NavBar() {
  const { address, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const { pathname } = useLocation()

  const [showConnect, setShowConnect] = useState(false)
  const [showWalletPanel, setShowWalletPanel] = useState(false)

  const isInstant = connector?.id === INSTANT_CONNECTOR_ID

  function handleWalletClick() {
    if (!address) {
      setShowConnect(true)
    } else if (isInstant) {
      setShowWalletPanel(true)
    } else {
      // Browser wallet — disconnect directly
      disconnect()
    }
  }

  return (
    <>
      <header
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'rgba(11,11,12,0.92)',
          backdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 1120,
            margin: '0 auto',
            padding: '0 20px',
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          {/* Logo */}
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              color: 'var(--ink)',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                background: 'var(--accent)',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Scissors size={15} color="#0B0B0C" strokeWidth={2.5} />
            </div>
            <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>
              CutPay
            </span>
            {/* Network badge */}
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                padding: '2px 7px',
                borderRadius: 99,
                background: ARC_NETWORK === 'mainnet' ? 'rgba(123,216,143,0.12)' : 'rgba(245,178,39,0.1)',
                color: ARC_NETWORK === 'mainnet' ? 'var(--success)' : 'var(--accent)',
                border: `1px solid ${ARC_NETWORK === 'mainnet' ? 'rgba(123,216,143,0.25)' : 'rgba(245,178,39,0.2)'}`,
              }}
            >
              {NETWORK_LABEL}
            </span>
          </Link>

          {/* Nav links */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center' }}>
            {address && (
              <>
                <NavLink to="/new" active={pathname === '/new'}>
                  New Job
                </NavLink>
                <NavLink to="/me" active={pathname === '/me'}>
                  Dashboard
                </NavLink>
                <NavLink to={`/editor/${address}`} active={pathname.startsWith('/editor/')}>
                  My Passport
                </NavLink>
              </>
            )}
          </nav>

          {/* Wallet button area */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Instant wallet chip */}
            {address && isInstant && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.05em',
                  padding: '3px 8px',
                  borderRadius: 99,
                  background: 'rgba(245,178,39,0.08)',
                  color: 'var(--accent)',
                  border: '1px solid rgba(245,178,39,0.18)',
                  whiteSpace: 'nowrap',
                  display: 'none', // hidden on mobile, shown via media query below
                }}
                className="instant-chip"
              >
                Instant wallet
              </span>
            )}

            <button
              onClick={handleWalletClick}
              style={{
                padding: '7px 14px',
                borderRadius: 99,
                border: '1px solid var(--border)',
                background: address ? 'var(--surface)' : 'var(--accent)',
                color: address ? 'var(--ink)' : '#0B0B0C',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'DM Sans, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              {address ? formatAddress(address) : 'Connect Wallet'}
            </button>
          </div>
        </div>
      </header>

      {/* Instant wallet chip inline under the header on mobile */}
      {address && isInstant && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '6px 0',
            background: 'rgba(245,178,39,0.04)',
            borderBottom: '1px solid rgba(245,178,39,0.1)',
          }}
        >
          <button
            onClick={() => setShowWalletPanel(true)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.05em',
              padding: '3px 10px',
              borderRadius: 99,
              background: 'transparent',
              color: 'var(--accent)',
              border: '1px solid rgba(245,178,39,0.25)',
              cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            Instant wallet · stored in this browser · Manage
          </button>
        </div>
      )}

      {/* Connect modal */}
      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}

      {/* Instant wallet management panel */}
      {showWalletPanel && <WalletPanel onClose={() => setShowWalletPanel(false)} />}
    </>
  )
}

function NavLink({
  to,
  active,
  children,
}: {
  to: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      style={{
        padding: '5px 12px',
        borderRadius: 99,
        textDecoration: 'none',
        fontSize: 13,
        fontWeight: 500,
        color: active ? 'var(--accent)' : 'var(--muted)',
        background: active ? 'rgba(245,178,39,0.1)' : 'transparent',
        transition: 'color 0.15s, background 0.15s',
      }}
    >
      {children}
    </Link>
  )
}
