from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from models import AsyncSessionLocal, WikiComment

router = APIRouter(prefix="/api/wiki", tags=["wiki"])


class CommentIn(BaseModel):
    author: str = Field(..., min_length=1, max_length=50)
    body: str = Field(..., min_length=1)
    parent_id: int | None = None


def _serialize(c: WikiComment, replies: list[dict]) -> dict[str, Any]:
    return {
        "id": c.id,
        "parent_id": c.parent_id,
        "author": c.author,
        "body": c.body,
        "created_at": c.created_at.isoformat(),
        "replies": replies,
    }


@router.get("/comments")
async def list_comments() -> list[dict[str, Any]]:
    async with AsyncSessionLocal() as session:
        rows = (
            await session.execute(
                select(WikiComment).order_by(WikiComment.created_at)
            )
        ).scalars().all()

    by_id = {c.id: c for c in rows}
    # Build tree: top-level first, then attach replies
    top: list[dict] = []
    children: dict[int, list[dict]] = {}

    for c in rows:
        children[c.id] = []

    for c in rows:
        if c.parent_id is not None:
            children.setdefault(c.parent_id, [])

    # Two-pass: build leaf nodes first, then parents
    serialized: dict[int, dict] = {}
    for c in sorted(rows, key=lambda x: x.id, reverse=True):
        serialized[c.id] = _serialize(c, [])

    for c in rows:
        node = _serialize(c, [serialized[r.id] for r in rows if r.parent_id == c.id])
        serialized[c.id] = node

    for c in rows:
        if c.parent_id is None:
            top.append(serialized[c.id])

    return top


@router.post("/comments", status_code=201)
async def create_comment(body: CommentIn) -> dict[str, Any]:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            if body.parent_id is not None:
                parent = await session.get(WikiComment, body.parent_id)
                if not parent:
                    raise HTTPException(status_code=404, detail="Parent comment not found")
                if parent.parent_id is not None:
                    raise HTTPException(status_code=400, detail="Only one level of replies allowed")
            comment = WikiComment(
                parent_id=body.parent_id,
                author=body.author.strip(),
                body=body.body.strip(),
            )
            session.add(comment)
            await session.flush()
            await session.refresh(comment)
            return _serialize(comment, [])


@router.delete("/comments/{comment_id}", status_code=200)
async def delete_comment(comment_id: int) -> dict[str, bool]:
    async with AsyncSessionLocal() as session:
        async with session.begin():
            comment = await session.get(WikiComment, comment_id)
            if not comment:
                raise HTTPException(status_code=404, detail="Comment not found")
            await session.delete(comment)
    return {"ok": True}
