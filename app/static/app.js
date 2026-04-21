const form = document.getElementById("predict-form");
const statusBadge = document.getElementById("status-badge");
const resultError = document.getElementById("result-error");
const submitButton = document.getElementById("submit-btn");
const modeCasualBtn = document.getElementById("mode-casual");
const modeAdvancedBtn = document.getElementById("mode-advanced");
const casualView = document.getElementById("casual-view");
const advancedView = document.getElementById("advanced-view");
const emptyState = document.getElementById("empty-state");
const signalBadge = document.getElementById("signal-badge");
const confidenceBar = document.getElementById("confidence-bar");
const confidenceValue = document.getElementById("confidence-value");
const signalStrengthLabel = document.getElementById("signal-strength-label");
const tradeSignalBtn = document.getElementById("trade-signal-btn");
const aiExplanation = document.getElementById("ai-explanation");
const casualReasonsList = document.getElementById("casual-reasons-list");
const casualActionsList = document.getElementById("casual-actions-list");
const casualLearnToggle = document.getElementById("casual-learn-toggle");
const casualLearnContent = document.getElementById("casual-learn-content");
const casualLearnText = document.getElementById("casual-learn-text");
const casualLearnChevron = document.getElementById("casual-learn-chevron");
const themeToggle = document.getElementById("theme-toggle");
const technicalGrid = document.getElementById("technical-grid");
const backtestCards = document.getElementById("backtest-cards");
const riskCards = document.getElementById("risk-cards");
const timeframeTable = document.getElementById("timeframe-table");
const earningsBanner = document.getElementById("earnings-banner");
const watchlistInput = document.getElementById("watchlist-input");
const yearsSelect = document.getElementById("years-select");
const windowWarning = document.getElementById("window-warning");
const watchlistAddBtn = document.getElementById("watchlist-add-btn");
const watchlistList = document.getElementById("watchlist-list");
const historyTableBody = document.getElementById("history-table-body");
const historyTableWrap = document.getElementById("history-table-wrap");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const topMoversList = document.getElementById("top-movers-list");
const moversLastUpdated = document.getElementById("movers-last-updated");
const refreshCountdown = document.getElementById("refresh-countdown");
const refreshMoversBtn = document.getElementById("refresh-movers-btn");
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
const THEME_KEY = "theme";
const TOP_MOVERS_TIMEOUT_MS = 20000;
const TOP_MOVERS_INTERVAL = 5 * 60 * 1000;
let hasLoadedTopMovers = false;

const WINDOW_WARNING_MESSAGES = {
  "2": {
    tone: "blue",
    text: "ℹ️ 2 years captures the recent Fed rate cycle and post-COVID market normalization. Good for current market conditions.",
  },
  "3": {
    tone: "blue",
    text: "ℹ️ 3 years balances recency with enough data for reliable pattern recognition. A solid choice for medium-term analysis.",
  },
  "10": {
    tone: "blue",
    text: "ℹ️ 10 years includes multiple market cycles — 2015 correction, 2018 selloff, COVID crash, and 2022 bear market. Best for long-term pattern analysis.",
  },
};

function signalTone(signal) {
  const value = String(signal || "NEUTRAL").toUpperCase();
  if (value === "BULLISH") return "positive";
  if (value === "BEARISH") return "negative";
  return "neutral";
}

function updateWindowWarning() {
  if (!yearsSelect || !windowWarning) return;
  const selected = yearsSelect.value;
  const info = WINDOW_WARNING_MESSAGES[selected];
  if (!info) {
    windowWarning.style.display = "none";
    windowWarning.className = "window-warning";
    windowWarning.textContent = "";
    return;
  }
  windowWarning.style.display = "block";
  windowWarning.className = `window-warning ${info.tone}`;
  windowWarning.textContent = info.text;
}

function getStrengthLabel(confidence) {
  if (confidence <= 25) return "Weak";
  if (confidence <= 50) return "Moderate";
  if (confidence <= 75) return "Strong";
  return "Very Strong";
}

