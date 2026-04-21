from __future__ import annotations

import os
from datetime import date
from typing import Any

import numpy as np
import pandas as pd
import shap
import ta
import yfinance as yf
from together import Together
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    return df


def _signal_and_confidence(probability: float) -> tuple[str, float]:
    if probability >= 0.60:
        signal = "BULLISH"
    elif probability <= 0.40:
        signal = "BEARISH"
    else:
        signal = "NEUTRAL"
    confidence = float(abs(probability - 0.5) * 200)
    return signal, confidence


def get_stock_data(ticker: str, years: int) -> pd.DataFrame:
    period = f"{years}y"
    data = yf.download(
        ticker,
        period=period,
        interval="1d",
        auto_adjust=False,
        progress=False,
    )
    data = _normalize_columns(data)
    if data.empty:
        raise ValueError(f"Could not fetch data for ticker: {ticker}")
    keep = ["Open", "High", "Low", "Close", "Volume"]
    if not set(keep).issubset(data.columns):
        raise ValueError(f"Could not fetch data for ticker: {ticker}")
    return data[keep].copy()


def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["rsi"] = ta.momentum.RSIIndicator(close=out["Close"], window=14).rsi()
    macd = ta.trend.MACD(close=out["Close"])
    out["macd"] = macd.macd()
    out["macd_signal"] = macd.macd_signal()
    out["macd_diff"] = macd.macd_diff()
    out["ema20"] = ta.trend.EMAIndicator(close=out["Close"], window=20).ema_indicator()
    out["ema50"] = ta.trend.EMAIndicator(close=out["Close"], window=50).ema_indicator()
    bb = ta.volatility.BollingerBands(close=out["Close"], window=20, window_dev=2)
    out["bb_upper"] = bb.bollinger_hband()
    out["bb_lower"] = bb.bollinger_lband()
    out["bb_pct"] = bb.bollinger_pband()
    out["atr"] = ta.volatility.AverageTrueRange(
        high=out["High"], low=out["Low"], close=out["Close"], window=14
    ).average_true_range()
    out["obv"] = ta.volume.OnBalanceVolumeIndicator(
        close=out["Close"], volume=out["Volume"]
    ).on_balance_volume()
    out["week52_high_ratio"] = out["Close"] / out["Close"].rolling(252).max()
    out["week52_low_ratio"] = out["Close"] / out["Close"].rolling(252).min()
    out["momentum_5"] = out["Close"] - out["Close"].shift(5)
    out["momentum_20"] = out["Close"] - out["Close"].shift(20)
    out["volume_ratio"] = out["Volume"] / out["Volume"].rolling(20).mean()
    out = out.dropna().copy()
    return out


def train_and_predict(
    df: pd.DataFrame,
) -> tuple[str, float, float, XGBClassifier, pd.DataFrame, pd.DataFrame, pd.Series, dict[str, float]]:
    work = df.copy()
    work["target"] = np.where(work["Close"].shift(-10) > work["Close"] * 1.02, 1, 0)
    work = work.iloc[:-10].copy()
    feature_cols = [
        "rsi",
        "macd",
        "macd_signal",
        "macd_diff",
        "ema20",
        "ema50",
        "bb_pct",
        "atr",
        "obv",
        "week52_high_ratio",
        "week52_low_ratio",
        "momentum_5",
        "momentum_20",
        "volume_ratio",
    ]
    x = work[feature_cols]
    y = work["target"]
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, shuffle=False)

    model = XGBClassifier(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        use_label_encoder=False,
        eval_metric="logloss",
    )
    model.fit(x_train, y_train)

    x_last = x.iloc[[-1]]
    probability = float(model.predict_proba(x_last)[0][1])
    signal, confidence = _signal_and_confidence(probability)
    features = {k: float(v) for k, v in x_last.iloc[0].to_dict().items()}
    features["Close"] = float(work["Close"].iloc[-1])
    return signal, confidence, probability, model, x_train, x_test, y_test, features


def run_backtest(model: XGBClassifier, x_test: pd.DataFrame, y_test: pd.Series) -> tuple[float, float, float]:
    probs = model.predict_proba(x_test)[:, 1]
    signals = np.where(probs >= 0.60, 1, np.where(probs <= 0.40, -1, 0))
    y = y_test.to_numpy()
    non_neutral_mask = signals != 0

    if np.sum(non_neutral_mask) == 0:
        return 0.0, 0.0, 0.0

    predicted_direction = (signals[non_neutral_mask] == 1).astype(int)
    actual_direction = y[non_neutral_mask]
    correct = predicted_direction == actual_direction
    win_rate = float(correct.mean() * 100)

    returns = np.where(correct, 0.01, -0.01).astype(float)
    ret_std = float(np.std(returns))
    sharpe = 0.0 if ret_std == 0 else float((np.mean(returns) / ret_std) * np.sqrt(252))
    cumulative = np.cumprod(1 + returns)
    running_max = np.maximum.accumulate(cumulative)
    drawdown = (cumulative / running_max) - 1
    max_drawdown = float(np.min(drawdown) * 100)
    return win_rate, sharpe, max_drawdown


