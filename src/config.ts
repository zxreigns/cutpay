/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { ACTIVE_CHAIN } from './chain'
import { instantWalletConnector } from './instantWallet'

// Pre-register the active chain RPC so traces show the correct network name
registerChain(ACTIVE_CHAIN.id, ACTIVE_CHAIN.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [ACTIVE_CHAIN, mainnet], // mainnet kept for ENS resolution only
  connectors: [
    injected(),
    instantWalletConnector(),
  ],
  transports: {
    [ACTIVE_CHAIN.id]: http(ACTIVE_CHAIN.rpcUrls.default.http[0]),
    [mainnet.id]: http(),
  },
})
