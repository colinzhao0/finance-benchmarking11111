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
import './StockChart.css';

/* ──────────── Helpers ──────────── */

function seededRandom(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/* ──────────── Trading-day & label generation ──────────── */

function getTradingDays(endDate, count) {
  const days = [];
  const d = new Date(endDate);
  while (days.length < count) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.unshift(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return days;
}

function fmtMD(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }
function fmtMMDD(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

const TIMES_27 = [
  '9:30','9:45','10:00','10:15','10:30','10:45',
  '11:00','11:15','11:30','11:45','12:00','12:15',
  '12:30','12:45','1:00','1:15','1:30','1:45',
  '2:00','2:15','2:30','2:45','3:00','3:15',
  '3:30','3:45','4:00',
];
const TIMES_14 = [
  '9:30','10:00','10:30','11:00','11:30','12:00',
  '12:30','1:00','1:30','2:00','2:30','3:00','3:30','4:00',
];
const TIMES_7 = ['9:30','10:30','11:30','12:30','1:30','2:30','3:30'];
const TIMES_3 = ['10:30','1:30','3:30'];

function pickIntradayTimes(pointsPerDay) {
  if (pointsPerDay <= 3) return TIMES_3;
  if (pointsPerDay <= 7) return TIMES_7;
  if (pointsPerDay <= 14) return TIMES_14;
  return TIMES_27;
}

/* ──────────── Multi-period data extension ──────────── */

function generateExtendedData(rawData, timeRange) {
  if (!rawData?.length || rawData.length < 2)
    return { data: rawData || [], totalPeriods: 1, periodLen: rawData?.length || 0 };

  const periodsToAdd = timeRange === '1d' ? 9 : timeRange === '5d' ? 3 : 2;
  const periodLen = rawData.length;
  const timeKey = rawData[0].time !== undefined ? 'time' : 'date';
  const totalPeriods = 1 + periodsToAdd;

  /* --- Generate labels -------------------------------------------------- */
  const refDate = new Date(2024, 0, 17);
  let labels;

  if (timeRange === '1d') {
    const days = getTradingDays(refDate, totalPeriods);
    const times = pickIntradayTimes(periodLen);
    labels = days.flatMap(day => {
      const prefix = fmtMD(day);
      return times.map(t => `${prefix} ${t}`);
    });
  } else if (timeRange === '5d') {
    const daysPerPeriod = 5;
    const ppd = Math.round(periodLen / daysPerPeriod);
    const totalDays = daysPerPeriod * totalPeriods;
    const days = getTradingDays(refDate, totalDays);
    const times = pickIntradayTimes(ppd);
    labels = days.flatMap(day => {
      const prefix = fmtMMDD(day);
      return times.map(t => `${prefix} ${t}`);
    });
  } else {
    /* 1m — one point per trading day */
    const totalDays = periodLen * totalPeriods;
    const days = getTradingDays(refDate, totalDays);
    labels = days.map(d => fmtMMDD(d));
  }

  /* Trim to exact size (in case of rounding) */
  const totalPoints = periodLen * totalPeriods;
  if (labels.length > totalPoints) labels = labels.slice(labels.length - totalPoints);
  while (labels.length < totalPoints) labels.unshift('');

  /* --- Generate prior-period prices ------------------------------------- */
  const templatePrices = rawData.map(d => d.price ?? d.close);
  const templateRange = Math.max(...templatePrices) - Math.min(...templatePrices) || 1;

  /* Random walk backward for period offsets */
  let cumOffset = 0;
  const offsets = [];
  for (let p = 0; p < periodsToAdd; p++) {
    const r = seededRandom(p * 137 + 42);
    const drift = templateRange * (0.8 + r * 1.5);
    cumOffset -= drift;
    offsets.unshift(cumOffset);
  }

  const allData = [];

  /* Prior periods */
  for (let p = 0; p < periodsToAdd; p++) {
    const off = offsets[p];
    for (let i = 0; i < periodLen; i++) {
      const base = templatePrices[i] + off;
      const noise = base * (seededRandom(p * 10000 + i * 13) - 0.5) * 0.006;
      const price = +(base + noise).toFixed(2);
      allData.push({ [timeKey]: labels[p * periodLen + i], price });
    }
  }

  /* Original / current period — keep original prices, update labels */
  for (let i = 0; i < periodLen; i++) {
    const labelIdx = periodsToAdd * periodLen + i;
    allData.push({
      ...rawData[i],
      [timeKey]: labels[labelIdx] || rawData[i][timeKey],
    });
  }

  return { data: allData, totalPeriods, periodLen };
}

/* ──────────── OHLCV enrichment ──────────── */

function ensureOHLCV(point, seed) {
  const price = point.price ?? point.close;
  if (price == null) return point;
  if (point.open != null && point.high != null && point.low != null && point.close != null)
    return { ...point, price: point.price ?? point.close };
  const v = price * 0.005;
  const r = (n) => seededRandom(seed * 4 + n);
  const open = +(price + (r(1) - 0.5) * v * 2).toFixed(2);
  const close = +price.toFixed(2);
  const rawHigh = price + r(2) * v * 1.5;
  const rawLow  = price - r(3) * v * 1.5;
  return {
    ...point, price, open, close,
    high: +Math.max(rawHigh, open, close).toFixed(2),
    low:  +Math.min(rawLow, open, close).toFixed(2),
    volume: point.volume ?? Math.floor(40000 + r(4) * 160000),
  };
}

/* Add intermediate points between existing data for jagged look */
function enrichWithIntermediates(extData, timeRange) {
  if (!extData?.length || extData.length < 2) return extData.map((p, i) => ensureOHLCV(p, i));

  const enriched = [];
  const timeKey = extData[0].time !== undefined ? 'time' : 'date';
  const numIntermediate = timeRange === '1d' ? 3 : 2;

  for (let i = 0; i < extData.length; i++) {
    const pt = ensureOHLCV(extData[i], i * 100);
    enriched.push({ ...pt, isActual: true, xIdx: i });

    if (i < extData.length - 1) {
      const next = ensureOHLCV(extData[i + 1], (i + 1) * 100);
      for (let j = 1; j <= numIntermediate; j++) {
        const t = j / (numIntermediate + 1);
        const seed = i * 1000 + j * 7;
        const base = pt.price + (next.price - pt.price) * t;
        const noise = base * (seededRandom(seed) - 0.5) * 0.008;
        const price = +(base + noise).toFixed(2);
        const vv = price * 0.005;
        const r = (n) => seededRandom(seed + n);
        const open  = +(price + (r(10) - 0.5) * vv * 2).toFixed(2);
        const close = price;
        const rawH  = price + r(20) * vv * 2;
        const rawL  = price - r(30) * vv * 2;
        enriched.push({
          [timeKey]: pt[timeKey] || '',
          xIdx: i + j / (numIntermediate + 1), // fractional position between actuals
          price, open, close,
          high: +Math.max(rawH, open, close).toFixed(2),
          low:  +Math.min(rawL, open, close).toFixed(2),
          volume: Math.floor(40000 + r(40) * 160000),
          isActual: false, // mark as intermediate for tooltip filtering
        });
      }
    }
  }
  return enriched;
}

/* ──────────── Candlestick Renderer ──────────── */

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
        const x = point.x;
        const yO = yScale(d.open), yC = yScale(d.close);
        const yH = yScale(d.high), yL = yScale(d.low);
        if ([yO,yC,yH,yL].some(v => v == null || isNaN(v))) return null;
        const up = d.close >= d.open;
        const color = up ? '#26a69a' : '#ef5350';
        const top = Math.min(yO, yC);
        const h = Math.max(Math.abs(yC - yO), 1);
        return (
          <g key={i}>
            <line x1={x} y1={yH} x2={x} y2={yL} stroke={color} strokeWidth={1} />
            <rect x={x - candleWidth/2} y={top} width={candleWidth} height={h}
              fill={color} stroke={color} strokeWidth={0.5} />
          </g>
        );
      })}
    </g>
  );
};