function getCasualActions(signal) {
  if (signal === "BEARISH") {
    return [
      {
        icon: "📉",
        title: "If you OWN this stock",
        description: "Consider reducing your position or setting a limit on how much you're willing to lose (called a stop-loss).",
      },
      {
        icon: "🚫",
        title: "If you DON'T own this stock",
        description: "This may not be the best time to buy. Consider waiting for a more positive signal before investing.",
      },
      {
        icon: "🤝",
        title: "Not sure what to do?",
        description: "That's completely normal. Consider speaking with a financial advisor before making any decisions based on this signal.",
      },
    ];
  }
  if (signal === "BULLISH") {
    return [
      {
        icon: "📈",
        title: "If you OWN this stock",
        description: "The signal looks positive - you may want to hold your position and monitor it closely over the next few days.",
      },
      {
        icon: "💰",
        title: "If you DON'T own this stock",
        description:
          "This could be a potential opportunity, but always research the company yourself and never invest more than you can afford to lose.",
      },
      {
        icon: "🤝",
        title: "Not sure what to do?",
        description: "Consider speaking with a financial advisor who can give you personalized guidance based on your full financial situation.",
      },
    ];
  }
  return [
    {
      icon: "⏸️",
      title: "If you OWN this stock",
      description:
        "The signal is mixed - there's no strong reason to buy more or sell right now. Holding and monitoring is a reasonable approach.",
    },
    {
      icon: "👀",
      title: "If you DON'T own this stock",
      description: "The signal isn't strong enough to recommend buying right now. Keep this stock on your watchlist and check back later.",
    },
    {
      icon: "🤝",
      title: "Not sure what to do?",
      description: "Neutral signals are very common. Consider speaking with a financial advisor for guidance tailored to your goals.",
    },
  ];
}

function renderCasualPanel(prediction, tone) {
  const signal = String(prediction.signal || "NEUTRAL").toUpperCase();
  const confidence = Number(prediction.confidence || 0);
  confidenceBar.style.width = `${confidence}%`;
  confidenceBar.className = `progress-bar ${tone}`;
  confidenceValue.textContent = `${confidence.toFixed(1)}%`;
  signalStrengthLabel.textContent = getStrengthLabel(confidence);
  aiExplanation.textContent = prediction.explanation || "Right now, our analysis is unavailable.";

  const reasons = Array.isArray(prediction.casual_reasons) ? prediction.casual_reasons.slice(0, 3) : [];
  casualReasonsList.innerHTML = reasons
    .map((reason) => {
      const icon = reason.icon || "🟡";
      const toneClass = icon.includes("🔴") ? "negative" : icon.includes("🟢") ? "positive" : "neutral";
      return `<div class="casual-reason-card">
        <div class="casual-reason-icon ${toneClass}">${icon}</div>
        <div>
          <div class="casual-reason-title">${reason.title || ""}</div>
          <div class="casual-reason-text">${reason.explanation || ""}</div>
        </div>
      </div>`;
    })
    .join("");

  const actions = getCasualActions(signal);
  casualActionsList.innerHTML = actions
    .map(
      (row) => `<div class="casual-action-row">
      <div class="casual-action-icon">${row.icon}</div>
      <div>
        <div class="casual-action-title">${row.title}</div>
        <div class="casual-action-text">${row.description}</div>
      </div>
    </div>`
    )
    .join("");

  const signalWord = signal.charAt(0) + signal.slice(1).toLowerCase();
  casualLearnText.textContent = `What does ${signal} mean?
A ${signalWord.toLowerCase()} signal means our analysis thinks the stock price is more likely to ${
    signal === "BEARISH" ? "go down" : signal === "BULLISH" ? "go up" : "move sideways"
  } over the next 10 trading days.

What did our analysis look at?
We analyzed ${prediction.ticker}'s price history over the past ${prediction.years} years using 14 different mathematical indicators including momentum, trend direction, and trading volume.

Remember:
No prediction is guaranteed. The stock market is unpredictable and past patterns don't always repeat. Always do your own research.`;

  casualLearnContent.classList.remove("open");
  casualLearnChevron.textContent = "▼";
  casualView.querySelectorAll(".casual-fade").forEach((node) => {
    node.classList.remove("show");
    requestAnimationFrame(() => node.classList.add("show"));
  });
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.classList.toggle("dark-theme", isDark);
  document.body.classList.toggle("dark-theme", isDark);
  themeToggle.textContent = isDark ? "☀️" : "🌙";
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  if (lastPrediction) renderAdvancedCharts(lastPrediction.chart_data);
}

themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.classList.contains("dark-theme") ? "light" : "dark";
  applyTheme(nextTheme);
});

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
      return `<div class="watchlist-row watchlist-item" data-ticker="${ticker}">
        <button type="button" class="watchlist-ticker-btn ticker-name" data-ticker="${ticker}">${ticker}</button>
        <span class="mini-signal-badge signal-badge-sm ${tone}">${signal}</span>
        <span class="watchlist-meta meta">${confidence.toFixed(1)}% · ${updated}</span>
        <button type="button" class="watchlist-remove-btn remove-btn" data-ticker="${ticker}" aria-label="Remove ${ticker}">×</button>
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
        <td><span class="mini-signal-badge signal-badge-sm ${tone}">${signal}</span></td>
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

function formatCompactNumber(value) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(numeric);
}

function formatMoverUpdatedTime(unixSeconds) {
  if (!unixSeconds) return "--";
  const dt = new Date(Number(unixSeconds) * 1000);
  if (Number.isNaN(dt.getTime())) return "--";
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function updateCountdown() {
  if (!refreshCountdown || !window.lastTopMoversUpdate) return;
  const now = new Date();
  const elapsed = Math.floor((now - window.lastTopMoversUpdate) / 1000);
  const remaining = Math.max(0, 300 - elapsed);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  refreshCountdown.textContent = `Next refresh in: ${mins}:${String(secs).padStart(2, "0")}`;
}

function updateLastUpdatedTicker() {
  if (!moversLastUpdated || !window.lastTopMoversUpdate) return;
  const now = new Date();
  const diff = Math.floor((now - window.lastTopMoversUpdate) / 1000);
  if (diff >= 295) {
    moversLastUpdated.textContent = "Refreshing...";
    return;
  }
  if (diff < 60) {
    moversLastUpdated.textContent = `Last updated: ${diff}s ago`;
    return;
  }
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  moversLastUpdated.textContent = `Last updated: ${mins}m ${secs}s ago`;
}

function renderMoverSkeletons() {
  if (!topMoversList) return;
  topMoversList.innerHTML = Array.from({ length: 5 })
    .map(
      () => `<article class="mover-card skeleton-card">
        <div class="skeleton skeleton-line w-35"></div>
        <div class="skeleton skeleton-line w-80"></div>
        <div class="skeleton skeleton-line w-45"></div>
      </article>`
    )
    .join("");
}

function renderMoversError() {
  if (!topMoversList) return;
  topMoversList.innerHTML = `<article class="mover-card mover-error full-width">
    <p>Market data unavailable. Try refreshing.</p>
    <button type="button" class="retry-movers-btn" id="retry-movers-btn">Retry</button>
  </article>`;
  const retry = document.getElementById("retry-movers-btn");
  if (retry) retry.addEventListener("click", () => fetchTopMovers({ forceRefresh: true, source: "manual" }));
}

function renderTopMovers(items) {
  if (!topMoversList) return;
  if (!Array.isArray(items) || !items.length) {
    renderMoversError();
    return;
  }
  topMoversList.innerHTML = items
    .slice(0, 5)
    .map((item) => {
      const changePct = Number(item.change_pct || 0);
      const change = Number(item.change || 0);
      const tone = changePct >= 0 ? "positive" : "negative";
      const sign = changePct >= 0 ? "+" : "";
      const safeCompany = item.company || item.ticker || "Unknown";
      return `<article class="mover-card">
        <div class="mover-top">
          <strong>${item.ticker || "-"}</strong>
          <span class="mover-change ${tone}">${sign}${changePct.toFixed(2)}%</span>
        </div>
        <div class="mover-company">${safeCompany}</div>
        <div class="mover-meta">
          <span>$${Number(item.price || 0).toFixed(2)}</span>
          <span>${change >= 0 ? "+" : ""}${change.toFixed(2)}</span>
          <span>Vol ${formatCompactNumber(item.volume)}</span>
        </div>
      </article>`;
    })
    .join("");
}

async function fetchTopMovers({ forceRefresh = false, source = "manual" } = {}) {
  if (!topMoversList || !moversLastUpdated) return;
  renderMoverSkeletons();
  moversLastUpdated.textContent = "Refreshing...";
  if (refreshMoversBtn) {
    refreshMoversBtn.disabled = true;
    refreshMoversBtn.textContent = "Updating...";
    if (source === "auto") refreshMoversBtn.classList.add("refreshing");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOP_MOVERS_TIMEOUT_MS);
  try {
    const url = forceRefresh ? "/top-movers?refresh=true" : "/top-movers";
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("Failed to fetch top movers");
    const payload = await response.json();
    if (!Array.isArray(payload.data) || !payload.data.length) throw new Error("No mover data");
    renderTopMovers(payload.data);
    moversLastUpdated.textContent = `Last updated: ${formatMoverUpdatedTime(payload.last_updated)}`;
    window.lastTopMoversUpdate = new Date();
    updateCountdown();
    hasLoadedTopMovers = true;
  } catch {
    if (hasLoadedTopMovers || source === "manual" || source === "auto") {
      renderMoversError();
      moversLastUpdated.textContent = "Last updated: Unavailable";
    } else {
      // Keep skeletons on first load and retry quietly.
      moversLastUpdated.textContent = "Last updated: Loading market data...";
      setTimeout(() => {
        fetchTopMovers({ forceRefresh: false, source: "initial" });
      }, 2500);
    }
  } finally {
    clearTimeout(timeoutId);
    if (refreshMoversBtn) {
      refreshMoversBtn.disabled = false;
      refreshMoversBtn.textContent = "🔄 Refresh";
      setTimeout(() => refreshMoversBtn.classList.remove("refreshing"), 2000);
    }
  }
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

if (refreshMoversBtn) {
  refreshMoversBtn.addEventListener("click", () => {
    fetchTopMovers({ forceRefresh: true, source: "manual" });
  });
}

if (casualLearnToggle) {
  casualLearnToggle.addEventListener("click", () => {
    const open = casualLearnContent.classList.toggle("open");
    casualLearnChevron.textContent = open ? "▲" : "▼";
  });
}

function setMode(mode) {
  currentMode = mode;
  modeCasualBtn.classList.toggle("selected", mode === "casual");
  modeAdvancedBtn.classList.toggle("selected", mode === "advanced");

  if (!lastPrediction) {
    emptyState.classList.remove("hidden");
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
  const styles = getComputedStyle(document.documentElement);
  const gridColor = styles.getPropertyValue("--grid-line").trim() || "rgba(100, 116, 139, 0.2)";
  const tickColor = styles.getPropertyValue("--tick-color").trim() || "#64748b";
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
      scales: {
        x: { type: "time", time: { unit: "day" }, ticks: { color: tickColor }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor }, grid: { color: gridColor } },
      },
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
      scales: {
        x: { type: "time", display: false, ticks: { color: tickColor }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor }, grid: { color: gridColor } },
      },
    },
  });
}

function renderCards(target, cards) {
  const accentClassByLabel = {
    "Win Rate": "metric-accent-win",
    "Sharpe Ratio": "metric-accent-sharpe",
    "Max Drawdown": "metric-accent-drawdown",
    Beta: "metric-accent-beta",
    "30d Volatility": "metric-accent-volatility",
    "VaR (95%)": "metric-accent-var",
  };
  target.innerHTML = cards
    .map(
      (card) => `<div class="metric-card ${accentClassByLabel[card.label] || ""}">
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
  renderCasualPanel(prediction, tone);
  const tradeAction = signal === "BEARISH" ? "SELL" : "BUY";
  tradeSignalBtn.href = `/portfolio?ticker=${encodeURIComponent(prediction.ticker)}&action=${tradeAction}`;
  tradeSignalBtn.classList.remove("hidden");

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
    .map((data) => {
      const signalClass = signalTone(data.signal);
      return `<tr><td>${data.horizon}</td><td class="signal-cell ${signalClass}">${data.signal}</td><td>${data.confidence}%</td></tr>`;
    })
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
  emptyState.classList.add("hidden");
  setMode(currentMode);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusBadge.textContent = "Processing";
  if (resultError) resultError.classList.add("hidden");
  const originalButtonText = submitButton.textContent;
  submitButton.textContent = "⏳ Analyzing...";
  submitButton.disabled = true;
  if (!lastPrediction) {
    emptyState.textContent = "Training models and generating prediction...";
    emptyState.classList.remove("hidden");
    casualView.classList.add("hidden");
    advancedView.classList.add("hidden");
  }
  const payload = {
    ticker: document.getElementById("symbol").value.trim(),
    years: Number(yearsSelect.value),
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
      if (response.status === 400 && resultError) {
        resultError.innerHTML = `<div class="result-error-title">Unable to run prediction</div>
        <div>${data.detail || "Unable to generate prediction."}</div>
        <div class="result-error-suggestion">Try selecting a longer historical window for more reliable results.</div>`;
        resultError.classList.remove("hidden");
        if (!lastPrediction) {
          emptyState.classList.add("hidden");
        } else {
          setMode(currentMode);
        }
      } else {
        emptyState.textContent = `Error: ${data.detail || "Unable to generate prediction."}`;
      }
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
if (yearsSelect) yearsSelect.addEventListener("change", updateWindowWarning);
updateWindowWarning();
fetchTopMovers({ forceRefresh: false, source: "initial" });
setInterval(updateCountdown, 1000);
setInterval(updateLastUpdatedTicker, 1000);
setInterval(() => {
  console.log("Auto-refreshing top movers...");
  fetchTopMovers({ forceRefresh: true, source: "auto" });
}, TOP_MOVERS_INTERVAL);
applyTheme(localStorage.getItem(THEME_KEY) || "light");
setMode("casual");
