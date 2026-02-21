/* ─── priceEngine.js ────────────────────────────────────────────────────────
 * Deterministic second-level procedural stock price generator.
 * Given the same inputs (symbol, basePrice, timestamp) the output is always
 * identical — fully reproducible for benchmarking / testing purposes.
 * ─────────────────────────────────────────────────────────────────────────── */

/* ── Hashing ─────────────────────────────────────────────────────────────── */

/** FNV-1a 32-bit hash of a string → unsigned 32-bit integer. */
function symbolSeed(symbol) {
  let h = 0x811c9dc5;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Mix two integers into a float in [0, 1).
 * Two-round xorshift-multiply hash — fast and well-distributed.
 */
function rand2(a, b) {
  let x = (Math.imul((a | 0) ^ 0xdeadbeef, 0x9e3779b9) + (b | 0)) | 0;
  x = Math.imul(((x >>> 16) ^ x) | 0, 0x45d9f3b) | 0;
  x = Math.imul(((x >>> 16) ^ x) | 0, 0x45d9f3b) | 0;
  return (((x >>> 16) ^ x) >>> 0) / 4294967296;
}

/* ── Smooth noise ─────────────────────────────────────────────────────────── */

/**
 * Smoothstep-interpolated noise stream — returns a value in [-1, 1].
 *
 * By using different `channel` constants you get fully independent streams
 * from the same symbol hash, enabling layered noise at multiple frequencies.
 *
 * @param {number} symHash  per-symbol seed (from symbolSeed)
 * @param {number} channel  independent noise channel (use distinct hex constants)
 * @param {number} t        time in seconds
 * @param {number} period   bucket size in seconds
 */
function smoothNoise(symHash, channel, t, period) {
  const b0   = Math.floor(t / period);
  const frac = (t - b0 * period) / period;
  const seed = (symHash ^ channel) >>> 0;
  const v0   = rand2(seed, b0)     * 2 - 1;
  const v1   = rand2(seed, b0 + 1) * 2 - 1;
  const u    = frac * frac * (3 - 2 * frac); // smoothstep
  return v0 + (v1 - v0) * u;
}

/* ── Day-level prices ─────────────────────────────────────────────────────── */

/** Today's day number (integer days since Unix epoch). */
export function todayDayNum() {
  return Math.floor(Date.now() / 86400000);
}

/**
 * Compute the reference opening price for a stock on `dayNum`.
 * Performs a seeded random walk backward from `basePrice` (today's reference).
 *
 * @param {number} symHash   symbolSeed(symbol)
 * @param {number} basePrice approximate current market price
 * @param {number} dayNum    target day (days since epoch)
 * @returns {number} opening price for that day
 */
function getDayOpenPrice(symHash, basePrice, dayNum) {
  const today = todayDayNum();
  if (dayNum >= today) return basePrice;
  let price = basePrice;
  for (let d = today; d > dayNum; d--) {
    const r = rand2(symHash ^ 0x44455455, d) * 2 - 1;
    price /= (1 + r * 0.015); // undo one day of ±1.5% drift
    if (price <= 0) price = basePrice * 0.3;
  }
  return Math.max(price, basePrice * 0.1);
}

/* ── Intraday price at a specific second ─────────────────────────────────── */

/**
 * Get the procedurally generated stock price at a specific second.
 *
 * Architecture: layered smooth noise at four frequencies + a gentle intraday
 * trend arc.  All layers are bounded, so the total intraday range is ~±2% of
 * the day's opening price (realistic for large-cap equities).
 *
 * @param {string} symbol
 * @param {number} basePrice  today's approximate price (reference anchor)
 * @param {number} dayNum     trading day (days since epoch)
 * @param {number} marketSec  seconds since 9:30 AM  (0 = open, 23400 = close)
 * @returns {number} price rounded to 2 decimal places
 */
export function getPriceAtSecond(symbol, basePrice, dayNum, marketSec) {
  const symHash = symbolSeed(symbol);
  const dayOpen = getDayOpenPrice(symHash, basePrice, dayNum);

  // Unique absolute time reference — dayNum * 30000 never overlaps marketSec (0-23400)
  const t   = dayNum * 30000 + Math.max(0, marketSec);
  const vol = dayOpen * 0.012; // base volatility: 1.2% of day's open

  // Four independent noise layers (coarse → fine)
  const n1 = smoothNoise(symHash, 0x1001, t, 3600) * vol * 1.00; // ~1-hour swings
  const n2 = smoothNoise(symHash, 0x2002, t,  600) * vol * 0.55; // ~10-min swings
  const n3 = smoothNoise(symHash, 0x3003, t,   60) * vol * 0.30; // ~1-min  noise
  const n4 = smoothNoise(symHash, 0x4004, t,   10) * vol * 0.15; // ~10-sec micro

  // Gentle intraday arc: slight upward drift in morning, levels off by close
  const dayFrac = marketSec / 23400;
  const trend   = vol * 0.6 * Math.sin(dayFrac * Math.PI);

  return Math.max(+(dayOpen + n1 + n2 + n3 + n4 + trend).toFixed(2), dayOpen * 0.9);
}

/* ── Minute-bar OHLCV ─────────────────────────────────────────────────────── */

/**
 * Compute OHLCV for a 1-minute bar by sampling 6 seconds within it.
 *
 * @param {string} symbol
 * @param {number} basePrice
 * @param {number} dayNum
 * @param {number} minuteIdx  0 = 9:30–9:31 AM … 389 = 3:59–4:00 PM
 * @returns {{ open, high, low, close, price, volume }}
 */
export function getMinuteBar(symbol, basePrice, dayNum, minuteIdx) {
  const startSec = minuteIdx * 60;
  const samples  = [0, 12, 24, 36, 48, 59].map(ds =>
    getPriceAtSecond(symbol, basePrice, dayNum, startSec + ds)
  );
  const open   = samples[0];
  const close  = samples[5];
  const high   = Math.max(...samples);
  const low    = Math.min(...samples);

  // Volume: U-shaped across the day (higher near open and close)
  const symHash   = symbolSeed(symbol);
  const baseVol   = 80000 + rand2(symHash ^ 0xaabbcc, dayNum) * 120000;
  const mNoise    = 0.5 + rand2(symHash ^ 0x001122, dayNum * 400 + minuteIdx) * 1.5;
  const openBias  = Math.exp(-minuteIdx / 40) * 2.5;
  const closeBias = Math.exp(-(389 - minuteIdx) / 25) * 2.0;
  const volume    = Math.floor(baseVol * mNoise * (1 + openBias + closeBias) / 390);

  return { open, high, low, close, price: close, volume };
}

/* ── Market state ─────────────────────────────────────────────────────────── */

const MARKET_OPEN_SEC  = 9 * 3600 + 30 * 60; // 34200 s  (9:30 AM local)
const MARKET_CLOSE_SEC = 16 * 3600;           // 57600 s  (4:00 PM local)
export const MARKET_DURATION = 23400;          // 6.5 hours in seconds

// Simulation is pinned to Feb 21, 2026 — price history is generated relative
// to this day, giving fully reproducible data regardless of when you run it.
export const SIMULATED_DAY_NUM =
  Math.floor(new Date('2026-02-21T00:00:00Z').getTime() / 86400000);

/**
 * Get the current market state.
 * - Day is always the hardcoded Feb 21, 2026 simulation date.
 * - Market open/close times (9:30 AM – 4:00 PM) are based on local wall-clock time.
 * - Weekend checks are skipped: Feb 21 is always treated as a trading day.
 *
 * @returns {{ dayNum, marketSec, isOpen, unixSec }}
 */
export function getCurrentMarketState() {
  const now     = Date.now();
  const unixSec = Math.floor(now / 1000);
  const local   = new Date(now);
  const localSecOfDay =
    local.getHours() * 3600 + local.getMinutes() * 60 + local.getSeconds();

  let marketSec, isOpen;
  if (localSecOfDay < MARKET_OPEN_SEC) {
    marketSec = 0;               // before 9:30 AM — show market as just opened
    isOpen    = false;
  } else if (localSecOfDay >= MARKET_CLOSE_SEC) {
    marketSec = MARKET_DURATION; // after 4:00 PM — show full day
    isOpen    = false;
  } else {
    marketSec = localSecOfDay - MARKET_OPEN_SEC;
    isOpen    = true;
  }

  return { dayNum: SIMULATED_DAY_NUM, marketSec, isOpen, unixSec };
}

/* ── Derived market statistics ────────────────────────────────────────────── */

/**
 * Previous trading day's closing price (computed from the price engine).
 * Properly skips weekends to find the last real trading day.
 */
export function getPreviousClose(symbol, basePrice, dayNum) {
  let prevDay = dayNum - 1;
  for (let i = 0; i < 5; i++) { // skip up to 5 days back (handles long weekends)
    const dow = new Date(prevDay * 86400000).getUTCDay();
    if (dow !== 0 && dow !== 6) break;
    prevDay--;
  }
  return getMinuteBar(symbol, basePrice, prevDay, 389).close;
}

/** Today's opening price (first second of market). */
export function getTodayOpen(symbol, basePrice, dayNum) {
  return getPriceAtSecond(symbol, basePrice, dayNum, 0);
}

/**
 * Today's day range [low, high] sampled every 5 minutes up to currentMarketSec.
 * Returns { low, high } strings formatted as "low - high".
 */
export function getTodayDaysRange(symbol, basePrice, dayNum, currentMarketSec) {
  const samples = [];
  for (let s = 0; s <= currentMarketSec; s += 300) {
    samples.push(getPriceAtSecond(symbol, basePrice, dayNum, s));
  }
  if (!samples.length) samples.push(getPriceAtSecond(symbol, basePrice, dayNum, 0));
  const lo = Math.min(...samples).toFixed(2);
  const hi = Math.max(...samples).toFixed(2);
  return `${lo} - ${hi}`;
}

/**
 * Approximate cumulative volume traded from market open to currentMarketSec.
 */
export function getDayVolume(symbol, basePrice, dayNum, currentMarketSec) {
  const currentMinute = Math.floor(currentMarketSec / 60);
  let total = 0;
  for (let m = 0; m <= currentMinute; m++) {
    total += getMinuteBar(symbol, basePrice, dayNum, m).volume;
  }
  return total;
}

/* ── Label formatters ─────────────────────────────────────────────────────── */

/** "9:30 AM", "10:00 AM", … for minute index 0-389 */
export function fmtMinuteTime(minuteIdx) {
  const totalMin = 9 * 60 + 30 + minuteIdx;
  const h    = Math.floor(totalMin / 60);
  const m    = totalMin % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** "01/17" from dayNum */
function fmtDate(dayNum) {
  const d = new Date(dayNum * 86400000);
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** "01/13 9:30 AM" from dayNum + minuteIdx */
function fmtDatetime(dayNum, minuteIdx) {
  const totalMin = 9 * 60 + 30 + minuteIdx;
  const h    = Math.floor(totalMin / 60);
  const m    = totalMin % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12  = h > 12 ? h - 12 : h;
  const d    = new Date(dayNum * 86400000);
  const mo   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dy   = String(d.getUTCDate()).padStart(2, '0');
  return `${mo}/${dy} ${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/* ── Trading-day calendar ─────────────────────────────────────────────────── */

/** Returns `count` most-recent trading day numbers ending before `upToDay`. */
function getLastTradingDays(count, upToDay) {
  const days = [];
  let d = upToDay;
  while (days.length < count) {
    d--;
    const dow = new Date(d * 86400000).getUTCDay();
    if (dow !== 0 && dow !== 6) days.unshift(d);
  }
  return days;
}

/* ── Chart data generators ────────────────────────────────────────────────── */

/**
 * Generate 1D chart data — one bar per completed minute since market open.
 * Chart updates every minute as new bars complete.
 *
 * @param {string} symbol
 * @param {number} basePrice
 * @param {number} dayNum
 * @param {number} currentMarketSec  seconds elapsed since 9:30 AM
 * @returns {Array<{ time, minuteIdx, open, high, low, close, price, volume }>}
 */
export function generate1DData(symbol, basePrice, dayNum, currentMarketSec) {
  const upToMinute = Math.min(Math.floor(currentMarketSec / 60), 389);
  const data = [];
  for (let m = 0; m <= upToMinute; m++) {
    const bar = getMinuteBar(symbol, basePrice, dayNum, m);
    data.push({ time: fmtMinuteTime(m), minuteIdx: m, ...bar });
  }
  return data;
}

/**
 * Generate 5D chart data — 7 hourly bars per day, last 4 trading days + today.
 * Today's bars are only generated up to the current hour.
 */
export function generate5DData(symbol, basePrice, dayNum, currentMarketSec) {
  const days          = getLastTradingDays(4, dayNum);
  days.push(dayNum);  // include today
  const currentMinute = Math.floor(currentMarketSec / 60);
  // Hourly sample points within the trading day (minute indices)
  const hourlyMins    = [0, 60, 120, 180, 240, 300, 360];
  const data          = [];

  for (const d of days) {
    for (const m of hourlyMins) {
      if (d === dayNum && m > currentMinute) break; // don't show future hours for today
      const bar = getMinuteBar(symbol, basePrice, d, m);
      data.push({ date: fmtDatetime(d, m), ...bar });
    }
  }
  return data;
}

/**
 * Generate 1M chart data — daily closing bars for last 22 trading days + today.
 */
export function generate1MData(symbol, basePrice, dayNum, currentMarketSec) {
  const days = getLastTradingDays(22, dayNum);
  const data = [];

  for (const d of days) {
    const bar = getMinuteBar(symbol, basePrice, d, 389); // 3:59-4:00 PM close
    data.push({ date: fmtDate(d), ...bar });
  }

  // Add today's current bar
  const todayMinute = Math.min(Math.floor(currentMarketSec / 60), 389);
  const todayBar    = getMinuteBar(symbol, basePrice, dayNum, todayMinute);
  data.push({ date: fmtDate(dayNum), ...todayBar });

  return data;
}
