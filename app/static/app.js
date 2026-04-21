const form = document.getElementById("predict-form");
const statusBadge = document.getElementById("status-badge");
const submitButton = document.getElementById("submit-btn");
const modeCasualBtn = document.getElementById("mode-casual");
const modeAdvancedBtn = document.getElementById("mode-advanced");
const casualView = document.getElementById("casual-view");
const advancedView = document.getElementById("advanced-view");
const emptyState = document.getElementById("empty-state");
const signalBadge = document.getElementById("signal-badge");
const confidenceBar = document.getElementById("confidence-bar");
const confidenceValue = document.getElementById("confidence-value");
const actionLine = document.getElementById("action-line");
const aiExplanation = document.getElementById("ai-explanation");
const disclaimer = document.getElementById("disclaimer");
const technicalGrid = document.getElementById("technical-grid");
const backtestCards = document.getElementById("backtest-cards");
const riskCards = document.getElementById("risk-cards");
const timeframeTable = document.getElementById("timeframe-table");
const earningsBanner = document.getElementById("earnings-banner");
const watchlistInput = document.getElementById("watchlist-input");
const watchlistAddBtn = document.getElementById("watchlist-add-btn");
const watchlistList = document.getElementById("watchlist-list");
const historyTableBody = document.getElementById("history-table-body");
const historyTableWrap = document.getElementById("history-table-wrap");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const placeholders = {
  candle: document.getElementById("ph-candle"),
  volume: document.getElementById("ph-volume"),
  technical: document.getElementById("ph-technical"),
  backtest: document.getElementById("ph-backtest"),
  risk: document.getElementById("ph-risk"),
  timeframe: document.getElementById("ph-timeframe"),
  earnings: document.getElementById("ph-earnings"),
};

let currentMode = "casual";
let lastPrediction = null;
let candleChart;
let volumeChart;
const WATCHLIST_KEY = "watchlist";
const HISTORY_KEY = "predictionHistory";

function signalTone(signal) {
  const value = String(signal || "NEUTRAL").toUpperCase();
  if (value === "BULLISH") return "positive";
  if (value === "BEARISH") return "negative";
  return "neutral";
}

function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "{}");
  } catch {
    return {};
  }
}

function setWatchlist(data) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(data));
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function setHistory(data) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(data));
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "Never";
  const dt = new Date(timestamp);
  if (Number.isNaN(dt.getTime())) return "Unknown";
  return dt.toLocaleString();
}

function runPredictionForTicker(ticker) {
  document.getElementById("symbol").value = ticker;
  form.requestSubmit();
}

function renderWatchlist() {
  const watchlist = getWatchlist();
  const tickers = Object.keys(watchlist).sort();
  if (!tickers.length) {
    watchlistList.innerHTML = '<div class="muted">No tickers saved yet.</div>';
    return;
  }

  watchlistList.innerHTML = tickers
    .map((ticker) => {
      const item = watchlist[ticker] || {};
      const signal = String(item.signal || "NEUTRAL").toUpperCase();
      const tone = signalTone(signal);
      const confidence = Number(item.confidence || 0);
      const updated = formatTimestamp(item.lastUpdated);
      return `<div class="watchlist-row" data-ticker="${ticker}">
        <button type="button" class="watchlist-ticker-btn" data-ticker="${ticker}">${ticker}</button>
        <span class="mini-signal-badge ${tone}">${signal}</span>
        <span class="watchlist-meta">${confidence.toFixed(1)}% · ${updated}</span>
        <button type="button" class="watchlist-remove-btn" data-ticker="${ticker}" aria-label="Remove ${ticker}">×</button>
      </div>`;
    })
    .join("");
}

function renderHistory() {
  const history = getHistory();
  historyTableWrap.classList.toggle("history-scroll", history.length > 4);
  if (!history.length) {
    historyTableBody.innerHTML = '<tr><td colspan="4" class="muted">No predictions yet.</td></tr>';
    return;
  }
  historyTableBody.innerHTML = history
    .map((row) => {
      const signal = String(row.signal || "NEUTRAL").toUpperCase();
      const tone = signalTone(signal);
      return `<tr>
        <td>${row.ticker || ""}</td>
        <td><span class="mini-signal-badge ${tone}">${signal}</span></td>
        <td>${Number(row.confidence || 0).toFixed(1)}%</td>
        <td>${formatTimestamp(row.timestamp)}</td>
      </tr>`;
    })
    .join("");
}

function addWatchlistTicker(tickerRaw) {
  const ticker = String(tickerRaw || "").trim().toUpperCase();
  if (!ticker) return;
  const watchlist = getWatchlist();
  const existing = watchlist[ticker] || {};
  watchlist[ticker] = {
    signal: existing.signal || "NEUTRAL",
    confidence: Number(existing.confidence || 0),
    lastUpdated: existing.lastUpdated || new Date().toISOString(),
  };
  setWatchlist(watchlist);
  renderWatchlist();
}

