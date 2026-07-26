# -*- coding: utf-8 -*-
"""발표자료 PDF 생성.

주최측 PC로만 발표하므로(오리엔테이션 p.26) 폰트를 PDF에 임베드해
글자 깨짐을 원천 차단한다. 16:9, 10장, 개조식·명사형.

실행: python scripts/build_deck.py
산출: 발표자료_Weather24.pdf
"""
import sys, os
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "발표자료_Weather24.pdf")

F = "C:/Windows/Fonts/malgun.ttf"
FB = "C:/Windows/Fonts/malgunbd.ttf"
pdfmetrics.registerFont(TTFont("MG", F))
pdfmetrics.registerFont(TTFont("MGB", FB))

W, H = 960, 540                      # 16:9
BG    = (0.031, 0.110, 0.176)        # #081c2d
PANEL = (0.063, 0.208, 0.298)        # #10354c
INK   = (0.925, 0.961, 0.968)        # #ecf5f7
MUTED = (0.655, 0.741, 0.773)        # #a7bdc5
SUN   = (1.000, 0.745, 0.345)        # #ffbe58
CORAL = (1.000, 0.502, 0.400)        # #ff8066
SEA   = (0.231, 0.816, 0.753)        # #3bd0c0
GREEN = (0.553, 0.878, 0.647)        # #8de0a5

c = canvas.Canvas(OUT, pagesize=(W, H))
page = [0]


def bg():
    c.setFillColorRGB(*BG); c.rect(0, 0, W, H, stroke=0, fill=1)


def foot(label):
    page[0] += 1
    c.setFont("MG", 9); c.setFillColorRGB(*MUTED)
    c.drawString(48, 22, "Weather24 · 절기의 약속 검증소")
    c.drawRightString(W - 48, 22, f"{label}   {page[0]} / 10")
    c.setStrokeColorRGB(*MUTED); c.setLineWidth(0.4); c.setDash(1, 0)
    c.line(48, 38, W - 48, 38)


def head(kicker, title, sub=None):
    c.setFont("MGB", 11); c.setFillColorRGB(*SUN)
    c.drawString(48, H - 62, kicker)
    c.setFont("MGB", 31); c.setFillColorRGB(*INK)
    c.drawString(48, H - 104, title)
    if sub:
        c.setFont("MG", 14); c.setFillColorRGB(*MUTED)
        c.drawString(48, H - 130, sub)


def bullets(items, x=48, y=None, w=864, size=15, gap=30, dot=SEA):
    """items: (텍스트, 강조여부) 또는 문자열"""
    yy = y if y is not None else H - 178
    for it in items:
        t, strong = (it, False) if isinstance(it, str) else it
        c.setFillColorRGB(*(SUN if strong else dot))
        c.circle(x + 4, yy + 5, 3, stroke=0, fill=1)
        c.setFont("MGB" if strong else "MG", size)
        c.setFillColorRGB(*(INK if strong else MUTED))
        c.drawString(x + 18, yy, t)
        yy -= gap
    return yy


def card(x, y, w, h, title, lines, accent=SEA, tsize=13, lsize=12):
    c.setFillColorRGB(*PANEL); c.roundRect(x, y, w, h, 10, stroke=0, fill=1)
    c.setStrokeColorRGB(*accent); c.setLineWidth(1.2)
    c.roundRect(x, y, w, h, 10, stroke=1, fill=0)
    c.setFont("MGB", tsize); c.setFillColorRGB(*accent)
    c.drawString(x + 16, y + h - 26, title)
    c.setFont("MG", lsize); c.setFillColorRGB(*INK)
    yy = y + h - 50
    for ln in lines:
        c.drawString(x + 16, yy, ln); yy -= 19


def big(x, y, val, label, color=CORAL, vs=40):
    c.setFont("MGB", vs); c.setFillColorRGB(*color); c.drawString(x, y, val)
    c.setFont("MG", 11.5); c.setFillColorRGB(*MUTED); c.drawString(x, y - 18, label)


