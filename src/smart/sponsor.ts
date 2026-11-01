import {
  type Address,
  type Hex,
  type RpcTransactionReceipt,
  decodeFunctionResult,
  encodeFunctionData,
  numberToHex,
  parseEther,
} from 'viem'
import { entryPoint07Abi } from 'viem/account-abstraction'

import {
  DEVWALLET_PAYMASTER,
  DEVWALLET_SPONSOR,
  ENTRY_POINT_07,
} from './constants'
import { serializeError } from './errors'
import type { Node } from './node'
import type { SponsorSetting } from './types'

/** The DevWallet sponsor is topped up to `SPONSOR_TOP_UP` below this. */
export const SPONSOR_MIN_BALANCE = parseEther('10')
export const SPONSOR_TOP_UP = parseEther('1000')
/** The paymaster's EntryPoint deposit gets `PAYMASTER_TOP_UP` below this. */
export const PAYMASTER_MIN_DEPOSIT = parseEther('1')
export const PAYMASTER_TOP_UP = parseEther('10')
// What an account sponsor keeps back to pay for `handleOps` itself.
const ACCOUNT_SPONSOR_GAS_RESERVE = parseEther('0.1')

export type SponsorPlan =
  | { ok: true; sender: Address }
  | { ok: false; reason: string }

const SPONSORSHIP_OFF: SponsorPlan = {
  ok: false,
  reason: 'Sponsorship is off.',
}

const RECEIPT_ATTEMPTS = 100
const RECEIPT_INTERVAL_MS = 50

async function paymasterDeposit(node: Node): Promise<bigint> {
  const result = await node.request<Hex>('eth_call', [
    {
      to: ENTRY_POINT_07,
      data: encodeFunctionData({
        abi: entryPoint07Abi,
        functionName: 'balanceOf',
        args: [DEVWALLET_PAYMASTER],
      }),
    },
    'latest',
  ])
  return decodeFunctionResult({
    abi: entryPoint07Abi,
    functionName: 'balanceOf',
    data: result,
  })
}

/**
 * Whether an account has the ETH to act as the sponsor, and whether the
 * paymaster's deposit needs a top-up from it. Shared by `assessSponsor` and
 * `prepareSponsor`, so they can't disagree.
 */
async function checkAccountSponsor(
  node: Node,
  address: Address,
): Promise<{ enough: boolean; depositShort: boolean }> {
  const [balance, deposit] = await Promise.all([
    node.getBalance(address),
    paymasterDeposit(node),
  ])
  const depositShort = deposit < PAYMASTER_MIN_DEPOSIT
  const required = depositShort
    ? PAYMASTER_TOP_UP + ACCOUNT_SPONSOR_GAS_RESERVE
    : ACCOUNT_SPONSOR_GAS_RESERVE
  return { enough: balance >= required, depositShort }
}

function tooLittleEth(address: Address): SponsorPlan {
  return { ok: false, reason: `Sponsor ${address} has too little ETH.` }
}

/** Waits for a mined, successful receipt. A node that never mines times out. */
async function waitForSuccess(node: Node, hash: Hex): Promise<void> {
  for (let attempt = 0; attempt < RECEIPT_ATTEMPTS; attempt++) {
    const receipt = await node.request<RpcTransactionReceipt | null>(
      'eth_getTransactionReceipt',
      [hash],
    )
    if (receipt) {
      if (receipt.status !== '0x1') throw new Error(`${hash} reverted`)
      return
    }
    await new Promise((resolve) => setTimeout(resolve, RECEIPT_INTERVAL_MS))
  }
  throw new Error(`${hash} was not mined`)
}

async function depositToPaymaster(node: Node, from: Address): Promise<void> {
  const hash = await node.request<Hex>('eth_sendTransaction', [
    {
      from,
      to: ENTRY_POINT_07,
      data: encodeFunctionData({
        abi: entryPoint07Abi,
        functionName: 'depositTo',
        args: [DEVWALLET_PAYMASTER],
      }),
      value: numberToHex(PAYMASTER_TOP_UP),
    },
  ])
  await waitForSuccess(node, hash)
}

async function isKnownToNode(node: Node, address: Address): Promise<boolean> {
  const accounts = await node.request<Address[]>('eth_accounts')
  return accounts.some((a) => a.toLowerCase() === address.toLowerCase())
}

/**
 * Makes the sponsor ready to pay for user operations: the funded sender that
 * will submit `handleOps`, and the paymaster's EntryPoint deposit. Sends
 * transactions and sets balances, so call it right before sending. A node
 * error is returned as a reason, never thrown.
 */
export async function prepareSponsor(
  node: Node,
  setting: SponsorSetting,
): Promise<SponsorPlan> {
  if (setting.kind === 'off') return SPONSORSHIP_OFF

  try {
    if (setting.kind === 'devwallet') {
      await node.impersonate(DEVWALLET_SPONSOR)
      if ((await node.getBalance(DEVWALLET_SPONSOR)) < SPONSOR_MIN_BALANCE) {
        await node.setBalance(DEVWALLET_SPONSOR, SPONSOR_TOP_UP)
      }
      if ((await paymasterDeposit(node)) < PAYMASTER_MIN_DEPOSIT) {
        await depositToPaymaster(node, DEVWALLET_SPONSOR)
      }
      return { ok: true, sender: DEVWALLET_SPONSOR }
    }

    const { address } = setting
    const { enough, depositShort } = await checkAccountSponsor(node, address)
    if (!enough) return tooLittleEth(address)
    if (!(await isKnownToNode(node, address))) await node.impersonate(address)
    if (depositShort) await depositToPaymaster(node, address)
    return { ok: true, sender: address }
  } catch (error) {
    const { message } = serializeError(error)
    return { ok: false, reason: `Couldn't fund the sponsor: ${message}` }
  }
}

/**
 * Whether `prepareSponsor` would succeed, without sending a transaction,
 * setting a balance or impersonating anyone. A node error is returned as a
 * reason, never thrown.
 */
export async function assessSponsor(
  node: Node,
  setting: SponsorSetting,
): Promise<SponsorPlan> {
  switch (setting.kind) {
    case 'off':
      return SPONSORSHIP_OFF
    case 'devwallet':
      // It can always be topped up.
      return { ok: true, sender: DEVWALLET_SPONSOR }
    case 'account':
      try {
        const { enough } = await checkAccountSponsor(node, setting.address)
        return enough
          ? { ok: true, sender: setting.address }
          : tooLittleEth(setting.address)
      } catch (error) {
        const { message } = serializeError(error)
        return { ok: false, reason: `Couldn't check the sponsor: ${message}` }
      }
  }
}
