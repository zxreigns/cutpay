/**
 * WalletMenu — two-choice connect UI + instant wallet management panel.
 *
 * Entry points:
 *   <ConnectModal open onClose /> — shown when no wallet connected
 *   <WalletPanel open onClose /> — shown when instant wallet is connected
 */

import { useState, useCallback } from 'react'
import { useAccount, useConnect, useDisconnect, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { INSTANT_CONNECTOR_ID, deleteKey, exportKey, importKey } from '../instantWallet'
import { USDC_ADDRESS, ARC_TESTNET_CHAIN_ID } from '../contract'
import { formatAddress, formatUsdc } from '../utils'
import { Copy, Eye, EyeOff, LogOut, Download, Upload, AlertTriangle } from 'lucide-react'

// ─── Shared overlay ─────────────────────────────────────────────────────────

function Overlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
      }}
    />
  )
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  zIndex: 101,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 18,
  padding: 28,
  width: 'min(420px, calc(100vw - 32px))',
  maxHeight: 'calc(100dvh - 64px)',
  overflowY: 'auto',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const btnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '11px 18px',
  borderRadius: 99,
  border: '1px solid var(--border)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'DM Sans, sans-serif',
  width: '100%',
  transition: 'border-color 0.15s, background 0.15s',
}

const dangerBtn: React.CSSProperties = {
  ...btnBase,
  background: 'rgba(242,107,107,0.08)',
  borderColor: 'rgba(242,107,107,0.3)',
  color: 'var(--danger)',
}

const ghostBtn: React.CSSProperties = {
  ...btnBase,
  background: 'transparent',
  color: 'var(--ink-2)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--accent-ink)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--ink)',
  fontSize: 13,
  fontFamily: 'DM Mono, monospace',
  outline: 'none',
  marginTop: 8,
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 4px' }}>
      {children}
    </p>
  )
}

function Divider() {
  return <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0' }} />
}

// ─── Connect Modal ───────────────────────────────────────────────────────────

export function ConnectModal({ onClose }: { onClose: () => void }) {
  const { connect, connectors, isPending } = useConnect()

  const injectedConnector = connectors.find((c) => c.id === 'injected')
  const instantConnector = connectors.find((c) => c.id === INSTANT_CONNECTOR_ID)

  const connectInjected = useCallback(() => {
    if (!injectedConnector) return
    connect({ connector: injectedConnector })
  }, [connect, injectedConnector])

  const connectInstant = useCallback(() => {
    if (!instantConnector) return
    connect({ connector: instantConnector })
  }, [connect, instantConnector])

  return (
    <>
      <Overlay onClose={onClose} />
      <div style={panelStyle} role="dialog" aria-modal aria-label="Connect wallet">
        <h2 className="display" style={{ fontSize: 30, marginBottom: 6, color: 'var(--ink)', lineHeight: 1 }}>
          Connect a <em>wallet.</em>
        </h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 24 }}>
          Try CutPay in one click, or use the extension you already have.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Instant wallet — the one-click path */}
          <button
            onClick={connectInstant}
            disabled={isPending || !instantConnector}
            style={{ ...btnBase, background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--bg)' }}
          >
            <InstantIcon />
            Instant wallet
            <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.6, marginLeft: 2 }}>— one click, lives in this browser</span>
          </button>
          {/* Browser wallet */}
          <button
            onClick={connectInjected}
            disabled={isPending || !injectedConnector}
            style={{ ...btnBase, background: 'transparent', color: 'var(--ink)', opacity: !injectedConnector ? 0.45 : 1 }}
          >
            <BrowserWalletIcon />
            Browser wallet
            {!injectedConnector && (
              <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>(no extension found)</span>
            )}
          </button>
        </div>

        <Divider />

        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
          The instant wallet generates a private key in your browser and stores it in
          localStorage. It never leaves your device. Use it to try CutPay without an
          extension — export the key to a proper wallet when you need real funds.
        </p>
      </div>
    </>
  )
}

// ─── Wallet Panel (instant wallet management) ─────────────────────────────────

