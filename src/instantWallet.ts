/**
 * Instant Wallet — wagmi v2 custom connector
 *
 * Backs a local viem LocalAccount from a private key stored in localStorage.
 * The key is generated with generatePrivateKey on first use.
 * Signs and sends through a viem WalletClient on ACTIVE_CHAIN.
 * switchChain is a no-op — this wallet always lives on ACTIVE_CHAIN.
 *
 * The private key is NEVER logged, traced, or emitted in events.
 */

import { createWalletClient, http } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { createConnector } from 'wagmi'
import type { WalletClient } from 'viem'
import { ACTIVE_CHAIN } from './chain'

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cutpay.instantWallet.v1'

function loadKey(): `0x${string}` | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && /^0x[0-9a-fA-F]{64}$/.test(raw)) return raw as `0x${string}`
  } catch {
    // storage blocked (private browsing)
  }
  return null
}

function saveKey(key: `0x${string}`): void {
  try {
    localStorage.setItem(STORAGE_KEY, key)
  } catch {
    // ignore
  }
}

export function deleteKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Import a raw hex private key into localStorage.
 * Returns true on success, false if the format is invalid.
 */
export function importKey(raw: string): boolean {
  const trimmed = raw.trim()
  if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) return false
  saveKey(trimmed as `0x${string}`)
  return true
}

/** Export the stored private key. Returns null if no key is stored. */
export function exportKey(): `0x${string}` | null {
  return loadKey()
}

/** True when a key already exists in storage. */
export function hasInstantWallet(): boolean {
  return loadKey() !== null
}

// ─── Connector ───────────────────────────────────────────────────────────────

export const INSTANT_CONNECTOR_ID = 'cutpay-instant'

export function instantWalletConnector() {
  // Mutable connector-level state
  let _client: WalletClient | null = null
  let _address: `0x${string}` | null = null

  /**
   * Builds (or returns cached) client from an EXISTING key.
   * Never generates a key — call only when you know a key exists or was just created.
   */
  function ensureClient(key: `0x${string}`): { client: WalletClient; address: `0x${string}` } {
    if (_client && _address) return { client: _client, address: _address }

    const account = privateKeyToAccount(key)
    _address = account.address
    _client = createWalletClient({
      account,
      chain: ACTIVE_CHAIN,
      transport: http(ACTIVE_CHAIN.rpcUrls.default.http[0]),
    })

    return { client: _client, address: _address }
  }

  // wagmi v2 createConnector — provider type is the raw JSON-RPC provider shape.
  // We return a WalletClient from getProvider; wagmi uses it as the EIP-1193 provider.
  return createConnector(() => ({
    id: INSTANT_CONNECTOR_ID,
    name: 'Instant wallet',
    type: 'instantWallet' as const,

    connect<W extends boolean = false>(params?: {
      chainId?: number
      isReconnecting?: boolean
      withCapabilities?: W | boolean
    }): Promise<{ accounts: W extends true ? readonly { address: `0x${string}`; capabilities: Record<string, unknown> }[] : readonly `0x${string}`[]; chainId: number }> {
      type Ret = { accounts: W extends true ? readonly { address: `0x${string}`; capabilities: Record<string, unknown> }[] : readonly `0x${string}`[]; chainId: number }

      // During wagmi's auto-reconnect on page load (isReconnecting === true),
      // only proceed if a key already exists — never generate one silently.
      const isReconnecting = params?.isReconnecting ?? false
      const existingKey = loadKey()

      if (isReconnecting && !existingKey) {
        // No key in storage: refuse auto-reconnect so the user stays disconnected.
        return Promise.reject(new Error('No instant wallet in storage'))
      }

      // Explicit connect: generate a key if none exists yet (user opted in).
      const key = existingKey ?? (() => { const k = generatePrivateKey(); saveKey(k); return k })()
      const { address } = ensureClient(key)
      return Promise.resolve({ accounts: [address], chainId: ACTIVE_CHAIN.id } as unknown as Ret)
    },

    disconnect() {
      _client = null
      _address = null
      return Promise.resolve()
    },

    getAccounts() {
      const key = loadKey()
      if (!key) return Promise.resolve([] as readonly `0x${string}`[])
      const { address } = ensureClient(key)
      return Promise.resolve([address] as readonly `0x${string}`[])
    },

    getChainId() {
      return Promise.resolve(ACTIVE_CHAIN.id)
    },

    /**
     * isAuthorized: returns true only when a key is already stored.
     * This controls whether wagmi attempts auto-reconnect on page load.
     * Returning false on a fresh visit prevents any auto-connection.
     */
    isAuthorized() {
      return Promise.resolve(loadKey() !== null)
    },

    /**
     * switchChain is a no-op: this connector is bound to ACTIVE_CHAIN.
     * It returns ACTIVE_CHAIN regardless of the requested chainId so wagmi
     * doesn't throw. Any chain-switch UI should show a message explaining this.
     */
    switchChain() {
      return Promise.resolve(ACTIVE_CHAIN)
    },

    /**
     * getClient — wagmi v2 prefers this over getProvider for getConnectorClient.
     * Returns the viem WalletClient directly so wagmi uses local signing instead
     * of forwarding eth_sendTransaction to the public RPC (which cannot sign).
     */
    getClient() {
      const key = loadKey()
      if (!key) return Promise.reject(new Error('No instant wallet in storage'))
      const { client } = ensureClient(key)
      // Cast needed: wagmi's Client generic is stricter than WalletClient at the call site.
      return Promise.resolve(client as unknown as import('viem').Client)
    },

    getProvider() {
      const key = loadKey()
      if (!key) {
        // No key yet — return a stub. wagmi won't reach here without a connect() first.
        return Promise.resolve({} as Record<string, unknown>)
      }
      const { client } = ensureClient(key)
      // Cast to unknown first; wagmi will use the WalletClient as its EIP-1193 provider.
      return Promise.resolve(client as unknown as Record<string, unknown>)
    },

    onAccountsChanged(accounts: string[]) {
      void accounts
    },

    onChainChanged(_chainId: string) {
      void _chainId
    },

    onDisconnect() {
      // no-op
    },
  }))
}
