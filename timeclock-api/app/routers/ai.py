import json
import httpx
import google.auth
import google.auth.transport.requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models.shared import User
from sqlalchemy.orm import Session
from sqlalchemy import text as sa_text

router = APIRouter(prefix="/ai", tags=["AI"])

_credentials = None


def _get_access_token() -> str:
    """Mint/refresh an OAuth access token for Vertex AI via Application Default Credentials."""
    global _credentials
    if _credentials is None:
        _credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
    if not _credentials.valid:
        _credentials.refresh(google.auth.transport.requests.Request())
    return _credentials.token


def gemini_url() -> str:
    location = settings.GOOGLE_CLOUD_LOCATION
    host = "aiplatform.googleapis.com" if location == "global" else f"{location}-aiplatform.googleapis.com"
    return (
        f"https://{host}/v1/"
        f"projects/{settings.GOOGLE_CLOUD_PROJECT}/locations/{location}"
        f"/publishers/google/models/{settings.GEMINI_MODEL}:generateContent"
    )


class AnalyzeWorkRequest(BaseModel):
    description: str
    company_id: str
    project_name: str | None = None
    duration_minutes: int | None = None


class AnalyzeWorkResponse(BaseModel):
    budget_code_id: str | None = None
    budget_code: str | None = None
    budget_code_name: str | None = None
    summary: str | None = None


def _load_budget_codes(company_id: str, db: Session) -> list[dict]:
    rows = db.execute(sa_text("""
        SELECT
            bc.id::text,
            bc.code,
            bc.name,
            bcat.name AS category,
            d.name    AS division
        FROM public.budget_codes bc
        JOIN public.budget_categories bcat ON bcat.id = bc.category_id
        JOIN public.divisions d             ON d.id   = bcat.division_id
        WHERE bc.is_active = true
          AND (bc.company_id IS NULL OR bc.company_id = :company_id)
        ORDER BY d.sort_order, bcat.sort_order, bc.code
    """), {"company_id": company_id}).fetchall()
    return [{"id": r.id, "code": r.code, "name": r.name, "category": r.category, "division": r.division} for r in rows]


@router.post("/analyze-work", response_model=AnalyzeWorkResponse)
async def analyze_work(
    body: AnalyzeWorkRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not settings.GOOGLE_CLOUD_PROJECT:
        raise HTTPException(status_code=503, detail="AI service not configured")

    if not body.description.strip():
        return AnalyzeWorkResponse()

    budget_codes = _load_budget_codes(body.company_id, db)

    context_parts = []
    if body.project_name:
        context_parts.append(f"Project: {body.project_name}")
    if body.duration_minutes:
        h = body.duration_minutes // 60
        m = body.duration_minutes % 60
        context_parts.append(f"Duration: {h}h {m}m")

    context = "\n".join(context_parts)

    code_list = "\n".join(
        f'  {{"id": "{c["id"]}", "code": "{c["code"]}", "name": "{c["name"]}", "division": "{c["division"]}", "category": "{c["category"]}"}}'
        for c in budget_codes
    )

    prompt = f"""You are a construction work log analyzer. Analyze this work description and match it to the single best budget code.

{context}
Work description: {body.description}

Available budget codes (choose exactly one):
[
{code_list}
]

Return ONLY a JSON object (no markdown, no explanation):
{{
  "budget_code_id": "<id from list above>",
  "budget_code": "<code field>",
  "budget_code_name": "<name field>",
  "summary": "One sentence summary of the work performed"
}}

Rules:
- Pick the single most specific matching budget code
- If no code matches at all, set budget_code_id to null
- summary must describe the actual work done, not the budget code
"""

    try:
        access_token = _get_access_token()
    except Exception:
        raise HTTPException(status_code=503, detail="AI service not configured")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            gemini_url(),
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1, "maxOutputTokens": 300},
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="AI service error")

    try:
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        data = json.loads(text)

        # Validate that the returned id actually exists in our list
        valid_ids = {c["id"] for c in budget_codes}
        returned_id = data.get("budget_code_id")
        if returned_id and returned_id not in valid_ids:
            returned_id = None

        return AnalyzeWorkResponse(
            budget_code_id=returned_id,
            budget_code=data.get("budget_code") if returned_id else None,
            budget_code_name=data.get("budget_code_name") if returned_id else None,
            summary=data.get("summary"),
        )
    except Exception:
        return AnalyzeWorkResponse()
