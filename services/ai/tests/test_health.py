from fastapi.testclient import TestClient
from app.main import app
client = TestClient(app)

def test_health_does_not_claim_ai_is_enabled():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["summaries_enabled"] is False

def test_summary_route_requires_internal_authentication():
    assert client.post("/summaries", json={}).status_code == 403