# ── 1. 표지 ───────────────────────────────────────────────────
bg()
c.setFillColorRGB(*PANEL); c.rect(0, 0, W, 168, stroke=0, fill=1)
c.setFont("MGB", 12); c.setFillColorRGB(*SUN)
c.drawString(48, H - 92, "2026 기상·기후 AI 해커톤 경진대회 · 본선")
c.setFont("MGB", 54); c.setFillColorRGB(*INK)
c.drawString(48, H - 158, "Weather24")
c.setFont("MGB", 30); c.setFillColorRGB(*SEA)
c.drawString(48, H - 202, "절기의 약속 검증소")
c.setFont("MG", 17); c.setFillColorRGB(*MUTED)
c.drawString(48, H - 244, "‘덥다’의 기준선을 학습자가 직접 정하고,")
c.drawString(48, H - 270, "24절기의 약속이 아직 맞는지 기상청 관측 자료로 검증하는 학습 도구")
c.setFont("MG", 12.5); c.setFillColorRGB(*MUTED)
c.drawString(48, 116, "대상 · 중3~고2 학생과 교사")
c.drawString(48, 94,  "자료 · 기상청 ASOS 종관기상관측 일자료 16지점 · 1969–2025")
c.drawString(48, 72,  "주소 · https://weather-24solar-terms.vercel.app")
c.setFont("MGB", 12.5); c.setFillColorRGB(*SUN)
c.drawRightString(W - 48, 72, "팀 DONGJUN92")
page[0] += 1

# ── 2. 문제 ───────────────────────────────────────────────────
c.showPage(); bg()
head("문제", "“처서가 지났는데 왜 덥죠?”", "학생의 실제 질문 · 절기와 기후를 섞어 이해하는 오개념")
bullets([
    ("절기 = 태양 위치로 정한 천문 날짜 — 해마다 거의 고정", True),
    "달라진 것은 절기 날짜가 아니라 그 무렵 관측된 기온",
    ("두 가지를 섞으면 “절기 자체가 더워졌다”는 오개념 발생", True),
    "기존 기후 교육 자료 대부분 ‘읽는 콘텐츠’ — 조작·검증 경험 부재",
    "‘더워졌다’를 수치로 말하는 훈련 기회 부족",
], y=H - 190, gap=34)
card(48, 62, 420, 108, "학습자가 겪는 어려움", [
    "· 기후 서술의 근거 범위 판단 어려움",
    "· ‘몇 도부터 덥다’의 기준 부재",
    "· 5년 관측과 30년 기후평년의 구분 미형성",
], accent=CORAL)
card(492, 62, 420, 108, "이 도구가 겨냥한 지점", [
    "· 기준을 스스로 정하는 경험",
    "· 정한 기준으로 실측을 세는 경험",
    "· 근거 크기만큼만 결론 쓰는 훈련",
], accent=GREEN)
foot("문제")

# ── 3. 해법 ───────────────────────────────────────────────────
c.showPage(); bg()
head("해법", "기준선 하나로 검증", "예측 봉인 → 조작 → 판정 → 재도전 루프")
bullets([
    ("‘덥다’의 정의를 학습자가 직접 설정 — 정답 제공 없음", True),
    "예측 봉인 전까지 수치 잠금 — 답을 보고 고르는 구조 차단",
    "판정문을 주장·근거·추론·한계(CERL) 네 요소로 구성",
], y=H - 178, gap=28)
c.setFont("MGB", 15); c.setFillColorRGB(*SUN)
c.drawString(48, H - 278, "조작 변수 3축 + 선택 2축")
rows = [
    ("세로 — 기준값", "‘덥다’를 몇 도로 정할지 · 드래그·슬라이더·±·프리셋 4경로", "미션 1~4 · 자유탐구"),
    ("가로 — 날짜", "가장 더울 것 같은 날 직접 찍기", "미션 5"),
    ("기간 — 비교 창", "‘현재’로 쓸 5년을 26가지 중 선택", "자유탐구"),
    ("지역 · 지표", "16지점 지도 클릭 · 기온·습도·강수", "전 구간"),
]
yy = H - 306
for a, b, d in rows:
    c.setFillColorRGB(*PANEL); c.roundRect(48, yy - 20, 864, 30, 7, stroke=0, fill=1)
    c.setFont("MGB", 12.5); c.setFillColorRGB(*SEA); c.drawString(62, yy - 11, a)
    c.setFont("MG", 12); c.setFillColorRGB(*INK); c.drawString(214, yy - 11, b)
    c.setFont("MG", 11.5); c.setFillColorRGB(*MUTED); c.drawRightString(898, yy - 11, d)
    yy -= 36
