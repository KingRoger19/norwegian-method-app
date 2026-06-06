from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.activities import router as activities_router
from app.routers.athlete import router as athlete_router
from app.routers.auth import router as auth_router
from app.routers.dashboard import router as dashboard_router
from app.routers.fit_import import router as fit_import_router
from app.routers.sync import router as sync_router
from app.scheduler import scheduler, setup_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_scheduler()
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="Norwegian Method App",
    description="Training analytics backend for Norwegian Method endurance athletes.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(athlete_router)
app.include_router(dashboard_router)
app.include_router(activities_router)
app.include_router(sync_router)
app.include_router(fit_import_router)
