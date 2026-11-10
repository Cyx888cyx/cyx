import type { Candle, Interval, Ticker } from './types'

const BASE = 'https://www.okx.com/api/v5'

export const SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
] as const

export type SymbolId = (typeof SYMBOLS)[number]

export const INTERVALS: { id: Interval; label: string }[] = [
  { id: '15m', label: '15分' },
  { id: '1h', label: '1小时' },
  { id: '4h', label: '4小时' },
  { id: '1d', label: '日线' },
]

const BAR_MAP: Record<Interval, string> = {
  '15m': '15m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
}

function toNum(v: string | number): number {
  return typeof v === 'number' ? v : Number(v)
}

/** BTCUSDT -> BTC-USDT */
export function toInstId(symbol: string): string {
  if (symbol.includes('-')) return symbol
  if (symbol.endsWith('USDT')) return `${symbol.slice(0, -4)}-USDT`
  return symbol
}

/** BTC-USDT -> BTCUSDT */
export function fromInstId(instId: string): string {
  return instId.replace('-', '')
}

interface OkxResponse<T> {
  code: string
  msg: string
  data: T
}

async function okxGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`OKX 请求失败 (${res.status})`)
  const body = (await res.json()) as OkxResponse<T>
  if (body.code !== '0') {
    throw new Error(body.msg || `OKX 错误码 ${body.code}`)
  }
  return body.data
}

export async function fetchTickers(symbols: readonly string[] = SYMBOLS): Promise<Ticker[]> {
  const wanted = new Set(symbols.map(toInstId))
  const raw = await okxGet<Array<Record<string, string>>>('/market/tickers?instType=SPOT')
  return raw
    .filter((t) => wanted.has(t.instId))
    .map((t) => {
      const last = toNum(t.last)
      const open = toNum(t.open24h)
      const changePct = open > 0 ? ((last - open) / open) * 100 : 0
      return {
        symbol: fromInstId(t.instId),
        lastPrice: last,
        priceChangePercent: changePct,
        highPrice: toNum(t.high24h),
        lowPrice: toNum(t.low24h),
        volume: toNum(t.vol24h),
        quoteVolume: toNum(t.volCcy24h),
      }
    })
    .sort((a, b) => symbols.indexOf(a.symbol as SymbolId) - symbols.indexOf(b.symbol as SymbolId))
}

export async function fetchKlines(
  symbol: string,
  interval: Interval,
  limit = 300,
): Promise<Candle[]> {
  const instId = toInstId(symbol)
  const bar = BAR_MAP[interval]
  const capped = Math.min(Math.max(limit, 1), 300)
  const raw = await okxGet<string[][]>(
    `/market/candles?instId=${encodeURIComponent(instId)}&bar=${bar}&limit=${capped}`,
  )
  // OKX returns newest first; chart/indicators need oldest first
  return raw
    .slice()
    .reverse()
    .map((k) => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: toNum(k[1]),
      high: toNum(k[2]),
      low: toNum(k[3]),
      close: toNum(k[4]),
      volume: toNum(k[5]),
    }))
}

export function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export function formatPct(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export function formatUsd(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

export function shortSymbol(symbol: string): string {
  return symbol.replace('-', '').replace('USDT', '')
}