c.setFont("MG", 12); c.setFillColorRGB(*MUTED)
c.drawString(48, 68, "학습 동선 · 미션 하나 핵심 2분 + 선택 심화 · 5미션 핵심만 약 12분 · 심화·자유탐구까지 45~55분")
foot("해법")

# ── 4. 시연 ───────────────────────────────────────────────────
c.showPage(); bg()
c.setFont("MGB", 13); c.setFillColorRGB(*SUN)
c.drawCentredString(W / 2, H - 130, "LIVE DEMO · 4분")
c.setFont("MGB", 44); c.setFillColorRGB(*INK)
c.drawCentredString(W / 2, H - 190, "직접 조작으로 보여 드립니다")
seq = [
    ("0:25", "24절기 입문", "궤도·한자 풀이 · ‘여름은 태양에 가까워서 덥다’ 오개념 교정"),
    ("0:50", "미션 1 처서", "숫자 잠금 → 기준선 조작 → 예측 봉인 → 수치 공개"),
    ("0:30", "미션 4 강수", "1mm → 30mm → 50mm · 결론의 방향이 뒤집히는 순간"),
    ("0:30", "미션 5 계절 지연", "가로 드래그로 날짜 찍기 · 원인 분리"),
    ("0:35", "판정 + AI 감사", "CERL 4요소 · 학습자 문장만 감사"),
    ("0:30", "자유탐구", "16지점 지도 · 비교 기간 26창"),
    ("0:40", "정직성 · 지구 맥락", "기상청 기준표의 ‘계산 불가’ 표기 · Keeling 곡선"),
]
yy = H - 240
for t, a, b in seq:
    c.setFont("MGB", 13); c.setFillColorRGB(*SUN); c.drawString(120, yy, t)
    c.setFont("MGB", 13); c.setFillColorRGB(*INK); c.drawString(180, yy, a)
    c.setFont("MG", 11.5); c.setFillColorRGB(*MUTED); c.drawString(330, yy, b)
    yy -= 26
c.setFont("MG", 11.5); c.setFillColorRGB(*CORAL)
c.drawCentredString(W / 2, 62, "시연 전 반드시 ‘↺ 처음부터’ 클릭 — 공용 PC이므로 이전 기록 제거 필요")
foot("시연")

# ── 5. 자기 수치 반증 ─────────────────────────────────────────
c.showPage(); bg()
head("검증", "우리 수치를 우리가 반증", "레드팀 자가 감사에서 발견 · 발표 전 전량 수정")
c.setFillColorRGB(*PANEL); c.roundRect(48, H - 300, 864, 128, 10, stroke=0, fill=1)
c.setStrokeColorRGB(*CORAL); c.setLineWidth(1.2); c.roundRect(48, H - 300, 864, 128, 10, stroke=1, fill=0)
c.setFont("MGB", 13); c.setFillColorRGB(*CORAL); c.drawString(66, H - 200, "무엇이 틀렸었나")
c.setFont("MG", 12.5); c.setFillColorRGB(*INK)
for i, t in enumerate([
    "· 평활 곡선을 세어 ‘관측 일수’로 표기 — 서울 33일 → 82일",
    "· 관측일수 350일 미만의 불완결 연도(2026)를 평년 비교에 포함",
    "· 강수는 방향까지 반대로 표기",
]):
    c.drawString(66, H - 224 - i * 21, t)
big(96,  H - 372, "30.8일 → 68.0일", "서울 · 일평균 25℃ 이상 · 연도별 실측 집계", CORAL, 30)
big(560, H - 372, "+13일", "더위가 그치는 날 8/30 → 9/12", SUN, 30)
bullets([
    ("곡선은 보기용 15일 이동평균, 수치는 연도별 실측을 평균한 값 — 화면이 직접 고지", True),
    "불완결 연도 제외 규칙 적용 · 비교 기간 2021–2025로 확정",
], y=H - 418, gap=26, size=13)
c.setFont("MG", 11.5); c.setFillColorRGB(*MUTED)
c.drawString(48, 68, "발견 경로 · AI 레드팀 3라운드 44건 적발 → 전량 수정 · AI 주장 11건은 원자료 재검증으로 기각")
foot("검증")

