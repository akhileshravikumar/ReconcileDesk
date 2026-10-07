import socket
import pytest
from app.main import _seen

@pytest.fixture(autouse=True)
def offline_only(monkeypatch):
    monkeypatch.setenv("AI_SUMMARIES_ENABLED", "false")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("AI_INTERNAL_TOKEN", raising=False)
    _seen.clear()
    def deny_network(*args, **kwargs):
        raise AssertionError("Tests must never make paid or external network calls")
    monkeypatch.setattr(socket.socket, "connect", deny_network)
