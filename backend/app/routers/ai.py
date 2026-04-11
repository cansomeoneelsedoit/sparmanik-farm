import json
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app.config import get_settings
from app.models import (
    Sale, StaffWage, Task, task_assignees, InventoryItem, Recipe, RecipeIngredient,
    Supplier, AccountingEntry, ForecastBudget, Planting, Sop, User,
)
from app.schemas.sops import AiGenerateRequest, AiGenerateResponse
from app.schemas.ai import ChatRequest, ChatResponse
from app.auth import get_current_user

router = APIRouter(prefix="/api/ai", tags=["ai"])

settings = get_settings()


def _get_client():
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="Anthropic API key not configured. Add ANTHROPIC_API_KEY to backend env vars.",
        )
    try:
        from anthropic import Anthropic
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="Anthropic SDK not installed. Add anthropic to requirements.txt.",
        )
    return Anthropic(api_key=settings.anthropic_api_key)


@router.get("/status")
def ai_status():
    return {
        "configured": bool(settings.anthropic_api_key),
        "model": "claude-sonnet-4-20250514",
    }


@router.post("/generate-sop", response_model=AiGenerateResponse)
def generate_sop(
    payload: AiGenerateRequest,
    user: User = Depends(get_current_user),
):
    client = _get_client()
    lang_name = "Bahasa Indonesia" if payload.lang == "id" else "English"

    system = (
        "You are writing a standard operating procedure for Sparmanik Farm, "
        "a hydroponic farm in Sumatera Utara, Indonesia, that grows chillies and yellow melons. "
        f"Write the SOP in {lang_name}. "
        "Be specific, practical, and concise. Use the bullets the user provides as the foundation, "
        "but flesh them out with the missing details a farm worker would need. "
        "Do not use markdown formatting, bold text, or em dashes. Use simple sentences. "
        "Return ONLY a JSON object with these exact keys: description (1-2 sentence summary), "
        "steps (array of 4-10 short clear instruction strings), safety_notes (string of important safety warnings or empty), "
        "frequency (string like 'Daily' or 'Every 3 days' or 'Weekly' or empty)."
    )

    user_msg = (
        f"Title: {payload.title}\n"
        f"Category: {payload.category}\n\n"
        f"Key points:\n{payload.bullets}\n\n"
        "Generate the JSON now. Return only the JSON, no preamble."
    )

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Anthropic API error: {str(e)}")

    text = ""
    for block in response.content:
        if block.type == "text":
            text += block.text

    # Strip code fences if Claude added them
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="AI returned invalid JSON. Try regenerating.",
        )

    return AiGenerateResponse(
        description=parsed.get("description", ""),
        steps=parsed.get("steps", []),
        safety_notes=parsed.get("safety_notes", ""),
        frequency=parsed.get("frequency", ""),
    )


