/**
 * Active network config, driven by VITE_ARC_NETWORK env var.
 * Set VITE_ARC_NETWORK=mainnet for Arc Mainnet; defaults to testnet.
 */

import { arcTestnet } from 'viem/chains'
import type { Chain } from 'viem'

export const ARC_NETWORK = (import.meta.env.VITE_ARC_NETWORK ?? 'testnet') as 'testnet' | 'mainnet'

// Arc Mainnet chain definition (not yet in viem/chains at time of writing)
const arcMainnet: Chain = {
  id: 5042,
  name: 'Arc',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.arc.io'] },
  },
  blockExplorers: {
    default: {
      name: 'Arc Explorer',
      url: 'https://explorer.arc.io',
    },
  },
}

export const ACTIVE_CHAIN: Chain = ARC_NETWORK === 'mainnet' ? arcMainnet : arcTestnet

export const CHAIN_ID = ACTIVE_CHAIN.id

export const EXPLORER_BASE =
  ARC_NETWORK === 'mainnet'
    ? 'https://explorer.arc.io'
    : 'https://explorer.testnet.arc.io'

/** USDC address is the same on both Arc Testnet and Arc Mainnet. */
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const

export const NETWORK_LABEL = ARC_NETWORK === 'mainnet' ? 'Arc Mainnet' : 'Arc Testnet'
