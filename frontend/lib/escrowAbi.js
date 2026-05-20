/**
 * Minimal ABIs for the Arc fund-escrow flow.
 *
 * PerformanceEscrow.fund(bytes32 contractId, uint256 amount, address merchant, address agent)
 * IERC20.approve(address spender, uint256 amount)
 *
 * Full ABI lives in contracts/out/abi.json. This file pins only the calls
 * the frontend makes so we don't ship the whole ABI to the browser.
 */
export const ESCROW_ABI = [
  {
    type: 'function',
    name: 'fund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'contractId', type: 'bytes32' },
      { name: 'amount',     type: 'uint256' },
      { name: 'merchant',   type: 'address' },
      { name: 'agent',      type: 'address' },
    ],
    outputs: [],
  },
]

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount',  type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner',   type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
]
