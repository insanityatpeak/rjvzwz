# Wind Forecast Monitor

Web app for a day-ahead power buying team. It shows (1) the latest national wind generation forecast that was available when a buying decision had to be made, and (2) how accurate those forecasts were against actual generation. Data: Elexon BMRS only, `WINDFOR` (forecasts) and `FUELHH` with `fuelType=WIND` (actuals). Scope: delivery days 1-31 January 2026.

**Live app:** https://rjvzwz.vercel.app

## How it works

- **Decision time.** For delivery day D, the decision cutoff is a configurable UK-local hour (default 09:00) on D-1. For each target hour the app uses the forecast with the latest `publishTime` at or before the cutoff. Equal publication times use the last input row. Each series point includes `forecast_age_hours`, the time from publication to the cutoff.
- **Alignment and coverage.** Forecasts are hourly, actuals are 30-minute. Duplicate actual timestamps use the last row before hourly averaging. An hour is complete only when both half-hours are present; a single half-hour remains usable and is flagged with `actual_complete: false`. Missing actuals remain null. `overall.coverage` reports `matched_hours`, `missing_actual_hours` and `incomplete_actual_hours`; incomplete hours are included in matched hours and metrics. Error = forecast - actual, so positive bias means over-forecast.
- **Metrics.** MAE is the average absolute miss; RMSE gives larger misses more weight. MAPE skips zero actuals and reports its sample count as `mape_n`. WAPE is total absolute error divided by total actual generation, as a percentage; it is null when total actual generation is zero. `over_forecast_share` is the fraction (0–1) of matched hours with positive error. `mean_over_error` and `mean_under_error` are the mean signed errors within those groups, or null if a group is empty. Exact matches belong to neither group.
- **P90.** The absolute-error threshold uses nearest rank: sort the n absolute errors and take the `ceil(0.9 * n)`-th value, counting from one. With no matched hours it is null. Metrics are shown overall, per day, per UK hour and per forecast lead time.
- **Lead times.** Horizon buckets include all published forecasts with matched actuals, not just the decision-time selection. `n` counts publications and `distinct_hours` counts their distinct target hours; `sparse` is true below 24 distinct hours. Buckets include the lower boundary and exclude the upper boundary. `horizon_excluded` counts publications targeting the selected delivery window whose lead time is negative or at least 48 hours, whether or not an actual is available.
- **Decision view.** The forecast endpoint returns `p90_abs_error`, `calibration_days` (days with at least one matched hour) and `calibration_note`. Its optional `calibration=retrospective|prior` parameter defaults to retrospective, using all January delivery days as before. Prior mode uses only January delivery days strictly before the selected day and needs at least three matched days; otherwise the P90 is null and the note explains why. The UI offers both modes and shows no band when P90 is null. Prior mode uses currently available actual publications, not a reconstruction of actuals available at the buying cutoff. Neither band is a guaranteed prediction interval.
- **Upstream quality.** Actual publication requests extend six hours beyond the last delivery day, capped at the current time; analysis still filters by delivery time. Chunk overlaps are deduplicated by target and publication time for WINDFOR, or target time for FUELHH, with the last row winning. Invalid timestamps or missing/non-numeric/non-finite generation are skipped. Both endpoints expose `meta.skipped_records`, counted across their fetched publication windows. Invalid JSON or a non-list response produces a sanitised 502 error.
- **Data note.** `FUELHH` is metered transmission-level output, whereas `WINDFOR` also covers embedded wind, so a positive bias (over-forecast vs `FUELHH`) is expected.
- Elexon responses are cached in memory for one hour; there is no database. Expired entries are removed on writes, the cache keeps at most 64 entries in write order, and simultaneous misses for the same key share a loader call.

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
