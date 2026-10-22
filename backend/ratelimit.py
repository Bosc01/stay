"""Per-client request limit for /triage.

The bucket is the owner's address. Getting that right depends on the host:
on Render every public request passes through Cloudflare, which overwrites
CF-Connecting-IP on every request, while X-Forwarded-For is only appended to,
so its left side is whatever the caller chose to send. The left side is never
trusted here.
"""

import ipaddress
import logging
import os
import threading
from datetime import datetime, timedelta

from fastapi import Request

from db import get_supabase

logger = logging.getLogger(__name__)

_rate_limit: dict[str, list[datetime]] = {}
_rate_limit_lock = threading.Lock()
RATE_LIMIT = 10  # requests
RATE_WINDOW = 3600  # 1 hour in seconds
MAX_TRACKED_IPS = 10_000  # backstop so the limiter cannot grow without bound

# "memory" or "supabase". Memory stays the default until the Supabase table is
# confirmed in production, then the memory path can go. The Supabase store
# needs SUPABASE_KEY to be the service role key (sql/triage_rate_limit.sql).
RATE_LIMIT_STORE = os.environ.get("RATE_LIMIT_STORE", "memory").strip().lower()


def client_ip_header(environ) -> str:
    """The header that carries the real client address, or "" for the peer.

    Only a header the platform overwrites is safe to read. Render sets
    RENDER=true, and its public traffic always arrives through Cloudflare.
    Elsewhere set CLIENT_IP_HEADER to the platform's equivalent (Railway
    documents x-real-ip), or leave it unset to key on the direct peer.
    """
    default = "cf-connecting-ip" if environ.get("RENDER") == "true" else ""
    return environ.get("CLIENT_IP_HEADER", default).strip().lower()


CLIENT_IP_HEADER = client_ip_header(os.environ)


def client_ip(request: Request) -> str:
    """The bucket a request counts against.

    IPv6 is bucketed by /64, because one connection usually controls the whole
    block and could otherwise take a fresh address for every request.
    """
    host = request.headers.get(CLIENT_IP_HEADER, "").strip() if CLIENT_IP_HEADER else ""
    if not host:
        host = request.client.host if request.client else "unknown"
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return host
    if ip.version == 6:
        if ip.ipv4_mapped:
            return str(ip.ipv4_mapped)
        return str(ipaddress.ip_network(f"{ip}/64", strict=False))
    return str(ip)


def _prune(now: datetime) -> None:
    """Drop buckets whose hits have all aged out, then cap what is left."""
    window_start = now - timedelta(seconds=RATE_WINDOW)
    for key in [k for k, hits in _rate_limit.items() if not hits or hits[-1] <= window_start]:
        del _rate_limit[key]

    overflow = len(_rate_limit) - MAX_TRACKED_IPS
    if overflow > 0:
        # Evict least recently seen rather than refusing new callers.
        for key, _ in sorted(_rate_limit.items(), key=lambda kv: kv[1][-1])[:overflow]:
            del _rate_limit[key]


def _record_and_check(key: str, now: datetime) -> bool:
    """Record this hit. Returns True when the caller is over the limit."""
    # Handlers can run in the threadpool, so read, check and append must be one
    # step or parallel requests all see a count under the limit.
    with _rate_limit_lock:
        window_start = now - timedelta(seconds=RATE_WINDOW)
        hits = [t for t in _rate_limit.get(key, []) if t > window_start]

        over_limit = len(hits) >= RATE_LIMIT
        if not over_limit:
            hits.append(now)
        _rate_limit[key] = hits

        # Prune after writing, so the cap holds counting the entry just added.
        _prune(now)
        return over_limit


def allow_request(key: str) -> bool:
    """Count one request for key, or return False once it is over the limit.

    With RATE_LIMIT_STORE=supabase the count lives in triage_rate_limit, so a
    restart does not reset it. Any failure there falls back to the in-memory
    counter, so a Supabase outage neither blocks owners nor drops the limit.
    """
    if RATE_LIMIT_STORE == "supabase":
        try:
            res = get_supabase().rpc(
                "triage_rate_limit_hit",
                {"p_key": key, "p_limit": RATE_LIMIT, "p_window_seconds": RATE_WINDOW},
            ).execute()
            if isinstance(res.data, bool):
                return res.data
            logger.warning("rate limit store returned %r, using memory", res.data)
        except Exception:
            logger.exception("rate limit store error, using memory")
    return not _record_and_check(key, datetime.now())