@router.post("/chat", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    client = _get_client()
    context = _build_farm_context(db)
    lang_name = "Bahasa Indonesia" if payload.lang == "id" else "English"

    system = (
        "You are an assistant for Sparmanik Farm, a hydroponic farm in Sumatera Utara growing chillies and melons. "
        "Answer questions about the farm using ONLY the data below. Be concise and specific. "
        "Use the data to give exact numbers, dates, and names. "
        "If the data does not contain the answer, say so honestly. "
        f"Respond in {lang_name}. "
        "Do not use markdown, bold, or em dashes.\n\n"
        f"FARM DATA:\n{context}"
    )

    # Build message history
    messages = []
    for m in payload.history:
        messages.append({"role": m.role, "content": m.text})
    messages.append({"role": "user", "content": payload.question})

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            system=system,
            messages=messages,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Anthropic API error: {str(e)}")

    text = ""
    for block in response.content:
        if block.type == "text":
            text += block.text

    return ChatResponse(text=text or "I could not generate a response. Try rephrasing.")


def _build_farm_context(db: Session) -> str:
    """Compact text representation of all farm data, for stuffing into the system prompt."""
    lines = []
    today = date.today()
    lines.append(f"Today: {today.isoformat()}")
    lines.append("")

    # Sales (last 15)
    sales = db.scalars(select(Sale).order_by(Sale.date.desc()).limit(15)).all()
    lines.append(f"SALES (showing latest {len(sales)} of all entries):")
    for s in sales:
        total = s.weight_kg * s.price_per_kg
        lines.append(
            f"- {s.date} W{s.week} {s.species} Grade {s.grade} {s.weight_kg}kg "
            f"@{int(s.price_per_kg)}/kg = {int(total)}"
        )
    lines.append("")

    # Staff wages
    wages = db.scalars(select(StaffWage)).all()
    lines.append("STAFF WAGES:")
    for w in wages:
        total = w.hours * w.hourly_rate
        lines.append(
            f"- {w.name} ({w.role}) W{w.week} {w.hours}h @{int(w.hourly_rate)} = {int(total)}"
        )
    lines.append("")

    # Tasks with assignees
    tasks = db.scalars(select(Task)).all()
    lines.append("TASKS:")
    for t in tasks:
        ass = db.execute(
            select(task_assignees.c.assignee_name).where(task_assignees.c.task_id == t.id)
        ).all()
        names = ",".join(a[0] for a in ass)
        done = "[DONE] " if t.done else ""
        notes = f" | {t.notes}" if t.notes else ""
        lines.append(f"- {done}{t.title} | due {t.due_date} | {t.priority} | {names}{notes}")
    lines.append("")

    # Inventory
    inv = db.scalars(select(InventoryItem)).all()
    lines.append("INVENTORY:")
    for i in inv:
        if i.quantity == 0:
            status = "OUT OF STOCK"
        elif i.quantity <= i.reorder_level:
            status = "LOW"
        else:
            status = "OK"
        lines.append(
            f"- {i.name} [{i.category}] {i.quantity} {i.unit} "
            f"(reorder {i.reorder_level}) {status} @{int(i.cost_per_unit)}/unit"
        )
    lines.append("")

    # Recipes
    recipes = db.scalars(select(Recipe)).all()
    lines.append("NUTRIENT RECIPES:")
    for r in recipes:
        lines.append(
            f"- {r.name_en} for {r.crop_target_en} {r.stage_en} "
            f"EC {r.ec_target} pH {r.ph_target}"
        )
        ings = db.scalars(
            select(RecipeIngredient).where(RecipeIngredient.recipe_id == r.id)
        ).all()
        for ing in ings[:8]:
            lines.append(f"  · {ing.name} ({ing.group}/{ing.section})")
    lines.append("")

    # Suppliers
    sups = db.scalars(select(Supplier)).all()
    lines.append("SUPPLIERS:")
    for sp in sups:
        lines.append(
            f"- {sp.supplier_name} [{sp.category}] {sp.product_name} "
            f"Rp {int(sp.price)} +ship Rp {int(sp.shipping_cost)} = Rp {int(sp.total_cost)}"
        )
    lines.append("")

    # Accounting
    acct = db.scalars(select(AccountingEntry).order_by(AccountingEntry.date.desc()).limit(20)).all()
    lines.append(f"ACCOUNTING (latest {len(acct)} entries):")
    for a in acct:
        lines.append(
            f"- {a.date} {a.type} Rp {int(a.amount)} [{a.category}] {a.description}"
        )
    lines.append("")

    # Forecast
    fc = db.scalars(select(ForecastBudget)).all()
    lines.append("FORECAST BUDGETS:")
    for f in fc:
        lines.append(f"- {f.category}: budgeted Rp {int(f.budgeted)} for {f.period}")
    lines.append("")

    # Plantings
    plants = db.scalars(select(Planting)).all()
    lines.append("PLANTINGS:")
    for p in plants:
        lines.append(
            f"- {p.variety} {p.beds} planted {p.planting_date} "
            f"harvest {p.harvest_estimate} stage {p.stage}"
        )
    lines.append("")

    # SOPs
    sops = db.scalars(select(Sop).where(Sop.archived == False)).all()
    lines.append("ACTIVE SOPs:")
    for s in sops:
        lines.append(f"- {s.title} [{s.category}] v{s.version} {len(s.steps or [])} steps")

    return "\n".join(lines)
