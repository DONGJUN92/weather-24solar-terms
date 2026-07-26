# -*- coding: utf-8 -*-
"""
24절기 데이터 빌더 (v4 — 레드팀 RC-A / RC-C 반영).
입력: data_collectors/output/allyears/kma_allyears_<지점>.csv  (1969~2026, 16지점)
산출: web_data/solar_terms_climatology.json + prototype/solar_terms_data.js

v4에서 바뀐 것 (레드팀 지적 반영):
  RC-C  불완결 연도(2026: 173일)를 평년 비교에서 제외한다. PRESENT를 완결 5년(2021~2025)으로 이동.
        지점·기간별로 '실제 사용한 연도 목록'을 JSON에 기록해 화면이 표본 수를 정직하게 표기할 수 있게 한다.
  RC-A  '기준 이상 일수'와 '마지막 기준초과일'을 평활 평년곡선에서 세지 않는다.
        연도별 실제 관측값으로 센 뒤 평균하는 실측 통계를 임계값 그리드로 사전계산한다.
        (평활 곡선은 '보기용 곡선'으로만 남는다 — 곡선에서 센 일수는 고임계에서 과소·저임계에서 과대다.)

산출 구조 (지점별):
  temp/humidity/precip:
    past, present            : 365일 평활 평년곡선 (그리기 전용)
    exceedDays.{past,present}: {임계값: 연평균 기준 이상 일수}          ← 실측
    lastDoy.{past,present}   : {임계값: [연평균 마지막초과 doy, 해당 연도 수]}  ← 실측, temp만
  years   : {past: [...], present: [...]}   실제 사용한 완결 연도
  timeline: 연별(1969~2025) 연평균/연합계 × 3지표
실행: python build_solar_terms.py   (완료 후 verify_solar_terms.py로 검증)
"""
from __future__ import annotations
import sys, json
from datetime import date
from pathlib import Path
import numpy as np
import pandas as pd
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

BASE = Path(__file__).resolve().parent.parent
SRC = BASE / "data_collectors" / "output" / "allyears"
OUT_JSON = BASE / "web_data" / "solar_terms_climatology.json"
OUT_JS = BASE / "prototype" / "solar_terms_data.js"

# name -> (lat, lon, type, 관측소 실명, 지점번호)  — '도' 칩은 단일 관측소임을 화면에 밝히기 위해 실명을 함께 싣는다
STATIONS = {
    "서울": (37.5714, 126.9658, "city", "서울", 108), "부산": (35.1047, 129.0320, "city", "부산", 159),
    "인천": (37.4777, 126.6249, "city", "인천", 112), "대구": (35.8780, 128.6526, "city", "대구", 143),
    "광주": (35.1729, 126.8916, "city", "광주", 156), "대전": (36.3722, 127.3719, "city", "대전", 133),
    "제주": (33.5141, 126.5297, "city", "제주", 184), "강릉": (37.7515, 128.8910, "city", "강릉", 105),
    "경기": (37.2571, 126.9831, "do", "수원", 119), "충북": (36.6392, 127.4407, "do", "청주", 131),
    "충남": (36.7766, 126.4939, "do", "서산", 129), "전북": (35.8409, 127.1192, "do", "전주", 146),
    "전남": (34.8170, 126.3812, "do", "목포", 165), "경북": (36.0320, 129.3800, "do", "포항", 138),
    "경남": (35.1639, 128.0401, "do", "진주", 192), "강원": (37.9026, 127.7357, "do", "춘천", 101),
}
PAST = (1969, 1973)
PRESENT = (2021, 2025)          # RC-C: 완결 5년. 2026은 6/22까지라 평년 비교에서 제외한다.
MIN_DAYS = 350                  # 완결 연도 판정 기준 (annual_series와 동일 게이트)

#          key         col        label  unit    nd  fill0  임계값 그리드(화면 슬라이더가 도달 가능한 전 범위)
METRICS = [("temp",     "avgTa",   "기온",   "℃",    1, False, range(20, 35)),
           ("humidity", "avgRhm",  "습도",   "%",    0, False, range(55, 96)),
           ("precip",   "sumRn",   "강수량", "mm/일", 1, True,  range(1, 21))]
