# -*- coding: utf-8 -*-
"""
[참고사이트 #18/#19 Copernicus ERA5 의 '키 없이 되는' 경로]
Open-Meteo Historical Weather API = Copernicus C3S ERA5 재분석을 무인증으로 제공
  https://open-meteo.com/en/docs/historical-weather-api   (데이터 출처: ERA5 / ECMWF·Copernicus)

특징 : API 키 불필요. 재분석 자료라 '빠짐 없는' 일별 시계열(결측 0)에 가까움.
수집 : 한국 주요 도시 최근 N개년 일별 기온/강수/바람/일사 등.
사용 :
  python collect_openmeteo_era5.py --years 5
  python collect_openmeteo_era5.py --simulate
"""
from __future__ import annotations
import argparse
import time
from datetime import date, timedelta

import pandas as pd

import common
from common import (log, make_session, http_get, save_csv, banner,
                    validate_daily_complete)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"

CITIES = {
    "Seoul":   (37.5665, 126.9780),
    "Busan":   (35.1796, 129.0756),
    "Incheon": (37.4563, 126.7052),
    "Daegu":   (35.8714, 128.6014),
    "Gwangju": (35.1595, 126.8526),
    "Daejeon": (36.3504, 127.3845),
    "Jeju":    (33.4996, 126.5312),
}

DAILY_VARS = [
    "temperature_2m_max", "temperature_2m_min", "temperature_2m_mean",
    "apparent_temperature_max", "apparent_temperature_min",
    "precipitation_sum", "rain_sum", "snowfall_sum",
    "windspeed_10m_max", "windgusts_10m_max", "winddirection_10m_dominant",
    "shortwave_radiation_sum", "et0_fao_evapotranspiration",
]


def daily_json_to_df(j: dict, city: str) -> pd.DataFrame:
    d = j["daily"]
    df = pd.DataFrame(d)
    df.insert(0, "city", city)
    df = df.rename(columns={"time": "date"})
    df["date"] = pd.to_datetime(df["date"])
    return df


def fetch_city(session, city: str, lat: float, lon: float,
               start: date, end: date) -> pd.DataFrame:
    params = {
        "latitude": lat, "longitude": lon,
        "start_date": start.isoformat(), "end_date": end.isoformat(),
        "daily": ",".join(DAILY_VARS), "timezone": "Asia/Seoul",
    }
    r = http_get(session, ARCHIVE_URL, params=params)
    r.raise_for_status()
    return daily_json_to_df(r.json(), city)


def run(years: int, end: date, cities: dict):
    banner("Open-Meteo (ERA5 재분석) — 한국 도시 일별 수집")
    start = date(end.year - years + 1, 1, 1)
    session = make_session()
    all_frames, summary = [], []
    for i, (city, (lat, lon)) in enumerate(cities.items()):
        log.info("수집: %s (%.4f, %.4f) %s~%s", city, lat, lon, start, end)
        try:
            df = fetch_city(session, city, lat, lon, start, end)
        except Exception as e:
            log.error("  ✗ %s 실패(건너뜀): %s", city, e)
            continue
        save_csv(df, f"openmeteo_era5_{city}_{start.year}_{end.year}.csv")
        rep = validate_daily_complete(df, "date", start, end, allow_missing_ratio=0.01)
        log.info("  검증: 커버 %s~%s | 내부결측 %d/%d | 최신지연 %d일 | ok=%s",
                 rep["coverage_first"], rep["coverage_last"], rep["internal_missing"],
                 rep["internal_expected"], rep["trailing_lag_days"], rep["ok"])
        all_frames.append(df)
        summary.append((city, rep))
        if i < len(cities) - 1:
            time.sleep(1.5)   # 무료 API 분당 제한 회피(예의상 간격)
    if all_frames:
        combined = pd.concat(all_frames, ignore_index=True)
        save_csv(combined, f"openmeteo_era5_ALLCITIES_{start.year}_{end.year}.csv")
    banner("요약")
    for city, rep in summary:
        print(f"  - {city:8s} {rep['coverage_first']}~{rep['coverage_last']}  "
              f"{rep['rows']:>5d}행  내부결측 {rep['internal_missing']}일  ok={rep['ok']}")
    return summary


def simulate():
    banner("[SIMULATE] Open-Meteo — 합성 JSON으로 코드 경로 검증")
    rng = pd.date_range("2024-01-01", "2024-12-31", freq="D")
    fake = {"daily": {"time": [d.strftime("%Y-%m-%d") for d in rng],
                      "temperature_2m_max": [10.0] * len(rng),
                      "temperature_2m_min": [2.0] * len(rng),
                      "precipitation_sum": [0.0] * len(rng)}}
    df = daily_json_to_df(fake, "Seoul")
    assert list(df.columns)[:2] == ["city", "date"], "컬럼 구성 오류"
    assert len(df) == 366, f"2024년 윤년 366일 기대, 실제 {len(df)}"
    rep = validate_daily_complete(df, "date", date(2024, 1, 1), date(2024, 12, 31),
                                  allow_missing_ratio=0.0)
    assert rep["internal_missing"] == 0 and rep["ok"], f"연속성 검증 실패: {rep}"
    save_csv(df, "openmeteo_era5_Seoul_SIM.csv", simulated=True)
    print("  ✓ JSON→DF 변환·366일(윤년)·결측0 검증 정상")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=5)
    ap.add_argument("--end", type=str, default=(date.today() - timedelta(days=5)).isoformat(),
                    help="ERA5 최종본은 약 5일 지연 → 기본 end=오늘-5일")
    ap.add_argument("--cities", nargs="*", default=list(CITIES))
    ap.add_argument("--simulate", action="store_true")
    a = ap.parse_args()
    if a.simulate:
        simulate(); return
    sel = {k: CITIES[k] for k in a.cities if k in CITIES}
    run(a.years, date.fromisoformat(a.end), sel)


if __name__ == "__main__":
    main()
