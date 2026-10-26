# Wind Forecast Monitor

Web app for a day-ahead power buying team. It shows (1) the latest national wind generation forecast that was available when a buying decision had to be made, and (2) how accurate those forecasts were against actual generation. Data: Elexon BMRS only, `WINDFOR` (forecasts) and `FUELHH` with `fuelType=WIND` (actuals). Scope: delivery days 1-31 January 2026.

**Live app:** https://rjvzwz.vercel.app

## How it works

- **Decision time.** For delivery day D, the decision cutoff is a configurable UK-local hour (default 09:00) on D-1. For each target hour the app uses the forecast with the latest `publishTime` at or before the cutoff.
- **Alignment.** Forecasts are hourly, actuals are 30-minute. Actuals are averaged to hourly means. Error = forecast - actual.
- **Metrics.** MAE, RMSE, MAPE (hours with zero actual skipped), bias, P90 absolute error. Shown overall, per day, per UK hour of day, and per forecast lead time (all published forecasts bucketed by `startTime - publishTime`).
- **Decision view** shows the forecast with a ±P90 error band so the buyer sees quantified uncertainty.
- **Data note.** `FUELHH` is metered transmission-level output, whereas `WINDFOR` also covers embedded wind, so a positive bias (over-forecast vs `FUELHH`) is expected.
- Elexon responses are cached in memory for one hour; there is no database.

## Files and directories

| Path | Purpose |
|---|---|
| `backend/app/main.py` | FastAPI routes: `/api/health`, `/api/meta`, `/api/forecast`, `/api/accuracy` |
| `backend/app/elexon_client.py` | Elexon BMRS client (7-day chunked requests, cached) |
| `backend/app/analysis.py` | Cutoff logic, forecast selection, alignment, metrics, horizon analysis |
| `backend/app/cache.py` | Small TTL cache |
| `backend/tests/` | pytest tests (analysis logic, API with mocked Elexon) |
| `backend/Dockerfile` | Backend image |
| `frontend/src/` | React + TypeScript (Vite, Recharts): `App.tsx`, `components/DecisionView.tsx`, `components/AccuracyView.tsx`, `api.ts`, `format.ts` |
| `frontend/Dockerfile`, `frontend/nginx.conf` | Frontend image served by nginx, proxying `/api` to the backend |
| `api/index.py` | Vercel serverless entry that exposes the FastAPI app |
| `requirements.txt` | Python dependencies (used by Docker and Vercel) |
| `docker-compose.yml` | Runs backend + frontend locally |
| `vercel.json` | Vercel build and routing config |

## Run locally

Docker:

```bash
docker compose up --build
# app: http://localhost:8080   API docs: http://localhost:8000/docs
```

Without Docker:

```bash
# backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements-dev.txt
cd backend && uvicorn app.main:app --port 8000

# frontend (second terminal)
cd frontend && npm install && npm run dev            # http://localhost:5173
```

## Tests

```bash
cd backend && pytest
cd frontend && npm test
```

## Deploy (Vercel)

Import the repo in Vercel with the repo root as the project root. `vercel.json` builds the frontend (`frontend/dist`) and serves `api/index.py` as a Python function for `/api/*`.
