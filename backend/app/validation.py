"""Conservative consistency checks; these do not prove semantic truthfulness."""

import re
from collections import Counter
from pydantic import BaseModel, Field, ConfigDict
from rapidfuzz.fuzz import ratio


class Bullet(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=5000)


class Resume(BaseModel):
    model_config = ConfigDict(extra="forbid")
    facts: dict[str, str] = Field(default_factory=dict, max_length=100)
    skills: list[str] = Field(default_factory=list, max_length=200)
    bullets: list[Bullet] = Field(default_factory=list, max_length=200)


def validate_resume(base: Resume, draft: Resume):
    errors = []
    if base.facts != draft.facts:
        errors.append("Confirmed facts must remain exactly unchanged.")
    if not set(s.casefold() for s in draft.skills) <= set(
        s.casefold() for s in base.skills
    ):
        errors.append("Draft includes an unconfirmed skill.")
    sources = {b.id: b.text for b in base.bullets}
    if len(sources) != len(base.bullets) or len({b.id for b in draft.bullets}) != len(
        draft.bullets
    ):
        errors.append("Bullet IDs must be unique.")
    for bullet in draft.bullets:
        source = sources.get(bullet.id)
        if source is None:
            errors.append(f"Unknown source bullet: {bullet.id}")
            continue
        numbers = lambda text: Counter(re.findall(r"\b\d+(?:[.,]\d+)*(?:%|\b)", text))
        if numbers(bullet.text) - numbers(source):
            errors.append(
                f"Bullet {bullet.id} contains numbers absent from its source."
            )
        if ratio(source.casefold(), bullet.text.casefold()) < 70:
            errors.append(f"Bullet {bullet.id} differs substantially from its source.")
    original = sum(len(b.text) for b in base.bullets)
    revised = sum(len(b.text) for b in draft.bullets)
    if original and not 0.8 * original <= revised <= 1.2 * original:
        errors.append("Draft bullet length is outside ±20% of the base.")
    return {
        "passed": not errors,
        "violations": errors,
        "notice": "Consistency checks cannot prove truthfulness. Review every rewritten claim before use.",
    }
