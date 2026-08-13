# -*- coding: utf-8 -*-
"""
미래 기후변화 시나리오(SSP) 데이터 빌더.

입력: 기상청 국립기상과학원 「지역 기후변화 전망보고서 개정판」(2024.02.29,
      발간등록번호 11-1360000-001799-01)에서 추출한 텍스트.
      원본 PDF: http://www.climate.go.kr/home/cc_data/2024/지역 기후변화 전망보고서 개정판_240229.pdf
산출: web_data/future_scenarios.json + prototype/future_scenarios.js

담는 표 3개:
  표 4-113  17개 광역시·도 계절길이 및 계절시작일 전망 (봄·여름·가을·겨울 × 4시나리오 × 3기간)
  표 4-22   17개 광역시·도 폭염일수 전망 및 편차
  표 4-23   17개 광역시·도 열대야일수 전망 및 편차

왜 이 보고서인가:
  기후정보포털의 자료 다운로드는 2024-07-01자로 종료되어 '기후변화 상황지도'로
  이관됐고, 상황지도의 원자료 다운로드는 로그인이 필요하다. 상황지도 내부 JSON
  (POST /atlas/dsh/ccf/getSsnLen)은 무인증으로 응답하지만 CORS 헤더가 없어
  런타임 호출이 불가능하고, 무엇보다 **보고서 값과 수치가 다르다**
  (서울 SSP5-8.5 후반기 겨울: 보고서 28일 vs 상황지도 12일).
  두 출처를 섞으면 검증 불가능한 숫자가 되므로 **발간등록번호가 있는 보고서 한 곳만** 쓴다.

주의(화면이 반드시 함께 밝혀야 하는 것):
  · 이 값은 관측이 아니라 **모형이 계산한 전망**이다.
  · 기준기간이 앱의 ASOS 비교(1969–1973 vs 2021–2025)와 다르다 — 여기서는 2000–2019.
  · 시도 단위 평균이라 앱의 '관측소 1곳'과 공간 범위가 다르다.
  · 계절 시작일 정의는 기상청(2012): 일평균기온 9일 이동평균이 봄 5℃↑ / 여름 20℃↑ /
    가을 20℃↓ / 겨울 5℃↓를 지나 다시 되돌아가지 않는 첫날.

실행: python build_future_scenarios.py
"""
from __future__ import annotations
import json
import re
import sys
from datetime import date
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE = Path(__file__).resolve().parent.parent
SRC = BASE / "processing" / "source" / "region_report_2024.txt"
OUT_JSON = BASE / "web_data" / "future_scenarios.json"
OUT_JS = BASE / "prototype" / "future_scenarios.js"

SCENARIOS = ["SSP1-2.6", "SSP2-4.5", "SSP3-7.0", "SSP5-8.5"]
# 보고서의 기간 구분. PRD0(현재)은 표의 '현재 기후 값' 열이다.
PERIODS = [
    ("now", "현재", "2000–2019"),
    ("p1", "21세기 전반기", "2021–2040"),
    ("p2", "21세기 중반기", "2041–2060"),
    ("p3", "21세기 후반기", "2081–2100"),
]
SEASONS = [("spring", "봄"), ("summer", "여름"), ("autumn", "가을"), ("winter", "겨울")]
REGIONS = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
           "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"]

# 앱의 16지점(관측소 1곳) → 보고서의 17개 시도(광역 평균).
# 공간 범위가 다르다는 사실 자체를 화면이 말해야 하므로 매핑을 데이터에 남긴다.
STATION_TO_REGION = {
    "서울": "서울", "부산": "부산", "인천": "인천", "대구": "대구", "광주": "광주",
    "대전": "대전", "제주": "제주", "강릉": "강원", "경기": "경기", "충북": "충북",
    "충남": "충남", "전북": "전북", "전남": "전남", "경북": "경북", "경남": "경남",
    "강원": "강원",
}


def md_to_doy(m: int, d: int) -> int:
    return date(2023, m, d).timetuple().tm_yday