function updateWatchlistFromPrediction(prediction) {
  const ticker = String(prediction.ticker || "").toUpperCase();
  if (!ticker) return;
  const watchlist = getWatchlist();
  if (!watchlist[ticker]) return;
  watchlist[ticker] = {
    signal: String(prediction.signal || "NEUTRAL").toUpperCase(),
    confidence: Number(prediction.confidence || 0),
    lastUpdated: new Date().toISOString(),
  };
  setWatchlist(watchlist);
  renderWatchlist();
}

function addHistoryFromPrediction(prediction) {
  const entry = {
    ticker: String(prediction.ticker || "").toUpperCase(),
    signal: String(prediction.signal || "NEUTRAL").toUpperCase(),
    confidence: Number(prediction.confidence || 0),
    timestamp: new Date().toISOString(),
    price: null,
  };
  const history = getHistory();
  history.unshift(entry);
  const capped = history.slice(0, 10);
  setHistory(capped);
  renderHistory();
}

watchlistAddBtn.addEventListener("click", () => {
  addWatchlistTicker(watchlistInput.value);
  watchlistInput.value = "";
});

watchlistInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addWatchlistTicker(watchlistInput.value);
  watchlistInput.value = "";
});

watchlistList.addEventListener("click", (event) => {
  const removeBtn = event.target.closest(".watchlist-remove-btn");
  if (removeBtn) {
    const ticker = removeBtn.dataset.ticker;
    const watchlist = getWatchlist();
    delete watchlist[ticker];
    setWatchlist(watchlist);
    renderWatchlist();
    return;
  }

  const tickerBtn = event.target.closest(".watchlist-ticker-btn");
  if (tickerBtn) {
    runPredictionForTicker(tickerBtn.dataset.ticker);
  }
});

clearHistoryBtn.addEventListener("click", () => {
  setHistory([]);
  renderHistory();
});

function setMode(mode) {
  currentMode = mode;
  modeCasualBtn.classList.toggle("selected", mode === "casual");
  modeAdvancedBtn.classList.toggle("selected", mode === "advanced");

  if (!lastPrediction) {
    emptyState.classList.add("hidden");
    if (mode === "casual") {
      casualView.classList.remove("hidden");
      advancedView.classList.add("hidden");
    } else {
      casualView.classList.add("hidden");
      advancedView.classList.remove("hidden");
    }
    return;
  }
  emptyState.classList.add("hidden");
  if (mode === "casual") {
    casualView.classList.remove("hidden");
    advancedView.classList.add("hidden");
  } else {
    casualView.classList.add("hidden");
    advancedView.classList.remove("hidden");
  }
}

modeCasualBtn.addEventListener("click", () => setMode("casual"));
modeAdvancedBtn.addEventListener("click", () => setMode("advanced"));

function destroyChart(chartRef) {
  if (chartRef) chartRef.destroy();
}

