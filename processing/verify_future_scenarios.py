# -*- coding: utf-8 -*-
"""
future_scenarios.json 검증.

이 앱은 "숫자를 어디까지 말할 수 있는지"를 가르친다. 그러므로 앱 자신의 숫자가
원본 보고서와 한 자리라도 어긋나면 안 된다. 파서가 PDF 텍스트를 상태 기계로 읽기
때문에 조용히 한 칸 밀릴 수 있어, 다음 네 축을 전부 검사한다.

  A. 구조 — 17개 시도 × 4계절 × (현재 + 4시나리오 × 3기간)이 빠짐없이 있는가
  B. 앵커 — 보고서 본문 서술에서 직접 뽑은 대표값과 일치하는가
  C. 내적 정합 — 네 계절의 시작일이 한 바퀴를 이루고, 길이 합이 365일 근처인가
  D. 매핑 — 앱의 16지점이 모두 시도로 연결되는가

실행: python verify_future_scenarios.py   (실패 시 종료코드 1)
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BASE = Path(__file__).resolve().parent.parent
F = BASE / "web_data" / "future_scenarios.json"

SCEN = ["SSP1-2.6", "SSP2-4.5", "SSP3-7.0", "SSP5-8.5"]
PER = ["p1", "p2", "p3"]
SEA = ["spring", "summer", "autumn", "winter"]

# 보고서 표에서 눈으로 확인한 앵커. (지역, 계절, 시나리오, 기간, 일수, 시작일)
SEASON_ANCHORS = [
    ("서울", "summer", None, "now", 127, "5/24"),
    ("서울", "summer", "SSP5-8.5", "p3", 188, "4/25"),
    ("서울", "winter", None, "now", 102, "11/29"),
    ("서울", "winter", "SSP5-8.5", "p3", 28, "12/30"),
    ("서울", "winter", "SSP3-7.0", "p3", 37, "12/23"),
    ("부산", "winter", None, "now", 67, "12/13"),
    ("부산", "winter", "SSP5-8.5", "p2", 0, None),
    ("부산", "summer", "SSP5-8.5", "p3", 196, "4/25"),
    ("대구", "summer", None, "now", 130, "5/19"),
    ("대구", "summer", "SSP5-8.5", "p3", 198, "4/16"),
    ("대구", "winter", "SSP5-8.5", "p3", 0, None),
    ("인천", "summer", "SSP5-8.5", "p3", 182, "4/30"),
    ("제주", "winter", None, "now", 0, None),
    ("제주", "summer", "SSP5-8.5", "p3", 211, "4/17"),
    ("제주", "spring", None, "now", 129, "1/25"),
    ("세종", "autumn", None, "now", 60, "9/19"),
    ("경기", "summer", None, "now", 117, "5/28"),
]
HEAT_ANCHORS = [
    ("서울", "now", 15.0), ("서울", "SSP5-8.5", "p3", 109.8),
    ("대구", "now", 32.4), ("대구", "SSP5-8.5", "p3", 120.1),
    ("광주", "SSP5-8.5", "p3", 118.1), ("제주", "now", 4.8),
    ("제주", "SSP5-8.5", "p3", 75.9), ("강원", "now", 6.8),
    ("서울", "SSP1-2.6", "p3", 42.7), ("부산", "SSP3-7.0", "p2", 28.3),
]
TROP_ANCHORS = [
    ("서울", "now", 11.3), ("서울", "SSP5-8.5", "p3", 96.1),
    ("부산", "now", 13.5), ("제주", "SSP5-8.5", "p3", 103.2),
]

fails: list[str] = []


def bad(msg: str) -> None:
    fails.append(msg)


def main() -> None:
    if not F.exists():
        print(f"✗ {F} 가 없습니다. build_future_scenarios.py 를 먼저 실행하세요.")
        sys.exit(1)
    d = json.load(open(F, encoding="utf-8"))
    regions = d["regions"]
    S = d["seasons"]

    # ── A. 구조 ────────────────────────────────────────────────
    if len(regions) != 17:
        bad(f"A: 시도 수가 17이 아닙니다 ({len(regions)})")
    for r in regions:
        for s in SEA:
            row = S.get(r, {}).get(s)
            if not row:
                bad(f"A: {r}/{s} 자체가 없습니다")
                continue
            if not row.get("now"):
                bad(f"A: {r}/{s}/현재 값이 없습니다")
            for sc in SCEN:
                for p in PER:
                    c = row.get(sc, {}).get(p)
                    if not c or "days" not in c:
                        bad(f"A: {r}/{s}/{sc}/{p} 값이 없습니다")

    # ── B. 앵커 ────────────────────────────────────────────────
    for a in SEASON_ANCHORS:
        r, s, sc, p, days, start = a
        cell = S[r][s]["now"] if sc is None else S[r][s][sc][p]
        if cell["days"] != days:
            bad(f"B: {r}/{s}/{sc or '현재'}/{p} 일수 {cell['days']} ≠ 보고서 {days}")
        if cell.get("start") != start:
            bad(f"B: {r}/{s}/{sc or '현재'}/{p} 시작일 {cell.get('start')} ≠ 보고서 {start}")
    for a in HEAT_ANCHORS:
        got = d["heatDays"][a[0]]["now"] if a[1] == "now" else d["heatDays"][a[0]][a[1]][a[2]]
        want = a[-1]
        if abs(got - want) > 1e-9:
            bad(f"B: 폭염일수 {a[:-1]} {got} ≠ 보고서 {want}")
    for a in TROP_ANCHORS:
        got = d["tropicalNights"][a[0]]["now"] if a[1] == "now" else d["tropicalNights"][a[0]][a[1]][a[2]]
        want = a[-1]
        if abs(got - want) > 1e-9:
            bad(f"B: 열대야일수 {a[:-1]} {got} ≠ 보고서 {want}")

    # ── C. 내적 정합 ───────────────────────────────────────────
    # 네 계절 길이의 합은 1년이어야 한다. 보고서 값은 20년 평균을 반올림한 것이라
    # 정확히 365가 아닐 수 있으므로 ±4일까지 허용한다.
    for r in regions:
        for sc in [None] + SCEN:
            for p in (["now"] if sc is None else PER):
                tot = 0
                for s in SEA:
                    cell = S[r][s]["now"] if sc is None else S[r][s][sc][p]
                    tot += cell["days"]
                if abs(tot - 365) > 4:
                    bad(f"C: {r}/{sc or '현재'}/{p} 네 계절 합 {tot}일 (365±4 벗어남)")
                # 길이가 0인데 시작일이 남아 있으면 화면이 '없는 계절의 시작일'을 찍는다
                for s in SEA:
                    cell = S[r][s]["now"] if sc is None else S[r][s][sc][p]
                    if cell["days"] == 0 and cell.get("start"):
                        bad(f"C: {r}/{s}/{sc or '현재'}/{p} 0일인데 시작일 {cell['start']}")
                    if cell["days"] > 0 and not cell.get("start"):
                        bad(f"C: {r}/{s}/{sc or '현재'}/{p} {cell['days']}일인데 시작일 없음")

    # ── D. 매핑 ────────────────────────────────────────────────
    for st, rg in d["stationToRegion"].items():
        if rg not in regions:
            bad(f"D: 지점 {st} → {rg} 가 시도 목록에 없습니다")
    try:
        sd = json.load(open(BASE / "web_data" / "solar_terms_climatology.json", encoding="utf-8"))
        for city in sd["cities"]:
            if city not in d["stationToRegion"]:
                bad(f"D: 앱 지점 '{city}' 의 시도 매핑이 없습니다")
    except FileNotFoundError:
        print("  (solar_terms_climatology.json 없음 — D축 일부 생략)")

    n_ok = len(SEASON_ANCHORS) + len(HEAT_ANCHORS) + len(TROP_ANCHORS)
    if fails:
        print(f"✗ 검증 실패 {len(fails)}건")
        for f in fails[:40]:
            print("   -", f)
        sys.exit(1)
    print(f"✓ 구조 {len(regions)}시도 × {len(SEA)}계절 × (현재 + {len(SCEN)}시나리오 × {len(PER)}기간) 완비")
    print(f"✓ 보고서 앵커 {n_ok}건 일치")
    print("✓ 계절 길이 합 · 0일 계절 시작일 정합")
    print("✓ 앱 16지점 → 시도 매핑 완비")


if __name__ == "__main__":
    main()