def parse_season_table(text: str) -> dict:
    """표 4-113 — 지역 × 계절 × 시나리오 × 기간의 (계절길이, 계절시작일).

    PDF에서 뽑은 텍스트는 표의 셀이 줄바꿈으로 흩어져 있다. 안정적으로 읽히는 것은
    '<n>일 (<m>.<d>.)' 조각과 그 앞에 오는 시나리오 이름·계절 이름·지역 이름뿐이므로,
    토큰을 순서대로 훑으면서 상태 기계로 채운다.
    겨울이 사라지는 칸은 '0일 (-)'로 적혀 있다 — 값이 없는 것이 아니라 0이다.
    """
    out = {r: {s: {} for s, _ in SEASONS} for r in REGIONS}
    blocks = []
    for m in re.finditer(r"표 4-113\. 광역시·도 계절길이 및 계절시작일 전망", text):
        blocks.append(m.start())
    if not blocks:
        raise SystemExit("표 4-113을 찾지 못했습니다. 원본 텍스트를 확인하세요.")
    seg = text[blocks[0]:]

    cell = re.compile(r"(\d+)일\s*\((?:(\d{1,2})\.(\d{1,2})\.|-)\)")
    region_re = re.compile(r"^(%s)$" % "|".join(REGIONS))
    season_re = re.compile(r"^(봄|여름|가을|겨울)")
    scen_re = re.compile(r"^(SSP1-2\.6|SSP2-4\.5|SSP3-7\.0|SSP5-8\.5)")

    cur_region = None
    cur_season = None
    filled = 0
    for raw in seg.split("\n"):
        line = raw.strip()
        if not line:
            continue
        if region_re.match(line):
            cur_region = line
            cur_season = None
            continue
        if cur_region is None:
            continue
        ms = season_re.match(line)
        if ms:
            cur_season = {"봄": "spring", "여름": "summer", "가을": "autumn", "겨울": "winter"}[ms.group(1)]
            # 같은 줄에 '현재' 값이 붙어 오는 경우: "여름 127일"
            c = cell.search(line)
            rest = line[ms.end():]
            c = cell.search(rest)
            if c:
                out[cur_region][cur_season]["now"] = _cell(c)
                filled += 1
            else:
                m2 = re.search(r"(\d+)일", rest)
                if m2:
                    out[cur_region][cur_season]["_now_days"] = int(m2.group(1))
            continue
        if cur_season is None:
            continue
        # '(3.11.)' 만 따로 오는 줄 — 직전에 일수만 읽은 '현재' 칸을 완성한다.
        # PDF 추출본에는 닫는 괄호가 빠진 칸('(9.19.')과 계절이 사라진 칸('(-)')이 있다.
        if "_now_days" in out[cur_region][cur_season]:
            days = out[cur_region][cur_season]["_now_days"]
            md = re.match(r"\(\s*(\d{1,2})\.(\d{1,2})\.?\)?$", line)
            if md:
                out[cur_region][cur_season].pop("_now_days")
                out[cur_region][cur_season]["now"] = _mk(days, int(md.group(1)), int(md.group(2)))
                filled += 1
                continue
            if line == "(-)":
                out[cur_region][cur_season].pop("_now_days")
                out[cur_region][cur_season]["now"] = {"days": days, "start": None}
                filled += 1
                continue
        msc = scen_re.match(line)
        if not msc:
            continue
        scen = msc.group(1)
        cells = [_cell(c) for c in cell.finditer(line)]
        for i, v in enumerate(cells[:3]):
            out[cur_region][cur_season][PERIODS[i + 1][0]] = v
            filled += 1
        if cells:
            out[cur_region][cur_season].setdefault("_scen", {})
            out[cur_region][cur_season]["_scen"][scen] = {
                PERIODS[i + 1][0]: v for i, v in enumerate(cells[:3])
            }
    # 상태 기계가 시나리오별로 덮어쓴 값을 정리해 최종 구조로 옮긴다
    clean = {}
    for r in REGIONS:
        clean[r] = {}
        for s, _ in SEASONS:
            d = out[r][s]
            per_scen = d.pop("_scen", {})
            d.pop("_now_days", None)
            row = {"now": d.get("now")}
            for scen in SCENARIOS:
                row[scen] = per_scen.get(scen, {})
            clean[r][s] = row
    return clean


def _cell(c) -> dict:
    days = int(c.group(1))
    if c.group(2) is None:
        return {"days": days, "start": None}
    return _mk(days, int(c.group(2)), int(c.group(3)))


def _mk(days: int, mm: int, dd: int) -> dict:
    return {"days": days, "start": f"{mm}/{dd}", "doy": md_to_doy(mm, dd)}


def parse_index_table(text: str, title: str) -> dict:
    """표 4-22(폭염일수)·표 4-23(열대야일수).

    구조: 지역 이름 줄 다음에 '현재값' 그리고 12개 전망값(4시나리오 × 3기간) 한 줄,
    그 아래 12개 편차 한 줄. 편차는 전망값에서 현재값을 빼면 나오므로 읽지 않는다.
    """
    # 같은 문자열이 목차에도 있다. 표 본문은 바로 뒤에 머리글 '구분'이 오는 쪽이다.
    i = -1
    for m in re.finditer(re.escape(title), text):
        if "구분" in text[m.end():m.end() + 40]:
            i = m.start()
            break
    if i < 0:
        raise SystemExit(f"{title} 본문을 찾지 못했습니다.")
    # 다음 표가 시작되기 전까지만 읽는다. 창을 넉넉히 잡으면 뒤따르는 표 4-24(여름일수)를
    # 같은 지역 키에 덮어써서, 형식이 똑같기 때문에 아무 오류 없이 다른 표가 실린다.
    nxt = re.search(r"\n표 4-\d+\. ", text[i + len(title):])
    end = i + len(title) + (nxt.start() if nxt else 9000)
    seg = text[i:end]
    out = {}
    lines = [x.strip() for x in seg.split("\n")]
    k = 0
    while k < len(lines):
        line = lines[k]
        m = re.fullmatch(r"(%s)\s+([\d.]+)" % "|".join(REGIONS), line)
        if not m:
            k += 1
            continue
        region, now = m.group(1), float(m.group(2))
        nums = []
        j = k + 1
        while j < len(lines) and len(nums) < 12:
            got = re.findall(r"(?<![+\-\d.])(\d+\.\d)", lines[j])
            if not got:
                break
            nums.extend(float(x) for x in got)
            j += 1
        if len(nums) >= 12:
            row = {"now": now}
            for si, scen in enumerate(SCENARIOS):
                row[scen] = {PERIODS[pi + 1][0]: nums[si * 3 + pi] for pi in range(3)}
            out[region] = row
        k = j
    return out


