import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTickerData } from '../data/mockData';
import { addToWatchlist, removeFromWatchlist, isInWatchlist } from '../utils/watchlist';
import StockChart from '../components/StockChart';
import './TickerPage.css';

function TickerPage() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [tickerInfo, setTickerInfo] = useState(null);
  const [timeRange, setTimeRange] = useState('1d');
  const [chartMode, setChartMode] = useState('line');
  const [inWatchlist, setInWatchlist] = useState(false);

  useEffect(() => {
    const info = getTickerData(symbol);
    if (!info) {
      navigate('/');
      return;
    }
    setTickerInfo(info);
    setInWatchlist(isInWatchlist(symbol));
  }, [symbol, navigate]);

  const toggleWatchlist = () => {
    if (inWatchlist) {
      removeFromWatchlist(symbol);
    } else {
      addToWatchlist(symbol);
    }
    setInWatchlist(!inWatchlist);
  };

  if (!tickerInfo) return null;

  const isPositive = tickerInfo.change >= 0;
  const chartData = tickerInfo[timeRange];

  return (
    <div className="ticker-page">
      <div className="container">
        <button className="back-button" onClick={() => navigate('/')}>
          ← Back to Search
        </button>

        <div className="ticker-header">
          <div className="ticker-info">
            <h1>{symbol}</h1>
            <p className="company-name">{tickerInfo.name}</p>
          </div>
          <div className="price-info">
            <div className="current-price">${tickerInfo.currentPrice}</div>
            <div className={`price-change ${isPositive ? 'positive' : 'negative'}`}>
              {isPositive ? '+' : ''}{tickerInfo.change} ({isPositive ? '+' : ''}{tickerInfo.changePercent}%)
            </div>
          </div>
        </div>

        <button 
          className={`watchlist-btn ${inWatchlist ? 'active' : ''}`}
          onClick={toggleWatchlist}
        >
          {inWatchlist ? '★ Remove from Watchlist' : '☆ Add to Watchlist'}
        </button>

        <div className="chart-section">
          <div className="chart-controls">
            <div className="time-range-selector">
              <button
                className={timeRange === '1d' ? 'active' : ''}
                onClick={() => setTimeRange('1d')}
              >
                1D
              </button>
              <button
                className={timeRange === '5d' ? 'active' : ''}
                onClick={() => setTimeRange('5d')}
              >
                5D
              </button>
              <button
                className={timeRange === '1m' ? 'active' : ''}
                onClick={() => setTimeRange('1m')}
              >
                1M
              </button>
            </div>
            <div className="chart-mode-toggle">
              <button
                className={chartMode === 'line' ? 'active' : ''}
                onClick={() => setChartMode('line')}
              >
                Line
              </button>
              <button
                className={chartMode === 'candlestick' ? 'active' : ''}
                onClick={() => setChartMode('candlestick')}
              >
                Candle
              </button>
            </div>
          </div>

          <StockChart data={chartData} timeRange={timeRange} chartMode={chartMode} />
        </div>

        <div className="stats-table">
          <div className="stat-row">
            <div className="stat-cell">
              <span className="stat-label">Previous Close</span>
              <span className="stat-value">{tickerInfo.previousClose}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Day's Range</span>
              <span className="stat-value">{tickerInfo.daysRange}</span>
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
              <span className="stat-value">{tickerInfo.open}</span>
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
              <span className="stat-value">{tickerInfo.bid}</span>
            </div>
            <div className="stat-cell">
              <span className="stat-label">Volume</span>
              <span className="stat-value">{tickerInfo.volume}</span>
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
              <span className="stat-value">{tickerInfo.ask}</span>
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
