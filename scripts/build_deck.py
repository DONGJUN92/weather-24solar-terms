# -*- coding: utf-8 -*-
"""주최측 템플릿에 내용만 채워 본선 발표자료를 만든다.

입력  assets/deck/템플릿_원본.pptx · assets/deck/*.png (배포본에서 추출한 시각자료)
출력  발표자료_Weather24_본선.pptx  (PDF 는 PowerPoint 로 내보낸다)

원칙
  · 서식(폰트·크기·색)은 템플릿 런의 것을 그대로 재사용한다 — 첫 런을 in-place 편집하고
    형제 런을 제거하는 set_para_text 방식(python-pptx가 text 대입 시 서식을 날리는 함정 회피)
  · 문장은 개조식 + 명사형
  · 가이드 슬라이드(2·3·4)와 별지1(12)은 템플릿 지시대로 삭제
  · 시각자료는 앱 실물 SVG를 래스터화한 PNG를 삽입
"""
import copy
import io
import os
import sys

from pptx import Presentation
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt


def no_bullet(tf):
    """개체 틀이 물려주는 글머리표(•)를 끈다.
    본문에 ■·· 표식을 직접 쓰므로 자동 글머리표가 겹치고, 빈 줄에도 점이 남는다."""
    for p in tf.paragraphs:
        pPr = p._p.get_or_add_pPr()
        for tag in ('a:buChar', 'a:buAutoNum', 'a:buNone'):
            for el in pPr.findall(qn(tag)):
                pPr.remove(el)
        pPr.append(pPr.makeelement(qn('a:buNone'), {}))

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(BASE, 'assets', 'deck')

URL = 'https://weather-24solar-terms.vercel.app'


# ─────────────────────────────────────────────────────────────── 서식 보존 편집
def set_lines(tf, lines, size=None):
    """텍스트프레임을 lines(문자열 리스트)로 교체하면서 첫 문단 첫 런의 서식을 유지한다."""
    paras = tf.paragraphs
    p0 = paras[0]
    if not p0.runs:
        p0.add_run()
    proto = p0.runs[0]
    # 첫 문단
    proto.text = lines[0]
    if size:
        proto.font.size = Pt(size)
    for r in list(p0.runs)[1:]:
        r._r.getparent().remove(r._r)
    # 나머지 문단 제거
    for p in list(paras)[1:]:
        p._p.getparent().remove(p._p)
    # 추가 문단은 첫 문단을 복제해 서식을 물려받는다
    for line in lines[1:]:
        newp = copy.deepcopy(p0._p)
        p0._p.getparent().append(newp)
    for p, line in zip(list(tf.paragraphs)[1:], lines[1:]):
        p.runs[0].text = line
        if size:
            p.runs[0].font.size = Pt(size)
    if size:                      # 본문 박스만 — 제목·표 셀의 글머리표는 건드리지 않는다
        no_bullet(tf)


def by_name(slide, name):
    for sh in slide.shapes:
        if sh.name == name:
            return sh
    raise KeyError('%r not found: %s' % (name, [s.name for s in slide.shapes]))


def drop_slide(prs, idx):
    """슬라이드 삭제 (python-pptx 미지원 — 관계와 sldIdLst 를 직접 정리)"""
    xml_slides = prs.slides._sldIdLst
    slides = list(xml_slides)
    rId = slides[idx].get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
    prs.part.drop_rel(rId)
    xml_slides.remove(slides[idx])


def put_pic(slide, png, left, top, width=None, height=None):
    if not png.lower().endswith('.png'):
        png += '.png'
    path = os.path.join(SHOTS, png)
    if not os.path.exists(path):
        print('  !! 이미지 없음: %s' % png)
        return None
    kw = {}
    if width:
        kw['width'] = Inches(width)
    if height:
        kw['height'] = Inches(height)
    return slide.shapes.add_picture(path, Inches(left), Inches(top), **kw)


# 12pt 한글 기준 — 렌더한 PNG에서 되짚어 보정한 값
# (첫 추정 33자/0.225in 은 실제보다 1.6배 커서 이미지 자리를 못 찾았다)
# 5.60in 박스에 약 52자, 줄높이 0.185in
CPL_PER_IN = 9.3
LINE_H = 0.185


