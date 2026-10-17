import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAccount, useDisconnect } from 'wagmi'
import { motion } from 'framer-motion'
import { formatAddress } from '../utils'
import { NETWORK_LABEL, ARC_NETWORK } from '../chain'
import { INSTANT_CONNECTOR_ID } from '../instantWallet'
import { ConnectModal, WalletPanel } from './WalletMenu'

export function Logo({ size = 18 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: size + 6, height: size + 6, borderRadius: 7, background: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={size - 4} height={size - 4} viewBox="0 0 16 16" fill="none">
          <path d="M3 2.5v11l9-5.5-9-5.5z" fill="var(--bg)" />
          <rect x="12.4" y="2" width="1.6" height="12" rx="0.8" fill="var(--play)" />
        </svg>
      </span>
      <span style={{ fontSize: size, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
        Cut<span style={{ color: 'var(--money)' }}>Pay</span>
      </span>
    </span>
  )
}

export default function NavBar() {
  const { address, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const { pathname } = useLocation()
  const [showConnect, setShowConnect] = useState(false)
  const [showWalletPanel, setShowWalletPanel] = useState(false)
  const isInstant = connector?.id === INSTANT_CONNECTOR_ID

  useEffect(() => {
    const open = () => setShowConnect(true)
    window.addEventListener('cutpay:connect', open)
    return () => window.removeEventListener('cutpay:connect', open)
  }, [])

  function handleWalletClick() {
    if (!address) setShowConnect(true)
    else if (isInstant) setShowWalletPanel(true)
    else disconnect()
  }

  const links = [
    { to: '/me', label: 'My jobs', short: 'Jobs' },
    { to: '/new', label: 'New job', short: 'New' },
  ]

  return (
    <>
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(8,8,9,0.72)', backdropFilter: 'blur(14px) saturate(140%)', WebkitBackdropFilter: 'blur(14px) saturate(140%)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="wrap" style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Link to="/" style={{ textDecoration: 'none' }}><Logo /></Link>

          <nav style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {links.map((l) => {
              const active = pathname === l.to
              return (
                <Link key={l.to} to={l.to} style={{ position: 'relative', textDecoration: 'none', fontSize: 14, fontWeight: 500, color: active ? 'var(--ink)' : 'var(--ink-2)', padding: '8px 12px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                  <span className="nav-long">{l.label}</span><span className="nav-short">{l.short}</span>
                  {active && <motion.span layoutId="nav-underline" style={{ position: 'absolute', left: 12, right: 12, bottom: 2, height: 2, borderRadius: 2, background: 'var(--money)' }} />}
                </Link>
              )
            })}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`chip ${ARC_NETWORK === 'mainnet' ? 'chip-money' : ''}`} style={{ display: 'none' }} data-net>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: ARC_NETWORK === 'mainnet' ? 'var(--money)' : 'var(--accent)' }} />
              {NETWORK_LABEL}
            </span>
            <button onClick={handleWalletClick} className={`btn btn-sm ${address ? 'btn-ghost' : 'btn-primary'}`} style={{ gap: 8 }}>
              {address ? (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--money)', boxShadow: '0 0 8px var(--money)' }} />
                  <span className="mono" style={{ fontSize: 12 }}>{formatAddress(address)}</span>
                </>
              ) : 'Connect'}
            </button>
          </div>
        </div>
        <style>{`.nav-short { display: none; } @media (max-width: 420px) { .nav-long { display: none; } .nav-short { display: inline; } } @media (min-width: 640px) { [data-net] { display: inline-flex !important; } }`}</style>
      </header>

      {showConnect && <ConnectModal onClose={() => setShowConnect(false)} />}
      {showWalletPanel && <WalletPanel onClose={() => setShowWalletPanel(false)} />}
    </>
  )
}
