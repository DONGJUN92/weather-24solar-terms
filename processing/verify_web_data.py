# -*- coding: utf-8 -*-
"""web_data 산출물 검증 — JSON 유효성 + 물리적 타당성 체크(assert)."""
from __future__ import annotations
import sys, json
from pathlib import Path
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

OUT = Path(__file__).resolve().parent.parent / "web_data"
def load(name): return json.load(open(OUT / name, encoding="utf-8"))

def main():
    print("=" * 60, "\n  web_data 검증\n", "=" * 60)
    ok = 0

    # 1) 월별 평년값: 서울 7월이 1월보다 더움, 여름 강수>겨울
    c = load("korea_monthly_climatology.json")
    seoul = c["stations"]["서울"]["monthly"]
    jan, jul = seoul[0], seoul[6]
    assert jul["tavg"] > jan["tavg"] + 15, "계절 기온 역전?"
    assert jul["precip"] > jan["precip"], "여름 강수 < 겨울?"
    print(f"  ✓ 평년값: 서울 1월 {jan['tavg']}℃/{jan['precip']}mm, 7월 {jul['tavg']}℃/{jul['precip']}mm")
    ok += 1

    # 2) 연별 요약: 8지점, 극값 날짜 존재
    a = load("korea_annual_summary.json")
    assert len(a["stations"]) == 8
    hot = a["stations"]["서울"]["years"][0]["hottest"]
    assert hot and hot["tmax"] > 25
    print(f"  ✓ 연별: 8지점, 서울 2022 최고 {hot['tmax']}℃({hot['date']})")
    ok += 1

    # 3) 일자료: 서울 길이 일치, 날짜·값 배열 동일 길이
    d = load("korea_daily/서울.json")
    n = len(d["dates"])
    assert n > 1500 and len(d["tavg"]) == n == len(d["precip"])
    print(f"  ✓ 일자료: 서울 {n}일, 배열 정합 OK ({d['dates'][0]}~{d['dates'][-1]})")
    ok += 1

    # 4) 기후변화: CO2-기온 회귀 양의 기울기, r2 타당
    cc = load("climate_change.json")
    rel = cc["relationship"]
    assert rel["co2_temp_slope_C_per_ppm"] > 0 and rel["r2"] > 0.7, rel
    assert len(cc["series"]) > 50
    print(f"  ✓ 기후변화: CO2 +100ppm당 +{rel['co2_temp_per_100ppm_C']}℃, r²={rel['r2']}, {len(cc['series'])}년")
    ok += 1

    # 5) Keeling: 단조 증가 경향(첫<끝)
    k = load("co2_keeling_monthly.json")
    assert k["co2_ppm"][0] < k["co2_ppm"][-1]
    print(f"  ✓ Keeling: {k['dates'][0]} {k['co2_ppm'][0]}ppm → {k['dates'][-1]} {k['co2_ppm'][-1]}ppm")
    ok += 1

    # 6) 태풍: 120개 내외, 트랙 좌표 범위, 강도 라벨
    t = load("typhoon_tracks_wnp.json")
    assert t["count"] >= 100
    s0 = max(t["storms"], key=lambda s: s["peak_wind_kt"] or 0)
    la, lo = s0["track"][0][1], s0["track"][0][2]
    assert 0 < la < 60 and 100 < lo < 180
    print(f"  ✓ 태풍: {t['count']}개, 최강 {s0['name']}({s0['season']}) {s0['peak_wind_kt']}kt '{s0['category']}'")
    ok += 1

    # 7) 변수범위: min<mean<max
    v = load("variable_ranges.json")["variables"]
    for key, vv in v.items():
        assert vv["min"] <= vv["mean"] <= vv["max"], key
    print(f"  ✓ 변수범위: {len(v)}종 (예: 기온 {v['avgTa']['min']}~{v['avgTa']['max']}℃)")
    ok += 1

    # 8) 극값
    e = load("extremes_records.json")["records"]
    assert e["hottest"]["value"] > e["coldest"]["value"]
    print(f"  ✓ 극값: 최고 {e['hottest']['value']}℃({e['hottest']['station']}), "
          f"최저 {e['coldest']['value']}℃({e['coldest']['station']}), "
          f"최다강수 {e['wettest_day']['value']}mm")
    ok += 1

    # 9) index 카탈로그
    idx = load("index.json")
    assert len(idx["datasets"]) == 8 and len(idx["stations"]) == 8
    print(f"  ✓ index: 데이터셋 {len(idx['datasets'])}종, 지점 {len(idx['stations'])}개")
    ok += 1

    print("=" * 60, f"\n  {ok}/9 검증 통과 ✅\n", "=" * 60)

if __name__ == "__main__":
    main()
