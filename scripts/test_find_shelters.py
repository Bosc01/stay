#!/usr/bin/env python3
"""Checks for the filters in find_shelters.py. Run: python scripts/test_find_shelters.py"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from find_shelters import _clean_email, _is_named_person, _valid_target, lint_draft

GOOD = (
    "Hello Dana,\n\n"
    "I am a computer science student at UT Austin and I volunteer at a shelter here.\n\n"
    "I read that you started a behavior hotline for adopters last spring.\n\n"
    "I built a free tool called Stay that helps owners work out what is going on "
    "with their dog and what to try first. It is free and there is nothing to sell.\n\n"
    "Would you try it once and tell me where the advice is wrong? If it seems "
    "useful, would you mention it to adopters.\n\n"
    "Harekas\nhello@trystay.org"
)


def main() -> int:
    assert lint_draft(GOOD) == [], lint_draft(GOOD)

    assert "contains a dash that is not a hyphen" in lint_draft(GOOD.replace("here.", "here \u2014 yes."))
    assert "contains an apostrophe" in lint_draft(GOOD.replace("It is free", "It's free"))
    assert "contains an exclamation mark" in lint_draft(GOOD.replace("wrong?", "wrong!"))
    assert any("words" in p for p in lint_draft(GOOD + " padding" * 200))
    assert any("trystay.org" in p for p in lint_draft(GOOD.replace("hello@trystay.org", "")))
    assert "does not open with Hello" in lint_draft("Hi Dana,\n" + GOOD)

    assert _clean_email("Dana.Reyes@Shelter.org ") == "dana.reyes@shelter.org"
    assert _clean_email("info@shelter.org") is None
    assert _clean_email("hello@shelter.org") is None
    assert _clean_email("not-an-email") is None
    assert _clean_email("two@@shelter.org") is None
    assert _clean_email(None) is None

    assert _is_named_person("Dana Reyes")
    assert not _is_named_person("Adoptions Team")
    assert not _is_named_person("Dana")
    assert not _is_named_person("Volunteer Coordinator")

    base = {
        "org_name": "Austin Pets Alive",
        "city": "Austin",
        "contact_name": "Dana Reyes",
        "contact_title": "Behavior Manager",
        "specific_detail": "They published a 2024 live release rate of 97 percent.",
        "detail_source_url": "https://example.org/impact",
    }
    assert _valid_target(base) == (True, "")
    assert _valid_target({**base, "contact_name": "Adoptions Team"})[1] == "no named person"
    assert _valid_target({**base, "city": " "})[1] == "missing city"
    assert _valid_target({**base, "detail_source_url": "example.org"})[1] == "detail has no source URL"

    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