/* ──────────── Tooltip ──────────── */

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  
  // Don't show tooltip for intermediate points (only actual data points)
  if (d.isActual === false) return null;
  
  const label = d.time || d.date;
  const cl = d.close ?? d.price;
  const op = d.open ?? cl;
  const hi = d.high ?? cl;
  const lo = d.low ?? cl;
  const vol = d.volume ?? 0;

  return (
    <div className="custom-tooltip">
      <p className="tooltip-label">Date:</p><p className="tooltip-value">{label || 'N/A'}</p>
      <p className="tooltip-label">Open:</p><p className="tooltip-value">{op.toFixed(2)}</p>
      <p className="tooltip-label">High:</p><p className="tooltip-value">{hi.toFixed(2)}</p>
      <p className="tooltip-label">Low:</p><p className="tooltip-value">{lo.toFixed(2)}</p>
      <p className="tooltip-label">Close:</p><p className="tooltip-value">{cl.toFixed(2)}</p>
      <p className="tooltip-label">Volume:</p><p className="tooltip-value">{vol.toLocaleString()}</p>
    </div>
  );
};

/* ──────────── Main Chart Component ──────────── */

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function StockChart({ data, timeRange, chartMode = 'line', marketTimeIndex = 0 }) {
  const {
    enrichedData,
    initialBrushStart,
    initialBrushEnd,
    enrichedPerOriginal,
    periodLen,
    maxIndex,
    tickLabels,
  } = useMemo(() => {
    if (timeRange === '1d') {
      /* 1D: no multi-period extension needed (no scroll / brush) */
      const rawData = data || [];
      const periodLen = rawData.length;
      const enriched = enrichWithIntermediates(rawData, timeRange);
      const enrichedPerOriginal = periodLen > 1 ? enriched.length / periodLen : 1;
      // Strip date prefix from time labels (e.g. "1/17 9:30 AM" → "9:30 AM")
      const tickLabels = rawData.map(d => {
        const t = d.time || d.date || '';
        const parts = t.trim().split(' ');
        return parts.length > 1 ? parts.slice(1).join(' ') : t;
      });
      return {
        enrichedData: enriched,
        initialBrushStart: 0,
        initialBrushEnd: enriched.length - 1,
        enrichedPerOriginal,
        periodLen,
        maxIndex: Math.max(0, periodLen - 1),
        tickLabels,
      };
    }
    /* 5d / 1m: extend raw data to multiple periods */
    const { data: extended, totalPeriods, periodLen } = generateExtendedData(data, timeRange);
    const enriched = enrichWithIntermediates(extended, timeRange);
    const enrichedPerOriginal = periodLen > 1
      ? enriched.length / (periodLen * totalPeriods)
      : 1;
    const onePeriodEnriched = Math.round(periodLen * enrichedPerOriginal);
    const bEnd = enriched.length - 1;
    const bStart = Math.max(0, enriched.length - onePeriodEnriched);
    return {
      enrichedData: enriched,
      initialBrushStart: bStart,
      initialBrushEnd: bEnd,
      enrichedPerOriginal,
      periodLen,
      maxIndex: Math.max(0, periodLen - 1),
      tickLabels: null,
    };
  }, [data, timeRange]);

  /*
   * For 1D: enrichedData is already just one day (9:30–4:00).
   * Null-out prices for points after the current marketTimeIndex
   * so the line grows from left to right while x-axis stays fixed.
   */
  const displayData = useMemo(() => {
    if (timeRange !== '1d') return enrichedData;

    const clampedIndex = clamp(marketTimeIndex, 0, maxIndex);
    const offset = Math.round(clampedIndex * enrichedPerOriginal);

    return enrichedData.map((point, i) => {
      if (i <= offset) return point;
      /* Future points — keep xIdx and isActual flag, null out prices */
      const timeKey = point.time !== undefined ? 'time' : 'date';
      return {
        [timeKey]: point[timeKey],
        xIdx: point.xIdx,
        price: null,
        open: null,
        high: null,
        low: null,
        close: null,
        volume: null,
        isActual: point.isActual,
      };
    });
  }, [enrichedData, marketTimeIndex, maxIndex, enrichedPerOriginal, timeRange]);

  /* Brush range as single state to avoid stale-closure bugs */
  const [brushRange, setBrushRange] = useState([initialBrushStart, initialBrushEnd]);
  const brushRangeRef = useRef(brushRange);
  brushRangeRef.current = brushRange;
  const chartRef = useRef(null);

  /* Reset brush when underlying data / time-range changes */
  useEffect(() => {
    setBrushRange([initialBrushStart, initialBrushEnd]);
  }, [initialBrushStart, initialBrushEnd]);

  /* Scroll-wheel handler — only for non-1D views.
   * Uses ref so the effect doesn't re-register on every brush change. */
  useEffect(() => {
    if (timeRange === '1d') return; // no scroll for 1D
    const chartElement = chartRef.current;
    if (!chartElement) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const [curStart, curEnd] = brushRangeRef.current;
      const windowSize = curEnd - curStart;
      const step = Math.max(1, Math.floor(windowSize * 0.1));
      const scrollAmount = Math.sign(e.deltaY) * step;

      let newStart = curStart + scrollAmount;
      let newEnd = curEnd + scrollAmount;

      /* Clamp to bounds */
      if (newStart < 0) {
        newStart = 0;
        newEnd = windowSize;
      }
      if (newEnd >= enrichedData.length) {
        newEnd = enrichedData.length - 1;
        newStart = newEnd - windowSize;
      }

      setBrushRange([newStart, newEnd]);
    };

    chartElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => chartElement.removeEventListener('wheel', handleWheel);
  }, [enrichedData.length, timeRange]); // re-attach when total length or timeRange changes

  const xAxisKey = timeRange === '1d' ? 'time' : 'date';

  return (
    <div className="stock-chart" ref={chartRef}>
      <ResponsiveContainer width="100%" height={450}>
        <ComposedChart
          key={`${timeRange}-${chartMode}`}
          data={displayData}
          margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
          {timeRange === '1d' ? (
            // Numeric axis: actual points sit exactly at integer xIdx values,
            // intermediates are at fractions between them — no duplicate labels.
            <XAxis
              type="number"
              dataKey="xIdx"
              domain={[0, periodLen - 1]}
              ticks={Array.from({ length: periodLen }, (_, i) => i)}
              tickFormatter={(v) => (tickLabels && tickLabels[v]) ? tickLabels[v] : ''}
              stroke="#666"
              tick={{ fontSize: 10, fontFamily: 'Arial' }}
              interval="preserveStartEnd"
            />
          ) : (
            <XAxis
              dataKey={xAxisKey}
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
              <Line dataKey="high" stroke="transparent" strokeWidth={0} dot={false} activeDot={false} isAnimationActive={false} connectNulls={false} />
              <Line dataKey="low" stroke="transparent" strokeWidth={0} dot={false} activeDot={false} isAnimationActive={false} connectNulls={false} />
              <Line dataKey="price" stroke="transparent" strokeWidth={0} dot={false} activeDot={false} isAnimationActive={false} connectNulls={false} />
              <Customized component={CandlestickSeries} />
            </>
          )}

          {/* No brush for 1D — full day is always visible */}
          {timeRange !== '1d' && (
            <Brush
              dataKey={xAxisKey}
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
