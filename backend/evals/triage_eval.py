"""
Output-quality eval for the triage engine. 12 fixed intakes, run through the
triage logic directly (no HTTP route, no rate limiter) with dry_run=True, so
nothing is written to Supabase.

  cd backend && python3 -m evals.triage_eval

Requires ANTHROPIC_API_KEY. Costs 12 Claude calls per run.

The thresholds and banned phrases are parsed out of the Tone section of
prompts/system.py at import, not copied here, so rewording the prompt reworks
the eval instead of silently drifting from it. Two assertions are heuristics
and are marked as such below: "honest_note names a failure mode" and
"first_step avoids already_tried".
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env")

if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

if not os.environ.get("ANTHROPIC_API_KEY", "").strip():
    sys.exit("ANTHROPIC_API_KEY is not set. Put it in backend/.env and re-run.")

from models import TriageIntake, TriageResult  # noqa: E402
from prompts.system import SYSTEM_PROMPT  # noqa: E402
from routes.triage import run_triage  # noqa: E402

# --- rules read out of the prompt, not hardcoded ------------------------------

TONE = SYSTEM_PROMPT.split("## Tone", 1)[1].split("\n## ", 1)[0]

BANNED_PHRASES = [
    p.strip().strip(".").lower()
    for p in re.findall(
        r'"([^"]+)"', TONE.split("BANNED PATTERNS", 1)[1].split("REQUIRED:", 1)[0]
    )
]

MAX_ROOT_CAUSE_SENTENCES = int(
    re.search(r"root_cause must be (\d+) sentences maximum", TONE).group(1)
)

# The prompt bans the em dash by name; the en dash is banned by house style.
BANNED_DASHES = set(re.findall(r"Never use em dashes \((.)\)", TONE)) | {"–"}

SEVERITIES = set(re.findall(r'"(green|yellow|red)"', SYSTEM_PROMPT))

# --- the 12 intakes -----------------------------------------------------------

CASES = [
    TriageIntake(
        dog_name="Bruno",
        behavior_type="Aggression (biting, growling, lunging)",
        behavior_intensity=3,
        behavior_description=(
            "Bruno bit my 6 year old nephew on the forearm last weekend when he "
            "walked past the couch. It broke the skin and needed cleaning at urgent "
            "care. He had growled at kids twice before that."
        ),
        owner_experience="First-time owner",
        prior_training="Never",
        triggers=["Children"],
        duration="2–6 months",
        already_tried="",
    ),
    TriageIntake(
        dog_name="Kaya",
        behavior_type="Aggression (biting, growling, lunging)",
        behavior_intensity=2,
        behavior_description=(
            "Kaya lunges and air-snaps at other dogs on leash. No contact so far, "
            "but she is 70 pounds and I have been pulled over twice."
        ),
        owner_experience="Experienced owner",
        prior_training="Yes, didn't help",
        triggers=["Other dogs"],
        duration="Over a year",
        already_tried=(
            "Two group classes and a private trainer. We practice sit before "
            "greetings and use a front-clip harness on every walk."
        ),
    ),
    TriageIntake(
        dog_name="Pepper",
        behavior_type="Anxiety or fear (hiding, trembling, destructive when alone)",
        behavior_intensity=3,
        behavior_description=(
            "Pepper shredded the door frame and broke a nail doing it. She starts "
            "panting the second I pick up my keys."
        ),
        owner_experience="Some experience",
        prior_training="Yes, didn't help",
        triggers=["Being left alone"],
        duration="2–6 months",
        already_tried=(
            "Crate training, leaving the radio on, and a thundershirt for the "
            "first hour."
        ),
    ),
    TriageIntake(
        dog_name="Olive",
        behavior_type="Anxiety or fear (hiding, trembling, destructive when alone)",
        behavior_intensity=1,
        behavior_description=(
            "Olive hides under the bed during thunderstorms and comes out about an "
            "hour after they pass."
        ),
        owner_experience="First-time owner",
        prior_training="Never",
        triggers=["Loud noises (thunder, fireworks)"],
        duration="Less than 2 weeks",
        already_tried="",
    ),
    TriageIntake(
        dog_name="Miso",
        behavior_type="Reactivity (barking, pulling on leash at other dogs/people)",
        behavior_intensity=2,
        behavior_description=(
            "Miso barks and pulls hard the moment he sees a dog or a jogger across "
            "the street. He settles about a minute after they pass."
        ),
        owner_experience="Some experience",
        prior_training="Yes, it helped",
        triggers=["Other dogs", "Strangers or visitors"],
        duration="6–12 months",
        already_tried="",
    ),
    TriageIntake(
        dog_name="Scout",
        behavior_type="Reactivity (barking, pulling on leash at other dogs/people)",
        behavior_intensity=3,
        behavior_description=(
            "Scout screams and spins on the leash when kids run past on scooters. "
            "I have started walking him at 5am to avoid the school route."
        ),
        owner_experience="First-time owner",
        prior_training="Never",
        triggers=["Children"],
        duration="2–8 weeks",
        already_tried="",
    ),
    TriageIntake(
        dog_name="Fig",
        behavior_type="House soiling / potty issues",
        behavior_intensity=1,
        behavior_description=(
            "We adopted Fig 9 days ago and she has peed in the hallway four times, "
            "usually in the evening."
        ),
        owner_experience="First-time owner",
        prior_training="Never",
        triggers=["No clear trigger"],
        duration="Less than 2 weeks",
        already_tried="",
    ),
    TriageIntake(
        dog_name="Rooster",
        behavior_type="House soiling / potty issues",
        behavior_intensity=3,
        behavior_description=(
            "Rooster is 4 and still soils the rug most days, including right after "
            "a long walk. Our landlord has complained twice."
        ),
        owner_experience="Experienced owner",
        prior_training="Yes, didn't help",
        triggers=["No clear trigger"],
        duration="Over a year",
        already_tried=(
            "Belly bands, a strict 3 hour potty schedule, and enzyme cleaner on "
            "every spot."
        ),
    ),
    TriageIntake(
        dog_name="Juniper",
        behavior_type="Excessive barking or whining",
        behavior_intensity=2,
        behavior_description=(
            "Juniper barks at the window for several minutes whenever someone comes "
            "up the walkway, and does not stop when I call her."
        ),
        owner_experience="Experienced owner",
        prior_training="Yes, it helped",
        triggers=["Strangers or visitors"],
        duration="2–6 months",
        already_tried=(
            "A neighbor suggested a bark collar and we decided against it. We tried "
            "ignoring her and closing the blinds in the front room."
        ),
    ),
    TriageIntake(
        dog_name="Tank",
        behavior_type="Resource guarding (food, toys, space)",
        behavior_intensity=3,
        behavior_description=(
            "Tank snapped at my hand when I reached near his bowl. No skin broken, "
            "but he freezes and shows teeth over bully sticks now too."
        ),
        owner_experience="Some experience",
        prior_training="Never",
        triggers=["Food or treats nearby"],
        duration="Over a year",
        already_tried="",
    ),
    TriageIntake(
        dog_name="Maple",
        behavior_type="Resource guarding (food, toys, space)",
        behavior_intensity=1,
        behavior_description=(
            "Maple carries her chew to the corner and gives a low grumble if you "
            "walk near her. She has never snapped."
        ),
        owner_experience="Experienced owner",
        prior_training="Yes, it helped",
        triggers=["Handling or grooming"],
        duration="2–8 weeks",
        already_tried="",
    ),
    TriageIntake(
        dog_name="Barley",
        behavior_type="Other",
        behavior_intensity=2,
        behavior_description=(
            "Barley is 11 and started pacing and whining at night last week. He "
            "also yelps when I lift him onto the couch, which never used to bother "
            "him."
        ),
        owner_experience="Experienced owner",
        prior_training="Never",
        sudden_onset=True,
        triggers=["Handling or grooming", "No clear trigger"],
        duration="Less than 2 weeks",
        already_tried="",
    ),
]

# --- assertions ---------------------------------------------------------------

SKIP = object()

_NUMBER_WORDS = {
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "once", "twice",
}

# Words that overlap between two texts without meaning they say the same thing.
_STOPWORDS = {
    "your", "that", "this", "with", "when", "from", "them", "they", "their",
    "have", "been", "were", "will", "into", "over", "then", "than", "some",
    "more", "most", "just", "only", "also", "about", "before", "after", "each",
    "time", "times", "every", "while", "back", "keep", "make", "take", "give",
    "does", "doing", "done", "would", "could", "should",
}

# Any specific thing that could go wrong reads as one of these. Heuristic, so it
# can miss a phrasing that hedges without these words.
_FAILURE_MARKERS = (
    r"if |unless|risk|worse|regress|relapse|setback|backslide|plateau|stall|"
    r"fail|harder|slower|escalat|might|may |could |won't|will not|do not|"
    r"does not|don't|doesn't|not work|no progress|before it"
)


def _sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]


def _stem(word: str) -> str:
    """Crude suffix strip so "leaving the radio on" matches "leave the radio on"."""
    stripped = re.sub(r"(ing|ed|es|s|e)$", "", word)
    return stripped if len(stripped) >= 3 else word


def _content_words(text: str) -> set[str]:
    words = re.findall(r"[a-z]{4,}", text.lower())
    return {_stem(w) for w in words if w not in _STOPWORDS}


def _all_strings(result: TriageResult):
    for field, value in result.model_dump().items():
        if isinstance(value, str):
            yield field, value
        elif isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    yield field, item


def a_no_dashes(intake: TriageIntake, result: TriageResult):
    hits = [
        f"{field}: {value}"
        for field, value in _all_strings(result)
        if any(d in value for d in BANNED_DASHES)
    ]
    return "\n    ".join(hits) if hits else None


def a_root_cause_length(intake: TriageIntake, result: TriageResult):
    found = _sentences(result.root_cause)
    if len(found) > MAX_ROOT_CAUSE_SENTENCES:
        return f"{len(found)} sentences, max is {MAX_ROOT_CAUSE_SENTENCES}"
    return None


def a_root_cause_banned_phrases(intake: TriageIntake, result: TriageResult):
    lowered = result.root_cause.lower()
    hits = [p for p in BANNED_PHRASES if p in lowered]
    return "banned: " + "; ".join(hits) if hits else None


def a_first_step_has_number(intake: TriageIntake, result: TriageResult):
    text = result.first_step.lower()
    if re.search(r"\d", text):
        return None
    if _NUMBER_WORDS & set(re.findall(r"[a-z]+", text)):
        return None
    return "no duration, count, or distance given"


def a_honest_note_failure_mode(intake: TriageIntake, result: TriageResult):
    if re.search(_FAILURE_MARKERS, result.honest_note.lower()):
        return None
    return "no specific thing that could go wrong"


def a_first_step_skips_already_tried(intake: TriageIntake, result: TriageResult):
    if not intake.already_tried.strip():
        return SKIP
    step_words = _content_words(result.first_step)
    for phrase in re.split(r"[.,;\n]| and ", intake.already_tried):
        shared = _content_words(phrase) & step_words
        if len(shared) >= 2:
            return f"re-suggests '{phrase.strip()}' (shared: {', '.join(sorted(shared))})"
    return None


def a_severity_in_range(intake: TriageIntake, result: TriageResult):
    if result.severity in SEVERITIES:
        return None
    return f"severity={result.severity!r}, expected one of {sorted(SEVERITIES)}"


def a_red_escalates(intake: TriageIntake, result: TriageResult):
    if result.severity != "red":
        return SKIP
    if result.escalation_needed:
        return None
    return "severity is red but escalation_needed is false"


ASSERTIONS = [
    ("no em or en dashes in any field", a_no_dashes),
    (f"root_cause is {MAX_ROOT_CAUSE_SENTENCES} sentences or fewer", a_root_cause_length),
    ("root_cause avoids banned phrases", a_root_cause_banned_phrases),
    ("first_step contains a number", a_first_step_has_number),
    ("honest_note names a failure mode", a_honest_note_failure_mode),
    ("first_step avoids already_tried", a_first_step_skips_already_tried),
    ("severity is green, yellow, or red", a_severity_in_range),
    ("red severity escalates", a_red_escalates),
]

# --- runner -------------------------------------------------------------------


def _label(n: int, intake: TriageIntake) -> str:
    behavior = intake.behavior_type.split(" (")[0].split(" /")[0]
    return (
        f"{n:02d} {intake.dog_name}, {behavior.lower()}, "
        f"intensity {intake.behavior_intensity}, {intake.owner_experience}"
    )


def _check_coverage() -> None:
    """The suite is only worth its API spend if the 12 cases still span the grid."""
    assert len(CASES) == 12, f"expected 12 intakes, found {len(CASES)}"
    assert len({c.behavior_type for c in CASES}) == 7, "a behavior_type is missing"
    assert {c.behavior_intensity for c in CASES} == {1, 2, 3}, "an intensity is missing"
    assert len({c.owner_experience for c in CASES}) == 3, "an experience level is missing"
    assert sum(1 for c in CASES if c.already_tried.strip()) >= 2, "need 2+ already_tried"
    assert BANNED_PHRASES, "no banned phrases parsed out of the Tone section"
    assert SEVERITIES == {"green", "yellow", "red"}, f"parsed severities: {SEVERITIES}"


def main() -> int:
    _check_coverage()
    print(f"Running {len(CASES)} intakes through run_triage(dry_run=True)...\n")

    def one(intake: TriageIntake):
        try:
            result, session_id = run_triage(intake, dry_run=True)
            assert session_id is None, "dry_run returned a session_id"
            return result
        except Exception as e:  # HTTPException, network, parse
            return e

    # run_triage prints the raw Claude response; keep it out of the report
    with contextlib.redirect_stdout(io.StringIO()):
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(one, CASES))

    tally = {name: [0, 0] for name, _ in ASSERTIONS}  # name -> [passed, applicable]
    failures = []
    errors = []
    clean = 0

    for n, (intake, result) in enumerate(zip(CASES, results), start=1):
        label = _label(n, intake)
        if isinstance(result, Exception):
            errors.append((label, intake, result))
            continue
        reasons = []
        for name, check in ASSERTIONS:
            verdict = check(intake, result)
            if verdict is SKIP:
                continue
            tally[name][1] += 1
            if verdict is None:
                tally[name][0] += 1
            else:
                reasons.append((name, verdict))
        if reasons:
            failures.append((label, intake, result, reasons))
        else:
            clean += 1

    width = max(len(name) for name, _ in ASSERTIONS)
    print("PASS RATE BY ASSERTION")
    for name, _ in ASSERTIONS:
        passed, applicable = tally[name]
        if not applicable:
            print(f"  {name.ljust(width)}   n/a  (no applicable intakes)")
            continue
        pct = round(100 * passed / applicable)
        print(f"  {name.ljust(width)}  {passed:>2}/{applicable:<2} {pct:>3}%")

    scored = len(CASES) - len(errors)
    print(f"\n  {'fully clean responses'.ljust(width)}  {clean:>2}/{scored:<2}")
    if errors:
        print(f"  {len(errors)} intake(s) errored before scoring")

    for label, intake, result, reasons in failures:
        print(f"\n{'-' * 72}\nFAIL  {label}")
        for name, reason in reasons:
            print(f"  x {name}: {reason}")
        print(f"\n  intake.already_tried: {intake.already_tried!r}")
        print("  full response:")
        body = json.dumps(result.model_dump(), indent=2, ensure_ascii=False)
        print("\n".join("    " + line for line in body.splitlines()))

    for label, intake, error in errors:
        print(f"\n{'-' * 72}\nERROR {label}")
        print(f"  {type(error).__name__}: {getattr(error, 'detail', error)}")

    return 1 if failures or errors else 0


if __name__ == "__main__":
    sys.exit(main())
