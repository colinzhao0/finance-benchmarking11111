import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTickerData } from '../data/mockData';
import { addToWatchlist, removeFromWatchlist, isInWatchlist } from '../utils/watchlist';
import StockChart from '../components/StockChart';
import {
  getCurrentMarketState,
  getPriceAtSecond,
  getPreviousClose,
  getTodayOpen,
  getTodayDaysRange,
  getDayVolume,
  fmtMinuteTime,
} from '../utils/priceEngine';
import './TickerPage.css';

function TickerPage({ currentTimestamp = 0 }) {
  const { symbol }   = useParams();
  const navigate     = useNavigate();
  const [tickerInfo, setTickerInfo] = useState(null);
  const [timeRange,  setTimeRange]  = useState('1d');
  const [chartMode,  setChartMode]  = useState('line');
  const [inWatchlist, setInWatchlist] = useState(false);

  useEffect(() => {
    const info = getTickerData(symbol);
    if (!info) { navigate('/'); return; }
    setTickerInfo(info);
    setInWatchlist(isInWatchlist(symbol));
  }, [symbol, navigate]);

  const toggleWatchlist = () => {
    if (inWatchlist) removeFromWatchlist(symbol);
    else             addToWatchlist(symbol);
    setInWatchlist(!inWatchlist);
  };

  // getCurrentMarketState reads Date.now() — call directly; re-renders are driven
  // by currentTimestamp prop changing every second from App.js.
  const { dayNum, marketSec, isOpen } = getCurrentMarketState();

  // All price-derived values — recomputed every second because currentTimestamp changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const priceData = useMemo(() => {
    if (!tickerInfo) return null;
    const { basePrice } = tickerInfo;

    const currentPrice   = getPriceAtSecond(symbol, basePrice, dayNum, marketSec);
    const previousClose  = getPreviousClose(symbol, basePrice, dayNum);
    const todayOpen      = getTodayOpen(symbol, basePrice, dayNum);
    const change         = +(currentPrice - previousClose).toFixed(2);
    const changePercent  = previousClose
      ? +(((currentPrice - previousClose) / previousClose) * 100).toFixed(2)
      : 0;
    const isPositive     = change >= 0;
    const currentMinute  = Math.floor(marketSec / 60);
    const timeLabel      = isOpen
      ? `As of ${fmtMinuteTime(currentMinute)} ET`
      : 'Market Closed';

    // Bid / ask: spread of $0.01 on each side of current price
    const bid = `${(currentPrice - 0.01).toFixed(2)} x 200`;
    const ask = `${(currentPrice + 0.01).toFixed(2)} x 200`;

    return {
      currentPrice, previousClose, todayOpen,
      change, changePercent, isPositive, timeLabel, bid, ask,
    };
  // currentTimestamp intentionally included to trigger re-compute every second
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tickerInfo, dayNum, marketSec, isOpen, currentTimestamp]);

  // Day range and volume: update each minute (expensive to recompute every second)
  const currentMinute = Math.floor(marketSec / 60);
  const slowData = useMemo(() => {
    if (!tickerInfo) return null;
    const { basePrice } = tickerInfo;
    const daysRange = getTodayDaysRange(symbol, basePrice, dayNum, marketSec);
    const volume    = getDayVolume(symbol, basePrice, dayNum, marketSec)
      .toLocaleString();
    return { daysRange, volume };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tickerInfo, dayNum, currentMinute]);

  if (!tickerInfo || !priceData) return null;

  const { currentPrice, previousClose, todayOpen, change, changePercent,
          isPositive, timeLabel, bid, ask } = priceData;
  const { daysRange, volume } = slowData || { daysRange: '—', volume: '—' };

  return (
    <div className="ticker-page">
      <div className="container">
        <button className="back-button" onClick={() => navigate('/')}>
          ← Back to Search
        </button>

        {/* Header */}
        <div className="ticker-header">
          <div className="ticker-info">
            <h1>{symbol}</h1>
            <p className="company-name">{tickerInfo.name}</p>
          </div>
          <div className="price-info">
            <div className="current-price">${currentPrice.toFixed(2)}</div>
            <div className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
              {isPositive ? '+' : ''}{change} ({isPositive ? '+' : ''}{changePercent}%)
            </div>
            <div className="current-time">{timeLabel}</div>
          </div>
        </div>

        <button
          className={`watchlist-btn ${inWatchlist ? 'active' : ''}`}
          onClick={toggleWatchlist}
        >
          {inWatchlist ? '★ Remove from Watchlist' : '☆ Add to Watchlist'}
        </button>

        {/* Chart section */}
        <div className="chart-section">
          <div className="chart-controls">
            <div className="time-range-selector">
              {['1d', '5d', '1m'].map(r => (
                <button
                  key={r}
                  className={timeRange === r ? 'active' : ''}
                  onClick={() => setTimeRange(r)}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="chart-mode-toggle">
              <button className={chartMode === 'line'        ? 'active' : ''} onClick={() => setChartMode('line')}>Line</button>
              <button className={chartMode === 'candlestick' ? 'active' : ''} onClick={() => setChartMode('candlestick')}>Candle</button>
            </div>
          </div>

          <StockChart
            symbol={symbol}
            basePrice={tickerInfo.basePrice}
            timeRange={timeRange}
            chartMode={chartMode}
            currentTimestamp={currentTimestamp}
          />
        </div>

        {/* Stats table */}
        <div className="stats-table">
          <div className="stat-row">
            <div className="stat-cell">
              <span className="stat-label">Previous Close</span>
              <span className="stat-value">{previousClose.toFixed(2)}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Day's Range</span>
              <span className="stat-value">{daysRange}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Market Cap</span>
              <span className="stat-value">{tickerInfo.marketCap}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Earnings Date</span>
              <span className="stat-value">{tickerInfo.earningsDate}</span>
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-cell">
              <span className="stat-label">Open</span>
              <span className="stat-value">{todayOpen.toFixed(2)}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">52 Week Range</span>
              <span className="stat-value">{tickerInfo.weekRange52}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Beta (5Y Monthly)</span>
              <span className="stat-value">{tickerInfo.beta}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Forward Dividend</span>
              <span className="stat-value">{tickerInfo.forwardDividend}</span>
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-cell">
              <span className="stat-label">Bid</span>
              <span className="stat-value">{bid}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Volume</span>
              <span className="stat-value">{volume}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">PE Ratio (TTM)</span>
              <span className="stat-value">{tickerInfo.peRatio}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Ex-Dividend Date</span>
              <span className="stat-value">{tickerInfo.exDividendDate}</span>
            </div>
          </div>

          <div className="stat-row">
            <div className="stat-cell">
              <span className="stat-label">Ask</span>
              <span className="stat-value">{ask}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Avg. Volume</span>
              <span className="stat-value">{tickerInfo.avgVolume}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">EPS (TTM)</span>
              <span className="stat-value">{tickerInfo.eps}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">1y Target Est</span>
              <span className="stat-value">{tickerInfo.targetEst}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TickerPage;
