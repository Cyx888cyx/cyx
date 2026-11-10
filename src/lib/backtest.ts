import { positionSeries } from './strategies'
import type { BacktestResult, BacktestTrade, Candle, Interval, StrategyId } from './types'

export function runBacktest(
  strategyId: StrategyId,
  symbol: string,
  interval: Interval,
  candles: Candle[],
): BacktestResult {
  const pos = positionSeries(strategyId, candles)
  const equity: { time: number; value: number }[] = []
  const trades: BacktestTrade[] = []

  let cash = 1
  let units = 0
  let side: 'long' | 'short' | null = null
  let entryTime = 0
  let entryPrice = 0
  let peak = 1
  let maxDd = 0

  for (let i = 1; i < candles.length; i++) {
    const prevPos = pos[i - 1]
    const curPos = pos[i]
    const price = candles[i].close

    if (prevPos !== curPos) {
      // close existing
      if (side && units !== 0) {
        // flatten to cash mark-to-market
        if (side === 'long') {
          cash = units * price
          const pnlPct = (price / entryPrice - 1) * 100
          trades.push({
            entryTime,
            exitTime: candles[i].time,
            side,
            entryPrice,
            exitPrice: price,
            pnlPct,
          })
        } else {
          const pnlPct = (entryPrice / price - 1) * 100
          cash = cash + units * (entryPrice - price)
          trades.push({
            entryTime,
            exitTime: candles[i].time,
            side,
            entryPrice,
            exitPrice: price,
            pnlPct,
          })
        }
        units = 0
        side = null
      }

      if (curPos === 1) {
        units = cash / price
        cash = 0
        side = 'long'
        entryTime = candles[i].time
        entryPrice = price
      } else if (curPos === -1) {
        // short: keep cash, track units borrowed
        units = cash / price
        side = 'short'
        entryTime = candles[i].time
        entryPrice = price
      }
    }

    let value = cash
    if (side === 'long') value = units * price
    if (side === 'short') value = cash + units * (entryPrice - price)

    peak = Math.max(peak, value)
    const dd = peak > 0 ? (peak - value) / peak : 0
    maxDd = Math.max(maxDd, dd)
    equity.push({ time: candles[i].time, value })
  }

  // close at end
  const last = candles.at(-1)
  if (last && side && units !== 0) {
    const price = last.close
    if (side === 'long') {
      cash = units * price
      trades.push({
        entryTime,
        exitTime: last.time,
        side,
        entryPrice,
        exitPrice: price,
        pnlPct: (price / entryPrice - 1) * 100,
      })
    } else {
      cash = cash + units * (entryPrice - price)
      trades.push({
        entryTime,
        exitTime: last.time,
        side,
        entryPrice,
        exitPrice: price,
        pnlPct: (entryPrice / price - 1) * 100,
      })
    }
    equity[equity.length - 1] = { time: last.time, value: cash }
  }

  const finalValue = equity.at(-1)?.value ?? 1
  const wins = trades.filter((t) => t.pnlPct > 0).length

  return {
    strategyId,
    symbol,
    interval,
    trades,
    equity,
    totalReturnPct: (finalValue - 1) * 100,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    maxDrawdownPct: maxDd * 100,
    tradeCount: trades.length,
  }
}
