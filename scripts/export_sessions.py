# -*- coding: utf-8 -*-
"""제출물 ④ 주요 프롬프트 세션 내보내기.

대회 가이드 요건: "AI 활용 근거가 되는 주요 대화 세션을 .md 또는 .txt 포맷으로
내보내기 후, zip 파일로 압축하여" 제출.

Claude Code 로컬 기록(~/.claude/projects/<프로젝트>/*.jsonl)에서
사람 지시와 AI 답변 본문만 뽑아 .md로 만든다. 도구 호출 로그와 내부 추론은
가독성을 해치므로 제외하고, 사람이 무엇을 시켰고 AI가 무엇을 답했는지만 남긴다.

비밀값은 내보내는 시점에 치환한다 — API 키 노출은 실격이다.

실행: python scripts/export_sessions.py
산출: prompt_sessions/*.md
"""
import io, json, os, re, sys, glob
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")
SRC = os.path.expanduser(r"~\.claude\projects\C----------------------AI----")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "prompt_sessions")

# 세션 파일 → 제출용 파일명·주제. 실제 대화 흐름에 맞춰 붙인다.
TOPICS = [
    ("a112eb29-9c4d-447e-98d7-849ff20ac4cc", "01_기획과_초기구현",
     "주제 확정 · 학습 동선 설계 · 데이터 파이프라인 · 초기 화면 구현"),
    ("bef6a571-dafd-4a44-94ee-79ba0ae8c78c", "02_레드팀_감사와_전량수정",
     "자가 레드팀 감사 · 과학적 무결성 결함 적발 · 전량 수정"),
    ("c0381449-b5b2-448d-a30d-da4ad5fea901", "03_실측전환과_AI안정화",
     "평활 곡선 → 연도별 실측 집계 전환 · AI 감사관 502 원인 규명"),
    ("d7325e25-8bee-4a4b-aca4-55bbd0958dd1", "04_기능확장과_최종감사",
     "미션5 계절 지연 · 16지점 지도 · 비교 기간 26창 · 라이트 테마 · 최종 제출 감사"),
    ("7b3fdd6b-122b-4faa-a108-2d9096312328", "05_4차레드팀과_학습흐름_재구성",
     "4차 레드팀(6축 다중 에이전트 감사·반증 검증) · 지적 전량 반영 · 열관성 실험실 신설 · "
     "학습 흐름을 마이크로 단계로 재구성"),
    ("f1affef2-f931-4391-b867-2fcff19efb03", "06_5차레드팀과_우선순위_전량반영",
     "5차 레드팀(교육효과·완성도·심사기준 7축 + 카피·UI/UX·CX 6축, 축별 적대적 반증) · "
     "예측 봉인 누출 차단 · 시연 문서 재작성 · 자체 게이트 초록 복귀 · 데이터 표시 무결성 · "
     "CERL 내용 검사와 필수 필드 재설계"),
    ("1fb55ca9-27d8-4e02-b9ec-f40d59ecf0ea", "07_보조작업",
     "짧은 보조 작업 기록"),
]

SECRET = re.compile(
    r"(sk-[A-Za-z0-9_\-]{20,}|sk-proj-[A-Za-z0-9_\-]{20,}"
    r"|(?:OPENAI_API_KEY|KMA_SERVICE_KEY|SERVICE_KEY|AUTH_KEY)\s*=\s*[\"']?[A-Za-z0-9%_\-\.]{16,}"
    r"|serviceKey=[A-Za-z0-9%_\-\.]{16,}|authKey=[A-Za-z0-9%_\-\.]{16,}"
    # R4: 이메일 평문도 마스킹한다. 제출자 본인 계정이라 위해는 낮지만
    # '개인정보 없음'을 README에 적어 두고 로그에 남겨 두면 그 문장이 거짓이 된다.
    r"|[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})")

# 로컬 홈 경로 — 윈도우 사용자명이 그대로 드러나므로 치환한다.
HOMEPATH = re.compile(r"([A-Za-z]):\\Users\\[A-Za-z0-9._\-]+")

