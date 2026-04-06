import os

from supabase import Client, create_client

_client: Client | None = None


def get_supabase() -> Client:
    """Return a singleton Supabase client (supabase-py) from env."""
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY environment variables must be set"
            )
        _client = create_client(url, key)
    return _client