LAST_DOY_METRICS = {"temp"}     # '마지막 기준초과일'을 쓰는 지표 (화면 showLast와 일치)

# 24절기 — 이름/한자/양력 대표날짜/뜻/계절/字풀이/특징
# 날짜는 태양황경 기준 1969~2026년 최빈 그레고리력 날짜(RC-H: 상강 10/24 → 10/23 정정)
TERMS = [
    ("소한","小寒",1,6,"본격 추위 시작","winter","작을 소(小)+찰 한(寒)","‘작은 추위’라는 이름과 달리 실제로는 한 해 중 가장 추운 시기. ‘대한이 소한 집에 놀러 갔다 얼어 죽는다’는 속담이 있다."),
    ("대한","大寒",1,20,"가장 추운 때","winter","클 대(大)+찰 한(寒)","‘큰 추위’. 겨울 추위의 매듭을 짓는 마지막 절기로, 이 무렵을 지나면 추위가 누그러진다."),
    ("입춘","立春",2,4,"봄의 시작","spring","설 립(立)+봄 춘(春)","봄이 시작되는 첫 절기. 대문에 ‘입춘대길(立春大吉)’을 써 붙여 한 해의 복과 풍년을 기원했다."),
    ("우수","雨水",2,19,"눈이 녹아 비가 됨","spring","비 우(雨)+물 수(水)","눈이 녹아 비가 되고 얼음이 풀려 물이 많아지는 때. 본격적으로 봄기운이 돈다."),
    ("경칩","驚蟄",3,6,"겨울잠 깬 벌레","spring","놀랄 경(驚)+숨을 칩(蟄)","겨울잠 자던 벌레와 개구리가 놀라 깨어나는 때. 만물이 활동을 시작한다."),
    ("춘분","春分",3,21,"낮과 밤이 같음(봄)","spring","봄 춘(春)+나눌 분(分)","봄의 한가운데로 낮과 밤의 길이가 같아진다. 이후로 낮이 점점 길어진다."),
    ("청명","淸明",4,5,"맑고 밝음","spring","맑을 청(淸)+밝을 명(明)","하늘이 맑고 밝아 농사 준비(논밭갈이)를 시작하는 때. 한식과 시기가 겹친다."),
    ("곡우","穀雨",4,20,"농사를 돕는 봄비","spring","곡식 곡(穀)+비 우(雨)","곡식을 윤택하게 하는 봄비가 내린다. 못자리를 마련하며 본격 농사철이 시작된다."),
    ("입하","立夏",5,6,"여름의 시작","summer","설 립(立)+여름 하(夏)","여름이 시작되는 절기. 초목이 무성해지고 농작물이 빠르게 자란다."),
    ("소만","小滿",5,21,"만물이 차오름","summer","작을 소(小)+찰 만(滿)","햇볕이 풍부해 만물이 점차 자라 가득 차기 시작한다. 보리가 익고 모내기를 준비한다."),
    ("망종","芒種",6,6,"씨 뿌리는 때","summer","까끄라기 망(芒)+씨 종(種)","보리처럼 까끄라기 있는 곡식을 거두고 벼를 심는 때. 농가가 일 년 중 가장 바쁘다."),
    ("하지","夏至",6,21,"낮이 가장 긴 날","summer","여름 하(夏)+이를 지(至)","여름의 절정에 ‘이른다’는 뜻. 낮이 일 년 중 가장 길다."),
    ("소서","小暑",7,7,"작은 더위","summer","작을 소(小)+더울 서(暑)","‘작은 더위’. 본격적인 더위가 시작되며 장마가 이어진다."),
    ("대서","大暑",7,23,"가장 더운 때","summer","클 대(大)+더울 서(暑)","‘큰 더위’. 장마가 끝나고 일 년 중 가장 무더운 시기로 폭염이 절정에 이른다."),
    ("입추","立秋",8,8,"가을의 시작","autumn","설 립(立)+가을 추(秋)","가을이 시작되는 절기. 한낮은 덥지만 아침저녁으로 서늘한 기운이 돌기 시작한다."),
    ("처서","處暑",8,23,"더위가 그침","autumn","곳·그칠 처(處)+더울 서(暑)","더위가 한풀 꺾여 ‘그치는’ 때. ‘처서가 지나면 모기 입이 비뚤어진다’는 말이 있다."),
    ("백로","白露",9,8,"흰 이슬이 맺힘","autumn","흰 백(白)+이슬 로(露)","밤 기온이 내려가 풀잎에 흰 이슬이 맺힌다. 가을 기운이 완연해진다."),
    ("추분","秋分",9,23,"낮과 밤이 같음(가을)","autumn","가을 추(秋)+나눌 분(分)","가을의 한가운데로 낮과 밤의 길이가 같아진다. 이후로 밤이 점점 길어진다."),
    ("한로","寒露",10,8,"차가운 이슬","autumn","찰 한(寒)+이슬 로(露)","찬 이슬이 맺히는 때. 단풍이 짙어지고 추수가 한창이다."),
    ("상강","霜降",10,23,"서리가 내림","autumn","서리 상(霜)+내릴 강(降)","서리가 내리기 시작한다. 첫서리로 단풍이 절정에 이르고 가을걷이를 마무리한다."),
    ("입동","立冬",11,7,"겨울의 시작","winter","설 립(立)+겨울 동(冬)","겨울이 시작되는 절기. 김장을 담그고 겨울 채비를 한다."),
    ("소설","小雪",11,22,"첫눈이 옴","winter","작을 소(小)+눈 설(雪)","첫눈이 내리기 시작하는 때. 살얼음이 얼고 본격적인 추위에 대비한다."),
    ("대설","大雪",12,7,"큰 눈이 옴","winter","클 대(大)+눈 설(雪)","‘큰 눈’이 내리는 때. 한 해 중 눈이 가장 많이 온다고 여겨졌다."),
    ("동지","冬至",12,22,"밤이 가장 긴 날","winter","겨울 동(冬)+이를 지(至)","겨울의 절정에 ‘이른다’는 뜻. 밤이 일 년 중 가장 길며 팥죽을 먹는 풍습이 있다."),
]


