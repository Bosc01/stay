#!/usr/bin/env python3
"""
Shelter outreach research and draft generation.

Finds shelters in a state or metro area, keeps only the ones with a named
contact and a checkable detail, drafts one email per shelter, and writes the
rows to outreach_targets for review at /admin/outreach.

Nothing is sent from here. Review and send happen by hand.

Example from repo root:
  python scripts/find_shelters.py "Austin, TX"
  python scripts/find_shelters.py "Texas" --limit 15 --dry-run

Requires: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY, and the
outreach_targets table (backend/sql/outreach_targets.sql).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
_BACKEND_DIR = _REPO_ROOT / "backend"
load_dotenv(_BACKEND_DIR / ".env")

if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import anthropic  # noqa: E402

from db import get_supabase  # noqa: E402

# Matches the model the rest of Stay uses (see CLAUDE.md).
MODEL = "claude-sonnet-4-6"
SENDER_NAME = os.environ.get("OUTREACH_SENDER_NAME", "Harekas")
REPLY_EMAIL = "hello@trystay.org"
MAX_DRAFT_WORDS = 150
DRAFT_ATTEMPTS = 3
SEARCH_MAX_USES = 40
MAX_PAUSE_RESTARTS = 6
USER_AGENT = "Mozilla/5.0 (compatible; StayOutreachCheck/1.0; +https://trystay.org)"

# A person at one of these addresses is still reachable, but the address itself
# is a shared inbox, so it does not go in the draft as a personal contact.
GENERIC_MAILBOXES = {
    "info", "contact", "hello", "admin", "office", "general", "mail",
    "inquiries", "enquiries", "webmaster", "support", "questions", "help",
}

# Words that show up where a person's name should be.
NOT_A_PERSON = {
    "team", "staff", "department", "dept", "office", "committee", "group",
    "services", "center", "centre", "shelter", "rescue", "society", "manager",
    "coordinator", "director", "volunteer", "volunteers", "adoption",
    "adoptions", "behavior", "behaviour", "info", "contact", "admin",
}

TARGET_SCHEMA = {
    "type": "object",
    "properties": {
        "targets": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "org_name": {"type": "string"},
                    "city": {"type": "string"},
                    "website": {"type": "string"},
                    "contact_name": {"type": "string"},
                    "contact_title": {"type": "string"},
                    "contact_email": {"type": ["string", "null"]},
                    "specific_detail": {"type": "string"},
                    "detail_source_url": {"type": "string"},
                },
                "required": [
                    "org_name",
                    "city",
                    "website",
                    "contact_name",
                    "contact_title",
                    "contact_email",
                    "specific_detail",
                    "detail_source_url",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["targets"],
    "additionalProperties": False,
}

RESEARCH_SYSTEM = """You research animal shelters and rescues so that one volunteer can write to a real person there.

Search the web for every claim. Never invent or guess a name, a title, an email address, or a URL. If you cannot confirm something on a page you actually opened, leave that shelter out and move to the next one. Returning four solid shelters is a better result than twelve shaky ones.

A shelter only counts when you have all of this:
- The organization name and the city it operates in.
- Its website.
- One named person who works on adoptions, behavior, foster, or animal care, with a first name, a last name, and their title. A department, a team, or a shared mailbox is not a person. If a named person is all you cannot find, skip the shelter.
- That person's email address, but only when it is printed on a page you read. Otherwise return null. Never assemble an address out of a pattern you saw elsewhere.
- One specific detail about that shelter that a reader could check. A behavior or training program they run, an intake or live release number they published, a recent campaign, a building they opened, a grant they received. Caring for animals and serving the community are not details.
- The URL of the page the detail came from. The detail has to be stated on that page.

Prefer shelters that do behavior work or run a foster program."""


def _draft_system() -> str:
    return f"""You write one short outreach email as {SENDER_NAME}, a computer science student at UT Austin who volunteers at an animal shelter.

Write the body in this order and nothing else:
1. A greeting line starting with the word Hello and the contact's first name.
2. One sentence on who {SENDER_NAME} is: a UT Austin computer science student who volunteers at a shelter.
3. One sentence naming the specific detail you are given about their shelter, so it is obvious this is not a mass send.
4. Two sentences on Stay: a free tool that helps dog owners work out what is going on with their dog and what to try, aimed at owners who are close to giving the dog up. Say plainly that it is free and that there is nothing to sell.
5. The ask, in this order. First, would they try it once and tell you where the advice is wrong. Second, if it seems useful, would they mention it to adopters.
6. A sign off with {SENDER_NAME} on one line and {REPLY_EMAIL} on the next.