export function WalletPanel({ onClose }: { onClose: () => void }) {
  const { address } = useAccount()
  const { disconnect } = useDisconnect()

  const [copied, setCopied] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [confirmForget, setConfirmForget] = useState(false)
  const [confirmExport, setConfirmExport] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importInput, setImportInput] = useState('')
  const [importError, setImportError] = useState('')

  const { data: balance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 10_000 },
  })

  const copyAddress = useCallback(() => {
    if (!address) return
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => undefined)
  }, [address])

  const handleForget = useCallback(() => {
    deleteKey()
    disconnect()
    onClose()
  }, [disconnect, onClose])

  const handleImport = useCallback(() => {
    setImportError('')
    if (!importKey(importInput)) {
      setImportError('Invalid key. Must be 0x followed by 64 hex characters.')
      return
    }
    // Force a reconnect with the new key by disconnecting first
    disconnect()
    setShowImport(false)
    setImportInput('')
    onClose()
  }, [importInput, disconnect, onClose])

  const rawKey = confirmExport && showKey ? exportKey() : null

  return (
    <>
      <Overlay onClose={onClose} />
      <div style={panelStyle} role="dialog" aria-modal aria-label="Wallet">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 className="display" style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
              Instant wallet
            </h2>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                padding: '2px 7px',
                borderRadius: 99,
                background: 'rgba(109,141,255,0.1)',
                color: 'var(--accent)',
                border: '1px solid rgba(109,141,255,0.2)',
              }}
            >
              Stored in this browser
            </span>
          </div>
        </div>

        {/* Address + balance */}
        <div
          style={{
            background: 'var(--accent-ink)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 20,
          }}
        >
          <Label>Address</Label>
          <div style={{ ...rowStyle, justifyContent: 'space-between' }}>
            <span className="mono" style={{ fontSize: 13, color: 'var(--ink)', letterSpacing: '0.02em' }}>
              {address ? formatAddress(address) : '—'}
            </span>
            <button
              onClick={copyAddress}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: copied ? 'var(--success)' : 'var(--muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                padding: '4px 8px',
                borderRadius: 10,
              }}
            >
              <Copy size={12} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            <Label>USDC balance</Label>
            <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
              ${balance !== undefined ? formatUsdc(balance) : '—'}
            </span>
          </div>
        </div>

        {/* Receive instructions */}
        <div
          style={{
            background: 'rgba(109,141,255,0.06)',
            border: '1px solid rgba(109,141,255,0.18)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 20,
            fontSize: 12,
            color: 'var(--ink-2)',
            lineHeight: 1.6,
          }}
        >
          To fund this wallet, withdraw USDC on the Arc network from Bybit, OKX, or Kraken
          to the address above. On Arc, USDC pays for gas and escrow — one asset, no ETH needed.
        </div>

        <Divider />

        {/* Export key */}
        {!confirmExport ? (
          <button
            onClick={() => setConfirmExport(true)}
            style={ghostBtn}
          >
            <Download size={14} />
            Export private key
          </button>
        ) : (
          <div>
            <div
              style={{
                background: 'rgba(242,107,107,0.06)',
                border: '1px solid rgba(242,107,107,0.2)',
                borderRadius: 12,
                padding: '12px 14px',
                marginBottom: 12,
                display: 'flex',
                gap: 8,
                fontSize: 12,
                color: 'var(--danger)',
                lineHeight: 1.5,
              }}
            >
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              Keep this key private. Anyone with it has full control of this wallet. Store it
              in a password manager before refreshing or clearing this browser.
            </div>
            <div style={{ position: 'relative' }}>
              <input
                style={{ ...inputStyle, paddingRight: 40 }}
                type={showKey ? 'text' : 'password'}
                readOnly
                value={rawKey ?? ''}
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%) translateY(4px)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              onClick={() => { setConfirmExport(false); setShowKey(false) }}
              style={{ ...ghostBtn, marginTop: 8, fontSize: 12, padding: '6px 12px' }}
            >
              Done
            </button>
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          {!showImport ? (
            <button onClick={() => setShowImport(true)} style={ghostBtn}>
              <Upload size={14} />
              Import key
            </button>
          ) : (
            <div>
              <Label>Paste a 0x private key</Label>
              <div
                style={{
                  background: 'rgba(242,107,107,0.06)',
                  border: '1px solid rgba(242,107,107,0.2)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  marginBottom: 8,
                  fontSize: 12,
                  color: 'var(--danger)',
                  lineHeight: 1.5,
                }}
              >
                This will replace your current key. The old key will be gone.
              </div>
              <input
                style={inputStyle}
                type="password"
                placeholder="0x..."
                value={importInput}
                onChange={(e) => { setImportInput(e.target.value); setImportError('') }}
              />
              {importError && (
                <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6, marginBottom: 0 }}>{importError}</p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={handleImport} style={{ ...btnBase, background: 'var(--accent)', color: 'var(--accent-ink)', borderColor: 'var(--accent)', flex: 1 }}>
                  Import
                </button>
                <button onClick={() => { setShowImport(false); setImportInput(''); setImportError('') }} style={{ ...ghostBtn, flex: 1 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <Divider />

        {/* Forget */}
        {!confirmForget ? (
          <button onClick={() => setConfirmForget(true)} style={dangerBtn}>
            <LogOut size={14} />
            Forget wallet
          </button>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>
              This removes the key from localStorage. Make sure you exported it first.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleForget} style={{ ...dangerBtn, flex: 1 }}>
                Yes, forget it
              </button>
              <button onClick={() => setConfirmForget(false)} style={{ ...ghostBtn, flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function BrowserWalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M16 12h.01" />
    </svg>
  )
}

function InstantIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}