def multi_timeframe_signals(df: pd.DataFrame, model: XGBClassifier) -> list[dict[str, Any]]:
    feature_cols = [
        "rsi",
        "macd",
        "macd_signal",
        "macd_diff",
        "ema20",
        "ema50",
        "bb_pct",
        "atr",
        "obv",
        "week52_high_ratio",
        "week52_low_ratio",
        "momentum_5",
        "momentum_20",
        "volume_ratio",
    ]
    rows = [("Short (5d)", -5), ("Medium (20d)", -20), ("Long (60d)", -60)]
    out: list[dict[str, Any]] = []
    for horizon, idx in rows:
        x_row = df.iloc[[idx]][feature_cols]
        prob = float(model.predict_proba(x_row)[0][1])
        signal, confidence = _signal_and_confidence(prob)
        out.append({"horizon": horizon, "signal": signal, "confidence": round(confidence, 1)})
    return out


def compute_risk_metrics(df: pd.DataFrame) -> tuple[float, float, float]:
    stock_ret = df["Close"].pct_change().dropna()
    start = df.index.min().strftime("%Y-%m-%d")
    end = df.index.max().strftime("%Y-%m-%d")
    spy = yf.download("SPY", start=start, end=end, interval="1d", auto_adjust=False, progress=False)
    spy = _normalize_columns(spy)
    spy_ret = spy["Close"].pct_change().dropna() if not spy.empty else pd.Series(dtype=float)
    aligned = pd.concat([stock_ret.tail(252), spy_ret.tail(252)], axis=1, join="inner").dropna()
    beta = 0.0
    if not aligned.empty:
        beta = float(aligned.iloc[:, 0].cov(aligned.iloc[:, 1]) / (aligned.iloc[:, 1].var() + 1e-12))

    volatility = float(stock_ret.tail(30).std() * np.sqrt(252) * 100)
    var_95 = float(-1 * np.percentile(stock_ret.tail(252), 5) * 100)
    return beta, volatility, var_95


def compute_shap_values(
    model: XGBClassifier, x_train: pd.DataFrame, x_last_row: pd.DataFrame
) -> list[dict[str, float | str]]:
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(x_last_row)

    feature_names = x_train.columns.tolist()
    shap_list: list[dict[str, float | str]] = []
    for i, name in enumerate(feature_names):
        shap_list.append(
            {
                "feature": name,
                "value": round(float(shap_values[0][i]), 4),
                "feature_value": round(float(x_last_row.iloc[0][name]), 4),
            }
        )

    shap_list.sort(key=lambda x: abs(float(x["value"])), reverse=True)
    return shap_list[:8]


def get_llm_explanation(ticker, signal, confidence, features, mode, sentiment_label="NEUTRAL", sentiment_score=0.0):
    try:
        client = Together(api_key=os.getenv("TOGETHER_API_KEY"))

        rsi = features.get("rsi", 50)
        macd_diff = features.get("macd_diff", 0)
        ema20 = features.get("ema20", 0)
        ema50 = features.get("ema50", 0)
        ema_interp = "above" if ema20 > ema50 else "below"
        rsi_interp = "overbought" if rsi > 70 else "oversold" if rsi < 30 else "neutral"
        macd_interp = "bullish momentum" if macd_diff > 0 else "bearish momentum"

        if mode == "casual":
            prompt = f"""You are a friendly financial assistant explaining 
            a stock prediction to a beginner investor.
            Stock: {ticker}
            Signal: {signal} with {confidence:.0f}% confidence
            Recent news sentiment: {sentiment_label} (score: {sentiment_score:.2f})
            RSI is {rsi:.1f} ({rsi_interp}), MACD shows {macd_interp}, 
            price is {ema_interp} its 50-day average.
            Write 2-3 sentences in plain English explaining why the model 
            is giving this signal. Avoid jargon. 
            Do not give financial advice."""
        else:
            prompt = f"""You are a quantitative analyst explaining a stock 
            signal to an experienced trader.
            Stock: {ticker}
            Signal: {signal} with {confidence:.0f}% confidence
            Recent news sentiment: {sentiment_label} (score: {sentiment_score:.2f})
            RSI: {rsi:.1f} ({rsi_interp})
            MACD histogram: {macd_diff:.3f} ({macd_interp})
            Price vs EMA50: {ema_interp}
            Provide a 2-3 sentence technical analysis summary. 
            Use proper trading terminology. 
            Do not give financial advice."""

        response = client.chat.completions.create(
            model="meta-llama/Llama-3.3-70B-Instruct-Turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.7,
            stream=False
        )

        return response.choices[0].message.content

    except Exception as e:
        print(f"Together SDK error: {e}")
        return "AI explanation unavailable. Signal is based on ML model output."


def check_earnings_warning(ticker: str) -> dict[str, Any]:
    try:
        cal = yf.Ticker(ticker).calendar
        if not isinstance(cal, pd.DataFrame) or cal.empty:
            return {"warning": False}
        next_date = pd.to_datetime(cal.iloc[0, 0]).date()
        days_away = (next_date - date.today()).days
        if 0 <= days_away <= 28:
            return {"warning": True, "date": next_date.isoformat(), "days_away": days_away}
    except Exception:
        return {"warning": False}
    return {"warning": False}
