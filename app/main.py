from contextlib import asynccontextmanager

from fastapi import FastAPI

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

app.include_router(sync_router)
app.include_router(fit_import_router)