def text_height(lines, box_w_in):
    """줄바꿈까지 감안한 본문 높이(in). 이미지를 어디서부터 놓을지 정하는 데 쓴다."""
    cpl = max(12, int((box_w_in - 0.30) * CPL_PER_IN))
    n = 0
    for ln in lines:
        n += max(1, -(-len(ln) // cpl))       # ceil
    return n * LINE_H + 0.18


def fit_pic_below(slide, box, lines, png, pad=0.14):
    """본문 아래 남는 공간에 이미지를 비율 유지로 앉힌다 — 글자를 덮지 않게."""
    if not png.lower().endswith('.png'):
        png += '.png'
    path = os.path.join(SHOTS, png)
    if not os.path.exists(path):
        print('  !! 이미지 없음: %s' % png)
        return None
    from PIL import Image
    iw, ih = Image.open(path).size
    bx, by = box.left / 914400.0, box.top / 914400.0
    bw, bh = box.width / 914400.0, box.height / 914400.0
    top = by + text_height(lines, bw) + pad
    avail_h = (by + bh) - top - pad
    avail_w = bw - 2 * pad
    if avail_h < 0.6:
        print('  !! 남는 높이 부족(%.2fin): %s' % (avail_h, png))
        return None
    sc = min(avail_w / iw, avail_h / ih)
    w, h = iw * sc, ih * sc
    left = bx + (bw - w) / 2.0
    print('     %s → %.2fx%.2f in @ y=%.2f (남은 높이 %.2f)' % (png, w, h, top, avail_h))
    return slide.shapes.add_picture(path, Inches(left), Inches(top), width=Inches(w), height=Inches(h))


# ─────────────────────────────────────────────────────────────── 콘텐츠
CONTENT = {}

# ── 표지 (S1) ─────────────────────────────────────────────
COVER = {
    10: 'Weather24 — 절기, 아직 맞을까',
    11: '팀 Weather24 (1인 팀)',
    12: URL,
    13: '신동준',
}

# ── I. 결과물 및 팀 기본 정보 (S5) ─────────────────────────
TBL5 = [
    '팀 Weather24 (1인 팀)',
    'Weather24 — 절기, 아직 맞을까',
    URL,
    '중·고생이 ‘덥다’ 기준을 정해 24절기를 실측 검증하는 기후 학습 웹앱',   # 40자 — 템플릿 '40자 내외'
]
# 이 박스는 2.08in · 16pt 라 4줄이 한계다. AI 활용 내용은 6장(구현 완성도)에서 다룬다.
TEAM5 = [
    '신동준 / 기획·개발·데이터·디자인',
    '※ 1인 팀 — 단독 수행',
]

# ── 1. 학습 대상 분석 (S6) · (1) 학습 효과 ─────────────────
S6_TITLE = '1. 학습 대상 분석'
S6_BODY = [
    '■ 학습 대상 — 중3~고2 (중등 3학년 ~ 고등 2학년)',
    '  · 선정 근거 ① 2015·2022 개정 교육과정상 ‘기후변화와 지구환경’·‘자료 해석’ 성취기준 배치 학년',
    '  · 선정 근거 ② 임계값(기준온도) 개념과 평균·빈도 구분이 가능한 최소 학년',
    '  · 선정 근거 ③ 24절기를 생활 속에서 들어 본 세대이나 천문 기준임은 미학습 — 오개념 교정 여지 최대',
    '',
    '■ 난이도 적합성 근거 — 4단 조절 설계',
    '  · 수식 비노출 · 조작은 ‘기준선 끌기’ 하나로 시작 (첫 조작까지 클릭 2회)',
    '  · 용어 3단 계단 — 생활어(‘덥다’) → 조작어(기준) → 학술어(임계값·유효 열용량) 순 도입',
    '  · 심화는 선택 분기 — 열관성 실험실(에너지수지 모형)·전국 16지점·26개 비교 구간',
    '  · 읽기 부담 관리 — 화면 본문 한 문장 45자 이하, 한 화면 한 질문 원칙',
    '',
    '■ 교실 투입 형태',
    '  · 교사용 학습지 동시 제공 — 수업 흐름 · 활동지 · 오개념 표 8행 · 평가 루브릭',
    '  · 설치·로그인·결제 없음 · 크롬 단독 구동 · 모바일 대응(390px 검증)',
    '  · 미션 1 기준 16화면 · 진행 눈금 1/16~16/16 실시간 표시',
]

# ── 2. 문제 정의 및 분석 (S7) · (2) 주제 적합성 ─────────────
S7_TITLE = '2. 문제 정의 및 분석'
S7_L = [
    '■ 개발계획서 제시 기상·기후 개념 → 결과물 구현 대조',
    '',
    '① 기후 평년값과 계절의 길이',
    '  → 미션 2 ‘여름은 며칠일까’ · 화면 전역 ‘30년 기후평년 아님’ 고지',
    '② 기온 상승과 극값·계절 이동',
    '  → 미션 1 처서 · 미션 5 계절 지연 · 폭염/열대야 기준표',
    '③ 24절기의 과학 (태양황경 15° 간격)',
    '  → 24절기 궤도 화면 · 절기별 황경·지구–태양 거리 표시',
    '④ 습도·강수 변화',
    '  → 지표 3종(기온·강수·습도) · 미션 4 강수 빈도 대 강도',
    '⑤ (확장) CO₂–기온 상관',
    '  → ‘지구 맥락’ 화면 · 상관 제시, 인과 단정 회피',
    '',
    '■ 미해결 문제 정의 — 절기·날씨·기후 혼동',
    '  · “처서가 더워졌다” = 절기(천문 날짜)에 기온을 귀속하는 오개념',
    '  · 기존 콘텐츠는 결론만 전달 → 학습자가 검증 경험 없음',
]
S7_R = [
    '■ 체험 중 주제 인식 근거',
    '',
    '① 첫 화면이 곧 주제',
    '  · 표제 “24절기, 지금도 맞을까?”',
    '  · 부제 “움직이지 않는 절기와 움직이는 기후를 나란히”',
    '',
    '② 매 화면 자료 범위 고지 (아래 실화면)',
    '  · “기상청 ASOS 실측 · 과거 5년 vs 현재 5년 — 관측 신호이고 30년 기후평년 아님”',
    '  · “절기는 태양 위치로 정한 천문 날짜라 해마다 거의 움직이지 않음”',
    '',
    '③ 개념 렌즈 4문항 — 절기·날씨·기후 분류 통과 후 관측 진입',
    '  · “처서가 지났는데도 어제 낮 기온 31°C” → 날씨',
    '  · “처서를 9월로 옮겨야 한다” → 절기(오개념 판별 문항)',
]

# ── 3. 아이디어 도출 (S8) · (3) 아이디어 독창성 ─────────────
S8_TITLE = '3. 아이디어 도출'
S8_L = [
    '■ 차별화 포인트 3중 결합',
    '',
    '① 한국 고유 문화 기준선을 과학 검증 대상으로',
    '  · 24절기 = 학습자가 이미 아는 ‘약속’ → 반증 대상으로 전환',
    '  · 절기는 불변, 관측은 이동 — 두 축 분리가 학습 골격',
    '',
    '② 정의(定義)를 학습자에게 이양',
    '  · ‘덥다’를 몇 도로 볼지 학습자가 결정',
    '  · 같은 자료로 다른 결론 도출 경험 → 기준 공개의 필요성 체득',
    '',
    '③ 관측과 모형의 동시 제공',
    '  · 열관성 실험실 — 0차원 에너지수지 모형 직접 조작',
    '  · 필터 조작이 아니라 물리량(유효 열용량·온실효과) 조작',
    '',
    '■ 기존 서비스 대비 위치',
    '  · PhET·En-ROADS — 모형만, 실측 대조 없음',
    '  · 기후 스트라이프·기상자료개방포털 — 실측만, 조작 학습 없음',
    '  · Weather24 — 실측 + 모형 + 문화 기준선 동시',
]
S8_R = [
    '■ 새로운 학습 경험 — 예측 봉인 루프',
    '',
    '① 예측 봉인 — 자료 비공개 상태로 내 생각 기록',
    '② 직접 조작 — 기준선·지역·절기·지표 변경',
    '③ 봉인 해제 — 예측 대 자료 대조, 어긋난 지점 명시',
    '④ 내 결론(CERL) — 주장·근거·추론·한계 작성',
    '⑤ 이해 확인 → 모범 예시 비교 → 다른 절기 적용',
    '',
    '■ 새로운 인터랙션 4종',
    '  · 기준선 ⇅ 손잡이 직접 끌기 — 0초 반응',
    '  · 질문 조립기 — 조건 변경 시 검증 가능한 질문 문장 자동 생성',
    '  · 실험실 예측-공개 — 예측 후에만 내 값으로 계산한 결과 개방',
    '  · 정직한 실패 상태 — 비교 불가 시 앱이 스스로 한계 선언',
    '',
    '■ 산출물 회수 구조',
    '  · 완료 화면 ‘내 기록’ — 예측·CERL 5편·이해 확인·전이 3문항·실험 값·자유탐구 질문',
]

# ── 4. 체험·참여형 설계 (S9) · (4) ─────────────────────────
S9_TITLE = '4. 체험∙참여형 설계'
S9_L = [
    '■ 조작 → 즉시 반응 (전 경로 실측 확인)',
    '  · 기준선 ⇅ 손잡이 끌기 / 슬라이더 / ＋− 단추 / ‘자주 쓰는 기준’ — 4경로 전부 작동',
    '  · 조작 즉시 재계산 — 더위일·마지막 초과일·지도·표 동시 갱신',
    '',
    '■ 조작 강제 게이트 — 조작 없이 진행 불가',
    '  · 기준선 미조작 시 판정 버튼 잠금 (state.moved 조건)',
    '  · 미션 2 — 25°C·28°C 두 기준 요구',
    '  · 미션 3 — 제주·강원 두 지역 요구',
    '  · 미션 4 — 1mm·30mm 이상 두 기준 요구',
    '',
    '■ 조작 결과 → 학습 개념 연결',
    '  · 기준 상향 → 일수 감소 → “모호한 말은 기준을 정해야 자료가 됨”',
    '  · 1mm 감소·50mm 증가 → “빈도와 강도는 다른 지표”',
    '  · 온실효과 상향 → 곡선 상승·지연 불변 → “지연과 온난화는 다른 원인”',
]
S9_R = [
    '■ 변수 탐구 범위',
    '  · 지역 16지점 × 절기 24 × 지표 3종 × 기준값 연속 × 비교 구간 26개',
    '  · 보기 3종 — 그래프 / 전국 지도 / 표',
    '',
    '■ 직관성 확보 조치',
    '  · 조작부 전체에 화면 라벨 명시 — 지역·절기·지표·자주 쓰는 기준·비교 기간',
    '  · 결과 수치를 조작부 바로 위 고정 배치 — 시선 이동 최소화',
    '  · 스크린리더 — 슬라이더 값 변경 시 결과 수치까지 낭독(aria-valuetext)',
]

# ── 5. 학습 성과와 학습적 피드백 (S10) · (5) ────────────────
S10_TITLE = '5. 학습 성과와 학습적 피드백'
S10_BODY = [
    '■ 구체적 학습 성과 — 완료 시 회수되는 산출물 (교사 채점 근거)',
    '  · 봉인 예측 5건 · 개념 렌즈 4문항 정답률 · 이해 확인 5문항 정답률(1차/2차 구분)',
    '  · 내 결론(CERL) 5편 — 주장·근거·추론·한계 각 요소 작성 이력',
    '  · 전이 확인 3문항 — 학습하지 않은 상황에 적용 여부',
    '  · 열관성 실험실 — 학습자가 고른 물리량과 그때의 계절 지연 값',
    '  · 자유탐구 — 내가 만든 질문 + 내가 쓴 결론',
    '',
    '■ 잘못된 조작·선택에 대한 학습적 피드백 6종 (전부 배포본 실측)',
    '  · ① 이해 확인 1차 오답 → 정답 비공개 + 자료로 되돌리는 힌트 제시 (전 문항 retryHint)',
    '  · ② 예측 불일치 → “내 예측 vs 자료” 대조 후 “어긋난 지점이 배울 곳” 명시',
    '  · ③ 실험실 예측 오답 → 예측 방향과 모형 결과 병기 공개',
    '  · ④ 근거에 단위 누락 → “그 숫자가 무엇을 센 값인지 단위나 기간을 함께” 차단 안내',
    '  · ⑤ 한계에 범위어 누락 → “어디까지 통하는지” 차단 안내 (지역·기간·기준·원인)',
    '  · ⑥ 기준 극단 조작 → 조작 화면에서 즉시 “비교할 것이 남지 않음 · 기준선 하향” 안내',
    '',
    '■ 우회 차단 — 정답 고지형 회피',
    '  · 문장 중복 검사 — 같은 글 복사 차단 · 화면 안내문 베끼기 차단',
    '  · 오개념 검출 — 학생 문장의 범위 확대·인과 단정을 필수 경로에서 점검',
]

# ── 6. 구현 완성도 (S11) · (6) ─────────────────────────────
S11_TITLE = '6. 구현 완성도'
S11_L = [
    '■ 사용 기상·기후 데이터',
    '  · 기상청 ASOS 종관기상관측 일자료 — 1969~2026 · 16지점 · 3지표',
    '  · 파생 집계 — 기준 초과 일수 / 마지막 초과일 / 절기 무렵 15일 평균 / 26개 이동 구간',
    '  · 기상청 공식 기준표 — 폭염·열대야·결빙일 (기간 상이 명시)',
    '  · NOAA·OWID — CO₂ 농도와 전지구 기온 (출처·라이선스 표기)',
    '',
    '■ 실제 반영·작동 근거',
    '  · 조작 시 즉시 재계산 — 사전 계산 이미지 아님',
    '  · 자동 회귀 검증 8,360건 통과 (데이터 8,213 + 문서 147)',
    '  · 과학 수치 검산 — 태양년 365.24일 · 삭망월 354.37일 · 근일점 0.983 AU · 태양상수 1361 W/m²',
    '',
    '■ 구동 안정성 (배포본 실측)',
    '  · 1366×768 / 390×844 / 1920×1080 — 11화면 겹침·잘림·넘침·콘솔 오류 0건',
    '  · 외부 도메인 0 · 첫 로드 134KB · 로그인·결제 없음',
    '  · 배포본 = 제출 소스 해시 일치 검증 자동화',
]
S11_R = [
    '■ 제품 안의 AI — 증거 감사관',
    '  · 학습자 결론을 과장·범위·인과 3축으로 점검',
    '  · 실측 응답 예 — “서울 자료만으로 우리나라 전체를 말할 수 없고, ‘기후변화 때문에’라는 원인도 단정할 수 없음”',
    '  · 구조화 출력 강제 · 외부 전송 동의 후에만 요청 · 실패 시 기기 내 규칙 점검으로 폴백',
    '',
    '■ 제작 과정의 AI — Claude Code',
    '  · 데이터 수집·가공 → 화면 구현 → 카피 정비 전 과정 AI 페어 작업',
    '  · AI 레드팀 6회 — 자기 결과물을 교육효과·과학무결성·완성도·심사기준·카피·UI 축으로 반증',
    '  · AI 품질 평가 세트 100문항 — 허위 수치·결론 대필·인과 과장 0건 (100/100 통과)',
    '  · 프롬프트 세션 원문 6건 제출 — 비밀값·이메일·로컬 경로 마스킹 처리',
    '',
    '■ 재발 방지 자동화',
    '  · 제출 게이트 — 배포본·소스 해시 대조 · 비밀값 스캔 · 문서 정합성 · 캐시 버스팅',
    '  · 게이트 자기검증 — 위반 문자열을 실제로 잡는지 확인',
]


def main():
    src = os.path.join(BASE, 'assets', 'deck', '템플릿_원본.pptx')
    prs = Presentation(src)
    S = prs.slides

    # ── 표지 ──────────────────────────────────────────────
    s1 = S[0]
    for sh in s1.shapes:
        if sh.is_placeholder and sh.placeholder_format.idx in COVER:
            set_lines(sh.text_frame, [COVER[sh.placeholder_format.idx]])
    print('S1 표지 완료')

    # ── I. 결과물 및 팀 기본 정보 ─────────────────────────
    s5 = S[4]
    tbl = by_name(s5, '표 2').table
    for r, val in enumerate(TBL5):
        set_lines(tbl.cell(r, 1).text_frame, [val])
    set_lines(by_name(s5, 'TextBox 6').text_frame, TEAM5)
    # 팀 정보 박스는 2.08in 뿐이라 그 아래 빈 영역에 직접 앉힌다 (표 오른쪽·쪽번호 위)
    put_pic(s5, 'orbit', 7.95, 3.55, height=3.00)
    print('S5 기본정보 완료')

    # ── 1. 학습 대상 분석 ────────────────────────────────
    s6 = S[5]
    set_lines(by_name(s6, '텍스트 개체 틀 9').text_frame, [S6_TITLE])
    set_lines(by_name(s6, '직사각형 8').text_frame, S6_BODY, size=12)
    print('S6 학습대상 완료')

    # ── 2. 문제 정의 및 분석 ─────────────────────────────
    s7 = S[6]
    set_lines(by_name(s7, '텍스트 개체 틀 9').text_frame, [S7_TITLE])
    set_lines(by_name(s7, '직사각형 7').text_frame, S7_L, size=12)
    set_lines(by_name(s7, '직사각형 10').text_frame, S7_R, size=12)
    fit_pic_below(s7, by_name(s7, '직사각형 10'), S7_R, 'chart-temp')
    print('S7 문제정의 완료')

    # ── 3. 아이디어 도출 ─────────────────────────────────
    s8 = S[7]
    set_lines(by_name(s8, '텍스트 개체 틀 9').text_frame, [S8_TITLE])
    set_lines(by_name(s8, '직사각형 12').text_frame, S8_L, size=12)
    set_lines(by_name(s8, '직사각형 13').text_frame, S8_R, size=12)
    print('S8 아이디어 완료')

    # ── 4. 체험·참여형 설계 ──────────────────────────────
    s9 = S[8]
    set_lines(by_name(s9, '텍스트 개체 틀 9').text_frame, [S9_TITLE])
    set_lines(by_name(s9, '직사각형 11').text_frame, S9_L, size=12)
    set_lines(by_name(s9, '직사각형 16').text_frame, S9_R, size=12)
    fit_pic_below(s9, by_name(s9, '직사각형 16'), S9_R, 'map16')
    fit_pic_below(s9, by_name(s9, '직사각형 11'), S9_L, 'lab-ebm')
    print('S9 체험설계 완료')

    # ── 5. 학습 성과와 학습적 피드백 ─────────────────────
    s10 = S[9]
    set_lines(by_name(s10, '텍스트 개체 틀 9').text_frame, [S10_TITLE])
    set_lines(by_name(s10, '직사각형 12').text_frame, S10_BODY, size=12)
    print('S10 학습성과 완료')

    # ── 6. 구현 완성도 ───────────────────────────────────
    s11 = S[10]
    set_lines(by_name(s11, '텍스트 개체 틀 9').text_frame, [S11_TITLE])
    set_lines(by_name(s11, '직사각형 7').text_frame, S11_L, size=12)
    set_lines(by_name(s11, '직사각형 10').text_frame, S11_R, size=12)
    fit_pic_below(s11, by_name(s11, '직사각형 7'), S11_L, 'drift')
    print('S11 구현완성도 완료')

    # ── 가이드 슬라이드(2·3·4) + 별지1(12) 삭제 ──────────
    for idx in sorted([11, 3, 2, 1], reverse=True):
        drop_slide(prs, idx)
    print('가이드 3장 + 별지1 삭제 → 총 %d장' % len(prs.slides._sldIdLst))

    out = os.path.join(BASE, '발표자료_Weather24_본선.pptx')
    prs.save(out)
    print('\n저장: %s' % out)


if __name__ == '__main__':
    main()
