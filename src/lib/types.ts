export type Interval = '15m' | '1h' | '4h' | '1d'

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Ticker {
  symbol: string
  lastPrice: number
  priceChangePercent: number
  highPrice: number
  lowPrice: number
  volume: number
  quoteVolume: number
}

export type SignalSide = 'long' | 'short' | 'flat'

export interface Signal {
  side: SignalSide
  strength: number
  reason: string
  at: number
  price: number
}

export type StrategyId = 'ma_cross' | 'rsi_reversion' | 'macd_momentum' | 'boll_breakout'

export interface StrategyMeta {
  id: StrategyId
  name: string
  blurb: string
}

export interface Trade {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  qty: number
  price: number
  ts: number
  note: string
}

export interface Position {
  symbol: string
  qty: number
  avgPrice: number
}

export interface Portfolio {
  cash: number
  positions: Position[]
  trades: Trade[]
}

export interface BacktestTrade {
  entryTime: number
  exitTime: number
  side: 'long' | 'short'
  entryPrice: number
  exitPrice: number
  pnlPct: number
}

export interface BacktestResult {
  strategyId: StrategyId
  symbol: string
  interval: Interval
  trades: BacktestTrade[]
  equity: { time: number; value: number }[]
  totalReturnPct: number
  winRate: number
  maxDrawdownPct: number
  tradeCount: number
}
