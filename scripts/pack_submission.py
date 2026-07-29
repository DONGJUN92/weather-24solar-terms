# -*- coding: utf-8 -*-
"""제출용 폴더 생성 — 제출물 5종을 `제출물/`에 모은다.

구글폼에 올릴 것만 담는다. 저장소 루트에는 작업 문서(레드팀 보고서·기획서·개선 방향성 등)가
많고, 그것들은 소스코드 zip 안에 기록으로 들어가면 충분하다.

  ① 발표자료   발표자료_Weather24.pdf        (루트에서 복사)
  ② 구동 URL   00_제출안내.md 안에 기재       (파일 없음)
  ③ 소스코드   weather24_source.zip          git archive + 제외 pathspec
  ④ 프롬프트   weather24_sessions.zip        prompt_sessions/*.md
  ⑤ 구동문서   README.md                     (루트에서 복사)

사무국 배포 자료(`사무국 추가 공유 자료/`·`오리엔테이션/`)는 2026-07-29에 저장소에서
제거했다. 그전에는 git이 추적하는 파일이라 `git archive HEAD` 산출물에 그대로 담겼다
(실측 10.2MB). 아래 EXCLUDE pathspec은 **누군가 다시 넣어도 제출본에는 들어가지 않게**
하는 방어선으로 남겨 둔다 — 없는 경로를 지정해도 git archive는 정상 동작한다.
`.gitignore` 대상(.env*·원시 CSV·__pycache__·.claude/·제출물/)은 구조적으로 빠진다.

실행: python scripts/pack_submission.py
"""
import glob
import hashlib
import io
import os
import shutil
import subprocess
import sys
import zipfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "제출물")
APP = "https://weather-24solar-terms.vercel.app"

# 소스 zip에서 뺄 것 — 추적 파일이라 pathspec으로만 빠진다
EXCLUDE = ["사무국 추가 공유 자료", "오리엔테이션"]

