"""Shared pagination dependency + Page[T] envelope (docs/04)."""

from dataclasses import dataclass
from math import ceil
from typing import Generic, TypeVar

from fastapi import Depends, Query
from pydantic import BaseModel

T = TypeVar("T")


@dataclass
class PageRequest:
    page: int = 1
    page_size: int = 20

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def pagination(
    page: int = Query(1, ge=1, le=10_000),
    page_size: int = Query(20, ge=1, le=100),
) -> PageRequest:
    return PageRequest(page=page, page_size=page_size)


PageDep = Depends(pagination)
PageT = TypeVar("PageT")


class Page(BaseModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int
    pages: int

    @classmethod
    def build(cls, items: list[T], *, total: int, req: PageRequest) -> "Page[T]":
        return cls(
            items=items,
            page=req.page,
            page_size=req.page_size,
            total=total,
            pages=ceil(total / req.page_size) if req.page_size else 0,
        )
