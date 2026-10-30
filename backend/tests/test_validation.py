from app.validation import Resume, validate_resume


def test_cross_bullet_number_transfer_rejected():
    base = Resume(
        facts={},
        skills=[],
        bullets=[
            {"id": "1", "text": "Supported 5 engineers."},
            {"id": "2", "text": "Delivered 20 projects."},
        ],
    )
    draft = base.model_copy(deep=True)
    draft.bullets[0].text = "Supported 20 engineers."
    assert not validate_resume(base, draft)["passed"]


def test_facts_skills_orphan_and_duplicate_checks():
    base = Resume(
        facts={"title": "Engineer"},
        skills=["Python"],
        bullets=[{"id": "1", "text": "Built services."}],
    )
    for draft in [
        base.model_copy(update={"facts": {"title": "Lead"}}),
        base.model_copy(update={"skills": ["Rust"]}),
        Resume(
            facts=base.facts,
            skills=base.skills,
            bullets=[{"id": "2", "text": "Built services."}],
        ),
        Resume(
            facts=base.facts,
            skills=base.skills,
            bullets=[
                {"id": "1", "text": "Built services."},
                {"id": "1", "text": "Built services."},
            ],
        ),
    ]:
        assert not validate_resume(base, draft)["passed"]


def test_similarity_is_not_truthfulness():
    base = Resume(bullets=[{"id": "1", "text": "Supported a team of 5 engineers."}])
    draft = Resume(bullets=[{"id": "1", "text": "Led a team of 5 engineers."}])
    assert "cannot prove truthfulness" in validate_resume(base, draft)["notice"]
