"""User address book routes (docs/04 §8)."""

import uuid

from fastapi import APIRouter, status

from app.core.deps import DbDep, UserDep
from app.routers import API_PREFIX
from app.schemas.checkout_schemas import AddressIn, AddressOut, AddressUpdateIn
from app.services import address_service

router = APIRouter(prefix=f"{API_PREFIX}/users/addresses", tags=["addresses"])


@router.get("", response_model=list[AddressOut])
async def list_addresses(user: UserDep, db: DbDep) -> list[AddressOut]:
    return [address_service.to_out(a) for a in await address_service.list_addresses(db, user)]


@router.post("", response_model=AddressOut, status_code=status.HTTP_201_CREATED)
async def create_address(body: AddressIn, user: UserDep, db: DbDep) -> AddressOut:
    return address_service.to_out(await address_service.create_address(db, user, body))


@router.patch("/{address_id}", response_model=AddressOut)
async def update_address(
    address_id: uuid.UUID, body: AddressUpdateIn, user: UserDep, db: DbDep
) -> AddressOut:
    return address_service.to_out(await address_service.update_address(db, user, address_id, body))


@router.delete("/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(address_id: uuid.UUID, user: UserDep, db: DbDep) -> None:
    await address_service.delete_address(db, user, address_id)