def main():
    if not SRC.exists():
        raise SystemExit(
            f"원본 텍스트가 없습니다: {SRC}\n"
            "「지역 기후변화 전망보고서 개정판」(2024) PDF를 텍스트로 추출해 그 경로에 두세요."
        )
    text = SRC.read_text(encoding="utf-8", errors="replace")

    seasons = parse_season_table(text)
    heat = parse_index_table(text, "표 4-22. 17개 광역시·도 폭염일수 전망 및 편차(일)")
    trop = parse_index_table(text, "표 4-23. 17개 광역시·도 열대야일수 전망 및 편차(일)")

    missing = []
    for r in REGIONS:
        for s, _ in SEASONS:
            row = seasons[r][s]
            if not row.get("now"):
                missing.append(f"{r}/{s}/now")
            for scen in SCENARIOS:
                for pk, *_ in PERIODS[1:]:
                    if pk not in row.get(scen, {}):
                        missing.append(f"{r}/{s}/{scen}/{pk}")
    if missing:
        print(f"  ⚠ 빠진 칸 {len(missing)}개 — 예: {missing[:8]}")

    data = {
        "meta": {
            "title": "SSP 시나리오 기반 미래 계절·극한기후 전망",
            "source": "기상청 국립기상과학원 「지역 기후변화 전망보고서 개정판」(2024.02.29)",
            "docId": "발간등록번호 11-1360000-001799-01",
            "url": "http://www.climate.go.kr/home/cc_data/2024/",
            "tables": "표 4-113(계절길이·시작일) · 표 4-22(폭염일수) · 표 4-23(열대야일수)",
            "baseline": "2000–2019 (앱의 ASOS 비교 기간과 다릅니다)",
            "seasonDef": "기상청(2012): 일평균기온 9일 이동평균이 봄 5℃ 이상, 여름 20℃ 이상, "
                         "가을 20℃ 미만, 겨울 5℃ 미만으로 바뀐 뒤 되돌아가지 않는 첫날",
            "heatDef": "폭염일수 = 일 최고기온 33℃ 이상인 날의 연중 일수 (기상청 극한기후지수)",
            "tropDef": "열대야일수 = 일 최저기온 25℃ 이상인 날의 연중 일수 (기상청 극한기후지수)",
            "caution": "관측이 아니라 기후모형이 계산한 전망값입니다. 광역시·도 평균이므로 "
                       "관측소 한 지점의 값과 직접 비교할 수 없습니다.",
        },
        "scenarios": [
            {"key": "SSP1-2.6", "label": "SSP1-2.6", "short": "탄소를 크게 줄인 미래",
             "desc": "재생에너지로 빠르게 바꿔 21세기 후반에 탄소중립에 이르는 경로"},
            {"key": "SSP2-4.5", "label": "SSP2-4.5", "short": "지금 흐름이 이어지는 미래",
             "desc": "기후정책이 지금 수준으로 유지되는 중간 경로"},
            {"key": "SSP3-7.0", "label": "SSP3-7.0", "short": "협력이 어려운 미래",
             "desc": "국가 간 경쟁이 심해져 온실가스가 계속 느는 경로"},
            {"key": "SSP5-8.5", "label": "SSP5-8.5", "short": "화석연료를 계속 쓰는 미래",
             "desc": "화석연료 기반 고성장이 이어지는 가장 높은 배출 경로"},
        ],
        "periods": [{"key": k, "label": l, "span": s} for k, l, s in PERIODS],
        "seasonKeys": [{"key": k, "label": l} for k, l in SEASONS],
        "regions": REGIONS,
        "stationToRegion": STATION_TO_REGION,
        "seasons": seasons,
        "heatDays": heat,
        "tropicalNights": trop,
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    json.dump(data, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("window.FUTURE_DATA = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    s = seasons["서울"]["summer"]
    w = seasons["서울"]["winter"]
    print(f"  서울 여름 {s['now']['days']}일({s['now']['start']}) → "
          f"SSP5-8.5 후반기 {s['SSP5-8.5']['p3']['days']}일({s['SSP5-8.5']['p3']['start']})")
    print(f"  서울 겨울 {w['now']['days']}일({w['now']['start']}) → "
          f"SSP5-8.5 후반기 {w['SSP5-8.5']['p3']['days']}일")
    print(f"  폭염일수 {len(heat)}개 시도 · 열대야일수 {len(trop)}개 시도")
    print(f"\n  ✓ {OUT_JSON.name} ({OUT_JSON.stat().st_size // 1024} KB) · "
          f"{OUT_JS.name} ({OUT_JS.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
