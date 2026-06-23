# -*- coding: utf-8 -*-
"""
[참고사이트 #15] Our World in Data — Climate Change
  https://ourworldindata.org/climate-change

특징 : 인증 키 불필요(완전 공개). CSV 직접 다운로드.
수집 : 국가별 CO2 배출(연 단위, 1750~현재), 전지구 기온 이상치(temperature anomaly),
       대기중 CO2 농도(월 단위) 등 핵심 기후 데이터셋.
사용 : python collect_owid_climate.py --years 5
       python collect_owid_climate.py --simulate     # 네트워크 없이 코드 검증
"""
from __future__ import annotations
import argparse
import io
from datetime import date

import pandas as pd

import common
from common import log, make_session, http_get, save_csv, banner

# (이름, URL, 연도컬럼) — 모두 키 불필요 공개 엔드포인트
DATASETS = [
    # 국가별 연간 CO2 배출 종합(가장 안정적인 owid 카탈로그)
    ("owid_co2_by_country",
     "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv",
     "year"),
    # 전지구 평균 기온 이상치 (grapher CSV 공개 엔드포인트)
    ("owid_temperature_anomaly",
     "https://ourworldindata.org/grapher/temperature-anomaly.csv?v=1&csvType=full&useColumnShortNames=true",
     "Day"),
    # 해수면 온도 이상치
    ("owid_sea_surface_temp_anomaly",
     "https://ourworldindata.org/grapher/sea-surface-temperature-anomaly.csv?v=1&csvType=full&useColumnShortNames=true",
     "Day"),
    # 전지구 평균 해수면 상승
    ("owid_sea_level",
     "https://ourworldindata.org/grapher/sea-level.csv?v=1&csvType=full&useColumnShortNames=true",
     "Day"),
]


def fetch_csv(session, url: str) -> pd.DataFrame:
    r = http_get(session, url)
    r.raise_for_status()
    return pd.read_csv(io.StringIO(r.content.decode("utf-8", errors="replace")))


def _find_time_col(df: pd.DataFrame, hint: str) -> str:
    """시간 컬럼 자동 탐지 (대소문자 무시). OWID 변형 대응."""
    lower = {c.lower(): c for c in df.columns}
    for key in (hint.lower(), "year", "day", "date", "time"):
        if key in lower:
            return lower[key]
    raise KeyError(f"시간 컬럼을 찾지 못함. 컬럼들={list(df.columns)}")


def filter_recent(df: pd.DataFrame, year_col: str, years: int, end_year: int) -> pd.DataFrame:
    """최근 N개년만 남김. 날짜형이면 연도 추출, 정수 연도면 그대로 사용."""
    col = _find_time_col(df, year_col)
    s = df[col]
    if s.dtype.kind in "if" and s.dropna().between(1000, 3000).all():
        yr = pd.to_numeric(s, errors="coerce")           # 정수 '연도' 컬럼
    else:
        yr = pd.to_datetime(s, errors="coerce").dt.year   # 날짜 문자열
    # 데이터셋이 요청 연도보다 일찍 끝나면, 그 데이터셋의 마지막 연도 기준 최근 N개년
    eff_end = min(end_year, int(yr.max()))
    cutoff = eff_end - years + 1
    if eff_end < end_year:
        log.info("  └ 이 데이터셋은 %d년까지만 존재 → 최근 %d개년=%d~%d", eff_end, years, cutoff, eff_end)
    return df[yr >= cutoff].copy()


def run(years: int, end_year: int):
    banner("Our World in Data — Climate Change 수집")
    session = make_session()
    saved = []
    for name, url, ycol in DATASETS:
        try:
            log.info("다운로드: %s", name)
            df = fetch_csv(session, url)
            full = save_csv(df, f"{name}_FULL.csv")
            recent = filter_recent(df, ycol, years, end_year)
            rec = save_csv(recent, f"{name}_recent{years}y.csv")
            log.info("  └ 전체 %d행 → 최근 %d개년 %d행", len(df), years, len(recent))
            saved.append((name, len(df), len(recent)))
        except Exception as e:
            log.error("  ✗ 실패(%s): %s", name, e)
    banner("요약")
    for n, a, b in saved:
        print(f"  - {n:42s} 전체 {a:>8,}행 / 최근{years}년 {b:>7,}행")
    if not saved:
        raise SystemExit("수집된 데이터셋이 없습니다. 네트워크/URL 확인 필요.")
    return saved


def simulate():
    """네트워크 없이 파싱/필터/저장 로직만 검증."""
    banner("[SIMULATE] OWID — 합성 데이터로 코드 경로 검증")
    yrs = list(range(2010, 2026))
    df = pd.DataFrame({
        "country": ["South Korea"] * len(yrs) + ["World"] * len(yrs),
        "year": yrs * 2,
        "co2": [600 + i for i in range(len(yrs))] * 2,
        "co2_per_capita": [12.0] * len(yrs) * 2,
    })
    full = save_csv(df, "owid_co2_by_country_FULL.csv", simulated=True)
    recent = filter_recent(df, "year", 5, 2025)
    save_csv(recent, "owid_co2_by_country_recent5y.csv", simulated=True)
    # 최근 5개년 = 2021~2025, 2개국 → 10행
    assert len(recent) == 10, f"필터 결과 예상(10행)과 다름: {len(recent)}"
    assert set(recent["year"]) == set(range(2021, 2026)), "최근 5개년 연도 불일치"
    print("  ✓ 다운로드→파싱→연도필터→CSV저장 경로 정상 (assert 통과)")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=5)
    ap.add_argument("--end-year", type=int, default=date.today().year)
    ap.add_argument("--simulate", action="store_true")
    a = ap.parse_args()
    if a.simulate:
        simulate()
    else:
        run(a.years, a.end_year)


if __name__ == "__main__":
    main()
