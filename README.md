# Stock Market Benchmark Website

Interactive stock market dashboard for browser automation benchmarking.

## Features

- Search bar with autocomplete
- Interactive stock charts (5-day and 1-month views)
- Hover tooltips on charts
- Dynamic routing for ticker pages
- Mock data generation

## Setup

```bash
npm install
npm start
```

Runs on http://localhost:3000

## Docker

```bash
docker build -t benchmark-website .
docker run -p 3000:3000 benchmark-website
```

## Tech Stack

- React
- React Router
- Recharts
- Mock data (no external APIs)
# finance-benchmarking
