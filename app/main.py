from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from app.predictor import (
    check_earnings_warning,
    compute_features,
    compute_risk_metrics,
    get_llm_explanation,
    get_stock_data,
    multi_timeframe_signals,
    run_backtest,
    train_and_predict,
)

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Stock Price Predictor")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "index.html")


class PredictBody(BaseModel):
    ticker: str
    years: int = 8
    mode: str = "casual"


def _build_response(ticker: str, years: int, mode: str) -> dict:
    raw_df = get_stock_data(ticker, years)
    df_features = compute_features(raw_df)
    signal, confidence, probability, model, x_test, y_test, features = train_and_predict(df_features)
    win_rate, sharpe, max_drawdown = run_backtest(model, x_test, y_test)
    multi_tf = multi_timeframe_signals(df_features, model)
    beta, volatility, var_95 = compute_risk_metrics(raw_df)
    explanation = get_llm_explanation(ticker, signal, confidence, features, mode)
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
        "explanation": explanation,
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
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        raise HTTPException(status_code=500, detail="Unexpected server error. Please try again.")


@app.post("/api/predict")
async def predict_api(body: PredictBody) -> JSONResponse:
    return await predict(body)
