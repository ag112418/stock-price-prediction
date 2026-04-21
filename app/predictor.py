from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf
from dotenv import load_dotenv
from openai import OpenAI
from sklearn import metrics
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
try:
    from xgboost import XGBClassifier
except Exception:  # noqa: BLE001
    XGBClassifier = None

load_dotenv()


class PredictionError(Exception):
    """Raised when stock prediction fails in a user-facing way."""


@dataclass
class ModelReport:
    name: str
    train_auc: float
    valid_auc: float


def _load_history(symbol: str, lookback_years: int) -> pd.DataFrame:
    data = yf.download(
        symbol,
        period=f"{lookback_years}y",
        interval="1d",
        auto_adjust=False,
        progress=False,
    )
    if data.empty:
        raise PredictionError("No market data found for that ticker.")

    if isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.get_level_values(0)

    data = data.reset_index()
    required = {"Date", "Open", "High", "Low", "Close", "Volume"}
    if not required.issubset(set(data.columns)):
        raise PredictionError("Downloaded data is missing required price columns.")
    return data


def _build_features(df: pd.DataFrame) -> pd.DataFrame:
    prepared = df.copy()
    prepared["month"] = prepared["Date"].dt.month
    prepared["is_quarter_end"] = np.where(prepared["month"] % 3 == 0, 1, 0)
    prepared["open-close"] = prepared["Open"] - prepared["Close"]
    prepared["low-high"] = prepared["Low"] - prepared["High"]
    prepared["target"] = np.where(prepared["Close"].shift(-1) > prepared["Close"], 1, 0)
    prepared = prepared.dropna().reset_index(drop=True)
    return prepared


def _train_models(features: np.ndarray, target: np.ndarray) -> tuple[list[ModelReport], Any]:
    split_index = int(len(features) * 0.9)
    if split_index < 50 or len(features) - split_index < 10:
        raise PredictionError("Not enough data after preprocessing to train reliably.")

    x_train, x_valid = features[:split_index], features[split_index:]
    y_train, y_valid = target[:split_index], target[split_index:]

    scaler = StandardScaler()
    x_train_scaled = scaler.fit_transform(x_train)
    x_valid_scaled = scaler.transform(x_valid)

    models = [
        ("LogisticRegression", LogisticRegression(max_iter=1200)),
        ("SVC(poly)", SVC(kernel="poly", probability=True)),
    ]
    if XGBClassifier is not None:
        models.append(
            (
                "XGBClassifier",
                XGBClassifier(
                    n_estimators=150,
                    max_depth=3,
                    learning_rate=0.05,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    eval_metric="logloss",
                ),
            )
        )

    reports: list[ModelReport] = []
    fitted: list[tuple[float, Any]] = []
    for name, model in models:
        model.fit(x_train_scaled, y_train)
        train_auc = metrics.roc_auc_score(y_train, model.predict_proba(x_train_scaled)[:, 1])
        valid_auc = metrics.roc_auc_score(y_valid, model.predict_proba(x_valid_scaled)[:, 1])
        reports.append(ModelReport(name=name, train_auc=float(train_auc), valid_auc=float(valid_auc)))
        score = valid_auc - max(train_auc - valid_auc, 0) * 0.35
        fitted.append((score, model))

    selected_model = sorted(fitted, key=lambda item: item[0], reverse=True)[0][1]
    return reports, (selected_model, scaler)


def _build_ai_explanation(payload: dict[str, Any]) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return "AI explanation unavailable because OPENAI_API_KEY is not configured."

    try:
        client = OpenAI(api_key=api_key)
        prompt = (
            "You are assisting a student mini-project about stock movement prediction. "
            "Explain this prediction in 4 short bullet points and include one caution note. "
            "Do not provide personalized financial advice.\n\n"
            f"Data: {payload}"
        )
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You explain ML stock predictions clearly."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=280,
        )
        content = (response.choices[0].message.content or "").strip()
        return content or "AI explanation was empty."
    except Exception as exc:  # noqa: BLE001
        return f"AI explanation unavailable: {exc}"


def predict_stock_movement(symbol: str, lookback_years: int = 8) -> dict[str, Any]:
    clean_symbol = (symbol or "").strip().upper()
    if not clean_symbol:
        raise PredictionError("Ticker symbol is required.")
    if not (2 <= lookback_years <= 15):
        raise PredictionError("Lookback years must be between 2 and 15.")

    raw = _load_history(clean_symbol, lookback_years)
    prepared = _build_features(raw)
    feature_columns = ["open-close", "low-high", "is_quarter_end"]
    features = prepared[feature_columns].to_numpy()
    target = prepared["target"].to_numpy()

    reports, trained = _train_models(features, target)
    model, scaler = trained
    latest_features = scaler.transform(features[-1:].copy())
    gain_probability = float(model.predict_proba(latest_features)[0][1])

    if gain_probability >= 0.55:
        recommendation = "Likely profit signal (upward move more probable)."
    elif gain_probability <= 0.45:
        recommendation = "Likely risk signal (downward move more probable)."
    else:
        recommendation = "Uncertain signal (edge is weak)."

    result = {
        "symbol": clean_symbol,
        "lookback_years": lookback_years,
        "latest_close": float(prepared.iloc[-1]["Close"]),
        "prediction_for_next_trading_day": {
            "gain_probability": round(gain_probability, 4),
            "label": int(gain_probability >= 0.5),
            "recommendation": recommendation,
        },
        "model_reports": [
            {
                "model": report.name,
                "train_roc_auc": round(report.train_auc, 4),
                "valid_roc_auc": round(report.valid_auc, 4),
            }
            for report in reports
        ],
    }
    result["ai_explanation"] = _build_ai_explanation(result)
    result["disclaimer"] = (
        "This is an educational ML signal, not investment advice. "
        "Use additional research before making decisions."
    )
    return result
