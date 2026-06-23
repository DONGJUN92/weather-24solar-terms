# -*- coding: utf-8 -*-
"""
web_data 빌더 — 수집한 원시 CSV(../data_collectors/output)를
'웹 인터랙티브 도구'에 바로 쓰도록 가공한 컴팩트 JSON(../web_data)으로 변환.

대회 결과물 예시 6종 + 평가기준(실현가능성·체험형)에 맞춤:
  - 슬라이더/시간축/지도에 즉시 바인딩 가능한 작은 JSON
  - 월평년값·연추세·기후변화 결합·변수범위·극값·태풍경로

실행:  python build_web_data.py        (생성 후 자동 검증)
"""
from __future__ import annotations
import sys
import json
import math
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parent.parent
SRC = BASE / "data_collectors" / "output"
OUT = BASE / "web_data"
OUT.mkdir(exist_ok=True)
(OUT / "korea_daily").mkdir(exist_ok=True)

# KMA ASOS 지점 좌표(지도 배치용)
STATIONS = {
    "서울": (108, 37.5714, 126.9658), "부산": (159, 35.1047, 129.0320),
    "인천": (112, 37.4777, 126.6249), "대구": (143, 35.8780, 128.6526),
    "광주": (156, 35.1729, 126.8916), "대전": (133, 36.3722, 127.3719),
    "제주": (184, 33.5141, 126.5297), "강릉": (105, 37.7515, 128.8910),
}
MONTHS_KR = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월",
             "9월", "10월", "11월", "12월"]


