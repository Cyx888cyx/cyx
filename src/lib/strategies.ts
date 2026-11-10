import { bollinger, closes, ema, lastFinite, macd, rsi, sma } from './indicators'
import type { Candle, Signal, StrategyId, StrategyMeta } from './types'

export const STRATEGIES: StrategyMeta[] = [
  {
    id: 'ma_cross',
    name: '双均线交叉',
    blurb: 'EMA12 上穿/下穿 EMA26，捕捉趋势启动。',
  },
  {
    id: 'rsi_reversion',
    name: 'RSI 均值回归',
    blurb: 'RSI 超卖做多、超买做空，适合震荡行情。',
  },
  {
    id: 'macd_momentum',
    name: 'MACD 动量',
    blurb: '柱状图由负转正做多，由正转负做空。',
  },
  {
    id: 'boll_breakout',
    name: '布林带突破',
    blurb: '收盘突破上轨做多、跌破下轨做空。',
  },
]

function clampStrength(n: number): number {
  return Math.max(0, Math.min(1, n))
}

export function evaluateStrategy(id: StrategyId, candles: Candle[]): Signal {
  const price = candles.at(-1)?.close ?? 0
  const at = candles.at(-1)?.time ?? Math.floor(Date.now() / 1000)
  const px = closes(candles)

  if (candles.length < 40) {
    return { side: 'flat', strength: 0, reason: '样本不足，等待更多K线', at, price }
  }

  if (id === 'ma_cross') {
    const fast = ema(px, 12)
    const slow = ema(px, 26)
    const i = px.length - 1
    const f0 = fast[i - 1]
    const s0 = slow[i - 1]
    const f1 = fast[i]
    const s1 = slow[i]
    if (f0 == null || s0 == null || f1 == null || s1 == null) {
      return { side: 'flat', strength: 0, reason: '均线未就绪', at, price }
    }
    const gap = Math.abs(f1 - s1) / price
    if (f0 <= s0 && f1 > s1) {
      return {
        side: 'long',
        strength: clampStrength(0.45 + gap * 80),
        reason: `EMA12 上穿 EMA26（差 ${((f1 - s1) / price * 100).toFixed(3)}%）`,
        at,
        price,
      }
    }
    if (f0 >= s0 && f1 < s1) {
      return {
        side: 'short',
        strength: clampStrength(0.45 + gap * 80),
        reason: `EMA12 下穿 EMA26（差 ${((s1 - f1) / price * 100).toFixed(3)}%）`,
        at,
        price,
      }
    }
    return {
      side: f1 >= s1 ? 'long' : 'short',
      strength: clampStrength(0.2 + gap * 40),
      reason: f1 >= s1 ? '快线在慢线上方，偏多持有' : '快线在慢线下方，偏空持有',
      at,
      price,
    }
  }

  if (id === 'rsi_reversion') {
    const series = rsi(px, 14)
    const v = lastFinite(series)
    if (v == null) return { side: 'flat', strength: 0, reason: 'RSI 未就绪', at, price }
    if (v < 30) {
      return {
        side: 'long',
        strength: clampStrength((30 - v) / 30 + 0.4),
        reason: `RSI=${v.toFixed(1)} 超卖，均值回归做多`,
        at,
        price,
      }
    }
    if (v > 70) {
      return {
        side: 'short',
        strength: clampStrength((v - 70) / 30 + 0.4),
        reason: `RSI=${v.toFixed(1)} 超买，均值回归做空`,
        at,
        price,
      }
    }
    return {
      side: 'flat',
      strength: clampStrength(1 - Math.abs(v - 50) / 50),
      reason: `RSI=${v.toFixed(1)} 中性区间，观望`,
      at,
      price,
    }
  }

  if (id === 'macd_momentum') {
    const m = macd(px)
    const i = px.length - 1
    const h0 = m.hist[i - 1]
    const h1 = m.hist[i]
    const line = m.macd[i]
    if (h0 == null || h1 == null || line == null) {
      return { side: 'flat', strength: 0, reason: 'MACD 未就绪', at, price }
    }
    if (h0 <= 0 && h1 > 0) {
      return {
        side: 'long',
        strength: clampStrength(0.55 + Math.abs(h1) / price * 200),
        reason: 'MACD 柱由负转正，动量转多',
        at,
        price,
      }
    }
    if (h0 >= 0 && h1 < 0) {
      return {
        side: 'short',
        strength: clampStrength(0.55 + Math.abs(h1) / price * 200),
        reason: 'MACD 柱由正转负，动量转空',
        at,
        price,
      }
    }
    return {
      side: h1 >= 0 ? 'long' : 'short',
      strength: clampStrength(0.25 + Math.abs(h1) / price * 120),
      reason: h1 >= 0 ? 'MACD 柱为正，动量偏多' : 'MACD 柱为负，动量偏空',
      at,
      price,
    }
  }

  // boll_breakout
  const bb = bollinger(px, 20, 2)
  const i = px.length - 1
  const upper = bb.upper[i]
  const lower = bb.lower[i]
  const mid = bb.mid[i]
  if (upper == null || lower == null || mid == null) {
    return { side: 'flat', strength: 0, reason: '布林带未就绪', at, price }
  }
  if (price > upper) {
    return {
      side: 'long',
      strength: clampStrength(0.5 + (price - upper) / mid),
      reason: `收盘突破上轨 ${upper.toFixed(2)}`,
      at,
      price,
    }
  }
  if (price < lower) {
    return {
      side: 'short',
      strength: clampStrength(0.5 + (lower - price) / mid),
      reason: `收盘跌破下轨 ${lower.toFixed(2)}`,
      at,
      price,
    }
  }
  const width = (upper - lower) / mid
  return {
    side: 'flat',
    strength: clampStrength(1 - width * 8),
    reason: `价格在布林带内，带宽 ${(width * 100).toFixed(2)}%`,
    at,
    price,
  }
}

