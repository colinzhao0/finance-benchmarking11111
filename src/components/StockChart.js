import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Brush,
  Customized,
} from 'recharts';
import {
  generate1DData,
  generate5DData,
  generate1MData,
  getCurrentMarketState,
} from '../utils/priceEngine';
import './StockChart.css';

/* ── Candlestick renderer ────────────────────────────────────────────────── */

const CandlestickSeries = (props) => {
  const { formattedGraphicalItems, yAxisMap } = props;
  if (!formattedGraphicalItems?.length || !yAxisMap) return null;
  const yAxis = Object.values(yAxisMap)[0];
  if (!yAxis?.scale) return null;
  const yScale = yAxis.scale;
  const points = formattedGraphicalItems[0]?.props?.points;
  if (!points?.length) return null;
  const candleWidth = Math.max(2, Math.min(12, Math.floor(500 / points.length)));

  return (
    <g className="recharts-candlestick-series">
      {points.map((point, i) => {
        const d = point.payload;
        if (!d?.open) return null;
        const x  = point.x;
        const yO = yScale(d.open),  yC = yScale(d.close);
        const yH = yScale(d.high),  yL = yScale(d.low);
        if ([yO, yC, yH, yL].some(v => v == null || isNaN(v))) return null;
        const up    = d.close >= d.open;
        const color = up ? '#26a69a' : '#ef5350';
        const top   = Math.min(yO, yC);
        const h     = Math.max(Math.abs(yC - yO), 1);
        return (
          <g key={i}>
            <line x1={x} y1={yH} x2={x} y2={yL} stroke={color} strokeWidth={1} />
            <rect x={x - candleWidth / 2} y={top} width={candleWidth} height={h}
              fill={color} stroke={color} strokeWidth={0.5} />
          </g>
        );
      })}
    </g>
  );
};

/* ── Tooltip ─────────────────────────────────────────────────────────────── */

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  const label = d.time || d.date || '';
  const cl    = d.close  ?? d.price;
  const op    = d.open   ?? cl;
  const hi    = d.high   ?? cl;
  const lo    = d.low    ?? cl;
  const vol   = d.volume ?? 0;

  return (
    <div className="custom-tooltip">
      <p className="tooltip-label">Time:</p>  <p className="tooltip-value">{label || 'N/A'}</p>
      <p className="tooltip-label">Open:</p>  <p className="tooltip-value">{op.toFixed(2)}</p>
      <p className="tooltip-label">High:</p>  <p className="tooltip-value">{hi.toFixed(2)}</p>
      <p className="tooltip-label">Low:</p>   <p className="tooltip-value">{lo.toFixed(2)}</p>
      <p className="tooltip-label">Close:</p> <p className="tooltip-value">{cl.toFixed(2)}</p>
      <p className="tooltip-label">Volume:</p><p className="tooltip-value">{vol.toLocaleString()}</p>
    </div>
  );
};

/* ── X-axis config for 1D ─────────────────────────────────────────────────── */

// Ticks every 60 minutes (0 = 9:30 AM, 60 = 10:30 AM, … 360 = 3:30 PM)
const HOUR_TICKS  = [0, 60, 120, 180, 240, 300, 360];
const HOUR_LABELS = ['9:30', '10:30', '11:30', '12:30', '1:30', '2:30', '3:30'];

/* ── Main chart component ─────────────────────────────────────────────────── */

/**
 * StockChart — renders a Recharts chart for a given symbol.
 *
 * Props:
 *   symbol          {string}  ticker symbol
 *   basePrice       {number}  reference price for the procedural engine
 *   timeRange       {string}  '1d' | '5d' | '1m'
 *   chartMode       {string}  'line' | 'candlestick'
 *   currentTimestamp {number} Unix timestamp in seconds (drives live updates)
 */
