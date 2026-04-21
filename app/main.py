from __future__ import annotations

import concurrent.futures
from pathlib import Path
import time

from dotenv import load_dotenv
import os

# Always load project root .env (repo root), not dependent on cwd
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path, override=True)
print("DEBUG: TOGETHER KEY AT STARTUP =", os.getenv("TOGETHER_API_KEY"))

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import pandas as pd
import yfinance as yf

from app.predictor import (
    check_earnings_warning,
    get_casual_reasons,
    compute_features,
    compute_risk_metrics,
    get_llm_explanation,
    get_stock_data,
    multi_timeframe_signals,
    run_backtest,
    train_and_predict,
)

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Stock Price Predictor")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
_top_movers_cache: dict[str, object] = {"data": None, "timestamp": 0.0, "ttl": 300}


def get_top_movers() -> list[dict[str, object]]:
    universe = [
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA",
        "META", "NFLX", "AMD", "INTC", "CRM", "ORCL",
        "ADBE", "PYPL", "UBER", "LYFT", "SNAP", "SPOT",
        "JPM", "BAC", "GS", "MS", "WFC", "C",
        "JNJ", "PFE", "MRNA", "UNH", "CVS",
        "XOM", "CVX", "BP", "COP",
        "WMT", "TGT", "COST", "AMZN",
        "BA", "CAT", "GE", "MMM",
        "DIS", "CMCSA", "T", "VZ",
        "BRK-B", "V", "MA", "AXP",
    ]

    results: list[dict[str, object]] = []
    data = yf.download(
        universe,
        period="2d",
        interval="1d",
        group_by="ticker",
        auto_adjust=True,
        progress=False,
        threads=True,
    )

    if isinstance(data, pd.DataFrame) and data.empty:
        return []

    for ticker in universe:
        try:
            if ticker not in data.columns.get_level_values(0):
                continue
            closes = data[ticker]["Close"].dropna()
            if len(closes) < 2:
                continue

            current = float(closes.iloc[-1])
            previous = float(closes.iloc[-2])
            if previous == 0:
                continue
            change = current - previous
            change_pct = (change / previous) * 100

            # Keep this endpoint responsive by using batched data only.
            company = ticker
            volume_series = data[ticker]["Volume"].dropna() if "Volume" in data[ticker] else pd.Series(dtype="float64")
            volume = int(float(volume_series.iloc[-1])) if not volume_series.empty else 0

            results.append(
                {
                    "ticker": ticker,
                    "company": company,
                    "price": round(current, 2),
                    "change": round(change, 2),
                    "change_pct": round(change_pct, 2),
                    "volume": volume,
                    "abs_change_pct": abs(change_pct),
                }
            )
        except Exception:
            continue

    results.sort(key=lambda item: float(item["abs_change_pct"]), reverse=True)
    top5 = results[:5]
    for item in top5:
        item.pop("abs_change_pct", None)
    return top5


def get_top_movers_with_timeout() -> list[dict[str, object]]:
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    future = executor.submit(get_top_movers)
    try:
        return future.result(timeout=15)
    except concurrent.futures.TimeoutError:
        return []
    finally:
        executor.shutdown(wait=False, cancel_futures=True)


@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "index.html")


@app.get("/portfolio", response_class=HTMLResponse)
async def portfolio_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "portfolio.html")


@app.get("/top-movers")
async def top_movers(refresh: bool = False) -> JSONResponse:
    global _top_movers_cache
    now = time.time()
    if "ttl" not in _top_movers_cache:
        _top_movers_cache["ttl"] = 300
    cached = _top_movers_cache.get("data")
    timestamp = float(_top_movers_cache.get("timestamp", 0.0))
    ttl = float(_top_movers_cache.get("ttl", 300))
    cache_age = now - timestamp
    cache_valid = (
        isinstance(cached, list)
        and len(cached) >= 3
        and cache_age < ttl
        and not refresh
    )

    if cache_valid:
        print(f"Returning cached top movers ({cache_age:.0f}s old)")
        return JSONResponse({"data": cached, "last_updated": int(timestamp)})

    print("Fetching fresh top movers data...")
    data = get_top_movers_with_timeout()
    if data and len(data) >= 3:
        _top_movers_cache = {"data": data, "timestamp": now, "ttl": 300}
        return JSONResponse({"data": data, "last_updated": int(now)})

    if isinstance(cached, list) and cached:
        return JSONResponse({"data": cached, "last_updated": int(timestamp)})

    return JSONResponse({"data": [], "last_updated": int(now)})