def r(x, n=1):
    """안전 반올림(NaN→None)."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    return round(float(x), n)


def write_json(name, obj):
    p = OUT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    kb = p.stat().st_size / 1024
    print(f"  ✓ {name:42s} {kb:8.1f} KB")
    return p


def load_kma():
    frames = {}
    for name, (sid, lat, lon) in STATIONS.items():
        f = SRC / f"kma_asos_daily_{name}_2022_2026.csv"
        if f.exists():
            d = pd.read_csv(f)
            d["date"] = pd.to_datetime(d["date"])
            d["year"] = d["date"].dt.year
            d["month"] = d["date"].dt.month
            frames[name] = d
    return frames


# ───────────────────────── 1) 월별 평년값 ─────────────────────────
def build_climatology(kma):
    stations = {}
    for name, d in kma.items():
        sid, lat, lon = STATIONS[name]
        # 강수 월합계의 연평균(평년 강수)
        mtot = d.groupby(["year", "month"])["sumRn"].sum().groupby("month").mean()
        rdays = (d.assign(rain=d["sumRn"] >= 1.0)
                 .groupby(["year", "month"])["rain"].sum().groupby("month").mean())
        monthly = []
        for m in range(1, 13):
            sub = d[d["month"] == m]
            monthly.append({
                "month": m,
                "tavg": r(sub["avgTa"].mean()), "tmin": r(sub["minTa"].mean()),
                "tmax": r(sub["maxTa"].mean()), "precip": r(mtot.get(m)),
                "rain_days": r(rdays.get(m)), "wind": r(sub["avgWs"].mean()),
                "humidity": r(sub["avgRhm"].mean()), "pressure": r(sub["avgPa"].mean()),
                "sunshine": r(sub["sumSsHr"].mean()),
            })
        stations[name] = {"id": sid, "lat": lat, "lon": lon, "monthly": monthly}
    return {"meta": {"title": "한국 8개 지점 월별 평년값(2022~2026)",
                     "source": "기상청 ASOS 일자료", "period": "2022-2026",
                     "fields": {"tavg": "평균기온(℃)", "tmin": "평균최저(℃)", "tmax": "평균최고(℃)",
                                "precip": "월강수량(mm)", "rain_days": "강수일수(≥1mm)",
                                "wind": "평균풍속(m/s)", "humidity": "평균습도(%)",
                                "pressure": "평균기압(hPa)", "sunshine": "일조시간합(h)"},
                     "use_case": "예시#3 기압·바람, #4 강수 시뮬레이터의 계절 슬라이더/차트"},
            "months_kr": MONTHS_KR, "stations": stations}


# ───────────────────────── 2) 연별 요약·추세 ─────────────────────────
def build_annual(kma):
    stations = {}
    for name, d in kma.items():
        sid, lat, lon = STATIONS[name]
        years = []
        for y, sub in d.groupby("year"):
            hot = sub.loc[sub["maxTa"].idxmax()] if sub["maxTa"].notna().any() else None
            cold = sub.loc[sub["minTa"].idxmin()] if sub["minTa"].notna().any() else None
            wet = sub.loc[sub["sumRn"].idxmax()] if sub["sumRn"].notna().any() else None
            years.append({
                "year": int(y), "tavg": r(sub["avgTa"].mean()),
                "precip_total": r(sub["sumRn"].sum(), 0),
                "hottest": {"date": str(hot["date"].date()), "tmax": r(hot["maxTa"])} if hot is not None else None,
                "coldest": {"date": str(cold["date"].date()), "tmin": r(cold["minTa"])} if cold is not None else None,
                "wettest": {"date": str(wet["date"].date()), "rn": r(wet["sumRn"])} if wet is not None else None,
            })
        # 연평균기온 선형추세(℃/10년) — 5년이라 참고용
        yy = np.array([v["year"] for v in years], float)
        tt = np.array([v["tavg"] for v in years], float)
        slope = float(np.polyfit(yy, tt, 1)[0]) * 10 if len(yy) >= 2 else None
        stations[name] = {"id": sid, "lat": lat, "lon": lon,
                          "warming_per_decade": r(slope, 2), "years": years}
    return {"meta": {"title": "한국 8개 지점 연별 요약·추세(2022~2026)",
                     "source": "기상청 ASOS 일자료",
                     "use_case": "예시#5 기후변화 체험, 학습효과(극값/추세)"},
            "stations": stations}


# ───────────────────────── 3) 일자료 컴팩트(컬럼형) ─────────────────────────
def build_daily(kma):
    files = []
    for name, d in kma.items():
        sid, lat, lon = STATIONS[name]
        d = d.sort_values("date")
        obj = {"station": name, "id": sid, "lat": lat, "lon": lon,
               "dates": d["date"].dt.strftime("%Y-%m-%d").tolist(),
               "tavg": [r(v) for v in d["avgTa"]], "tmin": [r(v) for v in d["minTa"]],
               "tmax": [r(v) for v in d["maxTa"]], "precip": [r(v) for v in d["sumRn"]],
               "wind": [r(v) for v in d["avgWs"]], "humidity": [r(v, 0) for v in d["avgRhm"]],
               "pressure": [r(v) for v in d["avgPa"]], "wind_dir": [r(v, 0) for v in d["maxWd"]]}
        write_json(f"korea_daily/{name}.json", obj)
        files.append(name)
    return files


# ───────────────────────── 4) 기후변화 결합 + CO2-기온 민감도 ─────────────────────────
def build_climate_change(kma):
    co2 = pd.read_csv(SRC / "noaa_gml_co2_monthly_FULL.csv")
    co2_y = co2.groupby("year")["average"].mean()
    tano = pd.read_csv(SRC / "owid_temperature_anomaly_FULL.csv")
    g = tano[tano["entity"].isin(["Global", "World"])]
    if g.empty:
        g = tano[tano["entity"] == tano["entity"].unique()[0]]
    temp_y = g.set_index("year")["near_surface_temperature_anomaly"]
    sea = pd.read_csv(SRC / "owid_sea_level_FULL.csv")
    sea["year"] = pd.to_datetime(sea["day"]).dt.year
    sea_y = sea.groupby("year")["sea_level_average"].mean()
    # 한국 연평균기온(8지점 평균)
    kor = pd.concat(kma.values()) if kma else pd.DataFrame()
    kor_y = kor.groupby("year")["avgTa"].mean() if len(kor) else pd.Series(dtype=float)

    years = sorted(set(co2_y.index) | set(temp_y.index))
    series = []
    for y in years:
        series.append({"year": int(y),
                       "co2_ppm": r(co2_y.get(y), 2), "temp_anomaly_C": r(temp_y.get(y), 3),
                       "sea_level_mm": r(sea_y.get(y), 1),
                       "korea_temp_C": r(kor_y.get(y), 2) if y in kor_y.index else None})
    # CO2→기온이상치 선형회귀(겹치는 연도)
    m = pd.DataFrame({"co2": co2_y, "temp": temp_y}).dropna()
    slope, intercept = np.polyfit(m["co2"], m["temp"], 1)
    pred = slope * m["co2"] + intercept
    ss_res = ((m["temp"] - pred) ** 2).sum()
    ss_tot = ((m["temp"] - m["temp"].mean()) ** 2).sum()
    r2 = 1 - ss_res / ss_tot
    rel = {"co2_temp_slope_C_per_ppm": r(slope, 5),
           "co2_temp_per_100ppm_C": r(slope * 100, 3),
           "intercept_C": r(intercept, 3), "r2": r(r2, 3),
           "fit_years": [int(m.index.min()), int(m.index.max())],
           "formula": "temp_anomaly_C ≈ slope×CO2_ppm + intercept",
           "note": "역사적 관측 회귀(상관). 인과 단순화로 교육용 슬라이더에 사용."}
    return {"meta": {"title": "기후변화 결합 시계열(전지구 CO2·기온·해수면 + 한국기온)",
                     "sources": ["NOAA GML(마우나로아 CO2)", "OWID(기온이상치·해수면)", "기상청(한국기온)"],
                     "use_case": "예시#5 기후변화 체험: CO2 슬라이더→기온 반응"},
            "relationship": rel, "series": series}


# ───────────────────────── 5) Keeling 곡선(월) ─────────────────────────
def build_co2_monthly():
    co2 = pd.read_csv(SRC / "noaa_gml_co2_monthly_FULL.csv")
    co2 = co2.dropna(subset=["average"])
    return {"meta": {"title": "마우나로아 월별 대기중 CO2(Keeling Curve)",
                     "source": "NOAA GML", "unit": "ppm", "use_case": "예시#5 기후변화 체험"},
            "dates": (co2["year"].astype(int).astype(str) + "-" +
                      co2["month"].astype(int).astype(str).str.zfill(2)).tolist(),
            "co2_ppm": [r(v, 2) for v in co2["average"]]}


# ───────────────────────── 6) 태풍 경로 ─────────────────────────
def typhoon_category(wind_kt):
    if wind_kt is None or math.isnan(wind_kt):
        return "미상"
    if wind_kt < 34:  return "열대저압부"
    if wind_kt < 48:  return "열대폭풍"
    if wind_kt < 64:  return "강한 열대폭풍"
    if wind_kt < 85:  return "태풍(강)"
    if wind_kt < 105: return "태풍(매우 강)"
    return "태풍(초강력)"


def build_typhoons():
    f = SRC / "ibtracs_wp_typhoons_2022_2026.csv"
    d = pd.read_csv(f)
    d["ISO_TIME"] = pd.to_datetime(d["ISO_TIME"], errors="coerce")
    d = d[d["ISO_TIME"].dt.hour.isin([0, 6, 12, 18])]   # 6시간 간격으로 컴팩트화
    storms = []
    for sid, g in d.groupby("SID"):
        g = g.sort_values("ISO_TIME")
        peak = g["wind_kt"].max()
        track = [[t.strftime("%Y-%m-%d %H:%M"), r(la, 2), r(lo, 2), r(w, 0), r(p, 0)]
                 for t, la, lo, w, p in zip(g["ISO_TIME"], g["LAT"], g["LON"],
                                            g["wind_kt"], g["pres_mb"])]
        storms.append({"sid": sid, "name": (g["NAME"].iloc[0] or "UNNAMED"),
                       "season": int(g["SEASON"].iloc[0]),
                       "peak_wind_kt": r(peak, 0),
                       "min_pres_mb": r(g["pres_mb"].min(), 0),
                       "category": typhoon_category(peak),
                       "points": len(track), "track": track})
    storms.sort(key=lambda s: (s["season"], s["sid"]))
    return {"meta": {"title": "서태평양 태풍 경로(2022~2026)",
                     "source": "NOAA IBTrACS v04r01",
                     "track_fields": ["time", "lat", "lon", "wind_kt", "pres_mb"],
                     "use_case": "예시#1 태풍 형성·발달 시뮬레이터(경로·강도)"},
            "count": len(storms), "storms": storms}


# ───────────────────────── 7) 변수 범위(슬라이더 설정) ─────────────────────────
def build_ranges(kma):
    allk = pd.concat(kma.values())
    specs = [("avgTa", "평균기온", "℃", 1), ("minTa", "최저기온", "℃", 1),
             ("maxTa", "최고기온", "℃", 1), ("sumRn", "일강수량", "mm", 1),
             ("avgWs", "평균풍속", "m/s", 1), ("avgRhm", "평균습도", "%", 0),
             ("avgPa", "평균기압", "hPa", 1), ("sumSsHr", "일조시간", "h", 1)]
    out = {}
    for col, label, unit, nd in specs:
        s = pd.to_numeric(allk[col], errors="coerce").dropna()
        out[col] = {"label": label, "unit": unit,
                    "min": r(s.min(), nd), "max": r(s.max(), nd),
                    "mean": r(s.mean(), nd), "p5": r(s.quantile(.05), nd),
                    "p95": r(s.quantile(.95), nd),
                    "suggest_min": r(s.quantile(.01), nd), "suggest_max": r(s.quantile(.99), nd)}
    return {"meta": {"title": "변수별 범위·통계(슬라이더 설정용)",
                     "source": "기상청 ASOS 8지점 2022~2026",
                     "use_case": "모든 '슬라이더 조작' 예시의 입력 범위/스텝 설정(실현가능성)"},
            "variables": out}


# ───────────────────────── 8) 극값·기록 ─────────────────────────
def build_extremes(kma):
    allk = pd.concat([d.assign(station=n) for n, d in kma.items()], ignore_index=True)
    def rec(col, how):
        idx = allk[col].idxmax() if how == "max" else allk[col].idxmin()
        row = allk.loc[idx]
        return {"station": row["station"], "date": str(row["date"].date()), "value": r(row[col])}
    return {"meta": {"title": "최근 5년 전국 기록(8지점)",
                     "source": "기상청 ASOS", "use_case": "학습효과·흥미 유발(‘did you know’)"},
            "records": {
                "hottest": rec("maxTa", "max"), "coldest": rec("minTa", "min"),
                "wettest_day": rec("sumRn", "max"), "windiest": rec("maxInsWs", "max"),
                "most_humid": rec("avgRhm", "max")}}


def main():
    print("=" * 64, "\n  web_data 빌드 시작\n", "=" * 64)
    kma = load_kma()
    print(f"KMA 지점 로드: {list(kma)}")

    write_json("korea_monthly_climatology.json", build_climatology(kma))
    write_json("korea_annual_summary.json", build_annual(kma))
    daily_files = build_daily(kma)
    write_json("climate_change.json", build_climate_change(kma))
    write_json("co2_keeling_monthly.json", build_co2_monthly())
    write_json("typhoon_tracks_wnp.json", build_typhoons())
    write_json("variable_ranges.json", build_ranges(kma))
    write_json("extremes_records.json", build_extremes(kma))

    # index.json (카탈로그)
    index = {
        "title": "기상·기후 AI 해커톤 — 웹 인터랙티브용 가공 데이터",
        "generated": pd.Timestamp.now().strftime("%Y-%m-%d"),
        "note": "모든 파일은 브라우저 fetch 후 즉시 슬라이더/지도/차트에 바인딩 가능한 컴팩트 JSON.",
        "datasets": [
            {"file": "korea_monthly_climatology.json", "예시": [3, 4], "desc": "8지점 월별 평년값"},
            {"file": "korea_annual_summary.json", "예시": [5], "desc": "연별 요약·온난화 추세·극값"},
            {"file": "korea_daily/<지점>.json", "예시": [2, 6], "desc": "일자료 컬럼형(예보관 체험·ML)"},
            {"file": "climate_change.json", "예시": [5], "desc": "CO2·기온·해수면 결합 + CO2→기온 회귀"},
            {"file": "co2_keeling_monthly.json", "예시": [5], "desc": "마우나로아 월별 CO2(Keeling)"},
            {"file": "typhoon_tracks_wnp.json", "예시": [1], "desc": "서태평양 태풍 경로·강도"},
            {"file": "variable_ranges.json", "예시": [1, 3, 4], "desc": "슬라이더 범위/스텝"},
            {"file": "extremes_records.json", "예시": [5], "desc": "전국 기록(흥미 유발)"},
        ],
        "stations": [{"name": n, "id": s[0], "lat": s[1], "lon": s[2]} for n, s in STATIONS.items()],
        "daily_files": daily_files,
    }
    write_json("index.json", index)
    print("=" * 64, "\n  완료\n", "=" * 64)


if __name__ == "__main__":
    main()
