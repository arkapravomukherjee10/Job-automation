"""Local, conservative resume prefill. Keep source wording and require review."""
import re

SECTIONS = {
    'experience': {'experience', 'work experience', 'professional experience', 'employment history', 'employment'},
    'education': {'education', 'academic qualifications', 'academic background'},
    'skills': {'skills', 'technical skills', 'key skills', 'core competencies'},
    'certifications': {'certifications', 'certificates', 'licenses'},
    'summary': {'summary', 'professional summary', 'profile', 'objective'},
    'other': {'projects', 'personal projects', 'publications', 'awards', 'interests', 'languages'},
}


def prefill_resume(text):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    facts, skills, bullets, warnings = {}, [], [], []
    section = None
    counters = {}
    def fact(label, value):
        if len(facts) >= 100:
            return
        counters[label] = counters.get(label, 0) + 1
        key = label if counters[label] == 1 else f'{label} {counters[label]}'
        facts[key] = value
    for index, raw in enumerate(lines):
        clean = re.sub(r'^[•●▪◦*\-]\s*', '', raw).strip()
        heading = clean.rstrip(':').casefold()
        new_section = next((key for key, aliases in SECTIONS.items() if heading in aliases), None)
        if new_section:
            section = new_section
            continue
        labelled = re.match(r'^(name|employer|company|job title|title|dates|education|email|phone)\s*:\s*(.+)$', clean, re.I)
        if labelled:
            label = {'company':'employer', 'job title':'title'}.get(labelled[1].lower(), labelled[1].lower())
            fact(label, labelled[2])
            continue
        if section == 'skills':
            value = re.sub(r'^[^:]{1,40}:\s*', '', clean)
            for skill in re.split(r'[,;|•]', value):
                skill = skill.strip()
                if skill and skill.casefold() not in {s.casefold() for s in skills} and len(skills) < 200:
                    skills.append(skill)
            continue
        if section in ('education', 'certifications'):
            fact(section, clean)
            continue
        marked = raw != clean
        action = bool(re.match(r'^(led|built|managed|supported|developed|delivered|created|designed|improved|increased|reduced|launched|owned|worked|implemented|achieved|analyzed|analysed)\b', clean, re.I))
        if (section == 'experience' and (marked or action)) or (section is None and marked):
            if len(bullets) < 200:
                bullets.append({'id':f'b{len(bullets)+1}', 'text':clean[:5000]})
            continue
        if section == 'experience':
            # Keep ambiguous employer/title/date lines intact instead of guessing their meaning.
            fact('experience detail', clean)
        elif index == 0 and not section and 2 <= len(clean.split()) <= 5 and not re.search(r'[@\d:/|]', clean) and heading not in {'resume', 'curriculum vitae'}:
            fact('name', clean)
            warnings.append('Check the detected name; it was taken from the first line.')
        elif section is None and re.search(r'\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b', clean):
            fact('contact', clean)
    if not any(key.startswith('experience detail') or key in ('employer', 'title') for key in facts):
        warnings.append('Employer and title were not clearly identified. Add any missing experience details.')
    if not skills:
        warnings.append('No skills section was detected. Review and add your skills.')
    if not bullets:
        warnings.append('No experience bullets were confidently identified. Add them from the extracted text.')
    warnings.append('Review all fields against the extracted text. Unusual layouts and wrapped lines may need correction.')
    return {'facts':facts, 'skills':skills, 'bullets':bullets}, warnings