class PredictBody(BaseModel):
    ticker: str
    years: float = 8.0
    mode: str = "casual"


def _build_response(ticker: str, years: float, mode: str) -> dict:
    raw_df = get_stock_data(ticker, years)
    df_features = compute_features(raw_df)
    signal, confidence, probability, model, _x_train, x_test, y_test, features = train_and_predict(df_features)
    win_rate, sharpe, max_drawdown = run_backtest(model, x_test, y_test)
    multi_tf = multi_timeframe_signals(df_features, model)
    beta, volatility, var_95 = compute_risk_metrics(raw_df)
    explanation = get_llm_explanation(ticker, signal, confidence, features, mode)
    casual_reasons = get_casual_reasons(signal, features)
    earnings_warning = check_earnings_warning(ticker)

    recent = df_features.tail(60)
    action = "Hold"
    if signal == "BULLISH":
        action = "Consider buying"
    elif signal == "BEARISH":
        action = "Consider exiting"

    return {
        "ticker": ticker.upper(),
        "signal": signal,
        "confidence": round(confidence, 1),
        "probability": round(probability, 3),
        "action": action,
        "years": years,
        "explanation": explanation,
        "casual_reasons": casual_reasons,
        "backtest": {
            "win_rate": round(win_rate, 1),
            "sharpe": round(sharpe, 2),
            "max_drawdown": round(max_drawdown, 1),
        },
        "risk": {
            "beta": round(beta, 2),
            "volatility": round(volatility, 1),
            "var_95": round(var_95, 1),
        },
        "multi_timeframe": multi_tf,
        "chart_data": {
            "dates": [d.strftime("%Y-%m-%d") for d in recent.index],
            "open": [round(float(v), 2) for v in recent["Open"].tolist()],
            "high": [round(float(v), 2) for v in recent["High"].tolist()],
            "low": [round(float(v), 2) for v in recent["Low"].tolist()],
            "close": [round(float(v), 2) for v in recent["Close"].tolist()],
            "volume": [int(v) for v in recent["Volume"].tolist()],
            "ema20": [round(float(v), 2) for v in recent["ema20"].tolist()],
            "ema50": [round(float(v), 2) for v in recent["ema50"].tolist()],
        },
        "indicators": {
            "rsi": round(float(recent["rsi"].iloc[-1]), 1),
            "macd": round(float(recent["macd"].iloc[-1]), 2),
            "macd_signal": round(float(recent["macd_signal"].iloc[-1]), 2),
            "macd_diff": round(float(recent["macd_diff"].iloc[-1]), 2),
            "bb_pct": round(float(recent["bb_pct"].iloc[-1]), 2),
            "atr": round(float(recent["atr"].iloc[-1]), 2),
        },
        "earnings_warning": earnings_warning,
    }


@app.post("/predict")
async def predict(body: PredictBody) -> JSONResponse:
    try:
        payload = _build_response(body.ticker, body.years, body.mode)
        return JSONResponse(payload)
    except HTTPException as exc:
        raise exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        raise HTTPException(status_code=500, detail="Unexpected server error. Please try again.")


@app.post("/api/predict")
async def predict_api(body: PredictBody) -> JSONResponse:
    return await predict(body)


@app.get("/stock-price/{ticker}")
async def stock_price(ticker: str) -> JSONResponse:
    try:
        ticker_obj = yf.Ticker(ticker.upper())
        history = ticker_obj.history(period="1d")
        if history.empty:
            raise ValueError("No price data available.")
        price = float(history["Close"].iloc[-1])
        return JSONResponse({"ticker": ticker.upper(), "price": round(price, 2)})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to fetch price for {ticker.upper()}: {exc}") from exc
