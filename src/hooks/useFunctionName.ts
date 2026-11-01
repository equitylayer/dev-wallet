import { useMemo } from 'react'
import { type Abi, type Hex, slice, toFunctionSelector } from 'viem'

import { useLookupSignature } from './useLookupSignature'

/**
 * Best-effort function name for calldata, for compact labels such as
 * activity rows. Tries the contract's known ABI first, then a selector
 * lookup (cached per selector and shared with the decoded-calldata view).
 * Undefined while unknown, so callers keep their own fallback label.
 */
export function useFunctionName({
  abi,
  data,
}: {
  abi?: Abi
  data?: Hex
}): string | undefined {
  const selector =
    data && data.length >= 10 ? slice(data, 0, 4).toLowerCase() : undefined

  const fromAbi = useMemo(() => {
    if (!abi || !selector) return undefined
    for (const item of abi) {
      if (item.type !== 'function') continue
      try {
        if (toFunctionSelector(item) === selector) return item.name
      } catch {}
    }
    return undefined
  }, [abi, selector])

  const { data: signature } = useLookupSignature({
    enabled: Boolean(selector) && !fromAbi,
    selector: selector as Hex | undefined,
  })

  return fromAbi ?? (signature ? signature.split('(')[0] : undefined)
}
