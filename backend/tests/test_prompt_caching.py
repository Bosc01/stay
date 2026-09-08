"""The cached prefix has to stay byte identical, or caching silently never hits.

Anthropic prompt caching is a prefix match: any byte change anywhere in the
cached span invalidates it. These tests guard the property that makes it work,
namely that everything varying per request sits after the breakpoint.
"""

from conftest import sample_intake
from prompts.system import SYSTEM_PROMPT

# Claude Sonnet 5 will not create a cache entry below this many tokens. The
# check below is a deliberately loose character proxy, just enough to catch
# someone trimming the prompt to the point where caching quietly stops.
MIN_CACHEABLE_TOKENS = 1024
ROUGH_CHARS_PER_TOKEN = 4


def sent_blocks(fake) -> list:
    assert fake.messages.calls, "expected the triage route to call Claude"
    return fake.messages.calls[0]["system"]


def test_system_is_sent_as_blocks(client, fake_claude):
    fake = fake_claude()
    client.post("/triage", json=sample_intake())

    blocks = sent_blocks(fake)
    assert isinstance(blocks, list)
    assert all(b["type"] == "text" for b in blocks)


def test_first_block_is_the_static_prompt_and_is_cached(client, fake_claude):
    fake = fake_claude()
    client.post("/triage", json=sample_intake())

    first = sent_blocks(fake)[0]
    assert first["text"] == SYSTEM_PROMPT
    assert first["cache_control"] == {"type": "ephemeral"}


def test_only_the_static_block_carries_a_breakpoint(client, fake_claude):
    """Later blocks vary per request, so caching them would waste writes."""
    fake = fake_claude()
    client.post("/triage", json=sample_intake(sudden_onset=True))

    blocks = sent_blocks(fake)
    assert len(blocks) == 3
    assert "cache_control" in blocks[0]
    assert all("cache_control" not in b for b in blocks[1:])


def test_cached_block_is_identical_across_different_owners(client, fake_claude):
    """The whole point: different intakes must share one cache entry."""
    first = fake_claude()
    client.post(
        "/triage",
        json=sample_intake(owner_experience="First-time owner", sudden_onset=True),
    )

    second = fake_claude()
    client.post(
        "/triage",
        json=sample_intake(
            owner_experience="Experienced owner",
            prior_training="Yes, didn't help",
            dog_name="Bear",
            triggers=["Other dogs"],
        ),
    )

    assert sent_blocks(first)[0]["text"] == sent_blocks(second)[0]["text"]


def test_owner_context_lands_after_the_breakpoint(client, fake_claude):
    fake = fake_claude()
    client.post("/triage", json=sample_intake(owner_experience="First-time owner"))

    blocks = sent_blocks(fake)
    assert "First-time owner" in blocks[1]["text"]
    assert "First-time owner" not in blocks[0]["text"]


def test_static_prompt_stays_above_the_cacheable_minimum():
    """Below the minimum, the API accepts cache_control and just never caches."""
    estimated_tokens = len(SYSTEM_PROMPT) / ROUGH_CHARS_PER_TOKEN
    assert estimated_tokens > MIN_CACHEABLE_TOKENS, (
        f"static prompt is about {estimated_tokens:.0f} estimated tokens, at or "
        f"below the {MIN_CACHEABLE_TOKENS} token minimum, so prompt caching "
        "would silently stop working"
    )