def md_to_doy(m, d):
    return date(2023, m, d).timetuple().tm_yday


def csmooth(a, half=7):
    """원형 15일 이동평균 — 보기용 평년 곡선을 매끄럽게 한다."""
    n = len(a); out = np.empty(n)
    for i in range(n):
        out[i] = np.nanmean([a[(i + k) % n] for k in range(-half, half + 1)])
    return out


def load(name):
    df = pd.read_csv(SRC / f"kma_allyears_{name}.csv")
    df["date"] = pd.to_datetime(df["date"])
    df["year"] = df["date"].dt.year
    return df


def complete_years(df, y0, y1):
    """RC-C: 관측일수가 MIN_DAYS 이상인 '완결 연도'만 평년 비교에 쓴다."""
    c = df[(df["year"] >= y0) & (df["year"] <= y1)].groupby("year").size()
    return [int(y) for y, n in c.items() if n >= MIN_DAYS]


def _series(df, col, years, fill0):
    sub = df[df["year"].isin(years)].copy()
    s = pd.to_numeric(sub[col], errors="coerce")
    if fill0:
        s = s.fillna(0.0)        # ASOS는 무강수일을 공란으로 보고한다 → 0mm가 올바른 해석
    sub = sub.assign(_v=s)
    return sub[~((sub["date"].dt.month == 2) & (sub["date"].dt.day == 29))]


def climatology(df, col, years, fill0):
    """보기용 평년 곡선(365일). 일수 계산에는 쓰지 않는다 — RC-A 참조."""
    g = _series(df, col, years, fill0)
    md = g.groupby([g["date"].dt.month, g["date"].dt.day])["_v"].mean()
    arr = np.full(365, np.nan)
    for (m, dd), v in md.items():
        arr[md_to_doy(int(m), int(dd)) - 1] = v
    arr = pd.Series(arr).interpolate(limit_direction="both").to_numpy()
    return csmooth(arr, 7)


