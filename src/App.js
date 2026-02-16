import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import TickerPage from './pages/TickerPage';
import { getMaxIntradayPoints } from './data/mockData';
import './App.css';

function App() {
  const maxIntradayPoints = useMemo(() => getMaxIntradayPoints(), []);
  const [marketTimeIndex, setMarketTimeIndex] = useState(0);

  useEffect(() => {
    if (maxIntradayPoints <= 1) return undefined;
    const intervalId = setInterval(() => {
      setMarketTimeIndex((prev) => (prev + 1) % maxIntradayPoints);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [maxIntradayPoints]);

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<HomePage marketTimeIndex={marketTimeIndex} />} />
          <Route path="/tickers/:symbol" element={<TickerPage marketTimeIndex={marketTimeIndex} />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
