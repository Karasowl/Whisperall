import logging

log = logging.getLogger(__name__)


def record_usage_event(
    db,
    *,
    user_id: str,
    module: str,
    provider: str,
    model: str | None,
    resource: str,
    units: int,
    metadata: dict | None = None,
) -> None:
    """Best-effort insert into usage_events (safe to call even if table is missing)."""
    if not db:
        return
    if units <= 0:
        return

    row = {
        "user_id": user_id,
        "module": module,
        "provider": provider,
        "model": model,
        "resource": resource,
        "units": int(units),
        "metadata": metadata or None,
    }
    try:
        db.table("usage_events").insert(row).execute()
    except Exception as exc:
        # Don't break product flows due to missing analytics tables.
        log.debug("usage_events insert failed: %s", exc)

