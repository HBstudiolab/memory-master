"""Convert legacy VB.NET image problem files into a deployable dataset.
Usage: python tools/convert_legacy.py "C:\\path\\to\\암기자료" "나의암기자료"
Files must end in a single answer digit 0-9 immediately before the extension.
Explanation file adds h just before the extension, e.g. 문제4.jpg / 문제4h.jpg.
"""
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ALLOWED = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'}


def main():
    if len(sys.argv) < 2:
        print('사용법: python tools/convert_legacy.py "원본 암기자료 폴더" "새 세트 이름"')
        return 2
    src = Path(sys.argv[1]).expanduser().resolve()
    name = sys.argv[2].strip() if len(sys.argv) > 2 else '나의암기자료'
    slug = re.sub(r'[^a-zA-Z0-9가-힣_-]', '_', name).strip('_')
    if not src.is_dir():
        print('폴더를 찾을 수 없습니다:', src)
        return 2
    if not slug:
        print('올바른 세트 이름을 입력하세요.')
        return 2
    target = ROOT / 'datasets' / slug
    if target.exists():
        print('같은 이름의 세트가 이미 있습니다. 다른 이름을 사용하세요:', target)
        return 2
    image_folder = target / 'images'
    image_folder.mkdir(parents=True)
    allfiles = [f for f in src.rglob('*') if f.is_file() and f.suffix.lower() in ALLOWED]
    lookup = {str(f.relative_to(src)).lower(): f for f in allfiles}
    questions = []
    for f in sorted(allfiles, key=lambda x: str(x)):
        stem = f.stem
        if stem.lower().endswith('h'):
            continue
        match = re.search(r'(\d)$', stem)
        if not match:
            print('건너뜀 (파일 이름 끝에 정답 숫자가 없음):', f.name)
            continue
        rel = f.relative_to(src)
        # Mirror folder structure so duplicate basenames in different subjects are okay.
        dest = image_folder / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, dest)
        explanation = f.with_name(stem + 'h' + f.suffix)
        erel = explanation.relative_to(src)
        matched = lookup.get(str(erel).lower())
        explanation_path = ''
        if matched:
            edest = image_folder / erel
            edest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(matched, edest)
            explanation_path = 'images/' + erel.as_posix()
        questions.append({
            'id': 'q' + str(len(questions) + 1).zfill(5),
            'type': 'image',
            'subject': str(rel.parent) if str(rel.parent) != '.' else name,
            'questionImage': 'images/' + rel.as_posix(),
            'answer': match.group(1),
            'explanationImage': explanation_path,
        })
    (target / 'questions.json').write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding='utf-8')
    index = ROOT / 'datasets' / 'subjects.json'
    try:
        sets = json.loads(index.read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        sets = []
    sets.append({'id': slug, 'name': name, 'path': f'datasets/{slug}/questions.json', 'version': '1'})
    index.write_text(json.dumps(sets, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'완료: {len(questions)}개 문제 등록 → {target}')
    print('누락된 해설도 허용됩니다. 이미지와 정답을 확인한 후 GitHub에 올리세요.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
