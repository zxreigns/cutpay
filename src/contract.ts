/**
 * CutPayEscrow contract config.
 * Address is read from VITE_ESCROW_ADDRESS (set in .env after deploy).
 */

import { CHAIN_ID, USDC_ADDRESS } from './chain'

export { USDC_ADDRESS }
export const ARC_TESTNET_CHAIN_ID = CHAIN_ID

export const CUTPAY_ADDRESS = (import.meta.env.VITE_ESCROW_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`

export const CUTPAY_ABI = [
  // ─── Read ───
  {
    name: 'jobCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'getJob',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'client', type: 'address' },
          { name: 'editor', type: 'address' },
          { name: 'title', type: 'string' },
          { name: 'reviewWindow', type: 'uint256' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'totalFunded', type: 'uint256' },
          { name: 'totalReleased', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          {
            name: 'milestones',
            type: 'tuple[]',
            components: [
              { name: 'amount', type: 'uint256' },
              { name: 'status', type: 'uint8' },
              { name: 'submittedAt', type: 'uint256' },
              { name: 'deliverableHash', type: 'bytes32' },
              { name: 'deliverableURI', type: 'string' },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'jobsByClient',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'client', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'jobsByEditor',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'editor', type: 'address' }],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
  {
    name: 'editorStats',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'editor', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'jobsCompleted', type: 'uint256' },
          { name: 'usdcEarned', type: 'uint256' },
          { name: 'tipsReceived', type: 'uint256' },
          { name: 'onTimeApprovals', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'pendingWithdrawals',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // ─── Write ───
  {
    name: 'createJob',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'editor', type: 'address' },
      { name: 'title', type: 'string' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'reviewWindow', type: 'uint256' },
    ],
    outputs: [{ name: 'jobId', type: 'uint256' }],
  },
  {
    name: 'submitMilestone',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'idx', type: 'uint256' },
      { name: 'deliverableHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'approveMilestone',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'idx', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'claimAutoRelease',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'idx', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'revealDeliverable',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'idx', type: 'uint256' },
      { name: 'uri', type: 'string' },
    ],
    outputs: [],
  },
  {
    name: 'openDispute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'idx', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'acceptSplit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'idx', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'releaseDisputed',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'idx', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'cancelJob',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'declineJob',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'tip',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  // ─── Events ───
  {
    name: 'JobCreated',
    type: 'event',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'editor', type: 'address', indexed: true },
      { name: 'total', type: 'uint256', indexed: false },
      { name: 'milestoneCount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'MilestoneReleased',
    type: 'event',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'idx', type: 'uint256', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'autoReleased', type: 'bool', indexed: false },
    ],
  },
  {
    name: 'PayoutDeferred',
    type: 'event',
    inputs: [
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const
