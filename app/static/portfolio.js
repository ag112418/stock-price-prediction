const themeToggle = document.getElementById("theme-toggle");
const accountSummary = document.getElementById("account-summary");
const accountSummaryMeta = document.getElementById("account-summary-meta");
const resetAccountBtn = document.getElementById("reset-account-btn");
const tradeForm = document.getElementById("trade-form");
const tradeTickerInput = document.getElementById("trade-ticker");
const tradeSharesInput = document.getElementById("trade-shares");
const tradeBuyBtn = document.getElementById("trade-buy-btn");
const tradeSellBtn = document.getElementById("trade-sell-btn");
const getPriceBtn = document.getElementById("get-price-btn");
const executeTradeBtn = document.getElementById("execute-trade-btn");
const tradeEstimate = document.getElementById("trade-estimate");
const tradeMessage = document.getElementById("trade-message");
const refreshPricesBtn = document.getElementById("refresh-prices-btn");
const holdingsBody = document.getElementById("holdings-body");
const tradeHistoryBody = document.getElementById("trade-history-body");
const exportCsvBtn = document.getElementById("export-csv-btn");

const THEME_KEY = "theme";
const PORTFOLIO_KEY = "portfolio";
const PORTFOLIO_HISTORY_KEY = "portfolioHistory";
const WATCHLIST_KEY = "watchlist";
const STARTING_BALANCE = 10000.0;
let tradeAction = "BUY";
let currentPrice = null;
let portfolioChart = null;

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.classList.toggle("dark-theme", isDark);
  document.body.classList.toggle("dark-theme", isDark);
  themeToggle.textContent = isDark ? "☀️" : "🌙";
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
  renderPortfolioChart();
}

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.classList.contains("dark-theme") ? "light" : "dark";
  applyTheme(next);
});

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTs(value) {
  return new Date(value).toLocaleString();
}

function getPortfolio() {
  const raw = localStorage.getItem(PORTFOLIO_KEY);
  if (!raw) {
    const initial = {
      cash: STARTING_BALANCE,
      startingBalance: STARTING_BALANCE,
      createdAt: new Date().toISOString(),
      holdings: {},
      tradeHistory: [],
    };
    localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(initial));
    return initial;
  }
  return JSON.parse(raw);
}

function savePortfolio(portfolio) {
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(portfolio));
}

function getPortfolioHistory() {
  const raw = localStorage.getItem(PORTFOLIO_HISTORY_KEY);
  if (!raw) {
    const first = [{ date: new Date().toISOString().slice(0, 10), value: STARTING_BALANCE }];
    localStorage.setItem(PORTFOLIO_HISTORY_KEY, JSON.stringify(first));
    return first;
  }
  return JSON.parse(raw);
}

function savePortfolioHistory(history) {
  localStorage.setItem(PORTFOLIO_HISTORY_KEY, JSON.stringify(history));
}

function setTradeAction(action) {
  tradeAction = action;
  tradeBuyBtn.classList.toggle("selected", action === "BUY");
  tradeSellBtn.classList.toggle("selected", action === "SELL");
}

tradeBuyBtn.addEventListener("click", () => setTradeAction("BUY"));
tradeSellBtn.addEventListener("click", () => setTradeAction("SELL"));

