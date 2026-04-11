from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select
from datetime import datetime

from app.database import get_db
from app.models import Recipe, RecipeIngredient, RecipeComment, User
from app.schemas.recipes import (
    RecipeCreate, RecipeUpdate, RecipeOut, RecipeListItem,
    RecipeCommentCreate, RecipeCommentOut,
)
from app.auth import get_current_user, require_owner

router = APIRouter(prefix="/api/recipes", tags=["recipes"])


def _load(db: Session, recipe_id: int) -> Recipe:
    stmt = (
        select(Recipe)
        .where(Recipe.id == recipe_id)
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.comments))
    )
    r = db.scalar(stmt)
    if not r:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return r


@router.get("", response_model=list[RecipeListItem])
def list_recipes(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Recipe).options(selectinload(Recipe.ingredients)).order_by(Recipe.name_en)
    recipes = db.scalars(stmt).all()
    return [
        RecipeListItem(
            id=r.id,
            name_en=r.name_en,
            name_id=r.name_id or "",
            crop_target_en=r.crop_target_en,
            crop_target_id=r.crop_target_id or "",
            stage_en=r.stage_en or "",
            stage_id=r.stage_id or "",
            ec_target=r.ec_target,
            ph_target=r.ph_target,
            author=r.author or "",
            locked=r.locked,
            version=r.version,
            ingredient_count=len(r.ingredients),
        )
        for r in recipes
    ]


@router.get("/{recipe_id}", response_model=RecipeOut)
def get_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return _load(db, recipe_id)


@router.post("", response_model=RecipeOut)
def create_recipe(
    payload: RecipeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = payload.model_dump(exclude={"ingredients"})
    if not data.get("author"):
        data["author"] = user.name
    recipe = Recipe(**data, locked=False, version=1)
    db.add(recipe)
    db.flush()
    for i, ing in enumerate(payload.ingredients):
        db.add(RecipeIngredient(
            recipe_id=recipe.id,
            position=i,
            name=ing.name,
            group=ing.group,
            section=ing.section,
            doses=ing.doses,
            supplier=ing.supplier,
        ))
    db.commit()
    return _load(db, recipe.id)


@router.patch("/{recipe_id}", response_model=RecipeOut)
def update_recipe(
    recipe_id: int,
    payload: RecipeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    recipe = _load(db, recipe_id)
    if recipe.locked:
        raise HTTPException(
            status_code=400,
            detail="Recipe is locked. Unlock it before editing.",
        )

    data = payload.model_dump(exclude_unset=True, exclude={"ingredients"})
    for k, v in data.items():
        setattr(recipe, k, v)

    if payload.ingredients is not None:
        # Replace all ingredients
        for old in list(recipe.ingredients):
            db.delete(old)
        db.flush()
        for i, ing in enumerate(payload.ingredients):
            db.add(RecipeIngredient(
                recipe_id=recipe.id,
                position=i,
                name=ing.name,
                group=ing.group,
                section=ing.section,
                doses=ing.doses,
                supplier=ing.supplier,
            ))

    recipe.version = (recipe.version or 1) + 1
    recipe.modified_at = datetime.utcnow()
    db.commit()
    return _load(db, recipe.id)


@router.post("/{recipe_id}/lock", response_model=RecipeOut)
def lock_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    recipe = _load(db, recipe_id)
    recipe.locked = True
    db.commit()
    return _load(db, recipe.id)


@router.post("/{recipe_id}/unlock", response_model=RecipeOut)
def unlock_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    recipe = _load(db, recipe_id)
    recipe.locked = False
    db.commit()
    return _load(db, recipe.id)


@router.post("/{recipe_id}/clone", response_model=RecipeOut)
def clone_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    original = _load(db, recipe_id)
    copy = Recipe(
        name_en=original.name_en + " (copy)",
        name_id=(original.name_id or "") + " (salinan)" if original.name_id else "",
        crop_target_en=original.crop_target_en,
        crop_target_id=original.crop_target_id,
        stage_en=original.stage_en,
        stage_id=original.stage_id,
        ec_target=original.ec_target,
        ph_target=original.ph_target,
        concentrates=list(original.concentrates or [1, 5, 25, 50]),
        instructions_en=original.instructions_en,
        instructions_id=original.instructions_id,
        notes_en=original.notes_en,
        notes_id=original.notes_id,
        author=user.name,
        locked=False,
        version=1,
    )
    db.add(copy)
    db.flush()
    for i, ing in enumerate(original.ingredients):
        db.add(RecipeIngredient(
            recipe_id=copy.id,
            position=i,
            name=ing.name,
            group=ing.group,
            section=ing.section,
            doses=dict(ing.doses or {}),
            supplier=ing.supplier,
        ))
    db.commit()
    return _load(db, copy.id)


@router.post("/{recipe_id}/comments", response_model=RecipeCommentOut)
def add_comment(
    recipe_id: int,
    payload: RecipeCommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    recipe = _load(db, recipe_id)
    if recipe.locked:
        raise HTTPException(
            status_code=400,
            detail="Cannot add comments to a locked recipe. Unlock it first.",
        )
    comment = RecipeComment(
        recipe_id=recipe.id,
        author=user.name,
        text=payload.text,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/{recipe_id}", status_code=204)
def delete_recipe(
    recipe_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_owner),
):
    """Only Boyd, Bintang, Erni can delete."""
    recipe = _load(db, recipe_id)
    db.delete(recipe)
    db.commit()
