import type { Portfolio, Position, Trade } from './types'

const KEY = 'cyx-quant-paper-v1'
const STARTING_CASH = 100_000

export function defaultPortfolio(): Portfolio {
  return { cash: STARTING_CASH, positions: [], trades: [] }
}

export function loadPortfolio(): Portfolio {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultPortfolio()
    const parsed = JSON.parse(raw) as Portfolio
    if (typeof parsed.cash !== 'number' || !Array.isArray(parsed.positions)) {
      return defaultPortfolio()
    }
    return parsed
  } catch {
    return defaultPortfolio()
  }
}

export function savePortfolio(p: Portfolio): void {
  localStorage.setItem(KEY, JSON.stringify(p))
}

export function resetPortfolio(): Portfolio {
  const p = defaultPortfolio()
  savePortfolio(p)
  return p
}

function upsertPosition(positions: Position[], symbol: string, qtyDelta: number, price: number): Position[] {
  const next = [...positions]
  const idx = next.findIndex((p) => p.symbol === symbol)
  if (idx < 0) {
    if (qtyDelta > 0) next.push({ symbol, qty: qtyDelta, avgPrice: price })
    return next.filter((p) => p.qty > 1e-12)
  }
  const cur = next[idx]
  const newQty = cur.qty + qtyDelta
  if (newQty <= 1e-12) {
    next.splice(idx, 1)
    return next
  }
  if (qtyDelta > 0) {
    const avgPrice = (cur.avgPrice * cur.qty + price * qtyDelta) / newQty
    next[idx] = { symbol, qty: newQty, avgPrice }
  } else {
    next[idx] = { ...cur, qty: newQty }
  }
  return next
}

export function executeOrder(
  portfolio: Portfolio,
  params: { symbol: string; side: 'buy' | 'sell'; notionalUsd: number; price: number; note: string },
): { portfolio: Portfolio; error?: string } {
  const { symbol, side, notionalUsd, price, note } = params
  if (!(price > 0) || !(notionalUsd > 0)) {
    return { portfolio, error: '价格或金额无效' }
  }
  const qty = notionalUsd / price
  if (side === 'buy') {
    if (portfolio.cash < notionalUsd) return { portfolio, error: '现金不足' }
    const trade: Trade = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      symbol,
      side,
      qty,
      price,
      ts: Date.now(),
      note,
    }
    const next: Portfolio = {
      cash: portfolio.cash - notionalUsd,
      positions: upsertPosition(portfolio.positions, symbol, qty, price),
      trades: [trade, ...portfolio.trades].slice(0, 200),
    }
    savePortfolio(next)
    return { portfolio: next }
  }

  const pos = portfolio.positions.find((p) => p.symbol === symbol)
  if (!pos || pos.qty < qty - 1e-12) return { portfolio, error: '持仓不足' }
  const trade: Trade = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol,
    side,
    qty,
    price,
    ts: Date.now(),
    note,
  }
  const next: Portfolio = {
    cash: portfolio.cash + notionalUsd,
    positions: upsertPosition(portfolio.positions, symbol, -qty, price),
    trades: [trade, ...portfolio.trades].slice(0, 200),
  }
  savePortfolio(next)
  return { portfolio: next }
}

export function equityValue(
  portfolio: Portfolio,
  prices: Record<string, number>,
): number {
  const positionsValue = portfolio.positions.reduce((sum, p) => {
    const px = prices[p.symbol] ?? p.avgPrice
    return sum + p.qty * px
  }, 0)
  return portfolio.cash + positionsValue
}
