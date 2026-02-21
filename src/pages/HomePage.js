import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchBar from '../components/SearchBar';
import { TICKERS, getTickerData } from '../data/mockData';
import { getWatchlist, removeFromWatchlist } from '../utils/watchlist';
import {
  getCurrentMarketState,
  getPriceAtSecond,
  getPreviousClose,
} from '../utils/priceEngine';
import './HomePage.css';

/* Render a price card for a given symbol, driven by currentTimestamp. */
function StockCard({ symbol, name, currentTimestamp, onRemove, onClick }) {
  const info = getTickerData(symbol);
  const basePrice = info?.basePrice ?? 0;

  // getCurrentMarketState reads Date.now() — no memoization needed; re-renders
  // are driven by currentTimestamp prop changing every second.
  const { dayNum, marketSec } = getCurrentMarketState();

  const { currentPrice, change, changePercent, isUp } = useMemo(() => {
    if (!basePrice) return { currentPrice: 0, change: 0, changePercent: 0, isUp: true };
    const price         = getPriceAtSecond(symbol, basePrice, dayNum, marketSec);
    const previousClose = getPreviousClose(symbol, basePrice, dayNum);
    const chg           = +(price - previousClose).toFixed(2);
    const chgPct        = previousClose
      ? +(((price - previousClose) / previousClose) * 100).toFixed(2)
      : 0;
    return { currentPrice: price, change: chg, changePercent: chgPct, isUp: chg >= 0 };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, basePrice, dayNum, marketSec]);

  return (
    <div className="stock-card" onClick={onClick}>
      {onRemove && (
        <span className="remove-x" onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</span>
      )}
      <span className="stock-symbol">{symbol}</span>
      <span className="stock-name">{name || info?.name}</span>
      <span className="stock-price">${currentPrice.toFixed(2)}</span>
      <span className={`stock-change ${isUp ? 'positive' : 'negative'}`}>
        {isUp ? '+' : ''}{change} ({isUp ? '+' : ''}{changePercent}%)
      </span>
    </div>
  );
}

function HomePage({ currentTimestamp = 0 }) {
  const navigate   = useNavigate();
  const [watchlist, setWatchlist] = useState([]);

  useEffect(() => {
    setWatchlist(getWatchlist());
  }, []);

  const handleSearch = (symbol) => navigate(`/tickers/${symbol}`);

  const handleRemove = (symbol) => {
    removeFromWatchlist(symbol);
    setWatchlist(getWatchlist());
  };

  return (
    <div className="home-page">
      <div className="container">
        <header className="header">
          <h1>Stock Market Benchmark</h1>
          <p className="subtitle">Search for stock tickers and view interactive charts</p>
        </header>

        <div className="search-container">
          <SearchBar onSearch={handleSearch} />
        </div>

        {watchlist.length > 0 && (
          <div className="watchlist-section">
            <h2>My Watchlist</h2>
            <div className="stock-grid">
              {watchlist.map(symbol => (
                <StockCard
                  key={symbol}
                  symbol={symbol}
                  currentTimestamp={currentTimestamp}
                  onRemove={() => handleRemove(symbol)}
                  onClick={() => handleSearch(symbol)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="popular-stocks">
          <h2>Popular Stocks</h2>
          <div className="stock-grid">
            {TICKERS.map(({ symbol, name }) => (
              <StockCard
                key={symbol}
                symbol={symbol}
                name={name}
                currentTimestamp={currentTimestamp}
                onClick={() => handleSearch(symbol)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