function StockChart({ symbol, basePrice, timeRange, chartMode = 'line', currentTimestamp }) {
  // getCurrentMarketState reads Date.now() — call directly so it re-reads every render.
  // currentTimestamp prop drives re-renders each second via App.js setInterval.
  const { dayNum, marketSec } = getCurrentMarketState();

  const currentMinute = Math.floor(marketSec / 60);

  const chartData = useMemo(() => {
    if (!symbol || basePrice == null) return [];
    if (timeRange === '1d') return generate1DData(symbol, basePrice, dayNum, marketSec);
    if (timeRange === '5d') return generate5DData(symbol, basePrice, dayNum, marketSec);
    return generate1MData(symbol, basePrice, dayNum, marketSec);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, basePrice, timeRange, dayNum, currentMinute]);
  // ↑ 1D re-renders on each new minute; 5D/1M effectively stable within a day

  const totalLen = chartData.length;

  /* Brush initial window ─────────────────────────────────────────── */
  const initialBrushEnd   = Math.max(0, totalLen - 1);
  const initialBrushStart = timeRange === '5d'
    ? Math.max(0, totalLen - 7)   // show most-recent trading day (7 hourly bars)
    : Math.max(0, totalLen - 22); // show last ~month for 1M

  const [brushRange, setBrushRange] = useState([initialBrushStart, initialBrushEnd]);
  const brushRangeRef = useRef(brushRange);
  brushRangeRef.current = brushRange;
  const chartRef = useRef(null);

  useEffect(() => {
    setBrushRange([initialBrushStart, initialBrushEnd]);
  }, [initialBrushStart, initialBrushEnd]);

  /* Scroll-wheel panning (5D / 1M only) ─────────────────────────── */
  useEffect(() => {
    if (timeRange === '1d') return;
    const el = chartRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const [curStart, curEnd] = brushRangeRef.current;
      const windowSize  = curEnd - curStart;
      const step        = Math.max(1, Math.floor(windowSize * 0.1));
      let newStart      = curStart + Math.sign(e.deltaY) * step;
      let newEnd        = curEnd   + Math.sign(e.deltaY) * step;
      if (newStart < 0) { newStart = 0; newEnd = windowSize; }
      if (newEnd >= totalLen) { newEnd = totalLen - 1; newStart = newEnd - windowSize; }
      setBrushRange([newStart, newEnd]);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [totalLen, timeRange]);

  return (
    <div className="stock-chart" ref={chartRef}>
      <ResponsiveContainer width="100%" height={450}>
        <ComposedChart
          key={`${timeRange}-${chartMode}`}
          data={chartData}
          margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />

          {timeRange === '1d' ? (
            // Numeric axis: minuteIdx 0-389, ticks every 60 min
            <XAxis
              type="number"
              dataKey="minuteIdx"
              domain={[0, 389]}
              ticks={HOUR_TICKS}
              tickFormatter={(v) => {
                const idx = HOUR_TICKS.indexOf(v);
                return idx >= 0 ? HOUR_LABELS[idx] : '';
              }}
              stroke="#666"
              tick={{ fontSize: 10, fontFamily: 'Arial' }}
              interval="preserveStartEnd"
            />
          ) : (
            <XAxis
              dataKey="date"
              stroke="#666"
              tick={{ fontSize: 10, fontFamily: 'Arial' }}
              interval="preserveStartEnd"
              tickFormatter={(v) => v || ''}
            />
          )}

          <YAxis
            stroke="#666"
            tick={{ fontSize: 11, fontFamily: 'Arial' }}
            domain={['auto', 'auto']}
            padding={{ top: 10, bottom: 10 }}
          />

          <Tooltip content={<ChartTooltip />} />

          {chartMode === 'line' ? (
            <Line
              type="linear"
              dataKey="price"
              stroke="#0000cc"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, fill: '#cc0000' }}
              isAnimationActive={false}
              connectNulls={false}
            />
          ) : (
            <>
              <Line dataKey="high"  stroke="transparent" strokeWidth={0} dot={false} activeDot={false} isAnimationActive={false} />
              <Line dataKey="low"   stroke="transparent" strokeWidth={0} dot={false} activeDot={false} isAnimationActive={false} />
              <Line dataKey="price" stroke="transparent" strokeWidth={0} dot={false} activeDot={false} isAnimationActive={false} />
              <Customized component={CandlestickSeries} />
            </>
          )}

          {/* Brush only for 5D / 1M — 1D always shows the full session */}
          {timeRange !== '1d' && (
            <Brush
              dataKey="date"
              height={30}
              stroke="#6247aa"
              fill="#f8f8f8"
              startIndex={brushRange[0]}
              endIndex={brushRange[1]}
              tickFormatter={(v) => v || ''}
              onChange={({ startIndex, endIndex }) => setBrushRange([startIndex, endIndex])}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default StockChart;