# 5차 최종 감사: 제3자를 식별할 수 있는 표현은 '구간 제외'만으로 부족했다.
# 그 표현을 지우는 작업 자체가 대화에 기록되면서, 고치는 과정에 인용된 문구가
# 다시 세션 로그에 남았다(감사 보고서에서도 같은 일이 일어났다).
# 그래서 구간 제외와 별개로 표현 자체를 치환한다.
THIRD_PARTY = re.compile(
    r"본선\s*1?5?개?\s*팀\s*실명\s*평가|타\s*팀\s*실명\s*평가표?"
    r"|합격팀이\s*공유하는[^\n\"']{0,24}")

# R4: 제출 목적과 무관하고 제3자를 식별할 수 있는 구간은 내보내지 않는다.
# (이 제출물은 사무국이 보관·회람하며 중복·표절 심사를 거친다)
# 아래 정규식은 무엇을 걸러냈는지 감사할 수 있도록 남겨 둔다 — 제외가 임의적이지 않다는 근거다.
DROP_PATTERNS = [
    re.compile(r"본선.{0,6}(진출|합격).{0,4}(팀|명단).{0,40}(평가|분석|비교)"),
    re.compile(r"(합격팀|경쟁팀|타\s*팀).{0,20}(공유하는|3대|코드|밀린)"),
]