# ── 6. 재발 방지 ──────────────────────────────────────────────
c.showPage(); bg()
head("재발 방지", "같은 실수가 돌아오지 못하게", "검증 스크립트가 배포 전에 차단")
big(72, H - 216, "4,852", "회귀 검증 assert", SEA, 46)
big(300, H - 216, "9축", "구조·표본·단조성·실측대조·부호방향·강수전환·계절지연·극값안정·이동창", GREEN, 46)
big(72, H - 320, "96/100", "규칙 점검 평가 100케이스 · 오탐 0", SUN, 34)
big(300, H - 320, "0건", "API 키 노출 · git 히스토리 + 배포 자산 전수", CORAL, 34)
card(48, 66, 420, 120, "실측으로 잡아낸 예", [
    "· 겨울 최한일이 0.2℃ 차이로 12/24 결정",
    "  → 극값 ±0.4℃ 고원의 원형 중앙으로 교체",
    "· 서울 최한일 1/2 · 내륙 10~13일로 수렴",
    "· 해안(제주 42일)이 내륙보다 늦음 — 물리 설명 성립",
], accent=SEA)
card(492, 66, 420, 120, "게이트가 막는 것", [
    "· 평활 곡선을 실측으로 표기하는 회귀",
    "· 불완결 연도 혼입",
    "· 화면 결론문과 데이터의 불일치",
    "· 실패 시 배포 중단",
], accent=CORAL)
foot("재발 방지")

# ── 7. 앱 안의 AI ─────────────────────────────────────────────
c.showPage(); bg()
head("앱 안의 AI", "증거 감사관", "정답 생성기가 아닌 비판적 사고 코치")
bullets([
    ("학습자가 쓴 판정문만 감사 — 결론 대필 없음", True),
    "점검 항목 · 과장 · 범위 · 인과 · 5년→기후변화 비약 · 절기 오개념",
    "예시 문장을 그대로 두면 요청 거부",
    ("AI 응답 실패 시 동일 항목을 규칙 점검이 즉시 대체 — 학습 중단 없음", True),
], y=H - 186, gap=30)
card(48, 128, 420, 132, "품질 실측", [
    "· 연속 5회 호출 전부 HTTP 200",
    "· 응답 1.7~3.0초",
    "· 규칙 점검 평가 100케이스 96/100",
    "· 프롬프트 주입 차단 12/12",
    "· 과잉일반화 탐지 · 인과 단정 탐지",
], accent=GREEN)
card(492, 128, 420, 132, "설계 원칙", [
    "· 입력창 비어 있음 — 앱이 먼저 쓰지 않음",
    "· 실패 원인별 안내 분기(429·503·502)",
    "· 패널 제목에 (AI) / (규칙 점검) 표기",
    "· 출력 escape 처리",
    "· AI 없이도 학습 100% 완결",
], accent=SEA)
c.setFont("MG", 11.5); c.setFillColorRGB(*MUTED)
c.drawString(48, 68, "구성 · OpenAI Responses API · json_schema strict · Vercel 서버리스 1개 · 키는 환경변수로만 참조")
foot("앱 안의 AI")

# ── 8. 제작 과정의 AI ─────────────────────────────────────────
c.showPage(); bg()
head("제작 과정의 AI", "만들기보다 검증에 씀", "심사배점표 ⑤ 후반 · 생성형 AI의 제작 과정 활용")
rows2 = [
    ("데이터 파이프라인", "원시 CSV → 경량 JSON · 절기 드리프트 산출 방식 설계"),
    ("레드팀 자가 감사", "3라운드 44건 적발 · 과학적 무결성 · UI/UX · 카피"),
    ("전량 수정", "적발 44건 전부 수정 후 재검증"),
    ("502 원인 규명", "추론 토큰이 출력 예산을 소진하는 구조 계측 → 실패율 0%"),
    ("한국어 카피 감사", "6구간 병렬 감사 71건 → 반박 검증 통과 48건 적용"),
]
yy = H - 190
for a, b in rows2:
    c.setFillColorRGB(*PANEL); c.roundRect(48, yy - 22, 864, 34, 8, stroke=0, fill=1)
    c.setFont("MGB", 13); c.setFillColorRGB(*SUN); c.drawString(64, yy - 12, a)
    c.setFont("MG", 12); c.setFillColorRGB(*INK); c.drawString(250, yy - 12, b)
    yy -= 42
