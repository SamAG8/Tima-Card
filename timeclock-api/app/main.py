from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import entries, approvals, leave, reports, team, rates, settings as settings_router, ai, budget_codes

app = FastAPI(
    title="Time Clock API",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(entries.router,          prefix="/api/v1")
app.include_router(approvals.router,        prefix="/api/v1")
app.include_router(leave.router,            prefix="/api/v1")
app.include_router(reports.router,          prefix="/api/v1")
app.include_router(team.router,             prefix="/api/v1")
app.include_router(rates.router,            prefix="/api/v1")
app.include_router(settings_router.router,  prefix="/api/v1")
app.include_router(ai.router,               prefix="/api/v1")
app.include_router(budget_codes.router,     prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok", "app": "timeclock-api"}