def exceed_stats(df, col, years, fill0, thresholds, want_last):
    """RC-A: 연도별 실제 관측값으로 세고 평균한다.
    반환 (days, last)
      days[thr] = 연평균 '기준 이상' 일수
      last[thr] = [연평균 마지막 초과일(doy, 1-based), 초과일이 있었던 연도 수] 또는 None
    """
    g = _series(df, col, years, fill0)
    doy = g["date"].dt.dayofyear.to_numpy()
    # 윤년 3/1 이후를 평년 doy로 맞춘다(2/29 제거 후이므로 -1)
    leap = g["date"].dt.is_leap_year.to_numpy() & (g["date"].dt.month.to_numpy() > 2)
    doy = np.where(leap, doy - 1, doy)
    yr = g["year"].to_numpy()
    val = g["_v"].to_numpy(dtype=float)
    days, last = {}, {}
    for thr in thresholds:
        hit = val >= thr
        per_year_count, per_year_last = [], []
        for y in years:
            m = (yr == y)
            h = hit & m
            per_year_count.append(int(h.sum()))
            if want_last and h.any():
                per_year_last.append(int(doy[h].max()))
        days[str(thr)] = round(float(np.mean(per_year_count)), 1)
        if want_last:
            last[str(thr)] = [int(round(float(np.mean(per_year_last)))), len(per_year_last)] if per_year_last else None
    return days, last


def window_sensitivity(df, thr=25):
    """RC-C-2: '왜 하필 이 5년인가'에 데이터로 답한다.
    과거(PAST) 고정, 현재 창을 1996년 이후 모든 완결 5년 창으로 옮겨 시차 범위를 구하고
    장기(1996~2025) 값을 함께 낸다. 화면에서 한계를 학습 소재로 쓰기 위한 값.
    """
    g = _series(df, "avgTa", complete_years(df, 1969, 2025), False)
    doy = g["date"].dt.dayofyear.to_numpy()
    leap = g["date"].dt.is_leap_year.to_numpy() & (g["date"].dt.month.to_numpy() > 2)
    doy = np.where(leap, doy - 1, doy)
    yr, val = g["year"].to_numpy(), g["_v"].to_numpy(dtype=float)
    comp = set(complete_years(df, 1969, 2025))

    def last_mean(years):
        ls = [int(doy[(yr == y) & (val >= thr)].max()) for y in years if ((yr == y) & (val >= thr)).any()]
        return float(np.mean(ls)) if ls else None

    base = last_mean([y for y in range(PAST[0], PAST[1] + 1) if y in comp])
    if base is None:
        return None
    drifts = []
    for y0 in range(1996, PRESENT[1] - 3):
        ys = [y for y in range(y0, y0 + 5) if y in comp]
        if len(ys) < 5:
            continue
        m = last_mean(ys)
        if m is not None:
            drifts.append(round(m - base, 1))
    long_ys = [y for y in range(1996, PRESENT[1] + 1) if y in comp]
    lm = last_mean(long_ys)
    cur = last_mean([y for y in range(PRESENT[0], PRESENT[1] + 1) if y in comp])
    if not drifts or lm is None or cur is None:
        return None
    return {"thr": thr, "current": round(cur - base, 1),
            "min": min(drifts), "max": max(drifts), "windows": len(drifts),
            "longSpan": [long_ys[0], long_ys[-1]], "longYears": len(long_ys),
            "long": round(lm - base, 1)}


def annual_series(df, col, agg):
    s = pd.to_numeric(df[col], errors="coerce")
    if agg == "sum":
        s = s.fillna(0.0)
    tmp = pd.DataFrame({"year": df["year"], "v": s})
    out = {}
    for y, grp in tmp.groupby("year"):
        if len(grp) < MIN_DAYS:
            continue                      # 불완전 연도 제외(2026 등)
        out[int(y)] = (grp["v"].sum() if agg == "sum" else grp["v"].mean())
    return out


