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
           ("precip",   "sumRn",   "강수량", "mm/일", 1, True,  range(1, 81))]
LAST_DOY_METRICS = {"temp"}     # '마지막 기준초과일'을 쓰는 지표 (화면 showLast와 일치)

# 24절기 — 이름/한자/양력 대표날짜/뜻/계절/字풀이/특징
# 날짜는 태양황경 기준 1969~2026년 최빈 그레고리력 날짜.
#   RC-H : 상강 10/24 → 10/23 정정
#   R4-1 : 입하 5/6 → 5/5(31회 vs 27회), 입추 8/8 → 8/7(31회 vs 27회) 정정.
#          겉보기 태양황경(Meeus, 장동·광행차·ΔT 보정) 교차시각을 KST로 1969~2026 전수
#          계산해 최빈 날짜를 다시 구했다. verify_solar_terms.py J축이 24개 전부를 검사한다.
TERMS = [
    ("소한","小寒",1,6,"본격 추위 시작","winter","작을 소(小)+찰 한(寒)","‘작은 추위’라는 이름과 달리 실제로는 한 해 중 가장 추운 시기. ‘대한이 소한 집에 놀러 갔다 얼어 죽는다’는 속담이 있다."),
    ("대한","大寒",1,20,"가장 추운 때","winter","클 대(大)+찰 한(寒)","‘큰 추위’. 겨울 추위의 매듭을 짓는 마지막 절기로, 이 무렵을 지나면 추위가 누그러진다."),
    ("입춘","立春",2,4,"봄의 시작","spring","설 립(立)+봄 춘(春)","봄이 시작되는 첫 절기. 대문에 ‘입춘대길(立春大吉)’을 써 붙여 한 해의 복과 풍년을 기원했다."),
    ("우수","雨水",2,19,"눈이 녹아 비가 됨","spring","비 우(雨)+물 수(水)","눈이 녹아 비가 되고 얼음이 풀려 물이 많아지는 때. 본격적으로 봄기운이 돈다."),
    ("경칩","驚蟄",3,6,"겨울잠 깬 벌레","spring","놀랄 경(驚)+숨을 칩(蟄)","겨울잠 자던 벌레와 개구리가 놀라 깨어나는 때. 만물이 활동을 시작한다."),
    ("춘분","春分",3,21,"낮과 밤이 같음(봄)","spring","봄 춘(春)+나눌 분(分)","봄의 한가운데로 낮과 밤의 길이가 같아진다. 이후로 낮이 점점 길어진다."),
    ("청명","淸明",4,5,"맑고 밝음","spring","맑을 청(淸)+밝을 명(明)","하늘이 맑고 밝아 농사 준비(논밭갈이)를 시작하는 때. 한식과 시기가 겹친다."),
    ("곡우","穀雨",4,20,"농사를 돕는 봄비","spring","곡식 곡(穀)+비 우(雨)","곡식을 윤택하게 하는 봄비가 내린다. 못자리를 마련하며 본격 농사철이 시작된다."),
    ("입하","立夏",5,5,"여름의 시작","summer","설 립(立)+여름 하(夏)","여름이 시작되는 절기. 초목이 무성해지고 농작물이 빠르게 자란다."),
    ("소만","小滿",5,21,"만물이 차오름","summer","작을 소(小)+찰 만(滿)","햇볕이 풍부해 만물이 점차 자라 가득 차기 시작한다. 보리가 익고 모내기를 준비한다."),
    ("망종","芒種",6,6,"씨 뿌리는 때","summer","까끄라기 망(芒)+씨 종(種)","보리처럼 까끄라기 있는 곡식을 거두고 벼를 심는 때. 농가가 일 년 중 가장 바쁘다."),
    ("하지","夏至",6,21,"낮이 가장 긴 날","summer","여름 하(夏)+이를 지(至)","여름의 절정에 ‘이른다’는 뜻. 낮이 일 년 중 가장 길다."),
    ("소서","小暑",7,7,"작은 더위","summer","작을 소(小)+더울 서(暑)","‘작은 더위’. 본격적인 더위가 시작되며 장마가 이어진다."),
    ("대서","大暑",7,23,"가장 더운 때","summer","클 대(大)+더울 서(暑)","‘큰 더위’. 장마가 끝나고 일 년 중 가장 무더운 시기로 폭염이 절정에 이른다."),
    ("입추","立秋",8,7,"가을의 시작","autumn","설 립(立)+가을 추(秋)","가을이 시작되는 절기. 한낮은 덥지만 아침저녁으로 서늘한 기운이 돌기 시작한다."),
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


def doy_str(doy):
    """빌드 로그용 — 평년 doy(1~365)를 '10/23' 형태로."""
    dt = date(2023, 1, 1).toordinal() + int(doy) - 1
    dt = date.fromordinal(dt)
    return f"{dt.month}/{dt.day}"


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


def rain_flip(e):
    """RC-N 강수 미션: '비 온 날'은 줄고 '강한 비'는 느는 전환점을 데이터에서 찾는다.
    낮은 기준에서 감소, 높은 기준에서 증가로 부호가 바뀌는 첫 임계값을 반환."""
    g = e["precip"]["exceedDays"]
    ts = sorted(int(t) for t in g["past"])
    diffs = [(t, round(g["present"][str(t)] - g["past"][str(t)], 1)) for t in ts]
    usable = [(t, d) for t, d in diffs if g["past"][str(t)] >= 1.0]
    if not usable:
        return None
    flip = None
    for t, d in usable:
        if d > 0:
            flip = t
            break
    lo = usable[0]
    hi = max(usable, key=lambda x: x[0])
    return {"low": [lo[0], lo[1]], "high": [hi[0], hi[1]], "flip": flip,
            "maxThr": hi[0], "diffs": {str(t): d for t, d in usable}}


def seasonal_lag(curve_past, curve_present):
    """계절 지연 — 태양이 가장 높은 날(하지)과 실제로 가장 더운 날의 시차.

    앱의 핵심 오개념 방지 장치다. 절기와 실제 날씨가 어긋나 보이는 이유에는
    기후변화 신호 말고도 '땅과 바다가 데워지는 데 걸리는 시간'(열관성)이 있다.
    이 값이 없으면 학습자가 모든 어긋남을 기후변화로 귀인할 수 있다.

    극값일은 개별 연도의 최고기온일이 아니라 '평년 곡선의 최고점'이다.
    (연도별 최고일은 해마다 크게 흔들려 계절 지연을 보이는 데 적합하지 않다.)
    """
    SUMMER_SOLSTICE = md_to_doy(6, 21)      # 낮이 가장 긴 날
    WINTER_SOLSTICE = md_to_doy(12, 22)     # 밤이 가장 긴 날

    TOL = 0.4   # °C — 이 안에 드는 날은 '사실상 같은 온도'로 본다

    def _circ_center(doys):
        """연말·연초를 가로지르는 날짜 집합의 중앙. 원형 평균으로 구한다."""
        ang = np.array(doys, dtype=float) * 2 * np.pi / 365.0
        x, y = np.cos(ang).mean(), np.sin(ang).mean()
        d = (np.arctan2(y, x) * 365.0 / (2 * np.pi)) % 365.0
        return int(round(d)) or 365

    def _plateau(curve, want_max):
        """극값에서 TOL 안에 드는 날들의 원형 중앙을 돌려준다.

        argmax/argmin 한 점은 평탄한 구간에서 0.2°C 차이로 결정되어 표본에
        민감하다. 같은 온도로 볼 수 있는 날들의 중앙이 훨씬 안정적이다.
        """
        arr = np.asarray(curve, dtype=float)
        peak = arr.max() if want_max else arr.min()
        hit = np.where(arr >= peak - TOL)[0] if want_max else np.where(arr <= peak + TOL)[0]
        return _circ_center((hit + 1).tolist())

    def extremes(curve):
        return _plateau(curve, True), _plateau(curve, False)

    ph, pc = extremes(curve_past)
    nh, nc = extremes(curve_present)

    def lag(doy, solstice):
        return (doy - solstice) % 365

    return {
        "solstice": {"summer": SUMMER_SOLSTICE, "winter": WINTER_SOLSTICE},
        "past":    {"hotDoy": ph, "coldDoy": pc,
                     "hotLag": lag(ph, SUMMER_SOLSTICE), "coldLag": lag(pc, WINTER_SOLSTICE),
                     "hotT": round(float(curve_past[ph - 1]), 1), "coldT": round(float(curve_past[pc - 1]), 1)},
        "present": {"hotDoy": nh, "coldDoy": nc,
                     "hotLag": lag(nh, SUMMER_SOLSTICE), "coldLag": lag(nc, WINTER_SOLSTICE),
                     "hotT": round(float(curve_present[nh - 1]), 1), "coldT": round(float(curve_present[nc - 1]), 1)},
    }


def lag_stability(df, years):
    """R4-P0-4: 계절 지연이 '표본을 바꿔도 남는 신호'인지 '흔들리는 숫자'인지 잰다.

    5년 중 한 해를 빼고 다시 계산하는 잭나이프(leave-one-year-out)를 돌려
    지연 값이 얼마나 움직이는지 기록한다. 이 앱은 학습자에게 '흔들리는 숫자와
    남는 방향을 구별하라'고 가르치므로, 자기 숫자에 같은 잣대를 먼저 대야 한다.

    실측 결과: 여름 지연은 잭나이프에서 ±2~3일로 견고하고, 겨울 지연은
    지점에 따라 20~30일씩 흔들린다. 화면은 이 차이를 그대로 말해야 한다.
    """
    if len(years) < 3:
        return None
    hot, cold = [], []
    for drop in years:
        ys = [y for y in years if y != drop]
        cur = climatology(df, "avgTa", ys, False)
        L = seasonal_lag(cur, cur)["present"]
        hot.append(L["hotLag"])
        cold.append(L["coldLag"])
    return {"n": len(years),
            "hot": {"min": int(min(hot)), "max": int(max(hot)), "span": int(max(hot) - min(hot))},
            "cold": {"min": int(min(cold)), "max": int(max(cold)), "span": int(max(cold) - min(cold))}}


# 폭염·열대야는 일 최고/최저기온이 필요하다. allyears 통합본(일평균 3종)에는 없고,
# 별도 수집분(data_collectors/output/kma_asos_daily_*.csv, 8지점)에 minTa·maxTa가 있다.
# 자료가 있는데 "계산할 수 없다"고 말하지 않기 위해 이 블록을 따로 만든다.
# 기간이 통합본과 다르므로(현재 2022–2025, 4년) 화면이 그 사실을 함께 표기한다.
DAILY_SRC = BASE / "data_collectors" / "output"
EXTREME_PAST = (1969, 1973)
EXTREME_NOW = (2022, 2025)
# 라벨 주의(2026-08 정정): 33℃·35℃는 **특보 기준온도가 아니다**.
# 폭염특보는 2023-05-15부터 '일 최고 체감온도' 기준이고(2020-05 시범운영 → 2023 정식),
# 2026-06-01 개편으로 폭염중대경보·열대야주의보까지 신설됐다.
# 여기서 세는 33℃·35℃·25℃는 기상청 **기후통계(극한기후지수)** 정의다 — 둘은 다른 약속이다.
#   · 폭염일수  = 일 최고기온 33℃ 이상          (기상자료개방포털 기후통계분석)
#   · 여름일수  = 일 최고기온 25℃ 이상          (기상청 극한기후지수 / ETCCDI SU)
#   · 열대야일수 = 일 최저기온 25℃ 이상          (기상청 극한기후지수)
#     ※ 기상자료개방포털의 열대야일수는 '밤최저기온(당일 18:01~익일 09:00)' 기준이라
#        일 최저기온으로 센 이 값과 미세하게 다를 수 있다. 화면이 그 사실을 함께 밝힌다.
EXTREME_DEFS = [
    ("summerDay", "여름일", "maxTa", 25.0, "ge", "일 최고기온 25℃ 이상", "기상청 극한기후지수 ‘여름일수’ / ETCCDI SU"),
    ("heatwave", "폭염일", "maxTa", 33.0, "ge", "일 최고기온 33℃ 이상", "기상청 기후통계 ‘폭염일수’ 정의"),
    ("hot35", "35℃ 이상 폭염일", "maxTa", 35.0, "ge", "일 최고기온 35℃ 이상", "기상청 기후통계 지표"),
    ("tropicalNight", "열대야", "minTa", 25.0, "ge", "일 최저기온 25℃ 이상", "기상청 극한기후지수 ‘열대야일수’ 정의"),
    ("iceDay", "결빙일", "maxTa", 0.0, "lt", "일 최고기온 0℃ 미만", "하루 종일 영하"),
]

# ── 서리 조건일 (상강 10/23의 실측 대응) ──────────────────────────────
# minTg = 최저초상온도. 지면 위 약 5cm 잔디 끝의 최저기온으로, 백엽상 1.5m 기온과
# 다른 물리를 담는다(맑고 바람 없는 밤의 복사냉각). 그래서 기상청 기온이 영상 3℃여도
# 초상온도는 영하일 수 있고, 실제로 서리는 그때 내린다.
#
# 반드시 지킬 것: 기상청 공식 '첫서리일'은 관측자가 눈으로 확인하는 계절관측 종목이다.
# minTg ≤ 0℃ 를 '첫서리일'이라고 부르면 공식 정의를 잘못 옮기는 것이다.
# 이 앱은 **'서리가 내릴 조건이 갖춰진 날'** 로만 부르고 화면에도 그렇게 적는다.
FROST_AUTUMN_FROM = md_to_doy(8, 1)     # 가을 첫 조건일을 찾기 시작하는 날
FROST_SPRING_TO = md_to_doy(6, 30)      # 봄 마지막 조건일을 찾는 마지막 날


def extreme_index(name):
    """일 최고/최저기온 기반 지수. 자료가 없으면 None을 돌려 화면이 조용히 퇴화한다."""
    frames = []
    for span in (f"{EXTREME_PAST[0]}_{EXTREME_PAST[1]}", "2022_2026"):
        f = DAILY_SRC / f"kma_asos_daily_{name}_{span}.csv"
        if not f.exists():
            return None
        d = pd.read_csv(f, usecols=lambda c: c in ("date", "avgTa", "minTa", "maxTa"))
        frames.append(d)
    df = pd.concat(frames, ignore_index=True)
    df["date"] = pd.to_datetime(df["date"])
    df["year"] = df["date"].dt.year
    if not {"minTa", "maxTa"} <= set(df.columns):
        return None

    def years_of(lo, hi):
        c = df[(df["year"] >= lo) & (df["year"] <= hi)].groupby("year").size()
        return [int(y) for y, n in c.items() if n >= MIN_DAYS]

    py, ny = years_of(*EXTREME_PAST), years_of(*EXTREME_NOW)
    if len(py) < 3 or len(ny) < 3:
        return None
    out = {"periods": {"past": f"{EXTREME_PAST[0]}–{EXTREME_PAST[1]}", "present": f"{EXTREME_NOW[0]}–{EXTREME_NOW[1]}"},
           "years": {"past": py, "present": ny}, "idx": {}}
    for key, label, col, thr, op, defn, src in EXTREME_DEFS:
        v = pd.to_numeric(df[col], errors="coerce")
        hit = (v >= thr) if op == "ge" else (v < thr)
        row = {"label": label, "def": defn, "src": src, "thr": thr, "col": col}
        for pk, ys in (("past", py), ("present", ny)):
            # 결측일은 '해당 없음'이 아니라 '셀 수 없음'이다 — 유효 관측일수로 정규화한다.
            counts = []
            for y in ys:
                m = df["year"].to_numpy() == y
                valid = m & v.notna().to_numpy()
                if valid.sum() < MIN_DAYS:
                    continue
                counts.append(float((hit.to_numpy() & valid).sum()) * 365.0 / float(valid.sum()))
            row[pk] = round(float(np.mean(counts)), 1) if counts else None
        if row["past"] is not None and row["present"] is not None:
            row["diff"] = round(row["present"] - row["past"], 1)
        out["idx"][key] = row
    return out


def frost_window(name):
    """서리 조건일 — 가을 첫 조건일 · 봄 마지막 조건일 · 그 사이 무상기간.

    minTg(최저초상온도) ≤ 0℃ 인 날을 연도별로 찾아 평균한다. 곡선에서 세지 않고
    실제 관측일에서 세는 것은 exceed_stats와 같은 원칙이다.
    자료가 없거나 표본이 3년 미만이면 None을 돌려 화면이 조용히 퇴화한다.
    """
    frames = []
    for span in (f"{EXTREME_PAST[0]}_{EXTREME_PAST[1]}", "2022_2026"):
        f = DAILY_SRC / f"kma_asos_daily_{name}_{span}.csv"
        if not f.exists():
            return None
        frames.append(pd.read_csv(f, usecols=lambda c: c in ("date", "minTg")))
    df = pd.concat(frames, ignore_index=True)
    if "minTg" not in df.columns:
        return None
    df["date"] = pd.to_datetime(df["date"])
    df["year"] = df["date"].dt.year
    df["doy"] = df["date"].dt.dayofyear
    df["tg"] = pd.to_numeric(df["minTg"], errors="coerce")

    def stats(y0, y1):
        firsts, lasts, spans = [], [], []
        for y in range(y0, y1 + 1):
            s = df[(df["year"] == y) & df["tg"].notna()]
            if len(s) < MIN_DAYS:
                continue                      # 결측이 많은 해는 '조건일 없음'과 구분되지 않는다
            fall = s[(s["doy"] >= FROST_AUTUMN_FROM) & (s["tg"] <= 0)]
            spring = s[(s["doy"] <= FROST_SPRING_TO) & (s["tg"] <= 0)]
            f = int(fall["doy"].min()) if len(fall) else None
            l = int(spring["doy"].max()) if len(spring) else None
            if f is not None:
                firsts.append(f)
            if l is not None:
                lasts.append(l)
            if f is not None and l is not None:
                spans.append(f - l)           # 무상기간 = 봄 마지막 조건일 다음날부터 가을 첫 조건일까지
        if not firsts or not lasts:
            return None
        return {"first": int(round(float(np.mean(firsts)))),
                "last": int(round(float(np.mean(lasts)))),
                "free": int(round(float(np.mean(spans)))) if spans else None,
                "n": len(firsts)}

    p, c = stats(*EXTREME_PAST), stats(*EXTREME_NOW)
    if not p or not c:
        return None
    return {
        "periods": {"past": f"{EXTREME_PAST[0]}–{EXTREME_PAST[1]}", "present": f"{EXTREME_NOW[0]}–{EXTREME_NOW[1]}"},
        "past": p, "present": c,
        "shift": c["first"] - p["first"],
        "freeShift": (c["free"] - p["free"]) if (p["free"] is not None and c["free"] is not None) else None,
        "col": "minTg",
        "def": "최저초상온도(지면 위 약 5cm) 0℃ 이하",
        "note": "기상청 공식 ‘첫서리일’은 관측자가 눈으로 확인하는 계절관측 종목입니다. "
                "이 값은 그것이 아니라 <b>서리가 내릴 조건이 갖춰진 날</b>이에요 — 이름이 다르면 숫자도 다릅니다.",
    }


def sliding_windows(df, thresholds, span=5, start=1996):
    """5년 창을 한 해씩 옮겨 가며 기준별 통계를 낸다 (기간 창 조작 변수용).

    '왜 하필 이 5년인가'를 문장이 아니라 조작으로 배우게 하기 위한 데이터.
    과거(PAST)는 고정하고 현재 창만 움직인다.
    """
    comp = set(complete_years(df, 1969, PRESENT[1]))
    g = _series(df, "avgTa", sorted(comp), False)
    doy = g["date"].dt.dayofyear.to_numpy()
    leap = g["date"].dt.is_leap_year.to_numpy() & (g["date"].dt.month.to_numpy() > 2)
    doy = np.where(leap, doy - 1, doy)
    yr, val = g["year"].to_numpy(), g["_v"].to_numpy(dtype=float)

    def stats(years, thr):
        hit = val >= thr
        cnt, last = [], []
        for y in years:
            h = hit & (yr == y)
            cnt.append(int(h.sum()))
            if h.any():
                last.append(int(doy[h].max()))
        return (round(float(np.mean(cnt)), 1),
                int(round(float(np.mean(last)))) if last else None)

    out = []
    for y0 in range(start, PRESENT[1] - span + 2):
        ys = [y for y in range(y0, y0 + span) if y in comp]
        if len(ys) < span:
            continue
        row = {"y0": y0, "y1": y0 + span - 1, "days": {}, "last": {}}
        for thr in thresholds:
            d, l = stats(ys, thr)
            row["days"][str(thr)] = d
            row["last"][str(thr)] = l
        out.append(row)
    # 장기 창(가장 최근 30년) — 5년 창과 비교할 기준선
    long_years = [y for y in range(PRESENT[1] - 29, PRESENT[1] + 1) if y in comp]
    long_row = None
    if len(long_years) >= 25:
        long_row = {"y0": long_years[0], "y1": long_years[-1], "n": len(long_years), "days": {}, "last": {}}
        for thr in thresholds:
            d, l = stats(long_years, thr)
            long_row["days"][str(thr)] = d
            long_row["last"][str(thr)] = l
    return {"span": span, "list": out, "long": long_row}


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


# '올해 정말 더웠을까'에 답하려면 연평균기온만으로는 얇다 — 학습자가 내내 만져 온 것은
# '기준을 넘은 날이 며칠인가'이기 때문이다. 같은 잣대로 연도별 시계열을 만든다.
# 25℃는 이 앱의 기본 기준이고, 화면이 "다른 기준으로 세면 순위가 달라진다"고 함께 밝힌다.
ANNUAL_HOT_THR = 25.0


def annual_hot_days(df):
    """연도별 '일평균기온 ANNUAL_HOT_THR 이상' 일수. 불완결 연도는 None."""
    v = pd.to_numeric(df["avgTa"], errors="coerce")
    tmp = pd.DataFrame({"year": df["year"], "hit": (v >= ANNUAL_HOT_THR), "ok": v.notna()})
    out = {}
    for y, grp in tmp.groupby("year"):
        if int(grp["ok"].sum()) < MIN_DAYS:
            continue                      # 셀 수 없는 해를 0일로 적으면 '가장 시원한 해'가 된다
        out[int(y)] = int((grp["hit"] & grp["ok"]).sum())
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
        hot = annual_hot_days(df)
        tl["hotDays"] = [hot.get(y) for y in yrs]
        tl["hotThr"] = ANNUAL_HOT_THR
        e["timeline"] = tl
        e["sensitivity"] = window_sensitivity(df)
        e["rainFlip"] = rain_flip(e)
        e["seasonalLag"] = seasonal_lag(e["temp"]["past"], e["temp"]["present"])
        e["lagStability"] = lag_stability(df, cy)          # R4-P0-4 잭나이프
        ex = extreme_index(name)                            # R4-P1-1 폭염·열대야
        if ex:
            e["extremes"] = ex
        fr = frost_window(name)                             # 상강(10/23)의 실측 대응
        if fr:
            e["frost"] = fr
        e["windows"] = sliding_windows(df, range(20, 35))
        cities[name] = e
        d25 = e["temp"]["exceedDays"]
        l25 = e["temp"]["lastDoy"]
        sl = e["seasonalLag"]
        print(f"  {name}({station} {sid}): 과거 {len(py)}년 현재 {len(cy)}년 · "
              f"25℃ {d25['past']['25']}→{d25['present']['25']}일 · "
              f"계절지연 하지+{sl['present']['hotLag']}일(최고 {sl['present']['hotT']}℃) "
              f"동지+{sl['present']['coldLag']}일 · 창 {len(e['windows']['list'])}개")

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

    # ── R4-P0-4: 계절 지연 전국 요약 ──────────────────────────────
    # 예전에는 화면이 COASTAL 이분법(해안 7 vs 내륙 9)으로 "바다가 천천히 식으니
    # 해안이 늦다"고 단정했다. 그러나 그 '해안' 7곳 중 인천·포항은 내륙 분포
    # 안에 그대로 들어가고, 5년 중 한 해만 빼면 격차가 11일 → 2일로 사라진다.
    # 이분법을 버리고 '데이터가 실제로 말하는 것'만 싣는다 — 뚜렷하게 늦은
    # 지점의 목록과, 그 결론이 표본에 얼마나 흔들리는지(잭나이프)를 함께.
    def _lag_summary(season):
        hk = "hotLag" if season == "summer" else "coldLag"
        jk = "hot" if season == "summer" else "cold"
        vals, jspan, late = {}, [], []
        for n, c in cities.items():
            L = c.get("seasonalLag")
            if not L:
                continue
            vals[n] = L["present"][hk]
            st = c.get("lagStability")
            if st:
                jspan.append(st[jk]["span"])
        if not vals:
            return None
        arr = sorted(vals.values())
        # '뚜렷하게 늦다'의 기준을 임의로 정하지 않는다 — 중앙값 + 사분위범위 1.5배(상자그림 이상치)
        q1, q3 = arr[len(arr) // 4], arr[(3 * len(arr)) // 4]
        fence = q3 + 1.5 * (q3 - q1)
        late = sorted([n for n, v in vals.items() if v > fence], key=lambda n: -vals[n])
        return {"min": min(arr), "max": max(arr), "median": arr[len(arr) // 2],
                "spread": max(arr) - min(arr),
                "jackMaxSpan": max(jspan) if jspan else None,
                "jackMedianSpan": sorted(jspan)[len(jspan) // 2] if jspan else None,
                "outliers": late, "outlierVals": {n: vals[n] for n in late},
                "typical": [q1, q3],
                # 잭나이프 흔들림이 지점 간 퍼짐만큼 크면 '지역 차이'라고 말할 수 없다
                "robust": bool(jspan) and (max(jspan) * 2 <= (max(arr) - min(arr)))}
    lag_summary = {"summer": _lag_summary("summer"), "winter": _lag_summary("winter")}

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
            "cities": cities, "nationwide": nat, "terms": terms, "lagSummary": lag_summary}
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    json.dump(data, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("window.SOLAR_DATA = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    for s in ("summer", "winter"):
        g = lag_summary[s]
        if g:
            print(f"  계절지연 {s}: {g['min']}~{g['max']}일 · 중앙 {g['median']}일 · "
                  f"잭나이프 최대흔들림 {g['jackMaxSpan']}일 · 뚜렷이 늦은 지점 {g['outliers'] or '없음'} · "
                  f"robust={g['robust']}")
    nex = sum(1 for c in cities.values() if c.get("extremes"))
    print(f"  폭염·열대야 지수: {nex}지점 ({EXTREME_PAST[0]}–{EXTREME_PAST[1]} vs {EXTREME_NOW[0]}–{EXTREME_NOW[1]})")
    nfr = sum(1 for c in cities.values() if c.get("frost"))
    sang = md_to_doy(10, 23)
    for n, c in cities.items():
        fr = c.get("frost")
        if not fr:
            continue
        side = lambda d: "상강 앞" if d < sang else ("상강" if d == sang else "상강 뒤")
        print(f"    서리 조건일 {n}: {doy_str(fr['past']['first'])}({side(fr['past']['first'])}) → "
              f"{doy_str(fr['present']['first'])}({side(fr['present']['first'])}) · "
              f"무상기간 {fr['past']['free']}일 → {fr['present']['free']}일")
    print(f"  서리 조건일: {nfr}지점 (최저초상온도 minTg ≤ 0℃)")
    print(f"\n  ✓ {OUT_JSON.name} ({OUT_JSON.stat().st_size // 1024} KB) · "
          f"{OUT_JS.name} ({OUT_JS.stat().st_size // 1024} KB) · nationwide {nat['years'][0]}~{nat['years'][-1]}")


if __name__ == "__main__":
    main()
