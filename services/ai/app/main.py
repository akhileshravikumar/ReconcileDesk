from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="ReconcileDesk AI service", version="0.1.0")

class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "ai"
    milestone: int = 2
    summaries_enabled: bool = False

@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse()