def main():
    cities = {}
    year_lo, year_hi = 1969, 2025
    for name, (lat, lon, typ, station, sid) in STATIONS.items():
        f = SRC / f"kma_allyears_{name}.csv"
        if not f.exists():
            print(f"  (건너뜀: {name} 아직 미수집)"); continue
        df = load(name)
        py = complete_years(df, *PAST)
        cy = complete_years(df, *PRESENT)
        e = {"lat": lat, "lon": lon, "type": typ, "station": station, "sid": sid,
             "years": {"past": py, "present": cy}}
        for mk, col, lab, unit, nd, f0, thrs in METRICS:
            want_last = mk in LAST_DOY_METRICS
            e[mk] = {"exceedDays": {}, "lastDoy": {}} if want_last else {"exceedDays": {}}
            for pk, years in (("past", py), ("present", cy)):
                e[mk][pk] = [round(float(x), nd if nd else 1) for x in climatology(df, col, years, f0)]
                d, l = exceed_stats(df, col, years, f0, thrs, want_last)
                e[mk]["exceedDays"][pk] = d
                if want_last:
                    e[mk]["lastDoy"][pk] = l
        tl = {"years": []}
        series = {mk: annual_series(df, col, "sum" if mk == "precip" else "mean")
                  for mk, col, *_ in METRICS}
        yrs = sorted(set(range(year_lo, year_hi + 1)) & set().union(*[set(series[mk]) for mk in series]))
        tl["years"] = yrs
        for mk, *_ in METRICS:
            tl[mk] = [(round(series[mk][y], 1) if y in series[mk] else None) for y in yrs]
        e["timeline"] = tl
        e["sensitivity"] = window_sensitivity(df)
        cities[name] = e
        d25 = e["temp"]["exceedDays"]
        l25 = e["temp"]["lastDoy"]
        print(f"  {name}({station} {sid}): 과거 {len(py)}년{py} 현재 {len(cy)}년{cy} · "
              f"25℃ 이상 연평균 {d25['past']['25']}일→{d25['present']['25']}일 · "
              f"마지막초과 {l25['past']['25']}→{l25['present']['25']}")

    allyears = sorted(set().union(*[set(cities[n]["timeline"]["years"]) for n in cities]))
    nat = {"years": allyears}
    for mk, *_ in METRICS:
        vals = []
        for y in allyears:
            xs = []
            for n in cities:
                tl = cities[n]["timeline"]
                if y in tl["years"]:
                    v = tl[mk][tl["years"].index(y)]
                    if v is not None:
                        xs.append(v)
            vals.append(round(sum(xs) / len(xs), 2) if xs else None)
        nat[mk] = vals

    terms = [{"name": n, "hanja": h, "date": f"{m}/{d}", "doy": md_to_doy(m, d), "meaning": mean,
              "season": s, "hanja_gloss": hg, "desc": ds} for (n, h, m, d, mean, s, hg, ds) in TERMS]

    data = {"meta": {"title": "24절기: 조상의 약속 vs 실제 기후",
                     "source": "기상청 ASOS 16지점 일자료(1969~2026)",
                     "curve": "표시용 평년 곡선 = 완결 연도의 일자별 평균 + 15일 원형 이동평균",
                     "counts": "기준 이상 일수·마지막 초과일 = 연도별 실제 관측값으로 센 뒤 평균(연평균)",
                     "note": "불완결 연도(관측 350일 미만)는 평년 비교에서 제외"},
            "periods": {"past": f"{PAST[0]}–{PAST[1]}", "present": f"{PRESENT[0]}–{PRESENT[1]}"},
            "periodYears": {"past": list(PAST), "present": list(PRESENT)},
            "metrics": [{"key": k, "label": l, "unit": u, "promise": (k == "temp")} for (k, _, l, u, *_) in METRICS],
            "cities": cities, "nationwide": nat, "terms": terms}
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    json.dump(data, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("window.SOLAR_DATA = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"\n  ✓ {OUT_JSON.name} ({OUT_JSON.stat().st_size // 1024} KB) · "
          f"{OUT_JS.name} ({OUT_JS.stat().st_size // 1024} KB) · nationwide {nat['years'][0]}~{nat['years'][-1]}")


if __name__ == "__main__":
    main()
