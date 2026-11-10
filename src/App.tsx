import { useEffect, useMemo, useState } from 'react'
import { PriceChart } from './components/PriceChart'
import { runBacktest } from './lib/backtest'
import {
  fetchKlines,
  fetchTickers,
  formatPct,
  formatPrice,
  formatUsd,
  INTERVALS,
  shortSymbol,
  SYMBOLS,
  type SymbolId,
} from './lib/market'
import { equityValue, executeOrder, loadPortfolio, resetPortfolio } from './lib/paper'
import { evaluateStrategy, snapshotIndicators, STRATEGIES } from './lib/strategies'
import type {
  BacktestResult,
  Candle,
  Interval,
  Portfolio,
  StrategyId,
  Ticker,
} from './lib/types'

type Tab = 'market' | 'signal' | 'paper' | 'backtest'

const SIDE_LABEL = {
  long: '做多',
  short: '做空',
  flat: '观望',
} as const

function EquitySpark({ points }: { points: { time: number; value: number }[] }) {
  if (points.length < 2) return null
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const w = 640
  const h = 180
  const pad = 12
  const d = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - pad * 2)
      const y = h - pad - ((p.value - min) / span) * (h - pad * 2)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const up = values.at(-1)! >= values[0]
  return (
    <svg className="equity-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={up ? '#3DDC97' : '#F07167'} strokeWidth="2.5" />
    </svg>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('market')
  const [symbol, setSymbol] = useState<SymbolId>('BTCUSDT')
  const [interval, setInterval] = useState<Interval>('1h')
  const [tickers, setTickers] = useState<Ticker[]>([])
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [strategyId, setStrategyId] = useState<StrategyId>('ma_cross')
  const [portfolio, setPortfolio] = useState<Portfolio>(() => loadPortfolio())
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [notional, setNotional] = useState('1000')
  const [orderError, setOrderError] = useState<string | null>(null)
  const [backtest, setBacktest] = useState<BacktestResult | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [t, k] = await Promise.all([fetchTickers(), fetchKlines(symbol, interval, 300)])
        if (cancelled) return
        setTickers(t)
        setCandles(k)
        setUpdatedAt(Date.now())
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    const id = window.setInterval(() => void load(), 30_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [symbol, interval])

  const priceMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of tickers) map[t.symbol] = t.lastPrice
    return map
  }, [tickers])

  const activeTicker = tickers.find((t) => t.symbol === symbol)
  const indicators = useMemo(() => snapshotIndicators(candles), [candles])
  const signal = useMemo(() => evaluateStrategy(strategyId, candles), [strategyId, candles])
  const totalEquity = equityValue(portfolio, priceMap)

  function onTrade() {
    const price = priceMap[symbol] ?? candles.at(-1)?.close
    if (!price) {
      setOrderError('暂无价格')
      return
    }
    const amount = Number(notional)
    const note = `${STRATEGIES.find((s) => s.id === strategyId)?.name ?? ''} 信号辅助`
    const result = executeOrder(portfolio, {
      symbol,
      side: orderSide,
      notionalUsd: amount,
      price,
      note,
    })
    if (result.error) {
      setOrderError(result.error)
      return
    }
    setOrderError(null)
    setPortfolio(result.portfolio)
  }

  function onBacktest() {
    if (candles.length < 50) return
    setBacktest(runBacktest(strategyId, symbol, interval, candles))
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <div className="brand-logo" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 16 L9 8 L13 13 L21 4"
                  stroke="#2DD4BF"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="21" cy="4" r="2" fill="#F5A524" />
              </svg>
            </div>
            <div className="brand-name">
              CYX <span>Quant</span>
            </div>
          </div>
          <div className="brand-tag">
            加密货币量化交易终端：实时行情、策略信号、模拟下单与历史回测。
          </div>
        </div>
        <div className="status-pill">
          <span className="status-dot" />
          {loading ? '同步中' : '行情已连接'}
          {updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString('zh-CN')}` : ''}
        </div>
      </header>

      <nav className="tabs" aria-label="主导航">
        {(
          [
            ['market', '行情'],
            ['signal', '策略信号'],
            ['paper', '模拟交易'],
            ['backtest', '回测'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={`tab ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <div className="panel">
          <p className="error">{error}</p>
          <p className="hint">行情来源：OKX 公开接口（无需 API Key）。</p>
        </div>
      )}

      {tab === 'market' && (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">市场总览</h2>
              <div className="controls">
                <select
                  className="select"
                  value={interval}
                  onChange={(e) => setInterval(e.target.value as Interval)}
                >
                  {INTERVALS.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ticker-grid">
              {SYMBOLS.map((sym) => {
                const t = tickers.find((x) => x.symbol === sym)
                const chg = t?.priceChangePercent ?? 0
                return (
                  <button
                    key={sym}
                    type="button"
                    className={`ticker ${symbol === sym ? 'active' : ''}`}
                    onClick={() => setSymbol(sym)}
                  >
                    <div className="ticker-sym">{shortSymbol(sym)}</div>
                    <div className="ticker-px">{t ? formatPrice(t.lastPrice) : '—'}</div>
                    <div className={`ticker-chg ${chg >= 0 ? 'up' : 'down'}`}>
                      {t ? formatPct(chg) : '—'}
                    </div>
                  </button>
                )
              })}
            </div>

            <PriceChart candles={candles} />

            <div className="metrics">
              <div className="metric">
                <div className="metric-label">最新价</div>
                <div className="metric-value">
                  {activeTicker ? formatPrice(activeTicker.lastPrice) : '—'}
                </div>
              </div>
              <div className="metric">
                <div className="metric-label">24h 涨跌</div>
                <div
                  className={`metric-value ${(activeTicker?.priceChangePercent ?? 0) >= 0 ? 'up' : 'down'}`}
                >
                  {activeTicker ? formatPct(activeTicker.priceChangePercent) : '—'}
                </div>
              </div>
              <div className="metric">
                <div className="metric-label">MA20</div>
                <div className="metric-value">
                  {indicators.ma20 != null ? formatPrice(indicators.ma20) : '—'}
                </div>
              </div>
              <div className="metric">
                <div className="metric-label">RSI(14)</div>
                <div className="metric-value">
                  {indicators.rsi14 != null ? indicators.rsi14.toFixed(1) : '—'}
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {tab === 'signal' && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">量化策略信号 · {shortSymbol(symbol)}</h2>
            <div className="controls">
              <select
                className="select"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value as SymbolId)}
              >
                {SYMBOLS.map((s) => (
                  <option key={s} value={s}>
                    {shortSymbol(s)}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={interval}
                onChange={(e) => setInterval(e.target.value as Interval)}
              >
                {INTERVALS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="strategy-grid">
            <div className="strategy-list">
              {STRATEGIES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`strategy-item ${strategyId === s.id ? 'active' : ''}`}
                  onClick={() => setStrategyId(s.id)}
                >
                  <h3>{s.name}</h3>
                  <p>{s.blurb}</p>
                </button>
              ))}
            </div>

            <div className="signal-box">
              <div className={`signal-side ${signal.side}`}>{SIDE_LABEL[signal.side]}</div>
              <div>
                <div className="muted" style={{ marginBottom: 6 }}>
                  信号强度 {(signal.strength * 100).toFixed(0)}%
                </div>
                <div className="bar">
                  <span style={{ width: `${Math.round(signal.strength * 100)}%` }} />
                </div>
              </div>
              <p className="hint">{signal.reason}</p>
              <div className="metrics" style={{ marginTop: 0 }}>
                <div className="metric">
                  <div className="metric-label">EMA12</div>
                  <div className="metric-value">
                    {indicators.ema12 != null ? formatPrice(indicators.ema12) : '—'}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">EMA26</div>
                  <div className="metric-value">
                    {indicators.ema26 != null ? formatPrice(indicators.ema26) : '—'}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">MACD</div>
                  <div className="metric-value">
                    {indicators.macd != null ? indicators.macd.toFixed(2) : '—'}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">价格</div>
                  <div className="metric-value">{formatPrice(signal.price)}</div>
                </div>
              </div>
              <button
                className="btn primary"
                type="button"
                onClick={() => {
                  setOrderSide(signal.side === 'short' ? 'sell' : 'buy')
                  setTab('paper')
                }}
              >
                按信号去模拟下单
              </button>
            </div>
          </div>
        </section>
      )}

      {tab === 'paper' && (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">模拟交易账户</h2>
              <button
                className="btn danger"
                type="button"
                onClick={() => setPortfolio(resetPortfolio())}
              >
                重置账户
              </button>
            </div>
            <div className="metrics">
              <div className="metric">
                <div className="metric-label">总权益</div>
                <div className="metric-value">{formatUsd(totalEquity)}</div>
              </div>
              <div className="metric">
                <div className="metric-label">现金</div>
                <div className="metric-value">{formatUsd(portfolio.cash)}</div>
              </div>
              <div className="metric">
                <div className="metric-label">持仓市值</div>
                <div className="metric-value">{formatUsd(totalEquity - portfolio.cash)}</div>
              </div>
              <div className="metric">
                <div className="metric-label">累计成交</div>
                <div className="metric-value">{portfolio.trades.length}</div>
              </div>
            </div>
            <p className="hint" style={{ marginTop: '0.85rem' }}>
              本地模拟盘，起始资金 $100,000，数据保存在浏览器 localStorage，不连接真实交易所下单。
            </p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">下单</h2>
            </div>
            <div className="trade-form">
              <div className="field">
                <label htmlFor="sym">交易对</label>
                <select
                  id="sym"
                  className="select"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value as SymbolId)}
                >
                  {SYMBOLS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="side">方向</label>
                <select
                  id="side"
                  className="select"
                  value={orderSide}
                  onChange={(e) => setOrderSide(e.target.value as 'buy' | 'sell')}
                >
                  <option value="buy">买入</option>
                  <option value="sell">卖出</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="notional">金额 (USDT)</label>
                <input
                  id="notional"
                  className="input"
                  value={notional}
                  onChange={(e) => setNotional(e.target.value)}
                  inputMode="decimal"
                />
              </div>
              <button className="btn primary" type="button" onClick={onTrade}>
                提交模拟单
              </button>
            </div>
            {orderError && <p className="error">{orderError}</p>}
            <p className="hint" style={{ marginTop: '0.75rem' }}>
              当前参考价：
              <span className="mono">
                {' '}
                {priceMap[symbol] != null ? formatPrice(priceMap[symbol]) : '—'}
              </span>
            </p>
          </section>

          <div className="split-2">
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">持仓</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>币种</th>
                      <th>数量</th>
                      <th>成本</th>
                      <th>现价</th>
                      <th>盈亏</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.positions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted">
                          暂无持仓
                        </td>
                      </tr>
                    )}
                    {portfolio.positions.map((p) => {
                      const px = priceMap[p.symbol] ?? p.avgPrice
                      const pnl = ((px - p.avgPrice) / p.avgPrice) * 100
                      return (
                        <tr key={p.symbol}>
                          <td>{shortSymbol(p.symbol)}</td>
                          <td className="mono">{p.qty.toFixed(6)}</td>
                          <td className="mono">{formatPrice(p.avgPrice)}</td>
                          <td className="mono">{formatPrice(px)}</td>
                          <td className={`mono ${pnl >= 0 ? 'up' : 'down'}`}>{formatPct(pnl)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">成交记录</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>方向</th>
                      <th>币种</th>
                      <th>金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.trades.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted">
                          暂无成交
                        </td>
                      </tr>
                    )}
                    {portfolio.trades.slice(0, 12).map((t) => (
                      <tr key={t.id}>
                        <td className="mono">
                          {new Date(t.ts).toLocaleString('zh-CN', { hour12: false })}
                        </td>
                        <td className={t.side === 'buy' ? 'up' : 'down'}>
                          {t.side === 'buy' ? '买入' : '卖出'}
                        </td>
                        <td>{shortSymbol(t.symbol)}</td>
                        <td className="mono">{formatUsd(t.qty * t.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}

      {tab === 'backtest' && (
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">策略回测</h2>
            <div className="controls">
              <select
                className="select"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value as SymbolId)}
              >
                {SYMBOLS.map((s) => (
                  <option key={s} value={s}>
                    {shortSymbol(s)}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={interval}
                onChange={(e) => setInterval(e.target.value as Interval)}
              >
                {INTERVALS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
              <select
                className="select"
                value={strategyId}
                onChange={(e) => setStrategyId(e.target.value as StrategyId)}
              >
                {STRATEGIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button className="btn primary" type="button" onClick={onBacktest}>
                运行回测
              </button>
            </div>
          </div>

          <p className="hint">
            使用当前已加载的 {candles.length} 根 K
            线做事件驱动回测（含做多/做空切换）。结果仅供研究，不构成投资建议。
          </p>

          {backtest && (
            <>
              <div className="metrics" style={{ marginTop: '0.9rem' }}>
                <div className="metric">
                  <div className="metric-label">总收益</div>
                  <div
                    className={`metric-value ${backtest.totalReturnPct >= 0 ? 'up' : 'down'}`}
                  >
                    {formatPct(backtest.totalReturnPct)}
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">胜率</div>
                  <div className="metric-value">{backtest.winRate.toFixed(1)}%</div>
                </div>
                <div className="metric">
                  <div className="metric-label">最大回撤</div>
                  <div className="metric-value down">
                    {backtest.maxDrawdownPct.toFixed(2)}%
                  </div>
                </div>
                <div className="metric">
                  <div className="metric-label">交易次数</div>
                  <div className="metric-value">{backtest.tradeCount}</div>
                </div>
              </div>

              <div style={{ marginTop: '0.9rem' }}>
                <EquitySpark points={backtest.equity} />
              </div>

              <div className="table-wrap" style={{ marginTop: '0.9rem' }}>
                <table>
                  <thead>
                    <tr>
                      <th>方向</th>
                      <th>入场</th>
                      <th>出场</th>
                      <th>收益</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backtest.trades
                      .slice()
                      .reverse()
                      .slice(0, 20)
                      .map((t, i) => (
                        <tr key={`${t.entryTime}-${i}`}>
                          <td className={t.side === 'long' ? 'up' : 'down'}>
                            {t.side === 'long' ? '多' : '空'}
                          </td>
                          <td className="mono">{formatPrice(t.entryPrice)}</td>
                          <td className="mono">{formatPrice(t.exitPrice)}</td>
                          <td className={`mono ${t.pnlPct >= 0 ? 'up' : 'down'}`}>
                            {formatPct(t.pnlPct)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  )
}