function renderAdvancedCharts(chartData) {
  const candleCtx = document.getElementById("candle-chart").getContext("2d");
  const volumeCtx = document.getElementById("volume-chart").getContext("2d");
  destroyChart(candleChart);
  destroyChart(volumeChart);

  const candles = chartData.dates.map((d, i) => ({
    x: new Date(`${d}T00:00:00Z`).getTime(),
    o: chartData.open[i],
    h: chartData.high[i],
    l: chartData.low[i],
    c: chartData.close[i],
  }));
  const ema20 = chartData.dates.map((d, i) => ({
    x: new Date(`${d}T00:00:00Z`).getTime(),
    y: chartData.ema20[i],
  }));
  const ema50 = chartData.dates.map((d, i) => ({
    x: new Date(`${d}T00:00:00Z`).getTime(),
    y: chartData.ema50[i],
  }));
  const volumeLabels = chartData.dates.map((d) => new Date(`${d}T00:00:00Z`).getTime());
  const volumeValues = chartData.volume.map((v) => Number(v));

  candleChart = new Chart(candleCtx, {
    type: "candlestick",
    data: {
      datasets: [
        {
          label: "OHLC",
          data: candles,
          borderColor: { up: "#16a34a", down: "#dc2626", unchanged: "#64748b" },
          color: { up: "#16a34a", down: "#dc2626", unchanged: "#64748b" },
        },
        { label: "EMA 20", type: "line", data: ema20, borderColor: "#2563eb", pointRadius: 0, tension: 0.2 },
        { label: "EMA 50", type: "line", data: ema50, borderColor: "#f59e0b", pointRadius: 0, tension: 0.2 },
      ],
    },
    options: {
      parsing: false,
      plugins: { legend: { position: "bottom" } },
      scales: { x: { type: "time", time: { unit: "day" } } },
    },
  });

  volumeChart = new Chart(volumeCtx, {
    type: "bar",
    data: {
      labels: volumeLabels,
      datasets: [{ label: "Volume", data: volumeValues, backgroundColor: "#94a3b8", borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { type: "time", display: false } },
    },
  });
}

function renderCards(target, cards) {
  target.innerHTML = cards
    .map(
      (card) => `<div class="metric-card">
        <div class="label">${card.label}</div>
        <div class="value">${card.value}</div>
      </div>`
    )
    .join("");
}

function renderPrediction(prediction) {
  lastPrediction = prediction;
  const signal = prediction.signal;
  const tone = signal === "BULLISH" ? "positive" : signal === "BEARISH" ? "negative" : "neutral";
  signalBadge.textContent = signal;
  signalBadge.className = `signal-badge ${tone}`;
  confidenceBar.style.width = `${prediction.confidence}%`;
  confidenceValue.textContent = `${prediction.confidence.toFixed(1)}%`;
  actionLine.textContent = prediction.action;
  aiExplanation.textContent = prediction.explanation;
  disclaimer.textContent =
    "Educational use only. This dashboard is not financial advice and should be used with independent research.";

  const technicals = prediction.indicators;
  let rsiTone = "gray";
  if (technicals.rsi > 70) rsiTone = "red";
  if (technicals.rsi < 30) rsiTone = "green";
  technicalGrid.innerHTML = `
    <div class="kv">
      <div class="k">RSI</div>
      <div class="v">${technicals.rsi}</div>
      <div class="rsi-meter"><div class="rsi-fill rsi-${rsiTone}" style="width:${Math.max(0, Math.min(100, technicals.rsi))}%"></div></div>
    </div>
    <div class="kv"><div class="k">MACD</div><div class="v">${technicals.macd}</div></div>
    <div class="kv"><div class="k">MACD Diff</div><div class="v">${technicals.macd_diff}</div></div>
    <div class="kv"><div class="k">BB %</div><div class="v">${technicals.bb_pct}</div></div>
    <div class="kv"><div class="k">ATR</div><div class="v">${technicals.atr}</div></div>
  `;
  placeholders.technical.classList.add("hidden");

  renderCards(backtestCards, [
    { label: "Win Rate", value: `${prediction.backtest.win_rate}%` },
    { label: "Sharpe Ratio", value: `${prediction.backtest.sharpe}` },
    { label: "Max Drawdown", value: `${prediction.backtest.max_drawdown}%` },
  ]);
  placeholders.backtest.classList.add("hidden");

  renderCards(riskCards, [
    { label: "Beta", value: `${prediction.risk.beta}` },
    { label: "30d Volatility", value: `${prediction.risk.volatility}%` },
    { label: "VaR (95%)", value: `${prediction.risk.var_95}%` },
  ]);
  placeholders.risk.classList.add("hidden");

  const t = prediction.multi_timeframe || [];
  timeframeTable.innerHTML = t
    .map((data) => `<tr><td>${data.horizon}</td><td>${data.signal}</td><td>${data.confidence}%</td></tr>`)
    .join("");
  placeholders.timeframe.classList.add("hidden");

  if (prediction.earnings_warning?.warning) {
    earningsBanner.innerHTML = `<div>⚠️ Earnings report expected on ${prediction.earnings_warning.date} (${prediction.earnings_warning.days_away} days away). Predictions may be less reliable around earnings events.</div>`;
    earningsBanner.className = "panel tag-negative";
    placeholders.earnings.classList.add("hidden");
  } else {
    earningsBanner.className = "panel hidden";
  }

  renderAdvancedCharts(prediction.chart_data);
  placeholders.candle.classList.add("hidden");
  placeholders.volume.classList.add("hidden");
  updateWatchlistFromPrediction(prediction);
  addHistoryFromPrediction(prediction);
  setMode(currentMode);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusBadge.textContent = "Processing";
  const originalButtonText = submitButton.textContent;
  submitButton.textContent = "Analyzing...";
  submitButton.disabled = true;
  emptyState.textContent = "Training models and generating prediction...";
  emptyState.classList.remove("hidden");
  casualView.classList.add("hidden");
  advancedView.classList.add("hidden");
  const payload = {
    ticker: document.getElementById("symbol").value.trim(),
    years: Number(document.getElementById("lookback_years").value),
    mode: currentMode,
  };

  try {
    const response = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      emptyState.textContent = `Error: ${data.detail || "Unable to generate prediction."}`;
      statusBadge.textContent = "Error";
      return;
    }
    renderPrediction(data);
    statusBadge.textContent = "Complete";
  } catch (error) {
    emptyState.textContent = "Error: Network issue while contacting the server.";
    statusBadge.textContent = "Offline";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = originalButtonText;
  }
});

renderWatchlist();
renderHistory();
setMode("casual");
