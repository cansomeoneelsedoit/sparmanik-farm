from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.routers import (
    auth, inventory, recipes, sales, tasks, staff, accounting, forecast, plantings,
    sops, videos, suppliers, ai, harvest,
)

settings = get_settings()

app = FastAPI(
    title="Sparmanik Farm API",
    version="0.6.0",
    description="Cultivation OS backend",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(inventory.router)
app.include_router(recipes.router)
app.include_router(sales.router)
app.include_router(tasks.router)
app.include_router(staff.router)
app.include_router(accounting.router)
app.include_router(forecast.router)
app.include_router(plantings.router)
app.include_router(sops.router)
app.include_router(videos.router)
app.include_router(suppliers.router)
app.include_router(ai.router)
app.include_router(harvest.router)


@app.get("/")
def root():
    return {"name": "Sparmanik Farm API", "status": "ok", "env": settings.environment}


@app.get("/health")
def health():
    return {"status": "healthy"}
