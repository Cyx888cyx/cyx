import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import type { Candle } from '../lib/types'

interface Props {
  candles: Candle[]
  height?: number
}

export function PriceChart({ candles, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = createChart(el, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8BA0B2',
        fontFamily: "'IBM Plex Mono', monospace",
      },
      grid: {
        vertLines: { color: 'rgba(139, 160, 178, 0.08)' },
        horzLines: { color: 'rgba(139, 160, 178, 0.08)' },
      },
      rightPriceScale: { borderColor: 'rgba(139, 160, 178, 0.15)' },
      timeScale: { borderColor: 'rgba(139, 160, 178, 0.15)', timeVisible: true },
      crosshair: {
        vertLine: { color: 'rgba(45, 212, 191, 0.35)' },
        horzLine: { color: 'rgba(45, 212, 191, 0.35)' },
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#3DDC97',
      downColor: '#F07167',
      borderUpColor: '#3DDC97',
      borderDownColor: '#F07167',
      wickUpColor: '#3DDC97',
      wickDownColor: '#F07167',
    })

    chartRef.current = chart
    seriesRef.current = series

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return
      chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [height])

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current || candles.length === 0) return
    seriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    )
    chartRef.current.timeScale().fitContent()
  }, [candles])

  return <div className="chart-host" ref={containerRef} style={{ height }} />
}
