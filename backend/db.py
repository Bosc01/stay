import os
from functools import lru_cache

from supabase import Client, create_client


# One client for the process: building one per call cost a fresh HTTP client
# and connection on every query. A missing env var raises and is not cached.
@lru_cache(maxsize=1)
def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_KEY environment variables must be set"
        )
    return create_client(url, key)