/** Bar-by-bar position series for backtests: 1 long, -1 short, 0 flat */
export function positionSeries(id: StrategyId, candles: Candle[]): number[] {
  const px = closes(candles)
  const pos = Array(candles.length).fill(0) as number[]

  if (id === 'ma_cross') {
    const fast = ema(px, 12)
    const slow = ema(px, 26)
    let state = 0
    for (let i = 1; i < candles.length; i++) {
      const f0 = fast[i - 1]
      const s0 = slow[i - 1]
      const f1 = fast[i]
      const s1 = slow[i]
      if (f0 == null || s0 == null || f1 == null || s1 == null) {
        pos[i] = state
        continue
      }
      if (f0 <= s0 && f1 > s1) state = 1
      else if (f0 >= s0 && f1 < s1) state = -1
      pos[i] = state
    }
    return pos
  }

  if (id === 'rsi_reversion') {
    const series = rsi(px, 14)
    let state = 0
    for (let i = 0; i < candles.length; i++) {
      const v = series[i]
      if (v == null) {
        pos[i] = state
        continue
      }
      if (v < 30) state = 1
      else if (v > 70) state = -1
      else if (v > 45 && v < 55) state = 0
      pos[i] = state
    }
    return pos
  }

  if (id === 'macd_momentum') {
    const m = macd(px)
    let state = 0
    for (let i = 1; i < candles.length; i++) {
      const h0 = m.hist[i - 1]
      const h1 = m.hist[i]
      if (h0 == null || h1 == null) {
        pos[i] = state
        continue
      }
      if (h0 <= 0 && h1 > 0) state = 1
      else if (h0 >= 0 && h1 < 0) state = -1
      pos[i] = state
    }
    return pos
  }

  const bb = bollinger(px, 20, 2)
  let state = 0
  for (let i = 0; i < candles.length; i++) {
    const upper = bb.upper[i]
    const lower = bb.lower[i]
    const mid = bb.mid[i]
    if (upper == null || lower == null || mid == null) {
      pos[i] = state
      continue
    }
    if (px[i] > upper) state = 1
    else if (px[i] < lower) state = -1
    else if (Math.abs(px[i] - mid) / mid < 0.002) state = 0
    pos[i] = state
  }
  return pos
}

export function snapshotIndicators(candles: Candle[]) {
  const px = closes(candles)
  const ma20 = lastFinite(sma(px, 20))
  const ema12 = lastFinite(ema(px, 12))
  const ema26 = lastFinite(ema(px, 26))
  const rsi14 = lastFinite(rsi(px, 14))
  const m = macd(px)
  return {
    ma20,
    ema12,
    ema26,
    rsi14,
    macd: lastFinite(m.macd),
    macdSignal: lastFinite(m.signal),
    macdHist: lastFinite(m.hist),
  }
}