def txt(content):
    """message.content에서 사람이 읽을 본문만 뽑는다."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    out = []
    for b in content:
        if not isinstance(b, dict):
            continue
        t = b.get("type")
        if t == "text":
            out.append(b.get("text", ""))
        # tool_use / tool_result / thinking 은 제외 — 대화가 아니라 실행 로그다
    return "\n".join(x for x in out if x)


def clean(s):
    s = SECRET.sub("<REDACTED>", s or "")
    # 5차 최종 감사: Claude Code 내부 안내 문구에 로컬 홈 경로가 섞여 들어와
    #   "C:\Users\<윈도우 사용자명>\.claude\..." 형태로 사용자명이 노출됐다.
    #   제출물에 있을 이유가 없는 정보이므로 경로째로 치환한다.
    s = HOMEPATH.sub(r"\1:\\Users\\<REDACTED>", s)
    s = re.sub(r"/(?:home|Users)/[A-Za-z0-9._\-]+", "/Users/<REDACTED>", s)
    s = re.sub(r"<system-reminder>.*?</system-reminder>", "", s, flags=re.S)
    s = re.sub(r"<task-notification>.*?</task-notification>", "[백그라운드 작업 결과 — 생략]", s, flags=re.S)
    s = re.sub(r"\n{4,}", "\n\n\n", s)
    return s.strip()


def when(o):
    ts = o.get("timestamp")
    if not ts:
        return ""
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M")
    except Exception:
        return ""


def turn_key(role, body):
    """중복 판정용 지문 — 공백·기호를 지운 본문 앞부분."""
    import hashlib
    norm = re.sub(r"\s+", "", body)[:400]
    return hashlib.sha1((role + "|" + norm).encode("utf-8")).hexdigest()


os.makedirs(OUT, exist_ok=True)
made = []
seen_turns = set()      # R4: 세션 간 중복 턴 제거 (03이 04의 97%를 중복 포함하고 있었다)
dropped_dup, dropped_offtopic = 0, 0
for sid, name, desc in TOPICS:
    path = os.path.join(SRC, sid + ".jsonl")
    if not os.path.exists(path) or os.path.getsize(path) < 2048:
        print(f"  건너뜀 {name} (기록 없음/과소)")
        continue

    turns, first, last = [], "", ""
    for line in io.open(path, encoding="utf-8", errors="replace"):
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
        except Exception:
            continue
        m = o.get("message")
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        if role not in ("user", "assistant"):
            continue
        body = clean(txt(m.get("content")))
        if not body or len(body) < 2:
            continue
        # 도구 결과가 사용자 메시지로 되돌아오는 경우 제외
        if role == "user" and body.startswith("[백그라운드 작업 결과"):
            continue
        # 제출 목적과 무관한 구간은 싣지 않는다 (아래 DROP_PATTERNS 참조)
        if any(p.search(body) for p in DROP_PATTERNS):
            dropped_offtopic += 1
            turns.append((role, when(o), "*(제출 목적과 무관한 구간 — 제외)*"))
            continue
        # 구간 제외 판정이 끝난 뒤에만 표현을 치환한다 — 순서를 뒤집으면 치환이
        # DROP_PATTERNS 가 찾는 지문을 지워 제외되어야 할 구간이 그대로 실린다(실제로 겪었다).
        body = THIRD_PARTY.sub("<제3자 식별 서술 — 제외>", body)
        # 이전 세션에 이미 실린 턴은 다시 싣지 않는다
        k = turn_key(role, body)
        if k in seen_turns:
            dropped_dup += 1
            continue
        seen_turns.add(k)
        t = when(o)
        if t:
            first = first or t
            last = t
        turns.append((role, t, body))

    if not turns:
        print(f"  건너뜀 {name} (추출 결과 없음)")
        continue

    nu = sum(1 for r, _, _ in turns if r == "user")
    na = len(turns) - nu
    lines = [
        f"# {name.split('_', 1)[1].replace('_', ' ')}",
        "",
        f"> **주제** {desc}  ",
        f"> **기간** {first} ~ {last}  ",
        f"> **분량** 사람 지시 {nu}건 · AI 답변 {na}건  ",
        f"> **원본** Claude Code 세션 `{sid[:8]}`  ",
        "> **처리** 도구 호출 로그·내부 추론 제외, 대화 본문만 추출. 비밀값·이메일·로컬 경로는 `<REDACTED>` 치환.",
        "",
        "---",
        "",
    ]
    for role, t, body in turns:
        tag = "사람" if role == "user" else "AI"
        lines.append(f"## [{tag}] {t}".rstrip())
        lines.append("")
        lines.append(body)
        lines.append("")
    doc = "\n".join(lines)

    hit = SECRET.findall(doc)
    if hit:
        print(f"  ! {name}: 치환 후에도 비밀값 패턴 {len(hit)}건 — 확인 필요")

    fp = os.path.join(OUT, name + ".md")
    io.open(fp, "w", encoding="utf-8").write(doc)
    made.append((name, nu, na, os.path.getsize(fp)))
    print(f"  ✓ {name}.md  지시 {nu} · 답변 {na} · {os.path.getsize(fp)//1024}KB")

print(f"\n총 {len(made)}개 세션, {sum(x[3] for x in made)//1024}KB "
      f"· 중복 턴 {dropped_dup}건 제거 · 무관 구간 {dropped_offtopic}건 제외")

# 목차를 실물과 항상 일치시킨다 (예전에는 AI_활용_기록.md의 목록 7개가 실물과 0건 일치했다)
idx = ["# 프롬프트 세션 로그", "",
       "> 제출물 ④. Claude Code 세션 원문에서 대화 본문만 추출했습니다.",
       "> 도구 호출 로그·내부 추론 제외 · 비밀값과 이메일은 `<REDACTED>` 치환 ·",
       "> 세션 간 중복 턴 제거(고유 턴만 집계) · 제출 목적과 무관한 구간 제외.", "",
       "| 파일 | 주제 | 사람 지시 | AI 답변 | 크기 |", "|---|---|---|---|---|"]
for (name, nu, na, sz), (_, _, desc) in zip(made, [t for t in TOPICS if any(m[0] == t[1] for m in made)]):
    idx.append(f"| `{name}.md` | {desc} | {nu} | {na} | {sz // 1024}KB |")
idx += ["", f"**합계 — 사람 지시 {sum(x[1] for x in made)}건 · AI 답변 {sum(x[2] for x in made)}건** (중복 제거 후 고유 턴 기준)", ""]
io.open(os.path.join(OUT, "README.md"), "w", encoding="utf-8").write("\n".join(idx))
print("  ✓ prompt_sessions/README.md 목차 갱신")