async function fetchPrice(ticker) {
  const response = await fetch(`/stock-price/${encodeURIComponent(ticker)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Failed to fetch price.");
  return data.price;
}

async function fillCurrentPrice() {
  const ticker = tradeTickerInput.value.trim().toUpperCase();
  if (!ticker) return;
  getPriceBtn.disabled = true;
  getPriceBtn.textContent = "⏳ Fetching...";
  try {
    currentPrice = await fetchPrice(ticker);
    renderTradeEstimate();
  } catch (err) {
    tradeMessage.textContent = `❌ ${err.message}`;
  } finally {
    getPriceBtn.disabled = false;
    getPriceBtn.textContent = "Get Current Price";
  }
}

function getSignalForTicker(ticker) {
  try {
    const watchlist = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "{}");
    return watchlist[ticker]?.signal || "N/A";
  } catch {
    return "N/A";
  }
}

function renderTradeEstimate() {
  const portfolio = getPortfolio();
  const ticker = tradeTickerInput.value.trim().toUpperCase();
  const shares = Math.max(1, Number(tradeSharesInput.value || 1));
  const total = (currentPrice || 0) * shares;
  tradeEstimate.innerHTML = `
    <div>Current price: <strong>${formatMoney(currentPrice || 0)}</strong></div>
    <div>Estimated total: <strong>${formatMoney(total)}</strong></div>
    <div>Available cash: <strong>${formatMoney(portfolio.cash)}</strong></div>
    <div>Signal from watchlist: <strong>${getSignalForTicker(ticker)}</strong></div>
  `;
}

getPriceBtn.addEventListener("click", fillCurrentPrice);
tradeTickerInput.addEventListener("input", () => {
  currentPrice = null;
  renderTradeEstimate();
});
tradeSharesInput.addEventListener("input", renderTradeEstimate);

function computePortfolioValue(portfolio) {
  let holdingsValue = 0;
  for (const ticker of Object.keys(portfolio.holdings)) {
    const h = portfolio.holdings[ticker];
    holdingsValue += Number(h.shares || 0) * Number(h.currentPrice || 0);
  }
  return Number(portfolio.cash || 0) + holdingsValue;
}

function updateSummary() {
  const portfolio = getPortfolio();
  const value = computePortfolioValue(portfolio);
  const ret = value - portfolio.startingBalance;
  const pct = (ret / portfolio.startingBalance) * 100;
  const retClass = ret >= 0 ? "signal-cell positive" : "signal-cell negative";
  accountSummary.innerHTML = `
    <div class="metric-card"><div class="label">Starting Balance</div><div class="value">${formatMoney(portfolio.startingBalance)}</div></div>
    <div class="metric-card"><div class="label">Current Cash</div><div class="value">${formatMoney(portfolio.cash)}</div></div>
    <div class="metric-card"><div class="label">Portfolio Value</div><div class="value">${formatMoney(value)}</div></div>
    <div class="metric-card"><div class="label">Total Return</div><div class="value ${retClass}">${ret >= 0 ? "+" : ""}${formatMoney(ret)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)</div></div>
  `;
  accountSummaryMeta.innerHTML = `Paper Trader · Member since ${formatTs(portfolio.createdAt)}`;
}

function updatePortfolioHistory() {
  const portfolio = getPortfolio();
  const history = getPortfolioHistory();
  history.push({ date: new Date().toISOString().slice(0, 10), value: Number(computePortfolioValue(portfolio).toFixed(2)) });
  savePortfolioHistory(history);
}

function renderPortfolioChart() {
  const history = getPortfolioHistory();
  const canvas = document.getElementById("portfolio-chart");
  const ctx = canvas.getContext("2d");
  const styles = getComputedStyle(document.documentElement);
  const tickColor = styles.getPropertyValue("--tick-color").trim() || "#64748b";
  const gridColor = styles.getPropertyValue("--grid-line").trim() || "rgba(100,116,139,0.2)";
  if (portfolioChart) portfolioChart.destroy();

  const latest = history[history.length - 1]?.value || STARTING_BALANCE;
  const lineColor = latest >= STARTING_BALANCE ? "#22c55e" : "#ef4444";
  portfolioChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: history.map((h) => h.date),
      datasets: [
        { label: "Portfolio Value", data: history.map((h) => h.value), borderColor: lineColor, pointRadius: 2, tension: 0.2 },
        {
          label: "Starting Balance",
          data: history.map(() => STARTING_BALANCE),
          borderColor: "#94a3b8",
          borderDash: [5, 5],
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: {
        x: { ticks: { color: tickColor }, grid: { color: gridColor } },
        y: { ticks: { color: tickColor }, grid: { color: gridColor } },
      },
    },
  });
}

async function refreshHoldingPrices() {
  const portfolio = getPortfolio();
  const tickers = Object.keys(portfolio.holdings);
  for (const ticker of tickers) {
    try {
      const price = await fetchPrice(ticker);
      portfolio.holdings[ticker].currentPrice = price;
    } catch (_) {}
  }
  savePortfolio(portfolio);
  updateSummary();
  renderHoldings();
}

function renderHoldings() {
  const portfolio = getPortfolio();
  const tickers = Object.keys(portfolio.holdings);
  if (!tickers.length) {
    holdingsBody.innerHTML = '<tr><td colspan="7" class="muted">No holdings yet. Make your first trade!</td></tr>';
    return;
  }
  holdingsBody.innerHTML = tickers
    .map((ticker) => {
      const h = portfolio.holdings[ticker];
      const value = Number(h.shares) * Number(h.currentPrice);
      const pnl = value - Number(h.shares) * Number(h.avgCost);
      const pnlPct = Number(h.avgCost) === 0 ? 0 : (pnl / (Number(h.shares) * Number(h.avgCost))) * 100;
      return `<tr>
        <td>${ticker}</td><td>${h.shares}</td><td>${formatMoney(h.avgCost)}</td><td>${formatMoney(h.currentPrice)}</td>
        <td>${formatMoney(value)}</td>
        <td class="signal-cell ${pnl >= 0 ? "positive" : "negative"}">${pnl >= 0 ? "+" : ""}${formatMoney(pnl)}</td>
        <td class="signal-cell ${pnl >= 0 ? "positive" : "negative"}">${pnl >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%</td>
      </tr>`;
    })
    .join("");
}

function renderTradeHistory() {
  const history = getPortfolio().tradeHistory.slice(0, 20);
  if (!history.length) {
    tradeHistoryBody.innerHTML = '<tr><td colspan="7" class="muted">No trades yet.</td></tr>';
    return;
  }
  tradeHistoryBody.innerHTML = history
    .map(
      (row) => `<tr>
      <td>${formatTs(row.timestamp)}</td>
      <td>${row.ticker}</td>
      <td class="signal-cell ${row.action === "BUY" ? "positive" : "negative"}">${row.action}</td>
      <td>${row.shares}</td>
      <td>${formatMoney(row.price)}</td>
      <td>${formatMoney(row.total)}</td>
      <td>${row.signalAtTime || "N/A"}</td>
    </tr>`
    )
    .join("");
}

tradeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ticker = tradeTickerInput.value.trim().toUpperCase();
  const shares = Math.max(1, Number(tradeSharesInput.value || 1));
  if (!ticker) return;
  if (!currentPrice) {
    await fillCurrentPrice();
    if (!currentPrice) return;
  }

  const portfolio = getPortfolio();
  const total = Number((currentPrice * shares).toFixed(2));
  const signalAtTime = getSignalForTicker(ticker);
  const holding = portfolio.holdings[ticker] || { shares: 0, avgCost: 0, currentPrice };

  if (tradeAction === "BUY") {
    if (portfolio.cash < total) {
      tradeMessage.textContent = "❌ Insufficient cash for this trade";
      return;
    }
    const newShares = Number(holding.shares) + shares;
    const newCostBasis = Number(holding.shares) * Number(holding.avgCost) + total;
    portfolio.cash = Number((portfolio.cash - total).toFixed(2));
    portfolio.holdings[ticker] = {
      shares: newShares,
      avgCost: Number((newCostBasis / newShares).toFixed(2)),
      currentPrice: currentPrice,
    };
    tradeMessage.textContent = `✅ Bought ${shares} shares of ${ticker} at ${formatMoney(currentPrice)} (${formatMoney(total)} total)`;
  } else {
    if (Number(holding.shares) < shares) {
      tradeMessage.textContent = "❌ Insufficient shares for this trade";
      return;
    }
    portfolio.cash = Number((portfolio.cash + total).toFixed(2));
    const remaining = Number(holding.shares) - shares;
    if (remaining <= 0) {
      delete portfolio.holdings[ticker];
    } else {
      portfolio.holdings[ticker] = { ...holding, shares: remaining, currentPrice: currentPrice };
    }
    tradeMessage.textContent = `✅ Sold ${shares} shares of ${ticker} at ${formatMoney(currentPrice)} (${formatMoney(total)} total)`;
  }

  portfolio.tradeHistory.unshift({
    ticker,
    action: tradeAction,
    shares,
    price: Number(currentPrice.toFixed(2)),
    total,
    timestamp: new Date().toISOString(),
    signalAtTime,
  });
  savePortfolio(portfolio);
  updatePortfolioHistory();
  updateSummary();
  renderHoldings();
  renderTradeHistory();
  renderPortfolioChart();
  renderTradeEstimate();
});

resetAccountBtn.addEventListener("click", () => {
  const reset = {
    cash: STARTING_BALANCE,
    startingBalance: STARTING_BALANCE,
    createdAt: new Date().toISOString(),
    holdings: {},
    tradeHistory: [],
  };
  savePortfolio(reset);
  savePortfolioHistory([{ date: new Date().toISOString().slice(0, 10), value: STARTING_BALANCE }]);
  currentPrice = null;
  tradeMessage.textContent = "Account reset.";
  updateSummary();
  renderHoldings();
  renderTradeHistory();
  renderPortfolioChart();
  renderTradeEstimate();
});

refreshPricesBtn.addEventListener("click", refreshHoldingPrices);

exportCsvBtn.addEventListener("click", () => {
  const rows = getPortfolio().tradeHistory.slice(0, 20);
  const header = ["timestamp", "ticker", "action", "shares", "price", "total", "signalAtTime"];
  const csv = [header.join(",")]
    .concat(rows.map((r) => header.map((k) => JSON.stringify(r[k] ?? "")).join(",")))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "trade_history.csv";
  a.click();
  URL.revokeObjectURL(url);
});

function applyPrefillFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const ticker = (params.get("ticker") || "").toUpperCase();
  const action = (params.get("action") || "BUY").toUpperCase();
  if (ticker) tradeTickerInput.value = ticker;
  if (action === "SELL") setTradeAction("SELL");
  else setTradeAction("BUY");
  renderTradeEstimate();
}

function boot() {
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  getPortfolio();
  getPortfolioHistory();
  updateSummary();
  renderHoldings();
  renderTradeHistory();
  renderPortfolioChart();
  applyPrefillFromQuery();
}

boot();
