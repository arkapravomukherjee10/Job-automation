from app.parsing import prefill_resume
from app.validation import Resume


def test_prefill_multiple_roles_and_exact_source_facts():
    draft, warnings = prefill_resume('Alex Example\nExperience\nProduct Manager | Example Labs | 2022–2025\n• Supported 5 launches.\nAnalyst | Other Company | 2020–2022\nBuilt SQL dashboards.\nEducation\nB.Tech Example University\nSkills\nSQL, Python, SQL\nCertifications\nExample Certificate')
    Resume(**draft)
    assert draft['facts']['name'] == 'Alex Example'
    assert draft['facts']['experience detail 2'] == 'Analyst | Other Company | 2020–2022'
    assert draft['facts']['education'] == 'B.Tech Example University'
    assert draft['skills'] == ['SQL','Python']
    assert [b['text'] for b in draft['bullets']] == ['Supported 5 launches.','Built SQL dashboards.']
    assert warnings


def test_unknown_layout_does_not_invent_facts():
    draft, warnings = prefill_resume('RESUME\nSome unstructured text with no clear sections')
    assert draft == {'facts':{},'skills':[], 'bullets':[]}
    assert len(warnings) >= 3


def test_labelled_fields_and_skill_bullets():
    draft, _ = prefill_resume('Name: Alex Example\nEmployer: Example Labs\nTitle: Analyst\nSkills\n• Python\n• SQL')
    assert draft['facts']['employer'] == 'Example Labs'
    assert draft['skills'] == ['Python','SQL']
    assert not draft['bullets']
