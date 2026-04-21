from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.predictor import PredictionError, predict_stock_movement

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Stock Price Predictor")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "index.html")


@app.post("/api/predict")
async def predict(
    symbol: str = Form(...),
    lookback_years: int = Form(default=8),
) -> JSONResponse:
    try:
        prediction = predict_stock_movement(symbol=symbol, lookback_years=lookback_years)
        return JSONResponse({"ok": True, "prediction": prediction})
    except PredictionError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
    except Exception:
        return JSONResponse(
            {"ok": False, "error": "Unexpected server error. Please try again."},
            status_code=500,
        )
