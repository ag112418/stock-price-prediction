# Stock Price Prediction (Mini Project)

Browser-based client/server project that predicts whether a stock is likely to move up on the next trading day.

## Features

- FastAPI backend with browser UI.
- User enters ticker symbol and historical lookback window.
- Server downloads market OHLCV data and engineers features:
  - `open-close`
  - `low-high`
  - `is_quarter_end`
- Trains three ML models (Logistic Regression, SVC, XGBoost) and compares ROC-AUC.
- Produces next-day gain probability and a recommendation label.
- Includes optional LLM-generated explanation of model output.
- Returns educational disclaimer for responsible use.

## Tech Stack

- **Server:** FastAPI + Uvicorn
- **Client:** HTML + CSS + JavaScript
- **ML:** scikit-learn, XGBoost
- **Data:** yfinance + pandas + numpy
- **LLM (optional):** Together.ai Chat Completions

## Run Locally

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

4. (Optional) Add `TOGETHER_API_KEY` in `.env` for AI explanations.
5. Start the server:

```bash
uvicorn app.main:app --reload
```

6. Open [http://127.0.0.1:8000](http://127.0.0.1:8000).

## API Endpoint

- `POST /api/predict` (multipart form data)
  - `symbol` (required, stock ticker like `AAPL`)
  - `lookback_years` (optional, default `8`)

## Documentation and Prompt Archive

- Project Manual: `docs/PROJECT_MANUAL.md`
- Prompt Archive: `prompt_archive/prompts.md`
