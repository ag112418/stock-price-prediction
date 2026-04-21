# Project Manual

## Mini Project: Stock Price Prediction Assistant

### Project Overview

This mini project is a browser-based client/server application that predicts whether a stock is likely to gain profit (price increase) on the next trading day.

The user enters:

- a stock ticker symbol (for example, `AAPL`), and
- a lookback period in years.

The server downloads historical market data, performs feature engineering, trains multiple ML models, and returns a prediction signal with model evaluation metrics.

### Requirements Mapping

- **Domain & AI collaboration tools:** Finance domain project created with AI-assisted design, coding, and documentation.
- **Client/server architecture:** Browser client + FastAPI backend (`app/main.py`).
- **LLM integration (preferred):** Optional realtime OpenAI explanation included in `app/predictor.py`.
- **User input & server processing:** Input form in `app/templates/index.html`; backend validation, ML training, and inference in `app/predictor.py`.
- **Documentation:** This project manual plus repository `README.md`.
- **Prompt archiving:** Archived in `prompt_archive/prompts.md` for electronic and formal documentation inclusion.

### How AI Was Used

#### 1) AI for Design

AI collaboration was used to:

- define an end-to-end mini-project scope from user input to prediction output,
- choose a practical client/server architecture with FastAPI,
- adapt a reference ML workflow (feature engineering + model comparison) into a web app.

#### 2) AI for Code Implementation

AI collaboration helped implement:

- data ingestion from market history (`yfinance`),
- feature engineering inspired by OHLC-based signals (`open-close`, `low-high`, `is_quarter_end`),
- model training/evaluation across Logistic Regression, SVC, and XGBoost with ROC-AUC reporting,
- prediction endpoint and browser UI integration.

#### 3) AI for Documentation

AI collaboration helped produce:

- setup and execution documentation,
- rubric-to-implementation mapping,
- this project manual content and prompt archive formatting.

### Architecture Summary

- **Frontend (browser):**
  - `app/templates/index.html`
  - `app/static/styles.css`
  - `app/static/app.js`
- **Backend (server):**
  - `app/main.py` (route handling)
  - `app/predictor.py` (data prep, modeling, prediction, optional LLM explanation)
- **Documentation & prompts:**
  - `README.md`
  - `docs/PROJECT_MANUAL.md`
  - `prompt_archive/prompts.md`

### Prompt Archive Inclusion

Prompt records are archived in `prompt_archive/prompts.md` and included as part of the formal mini-project documentation package.

### Local Run Instructions

1. Install dependencies:
   - `pip install -r requirements.txt`
2. Create `.env` from `.env.example` and optionally set `OPENAI_API_KEY`.
3. Run server:
   - `uvicorn app.main:app --reload`
4. Open browser client:
   - `http://127.0.0.1:8000`