bullets([
    ("AI 주장 11건을 원자료 재검증으로 기각 — 받아들인 것과 버린 것을 함께 기록", True),
    "커밋 39건 · 프롬프트 세션 원문 5건 제출",
], y=yy - 6, gap=26, size=13)
foot("제작 과정의 AI")

# ── 9. 교실 적용 ──────────────────────────────────────────────
c.showPage(); bg()
head("교실 적용", "수업에 그대로 들어감", "설치·로그인 없음 · 모바일 지원")
card(48, H - 300, 278, 128, "교사가 받는 것", [
    "· 교사용 학습지(인쇄용)",
    "· 수업 흐름 · 활동지",
    "· 오개념표 6행",
    "· 평가 루브릭 6점",
    "· 2022 개정 성취기준 연결",
], accent=SUN)
card(342, H - 300, 278, 128, "학생이 남기는 것", [
    "· 미션별 판정문(CERL)",
    "· 자가진단 응답",
    "· 사전·사후 인식 비교",
    "· 내 기록 복사·인쇄",
    "· 고향 기후 카드 PNG",
], accent=GREEN)
card(636, H - 300, 276, 128, "운영 조건", [
    "· 초기 로드 gzip 약 180KB",
    "· 외부 CDN·웹폰트 0건",
    "· 서버 의존은 AI 감사 1개뿐",
    "· ‘↺ 처음부터’로 공용 PC 대응",
    "· 라이트·다크 테마 선택",
], accent=SEA)
bullets([
    ("접근성 · WCAG 2.2 AA 대비 위반 0건 — 라이트·다크 양쪽 전 화면 실측", True),
    "표 보기 제공 — 스크린리더 사용자와 숫자로 보려는 학습자 모두 대응",
    "터치 타깃 24px 이상 · 모바일 375px 가로 스크롤 0",
], y=H - 336, gap=27, size=13)
foot("교실 적용")

# ── 10. 마무리 ────────────────────────────────────────────────
c.showPage(); bg()
c.setFont("MGB", 11); c.setFillColorRGB(*SUN)
c.drawString(48, H - 74, "마무리")
c.setFont("MGB", 34); c.setFillColorRGB(*INK)
c.drawString(48, H - 128, "숫자는 흔들리고, 방향은 남습니다")
c.setFont("MG", 15); c.setFillColorRGB(*MUTED)
c.drawString(48, H - 162, "그 차이를 구별하는 훈련 — 이 도구가 가르치려는 단 하나")
bullets([
    ("비교 기간 26창 전부에서 같은 방향 — 값은 36~68일 사이에서 변동", True),
    ("16지점 전부에서 증가 — 한 지역의 사정이 아님", True),
    ("계절 지연은 과거에도 존재 — 온난화 신호와 분리해 설명", True),
], y=H - 210, gap=30, size=14)
c.setFillColorRGB(*PANEL); c.roundRect(48, 96, 864, 96, 10, stroke=0, fill=1)
c.setStrokeColorRGB(*SEA); c.setLineWidth(1.2); c.roundRect(48, 96, 864, 96, 10, stroke=1, fill=0)
c.setFont("MGB", 20); c.setFillColorRGB(*SEA)
c.drawString(70, 152, "https://weather-24solar-terms.vercel.app")
c.setFont("MG", 12.5); c.setFillColorRGB(*MUTED)
c.drawString(70, 126, "설치·로그인 없이 즉시 체험 · 교사용 학습지 /교사_학습지.html")
c.drawString(70, 108, "소스 github.com/DONGJUN92/weather-24solar-terms · 자료 기상청 ASOS(공공누리 1유형)")
foot("마무리")

c.save()
print(f"생성 완료: {OUT}  ({os.path.getsize(OUT)//1024}KB, 10장)")
