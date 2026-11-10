import type { Candle } from './types'

export function closes(candles: Candle[]): number[] {
  return candles.map((c) => c.close)
}

export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null)
  if (period <= 0 || values.length < period) return out
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null)
  if (period <= 0 || values.length < period) return out
  const k = 2 / (period + 1)
  let prev = 0
  for (let i = 0; i < period; i++) prev += values[i]
  prev /= period
  out[period - 1] = prev
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

export function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = Array(values.length).fill(null)
  if (values.length <= period) return out

  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1]
    if (diff >= 0) gain += diff
    else loss -= diff
  }
  gain /= period
  loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    const g = diff > 0 ? diff : 0
    const l = diff < 0 ? -diff : 0
    gain = (gain * (period - 1) + g) / period
    loss = (loss * (period - 1) + l) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): {
  macd: Array<number | null>
  signal: Array<number | null>
  hist: Array<number | null>
} {
  const fastE = ema(values, fast)
  const slowE = ema(values, slow)
  const macdLine: Array<number | null> = values.map((_, i) =>
    fastE[i] != null && slowE[i] != null ? (fastE[i] as number) - (slowE[i] as number) : null,
  )

  const compact: number[] = []
  const indexMap: number[] = []
  macdLine.forEach((v, i) => {
    if (v != null) {
      compact.push(v)
      indexMap.push(i)
    }
  })
  const sigCompact = ema(compact, signal)
  const signalLine: Array<number | null> = Array(values.length).fill(null)
  const hist: Array<number | null> = Array(values.length).fill(null)
  sigCompact.forEach((v, j) => {
    if (v == null) return
    const i = indexMap[j]
    signalLine[i] = v
    hist[i] = (macdLine[i] as number) - v
  })
  return { macd: macdLine, signal: signalLine, hist }
}

export function bollinger(
  values: number[],
  period = 20,
  mult = 2,
): {
  mid: Array<number | null>
  upper: Array<number | null>
  lower: Array<number | null>
} {
  const mid = sma(values, period)
  const upper: Array<number | null> = Array(values.length).fill(null)
  const lower: Array<number | null> = Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1)
    const mean = mid[i] as number
    const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period
    const std = Math.sqrt(variance)
    upper[i] = mean + mult * std
    lower[i] = mean - mult * std
  }
  return { mid, upper, lower }
}

export function lastFinite(series: Array<number | null>): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i]
    if (v != null && Number.isFinite(v)) return v
  }
  return null
}
