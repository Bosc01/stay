"""Pick the professional-guidance excerpts that apply to one intake.

The excerpts live in backend/knowledge/ as markdown with a small frontmatter
block. Selection is an explicit routing table rather than a similarity score:
the intake vocabulary is a fixed list of options in the frontend, so a table is
both shorter and auditable. Sources shown to the owner come from here, never
from the model, so the name and link always trace to a real document.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).parent / "knowledge"

# How many excerpts go into one prompt. Three is enough to cover a behavior,
# its escalation path, and the humane-methods floor.
MAX_SOURCES = 3


@dataclass(frozen=True)
class KnowledgeDoc:
    slug: str
    name: str
    org: str
    url: str
    published: str
    body: str


def _parse(path: Path) -> KnowledgeDoc:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise ValueError(f"{path.name} is missing its frontmatter block")
    _, front, body = text.split("---", 2)

    meta: dict[str, str] = {}
    for line in front.strip().splitlines():
        key, _, value = line.partition(":")
        meta[key.strip()] = value.strip()

    missing = [k for k in ("name", "org", "url") if not meta.get(k)]
    if missing:
        raise ValueError(f"{path.name} frontmatter is missing {missing}")

    return KnowledgeDoc(
        slug=path.stem,
        name=meta["name"],
        org=meta["org"],
        url=meta["url"],
        published=meta.get("published", ""),
        body=body.strip(),
    )


# Loaded once at import. The knowledge base is static and small.
_DOCS: dict[str, KnowledgeDoc] = {
    doc.slug: doc for doc in (_parse(p) for p in sorted(KNOWLEDGE_DIR.glob("*.md")))
}

# The humane-methods statement applies to every case, so it is the floor rather
# than a match. It goes last so a behavior-specific excerpt is the primary one.
BASELINE = "avsab-humane-dog-training"


def select_sources(intake) -> list[KnowledgeDoc]:
    """Return the excerpts relevant to this intake, most specific first."""
    behavior = (intake.behavior_type or "").lower()
    described = (intake.behavior_description or "").lower()
    triggers = " ".join(intake.triggers or []).lower()

    slugs: list[str] = []

    if "aggress" in behavior or "biting" in behavior:
        slugs += ["aspca-aggression", "acvb-aversive-tools-and-referral"]
    if "resource guarding" in behavior or "food or treats" in triggers:
        slugs.append("aspca-food-guarding")
    if "being left alone" in triggers or "when alone" in behavior:
        slugs.append("aspca-separation-anxiety")
    if "reactiv" in behavior or "barking" in behavior or "fear" in behavior:
        slugs.append("aspca-barking-and-reactivity")
    if any(w in described for w in ("mouth", "nip", "jump", "wild", "over-excit")):
        slugs.append("aspca-arousal-and-mouthing")
    if intake.sudden_onset:
        slugs.append("aspca-medical-causes-of-behavior-change")
    if intake.behavior_intensity == 3:
        slugs.append("acvb-aversive-tools-and-referral")
    if "dominan" in described or "alpha" in described:
        slugs.append("avsab-dominance-theory")

    docs: list[KnowledgeDoc] = []
    for slug in slugs:
        doc = _DOCS.get(slug)
        if doc is not None and doc not in docs:
            docs.append(doc)

    # The baseline keeps its slot even when the behavior-specific matches would
    # fill the cap on their own, so no case loses the humane-methods grounding.
    baseline = _DOCS[BASELINE]
    docs = [d for d in docs if d is not baseline][: MAX_SOURCES - 1]
    return docs + [baseline]


def format_reference_block(docs: list[KnowledgeDoc]) -> str:
    """Render excerpts for the prompt. Never shown to the owner."""
    return "\n\n".join(
        f"### {doc.name} ({doc.org})\n\n{doc.body}" for doc in docs
    )