# zip 안에 있어야 하는 것 — 없으면 실패로 본다
REQUIRED = [
    "prototype/index.html", "prototype/verify.js", "prototype/verify.css",
    "prototype/base.css", "prototype/solar_terms_data.js", "prototype/korea_geo.js",
    "prototype/교사_학습지.html", "api/ai-turn.js", "vercel.json",
    "README.md", "eval_harness.js", "eval_set.json",
    "processing/verify_solar_terms.py", "scripts/submit_check.sh",
]
# 있으면 실격·감점 위험
FORBIDDEN_HINTS = (".env", ".git/", ".claude/", "node_modules", "__pycache__",
                   "_simulated/", "사무국", "오리엔테이션")


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def kb(path):
    return f"{os.path.getsize(path) / 1024:,.0f}KB"


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "*")):
        os.remove(f)
    fails = []

    # ① ⑤ 복사
    for name in ("발표자료_Weather24.pdf", "README.md"):
        src = os.path.join(BASE, name)
        if not os.path.exists(src):
            fails.append(f"{name} 없음")
            continue
        shutil.copy2(src, os.path.join(OUT, name))
        print(f"  ✓ {name}  {kb(src)}")

    # ③ 소스코드
    src_zip = os.path.join(OUT, "weather24_source.zip")
    cmd = ["git", "archive", "--format=zip", "--output", src_zip, "HEAD"]
    cmd += [f":(exclude){p}" for p in EXCLUDE]
    r = subprocess.run(cmd, cwd=BASE, capture_output=True, text=True)
    if r.returncode != 0:
        fails.append("git archive 실패: " + (r.stderr or "").strip()[:200])
    else:
        z = zipfile.ZipFile(src_zip)
        names = z.namelist()
        bad = [n for n in names if any(h in n for h in FORBIDDEN_HINTS)]
        miss = [n for n in REQUIRED if n not in names]
        if bad:
            fails.append(f"소스 zip에 제외 대상 {len(bad)}건: {bad[:3]}")
        if miss:
            fails.append(f"소스 zip에 필수 파일 누락: {miss}")
        print(f"  ✓ weather24_source.zip  {kb(src_zip)} · 파일 {len(names)}개"
              f" · 제외 대상 {len(bad)}건 · 필수 누락 {len(miss)}건")

    # ④ 프롬프트 세션
    ses = sorted(glob.glob(os.path.join(BASE, "prompt_sessions", "*.md")))
    ses_zip = os.path.join(OUT, "weather24_sessions.zip")
    if len(ses) < 3:
        fails.append(f"프롬프트 세션이 {len(ses)}건 (3건 이상 필요)")
    with zipfile.ZipFile(ses_zip, "w", zipfile.ZIP_DEFLATED) as z:
        for f in ses:
            z.write(f, os.path.basename(f))
    print(f"  ✓ weather24_sessions.zip  {kb(ses_zip)} · 세션 {len(ses) - 1}건 + 목차")

    # 세션 zip 안에 비밀값·이메일이 남아 있지 않은지 (내보내기 단계에서 치환했지만 다시 본다)
    import re
    secret = re.compile(r"sk-[A-Za-z0-9_\-]{20,}"
                        r"|[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
    zz = zipfile.ZipFile(ses_zip)
    hits = 0
    for n in zz.namelist():
        hits += len(secret.findall(zz.read(n).decode("utf-8", "replace")))
    if hits:
        fails.append(f"세션 zip에 비밀값·이메일 패턴 {hits}건")
    print(f"  ✓ 세션 zip 비밀값·이메일 스캔 {hits}건")

    # ② 구동 URL + 목록 문서
    rows = []
    for name in ("발표자료_Weather24.pdf", "weather24_source.zip",
                 "weather24_sessions.zip", "README.md"):
        p = os.path.join(OUT, name)
        if os.path.exists(p):
            rows.append((name, kb(p), sha(p)))
    commits = subprocess.run(["git", "rev-list", "--count", "HEAD"], cwd=BASE,
                             capture_output=True, text=True).stdout.strip()
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=BASE,
                          capture_output=True, text=True).stdout.strip()

    doc = [
        "# 제출물 — 2026 기상·기후 AI 해커톤 본선",
        "",
        "> Weather24 — 절기의 약속 검증소",
        f"> 기준 커밋 `{head[:8]}` · 총 {commits}커밋 · `scripts/pack_submission.py`로 생성",
        "> 마감 8월 21일(금) 18:00 · 구글폼",
        "",
        "## 구글폼에 올릴 것",
        "",
        "| # | 항목 | 올릴 것 |",
        "|---|---|---|",
        "| ① | 발표자료 | `발표자료_Weather24.pdf` |",
        f"| ② | 구동 URL | {APP} |",
        "| ③ | 소스코드 | `weather24_source.zip` |",
        "| ④ | 프롬프트 세션 | `weather24_sessions.zip` |",
        "| ⑤ | 구동·배포 문서 | `README.md` |",
        "",
        "## 파일 목록과 검증값",
        "",
        "| 파일 | 크기 | SHA-256 |",
        "|---|---:|---|",
    ]
    for name, size, digest in rows:
        doc.append(f"| `{name}` | {size} | `{digest[:32]}…` |")
    doc += [
        "",
        "## 이 폴더에 없는 것 — 일부러 뺐습니다",
        "",
        "- 사무국 배포 자료 — `사무국 추가 공유 자료/`(PDF 4건)·`오리엔테이션/`(캡처 9건)·"
        "대회 누리집 전사본은 **2026-07-29에 저장소에서 제거**했습니다. 사무국이 만든 자료를 되돌려 제출하지 않습니다.",
        "- `.env.local` — 실제 API 키가 들어 있습니다. 노출은 실격 사유입니다.",
        "- `data_collectors/output/` 원시 ASOS CSV 약 65MB — 재수집 절차가 `README.md` §2에 있습니다.",
        "- 레드팀 보고서·기획서 등 작업 문서 — **소스코드 zip 안에 기록으로 들어 있습니다.**",
        "",
        "## 업로드 직전 확인",
        "",
        "```bash",
        "bash scripts/submit_check.sh   # 전부 통과해야 업로드",
        "```",
        "",
        "체크리스트 전문은 소스 zip 안 `제출_체크리스트.md`에 있습니다.",
        "",
    ]
    io.open(os.path.join(OUT, "00_제출안내.md"), "w", encoding="utf-8").write("\n".join(doc))
    print("  ✓ 00_제출안내.md  (구동 URL · SHA-256 · 제외 항목)")

    print()
    if fails:
        print("실패 %d건 — 제출하지 마세요" % len(fails))
        for f in fails:
            print("  -", f)
        return 1
    print(f"제출물/ 준비 완료 — 파일 {len(rows) + 1}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
