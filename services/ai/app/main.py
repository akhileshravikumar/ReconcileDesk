import hmac
import os
from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from pydantic import ValidationError
from app.summaries import SummaryRequest, enabled, make_payload, call_openai, parse_reply

app = FastAPI(title="ReconcileDesk AI service", version="0.1.0")
# Defence against accidental duplicate dispatch within this process. Durable request
# identity and budget reservations are owned by the API database.
_seen: set[str] = set()

@app.get("/health")
def health():
    return {"status": "ok", "service": "ai", "milestone": 5, "summaries_enabled": enabled()}

@app.post("/summaries")
async def summaries(request: Request):
    secret = os.getenv("AI_INTERNAL_TOKEN", "")
    supplied = request.headers.get("authorization", "")
    if len(secret) < 64 or not hmac.compare_digest(supplied.encode(), ("Bearer " + secret).encode()):
        raise HTTPException(403, "Internal service authorization required")
    if not enabled():
        raise HTTPException(503, "Live AI is disabled")
    body = bytearray()
    async for part in request.stream():
        body.extend(part)
        if len(body) > 16000:
            raise HTTPException(413, "Request exceeds the size limit")
    try:
        parsed = SummaryRequest.model_validate_json(body)
        payload = make_payload(parsed.context.model_dump())
    except (ValueError, ValidationError):
        raise HTTPException(400, "Invalid or oversized summary context") from None
    if parsed.requestId in _seen or len(_seen) >= 65536:
        raise HTTPException(409, "Request already dispatched or service request limit reached")
    _seen.add(parsed.requestId)
    try:
        raw = await run_in_threadpool(call_openai, payload)
        return parse_reply(raw)
    except Exception:
        # Do not log upstream exception text, request content, or credentials.
        raise HTTPException(502, "Provider request failed; usage may be unknown") from None
