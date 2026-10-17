export interface NumberFormatOptions {
  decimals?: number
  compact?: boolean
}

/** 한국식 큰 수 축약 (만·억·조) */
export function compactKo(n: number, decimals = 1): string {
  const abs = Math.abs(n)
  const units: [number, string][] = [
    [1e12, '조'],
    [1e8, '억'],
    [1e4, '만'],
  ]
  for (const [base, unit] of units) {
    if (abs >= base) {
      const v = n / base
      return `${v.toLocaleString('ko-KR', { maximumFractionDigits: decimals })}${unit}`
    }
  }
  return n.toLocaleString('ko-KR', { maximumFractionDigits: decimals })
}

export function formatNumber(n: number | null | undefined, opts: NumberFormatOptions = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const decimals = opts.decimals ?? 1
  if (opts.compact && Math.abs(n) >= 1e4) return compactKo(n, decimals)
  return n.toLocaleString('ko-KR', { maximumFractionDigits: decimals })
}

export function formatPercent(ratio: number | null | undefined, decimals = 1): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—'
  const v = ratio * 100
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(decimals)}%`
}

export function formatShare(ratio: number | null | undefined, decimals = 1): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(decimals)}%`
}

export function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
