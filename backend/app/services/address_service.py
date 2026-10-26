"""Address book CRUD (docs/04 §6, §8): max 10 per user, default swap."""

import uuid

from sqlalchemy import delete, func, select, update

from app.core.exceptions import ConflictError, NotFoundError
from app.models import Address, User
from app.schemas.checkout_schemas import AddressIn, AddressOut, AddressUpdateIn

MAX_ADDRESSES = 10


async def list_addresses(db, user: User) -> list[Address]:
    stmt = (
        select(Address)
        .where(Address.user_id == user.id)
        .order_by(Address.is_default.desc(), Address.created_at.desc())
    )
    return (await db.scalars(stmt)).all()


async def create_address(db, user: User, body: AddressIn) -> Address:
    count = await db.scalar(
        select(func.count()).select_from(Address).where(Address.user_id == user.id)
    )
    if int(count or 0) >= MAX_ADDRESSES:
        raise ConflictError("ADDRESS_LIMIT", f"Maximum {MAX_ADDRESSES} addresses")

    address = Address(user_id=user.id, **body.model_dump())
    if body.is_default:
        await _clear_default(db, user.id)
    db.add(address)
    await db.flush()
    return address


async def update_address(db, user: User, address_id: uuid.UUID, body: AddressUpdateIn) -> Address:
    address = await _get_own(db, user, address_id)
    patch = body.model_dump(exclude_unset=True)
    if patch.get("is_default"):
        await _clear_default(db, user.id)
    for field, value in patch.items():
        setattr(address, field, value)
    await db.flush()
    return address


async def delete_address(db, user: User, address_id: uuid.UUID) -> None:
    """Orders already hold an address snapshot, so the row can go."""
    result = await db.execute(
        delete(Address).where(Address.id == address_id, Address.user_id == user.id)
    )
    if result.rowcount == 0:
        raise NotFoundError()


async def _clear_default(db, user_id: uuid.UUID) -> None:
    await db.execute(
        update(Address).where(Address.user_id == user_id, Address.is_default).values(is_default=False)
    )


async def _get_own(db, user: User, address_id: uuid.UUID) -> Address:
    address = await db.scalar(
        select(Address).where(Address.id == address_id, Address.user_id == user.id)
    )
    if address is None:
        raise NotFoundError()
    return address


def to_out(address: Address) -> AddressOut:
    return AddressOut(
        id=address.id,
        line1=address.line1,
        line2=address.line2,
        city=address.city,
        state=address.state,
        postal_code=address.postal_code,
        country=address.country,
        phone=address.phone,
        is_default=address.is_default,
    )
