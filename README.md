# Explainable Inventory Risk Intelligence for Retail

Detects early stockout and dead-inventory risk with transparent rules on top of simple forecasts.

## What it does
- Ingests public retail sales data
- Forecasts 7-day demand (ARIMA baseline from Colab)
- Flags only two risks: Stockout and Dead Inventory
- Explains the risk in plain language
- Shows a simple dashboard

## Architecture
1) Data ingestion
2) Forecast baseline + anomaly check
3) Rule-based risk engine
4) Explanation generator
5) Dashboard

## Quick start (local)
1) Install dependencies
```
cd backend
npm install
```

2) Prepare data
```
python scripts/prepare_data.py --input data/train.csv --output data/processed
python scripts/simple_forecast.py --input data/processed/sales_daily.csv --output data/processed/forecast.csv
```

3) Run server
```
cd backend
npm start
```
Open http://localhost:3000

## Colab training (optional)
See `notebooks/colab_training.md` to generate `forecast.csv` in Colab and place it into `data/processed/`.
Official forecast path is ARIMA from Colab. If ARIMA output is not available, the fallback is moving average (`scripts/simple_forecast.py`).

## Submission requirements
- `requirements.md` and `design.md` must be generated via Kiro and placed in the repo root.
- Presentation deck must follow the provided template and be submitted as PDF.

## Folder structure
- `backend/` Express API + static frontend
- `frontend/` React (CDN) UI
- `scripts/` data prep and baseline forecast
- `data/` raw + processed CSVs
- `notebooks/` Colab instructions
- `models/` optional model artifacts
