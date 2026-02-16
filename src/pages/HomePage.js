import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SearchBar from '../components/SearchBar';
import { TICKERS, getTickerData } from '../data/mockData';
import { getWatchlist, removeFromWatchlist } from '../utils/watchlist';
import './HomePage.css';

function HomePage({ marketTimeIndex = 0 }) {
  const navigate = useNavigate();
  const [watchlist, setWatchlist] = useState([]);

  useEffect(() => {
    setWatchlist(getWatchlist());
  }, []);

  const handleSearch = (symbol) => {
    navigate(`/tickers/${symbol}`);
  };

  const handleRemove = (symbol, e) => {
    e.stopPropagation();
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
              {watchlist.map(symbol => {
                const data = getTickerData(symbol);
                if (!data) return null;
                const intradayData = data['1d'] || [];
                const currentIndex = Math.min(marketTimeIndex, Math.max(intradayData.length - 1, 0));
                const currentPrice = intradayData[currentIndex]?.price ?? data.currentPrice;
                const currentTimeLabel = intradayData[currentIndex]?.time
                  || intradayData[currentIndex]?.date
                  || '';
                const basePrice = data.previousClose ?? intradayData[0]?.price ?? currentPrice;
                const change = +(currentPrice - basePrice).toFixed(2);
                const changePercent = basePrice
                  ? +(((currentPrice - basePrice) / basePrice) * 100).toFixed(2)
                  : 0;
                const isUp = change >= 0;
                return (
                  <div 
                    key={symbol}
                    className="stock-card"
                    onClick={() => handleSearch(symbol)}
                  >
                    <span className="remove-x" onClick={(e) => handleRemove(symbol, e)}>×</span>
                    <span className="stock-symbol">{symbol}</span>
                    <span className="stock-name">{data.name}</span>
                    <span className="stock-price">${currentPrice.toFixed(2)}</span>
                    <span className={`stock-change ${isUp ? 'positive' : 'negative'}`}>
                      {isUp ? '+' : ''}{change} ({isUp ? '+' : ''}{changePercent}%)
                    </span>
                    {currentTimeLabel && (
                      <span className="stock-time">As of {currentTimeLabel}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="popular-stocks">
          <h2>Popular Stocks</h2>
          <div className="stock-grid">
            {TICKERS.map(ticker => (
              <div 
                key={ticker.symbol}
                className="stock-card"
                onClick={() => handleSearch(ticker.symbol)}
              >
                <span className="stock-symbol">{ticker.symbol}</span>
                <span className="stock-name">{ticker.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
