import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import TickerPage from './pages/TickerPage';
import './App.css';

function App() {
  // Unix timestamp in seconds — updated every second to drive real-time prices.
  const [currentTimestamp, setCurrentTimestamp] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => {
      setCurrentTimestamp(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/"                 element={<HomePage   currentTimestamp={currentTimestamp} />} />
          <Route path="/tickers/:symbol"  element={<TickerPage currentTimestamp={currentTimestamp} />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
