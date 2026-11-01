import { homedir } from 'node:os'
import { join } from 'node:path'

import type { Address } from 'viem'

/** Anvil's default accounts 0-9 (10,000 ETH each on a fresh node). */
export const DEV_ACCOUNTS = [
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
  '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
  '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
  '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
  '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
] as const satisfies readonly Address[]

const READY_TIMEOUT_MS = 15_000
const START_ATTEMPTS = 5

function anvilBinary() {
  return Bun.which('anvil') ?? join(homedir(), '.foundry', 'bin', 'anvil')
}

async function chainIdOf(rpcUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      }),
    })
    return ((await res.json()) as { result?: string }).result
  } catch {
    return undefined
  }
}

/**
 * Spawns a local Anvil on a random port and resolves once it answers
 * `eth_chainId`. Call `stop()` to kill it.
 */
export async function startAnvil(
  args: string[] = [],
): Promise<{ rpcUrl: string; stop(): Promise<void> }> {
  let lastError = 'anvil did not start'
  // A random port can collide with another process; retry on a fresh one.
  for (let attempt = 0; attempt < START_ATTEMPTS; attempt++) {
    const port = 20_000 + Math.floor(Math.random() * 20_000)
    const rpcUrl = `http://127.0.0.1:${port}`
    const proc = Bun.spawn(
      [anvilBinary(), '--port', String(port), '--silent', ...args],
      { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' },
    )

    const stop = async () => {
      proc.kill()
      await proc.exited
    }

    let exited = false
    void proc.exited.then(() => {
      exited = true
    })

    const deadline = Date.now() + READY_TIMEOUT_MS
    while (!exited && Date.now() < deadline) {
      // If anvil died while we probed, the answer came from whatever else
      // holds the port, so only trust it while our process is still alive.
      if ((await chainIdOf(rpcUrl)) && !exited) return { rpcUrl, stop }
      await Bun.sleep(50)
    }

    if (!exited) {
      await stop()
      throw new Error(
        `anvil did not answer on ${rpcUrl} within ${READY_TIMEOUT_MS}ms`,
      )
    }
    lastError = (await new Response(proc.stderr).text()).trim() || lastError
    // Only a port collision is worth retrying; anything else (bad args) won't
    // get better on another port.
    if (!/in use/i.test(lastError)) break
  }
  throw new Error(`failed to start anvil: ${lastError}`)
}