Hard rules, all of them enforced by a checker:
- Under {MAX_DRAFT_WORDS} words.
- No em dashes and no en dashes. Use a comma or a second sentence.
- No apostrophes at all. That rules out contractions and possessives, so write "do not", "it is", "I am", and rephrase "the shelter's program" as "the program at the shelter".
- No exclamation marks.
- No subject line, no headers, no bullet points, no bold.

It has to read like a person typed it on a Tuesday night. Vary sentence length. Say the thing and stop.

Never write: I hope this email finds you well, I wanted to reach out, reaching out, I came across, I stumbled upon, delve, leverage, passionate, excited, thrilled, impactful, incredible work, amazing work, tirelessly, truly, game changer, innovative, cutting edge, revolutionary, at its core, that said. Do not compliment the shelter in vague terms. Do not group things into threes for rhythm. Do not close with a line about looking forward to hearing back.

Return the email body as plain text and nothing else."""


def _research(client: anthropic.Anthropic, area: str, limit: int) -> list[dict]:
    """One web-search conversation; returns whatever the model could verify."""
    user_input = (
        f"Find up to {limit} animal shelters or rescue organizations in {area}. "
        "Return only the ones that meet every requirement."
    )
    messages: list[dict] = [{"role": "user", "content": user_input}]

    for _ in range(MAX_PAUSE_RESTARTS):
        response = client.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=RESEARCH_SYSTEM,
            messages=messages,
            tools=[
                {
                    "type": "web_search_20260209",
                    "name": "web_search",
                    "max_uses": SEARCH_MAX_USES,
                }
            ],
            output_config={"format": {"type": "json_schema", "schema": TARGET_SCHEMA}},
        )
        # Web search can stop mid-turn; re-send to let it keep going.
        if response.stop_reason == "pause_turn":
            messages = [
                {"role": "user", "content": user_input},
                {"role": "assistant", "content": response.content},
            ]
            continue

        text = next((b.text for b in response.content if b.type == "text"), "")
        if not text.strip():
            return []
        return list(json.loads(text).get("targets") or [])

    print("Search kept pausing and never finished. Try a narrower area.")
    return []


def _clean_email(raw) -> str | None:
    """Keep a personal address, drop a shared inbox, drop anything malformed."""
    email = str(raw or "").strip().lower()
    if not email or email.count("@") != 1:
        return None
    local, _, domain = email.partition("@")
    if "." not in domain or not local:
        return None
    if local in GENERIC_MAILBOXES:
        return None
    return email


def _is_named_person(name: str) -> bool:
    parts = [p for p in re.split(r"\s+", str(name or "").strip()) if p]
    if len(parts) < 2 or "@" in name:
        return False
    return not any(p.strip(".,").lower() in NOT_A_PERSON for p in parts)


def _valid_target(target: dict) -> tuple[bool, str]:
    """Structural check. Anything missing means the research did not land."""
    for field in ("org_name", "city", "contact_title", "specific_detail"):
        if not str(target.get(field) or "").strip():
            return False, f"missing {field}"
    if not _is_named_person(target.get("contact_name", "")):
        return False, "no named person"
    url = str(target.get("detail_source_url") or "").strip()
    if not url.startswith(("http://", "https://")):
        return False, "detail has no source URL"
    return True, ""


def _source_reachable(url: str) -> bool:
    """Does the cited page answer? Guards against an invented citation."""
    for method in ("HEAD", "GET"):
        request = urllib.request.Request(
            url, method=method, headers={"User-Agent": USER_AGENT}
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status < 400
        except urllib.error.HTTPError as e:
            # A site that blocks scripts or rejects HEAD still proves the page
            # is there. A 404 or a dead host does not.
            if e.code in (403, 405, 429):
                return True
            if method == "GET":
                return False
        except Exception:
            if method == "GET":
                return False
    return False


def lint_draft(body: str) -> list[str]:
    """Every hard rule, checked after the model writes. Empty list means clean."""
    problems = []
    text = body or ""
    if "\u2014" in text or "\u2013" in text:
        problems.append("contains a dash that is not a hyphen")
    if "'" in text or "\u2019" in text:
        problems.append("contains an apostrophe")
    if "!" in text:
        problems.append("contains an exclamation mark")
    words = len(text.split())
    if words >= MAX_DRAFT_WORDS:
        problems.append(f"{words} words, needs to be under {MAX_DRAFT_WORDS}")
    if REPLY_EMAIL not in text:
        problems.append(f"does not sign off with {REPLY_EMAIL}")
    if not text.strip().lower().startswith("hello"):
        problems.append("does not open with Hello")
    return problems


def _draft_email(
    client: anthropic.Anthropic, target: dict, earlier: list[str]
) -> tuple[str, list[str]]:
    """Write one body, re-asking while the checker still finds problems."""
    request = (
        f"Shelter: {target['org_name']} in {target['city']}\n"
        f"Contact: {target['contact_name']}, {target['contact_title']}\n"
        f"Specific detail to name: {target['specific_detail']}\n"
    )
    if earlier:
        shown = "\n\n".join(earlier[-3:])
        request += (
            "\nHere are the last drafts you wrote to other shelters. This one goes "
            "to a different person, so build the sentences differently. Do not "
            "reuse their openings or their shape:\n\n" + shown
        )

    messages: list[dict] = [{"role": "user", "content": request}]
    body, problems = "", ["not written yet"]

    for _ in range(DRAFT_ATTEMPTS):
        response = client.messages.create(
            model=MODEL,
            max_tokens=1200,
            system=_draft_system(),
            messages=messages,
        )
        body = next((b.text for b in response.content if b.type == "text"), "").strip()
        problems = lint_draft(body)
        if not problems:
            return body, []
        messages += [
            {"role": "assistant", "content": body},
            {
                "role": "user",
                "content": (
                    "That draft breaks the rules: "
                    + "; ".join(problems)
                    + ". Rewrite it. Same shape, same detail, fix those."
                ),
            },
        ]

    return body, problems


def run(area: str, limit: int, dry_run: bool) -> int:
    client = anthropic.Anthropic()

    print(f"Researching shelters in {area} (up to {limit})...")
    found = _research(client, area, limit)
    print(f"Model returned {len(found)} candidate(s).")

    kept: list[dict] = []
    for target in found:
        ok, reason = _valid_target(target)
        if not ok:
            print(f"  skip {target.get('org_name', 'unnamed')}: {reason}")
            continue
        if not _source_reachable(target["detail_source_url"]):
            print(
                f"  skip {target['org_name']}: source URL does not resolve "
                f"({target['detail_source_url']})"
            )
            continue
        target["contact_email"] = _clean_email(target.get("contact_email"))
        kept.append(target)

    print(f"{len(kept)} target(s) survived verification.")
    if not kept:
        return 0

    rows, flagged = [], []
    earlier: list[str] = []
    for target in kept:
        print(f"  drafting for {target['contact_name']} at {target['org_name']}...")
        body, problems = _draft_email(client, target, earlier)
        earlier.append(body)
        if problems:
            flagged.append((target["org_name"], problems))
        rows.append(
            {
                "org_name": target["org_name"],
                "city": target["city"],
                "website": target.get("website") or None,
                "contact_name": target["contact_name"],
                "contact_title": target["contact_title"],
                "contact_email": target["contact_email"],
                "specific_detail": target["specific_detail"],
                "detail_source_url": target["detail_source_url"],
                "status": "drafted",
                "drafted_body": body,
            }
        )

    if dry_run:
        print("\n--dry-run, nothing written to Supabase:\n")
        print(json.dumps(rows, indent=2))
    else:
        try:
            get_supabase().table("outreach_targets").upsert(
                rows, on_conflict="org_name,city", ignore_duplicates=True
            ).execute()
        except Exception as e:
            print(f"Failed to write outreach_targets: {e}")
            return 1
        print(f"\nWrote {len(rows)} row(s). Review them at /admin/outreach.")

    if flagged:
        print(f"\n{len(flagged)} draft(s) still break the rules after "
              f"{DRAFT_ATTEMPTS} attempts. Fix them in the review queue:")
        for org, problems in flagged:
            print(f"  {org}: {'; '.join(problems)}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Research shelters and draft outreach.")
    parser.add_argument("area", help='State or metro area, for example "Austin, TX"')
    parser.add_argument("--limit", type=int, default=10, help="Max shelters to research")
    parser.add_argument(
        "--dry-run", action="store_true", help="Print rows instead of writing them"
    )
    args = parser.parse_args()
    return run(args.area, args.limit, args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
