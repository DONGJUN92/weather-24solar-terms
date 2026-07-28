# -*- coding: utf-8 -*-
"""
배포 데이터 회귀 검증 게이트 (레드팀 RC-I).

기존 verify_web_data.py는 구 자산(web_data/*.json)만 검사했고, 정작 배포본이 유일하게 읽는
prototype/solar_terms_data.js에 대한 assert가 0개였다. 이 스크립트가 그 공백을 메운다.

검사 항목
  A. 구조     — 16지점, 곡선 365개, None/NaN 없음, 임계값 그리드가 화면 슬라이더 전 범위를 덮는가
  B. 표본     — 불완결 연도(2026 등)가 평년 비교에 섞이지 않았는가, 연도 목록이 기록되었는가
  C. 단조성   — 기준이 높아질 때 '기준 이상 일수'가 늘어나지 않는가
  D. 실측대조 — 사전계산값이 원시 CSV에서 다시 센 값과 일치하는가 (RC-A의 핵심 회귀 테스트)
  E. 방향     — 강수·습도 지표의 증감 방향이 실측과 일치하는가 (평활 곡선 시절의 부호 역전 재발 방지)
  F. 문서대조 — 데이터에서 뽑은 값이 문서에 실제로 그 값으로 적혀 있는가 (R4에서 방식을 뒤집었다)
  J. 절기날짜 — 24개 대표 날짜가 태양황경 교차 최빈일과 일치하는가
  K. 전지구   — web_data/*.json에 불완결 연도가 섞이지 않았는가, r²가 재계산과 일치하는가
  L. 안정성   — 계절 지연이 잭나이프에서 얼마나 흔들리는지 기록되어 있는가

실행: python verify_solar_terms.py            (실패 시 exit code 1)
     python verify_solar_terms.py --no-raw   (원시 CSV 없이 구조·문서 검사만 — zip 제출본용)

R4 변경 — F축을 '블랙리스트'에서 '화이트리스트 대조'로 뒤집었다.
  예전 F축은 고정 문자열 7개("과거 33일", "현재 82일"…)가 문서에 있는지만 봤다.
  그래서 데이터를 다시 빌드한 뒤 문서에 남은 낡은 수치 5계열 24곳을 하나도 잡지 못했고,
  그 "경고 0건"이 레드팀_해결확인.md의 '해결' 근거 칸에 적혔다.
  이제는 데이터에서 값을 계산해 문서에 그 값이 실제로 등장하는지 확인하고,
  불일치는 경고가 아니라 <b>실패</b>다.
"""
from __future__ import annotations
import json, math, re, sys
from pathlib import Path
import numpy as np
import pandas as pd
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

BASE = Path(__file__).resolve().parent.parent
JS = BASE / "prototype" / "solar_terms_data.js"
SRC = BASE / "data_collectors" / "output" / "allyears"
NO_RAW = "--no-raw" in sys.argv
MIN_DAYS = 350
GRIDS = {"temp": range(20, 35), "humidity": range(55, 96), "precip": range(1, 81)}
FILL0 = {"precip"}
COL = {"temp": "avgTa", "humidity": "avgRhm", "precip": "sumRn"}

fails, warns, checks = [], [], [0]
DATA_CHECKS = [0]        # 문서가 인용하는 대표 검사 수(문서 대조 축 제외)
DOC_COUNT_TARGETS = []   # 검사 건수 인용을 대조할 문서 (최종 건수를 알아야 하므로 report()에서 확인)


def ck(cond, msg):
    checks[0] += 1
    if not cond:
        fails.append(msg)


def load_data():
    raw = JS.read_text(encoding="utf-8")
    return json.loads(raw[raw.index("=") + 1: raw.rstrip().rstrip(";").rindex("}") + 1])


def raw_frame(name):
    f = SRC / f"kma_allyears_{name}.csv"
    if not f.exists():
        # R4: zip 제출본에는 원시 CSV가 .gitignore로 빠져 있다. 예전에는 여기서
        # 안내 없는 FileNotFoundError 스택트레이스가 났다 — README가 권하는
        # 검증 명령이 심사위원 손에서 죽는 것이 이 게이트의 가장 큰 구멍이었다.
        raise SystemExit(
            f"\n  원시 ASOS CSV가 없습니다: {f}\n"
            "  · 재수집: README §2 '데이터 재빌드' 절차를 먼저 실행하세요.\n"
            "  · 원시 자료 없이 구조·문서·전지구 검사만 돌리려면:  python verify_solar_terms.py --no-raw\n")
    df = pd.read_csv(f)
    df["date"] = pd.to_datetime(df["date"])
    df["year"] = df["date"].dt.year
    return df


# ── 태양황경 교차 계산 (J축) — 절기 대표 날짜의 독립 검산 ──────────
def _jd(y, m, d):
    if m <= 2:
        y -= 1; m += 12
    a = y // 100
    return math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) + d + (2 - a + a // 4) - 1524.5


def _delta_t(y):
    if 1961 <= y < 1986:
        t = y - 1975; return 45.45 + 1.067 * t - t * t / 260 - t ** 3 / 718
    if 1986 <= y < 2005:
        t = y - 2000
        return (63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t ** 3
                + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5)
    t = y - 2000
    return 62.92 + 0.32217 * t + 0.005589 * t * t


def _app_lon(jde):
    T = (jde - 2451545.0) / 36525.0
    L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
    M = math.radians((357.52911 + 35999.05029 * T - 0.0001537 * T * T) % 360)
    C = ((1.914602 - 0.004817 * T - 0.000014 * T * T) * math.sin(M)
         + (0.019993 - 0.000101 * T) * math.sin(2 * M) + 0.000289 * math.sin(3 * M))
    om = math.radians((125.04 - 1934.136 * T) % 360)
    return (L0 + C - 0.00569 - 0.00478 * math.sin(om)) % 360


def _term_mode_date(target, y0=1969, y1=2026):
    """황경 target°를 지나는 순간(KST)의 그레고리력 날짜 최빈값."""
    cnt = {}
    for y in range(y0, y1 + 1):
        jde = _jd(y, 1, 1) + target * 365.2422 / 360.0
        for _ in range(60):
            diff = (_app_lon(jde) - target + 180) % 360 - 180
            jde -= diff / 0.9856
            if abs(diff) < 1e-7:
                break
        kst = jde - _delta_t(y) / 86400.0 + 9 / 24.0
        z = math.floor(kst + 0.5); f = (kst + 0.5) - z
        a = z
        if z >= 2299161:
            al = math.floor((z - 1867216.25) / 36524.25); a = z + 1 + al - al // 4
        b = a + 1524; c = math.floor((b - 122.1) / 365.25)
        dd = math.floor(365.25 * c); e = math.floor((b - dd) / 30.6001)
        day = int(b - dd - math.floor(30.6001 * e) + f)
        mo = e - 1 if e < 14 else e - 13
        cnt[(int(mo), day)] = cnt.get((int(mo), day), 0) + 1
    best = max(cnt.items(), key=lambda kv: kv[1])
    return best[0], best[1], len(range(y0, y1 + 1))


def recompute(df, metric, years):
    """build_solar_terms.exceed_stats와 독립적으로 다시 센다(같은 규칙, 다른 코드 경로)."""
    col = COL[metric]
    sub = df[df["year"].isin(years)].copy()
    s = pd.to_numeric(sub[col], errors="coerce")
    if metric in FILL0:
        s = s.fillna(0.0)
    sub = sub.assign(_v=s)
    sub = sub[~((sub["date"].dt.month == 2) & (sub["date"].dt.day == 29))]
    doy = sub["date"].dt.dayofyear.to_numpy()
    leap = sub["date"].dt.is_leap_year.to_numpy() & (sub["date"].dt.month.to_numpy() > 2)
    doy = np.where(leap, doy - 1, doy)
    yr, val = sub["year"].to_numpy(), sub["_v"].to_numpy(dtype=float)
    days, last = {}, {}
    for thr in GRIDS[metric]:
        hit = val >= thr
        cnt, lst = [], []
        for y in years:
            h = hit & (yr == y)
            cnt.append(int(h.sum()))
            if h.any():
                lst.append(int(doy[h].max()))
        days[str(thr)] = round(float(np.mean(cnt)), 1)
        last[str(thr)] = [int(round(float(np.mean(lst)))), len(lst)] if lst else None
    return days, last


def main():
    print("=" * 70)
    print("  solar_terms_data.js 회귀 검증 (RC-I)")
    print("=" * 70)
    ck(JS.exists(), "prototype/solar_terms_data.js 가 없습니다")
    if fails:
        return report()
    D = load_data()
    cities = D["cities"]

    # ── A. 구조 ────────────────────────────────────────────────
    ck(len(cities) == 16, f"A: 지점이 16개가 아닙니다 ({len(cities)}개)")
    for name, c in cities.items():
        ck("station" in c and "sid" in c, f"A: {name} 관측소 실명/지점번호 누락 (RC-J: '도' 칩 고지에 필요)")
        for mk in GRIDS:
            ck(mk in c, f"A: {name}.{mk} 누락")
            if mk not in c:
                continue
            for pk in ("past", "present"):
                arr = c[mk][pk]
                ck(len(arr) == 365, f"A: {name}.{mk}.{pk} 길이 {len(arr)} (365 아님)")
                ck(all(v is not None for v in arr), f"A: {name}.{mk}.{pk} None 포함")
                grid = c[mk]["exceedDays"][pk]
                missing = [t for t in GRIDS[mk] if str(t) not in grid]
                ck(not missing, f"A: {name}.{mk}.exceedDays.{pk} 임계값 누락 {missing[:5]}")
            if mk == "temp":
                ck("lastDoy" in c[mk], f"A: {name}.temp.lastDoy 누락 (화면 showLast가 참조)")
                for pk in ("past", "present"):
                    for t, v in c[mk]["lastDoy"][pk].items():
                        ck(v is None or (isinstance(v, list) and len(v) == 2 and 1 <= v[0] <= 365),
                           f"A: {name}.temp.lastDoy.{pk}[{t}] 형식 오류 {v}")
            else:
                ck("lastDoy" not in c[mk], f"A: {name}.{mk}에 lastDoy가 있습니다(화면은 쓰지 않음)")

    # ── B. 표본 (RC-C) ─────────────────────────────────────────
    for name, c in cities.items():
        y = c.get("years", {})
        ck(y.get("past") and y.get("present"), f"B: {name} years 기록 누락 (표본 수 표기에 필요)")
        for pk in ("past", "present"):
            for yr in y.get(pk, []):
                df = raw_frame(name)
                n = int((df["year"] == yr).sum())
                ck(n >= MIN_DAYS, f"B: {name} {pk}에 불완결 연도 {yr}({n}일) 포함 — RC-C 위반")
        ck(2026 not in y.get("present", []), f"B: {name} present에 2026(부분연도) 포함 — RC-C 위반")
        ck(len(y.get("present", [])) == 5, f"B: {name} present 완결 연도 {len(y.get('present', []))}개 (5개 기대)")
    ck(D["periods"]["present"] == "2021–2025", f"B: periods.present = {D['periods']['present']} (2021–2025 기대)")

    # ── C. 단조성 ──────────────────────────────────────────────
    for name, c in cities.items():
        for mk in GRIDS:
            for pk in ("past", "present"):
                g = c[mk]["exceedDays"][pk]
                seq = [g[str(t)] for t in GRIDS[mk]]
                bad = [(GRIDS[mk][i], seq[i], seq[i + 1]) for i in range(len(seq) - 1) if seq[i + 1] > seq[i] + 1e-9]
                ck(not bad, f"C: {name}.{mk}.{pk} 기준↑인데 일수↑ {bad[:3]}")

    # ── D. 실측 대조 (RC-A 핵심) ────────────────────────────────
    # R4: 표본 5지점 → 16지점 전체로 확대(실행 시간 여유가 있다).
    #     원시 CSV가 없는 zip 제출본에서는 --no-raw로 이 축만 건너뛴다.
    sample = list(cities.keys())
    if NO_RAW:
        print("  (--no-raw: D·E축 원시 대조를 건너뜁니다 — 구조·문서·전지구·안정성만 검사)")
        sample = []
    for name in sample:
        df = raw_frame(name)
        for mk in GRIDS:
            for pk in ("past", "present"):
                years = cities[name]["years"][pk]
                days, last = recompute(df, mk, years)
                for t in GRIDS[mk]:
                    got = cities[name][mk]["exceedDays"][pk][str(t)]
                    ck(abs(got - days[str(t)]) < 0.05,
                       f"D: {name}.{mk}.{pk} thr={t} 일수 불일치 (데이터 {got} vs 실측 {days[str(t)]})")
                if mk == "temp":
                    for t in GRIDS[mk]:
                        got = cities[name][mk]["lastDoy"][pk][str(t)]
                        ck(got == last[str(t)],
                           f"D: {name}.temp.{pk} thr={t} 마지막초과 불일치 ({got} vs {last[str(t)]})")

    # ── E. 방향 (부호 역전 재발 방지) ────────────────────────────
    for name, c in ({} if NO_RAW else cities).items():
        df = raw_frame(name)
        for mk in GRIDS:
            for t in list(GRIDS[mk])[::5]:
                p = c[mk]["exceedDays"]["past"][str(t)]
                q = c[mk]["exceedDays"]["present"][str(t)]
                dp, _ = recompute(df, mk, c["years"]["past"])
                dq, _ = recompute(df, mk, c["years"]["present"])
                real = dq[str(t)] - dp[str(t)]
                shown = q - p
                ck(real == 0 or shown == 0 or (real > 0) == (shown > 0),
                   f"E: {name}.{mk} thr={t} 증감 방향 역전 (화면 {shown:+.1f} vs 실측 {real:+.1f})")

    # ── G. 강수 강도 미션(RC-N)이 쓰는 rainFlip ─────────────────
    for name, c in cities.items():
        f = c.get("rainFlip")
        ck(f is not None, f"G: {name} rainFlip 누락 (강수 미션이 참조)")
        if not f:
            continue
        ck(f["low"][0] == 1, f"G: {name} rainFlip 낮은 기준이 1mm가 아님")
        lo1 = c["precip"]["exceedDays"]["present"]["1"] - c["precip"]["exceedDays"]["past"]["1"]
        ck(abs(f["low"][1] - round(lo1, 1)) < 0.05, f"G: {name} rainFlip low 값 불일치")
        ck(f["flip"] is None or 1 <= f["flip"] <= 80, f"G: {name} flip 범위 밖 {f['flip']}")

    # ── H. 계절 지연 (미션 5) ───────────────────────────────────
    # 미션 5의 모든 문장이 이 값에서 나온다. 부호가 뒤집히면
    # "하지가 가장 덥다"는 반대 결론을 그대로 화면에 출력하게 된다.
    lag_s, lag_w = [], []
    for name, c in cities.items():
        L = c.get("seasonalLag")
        ck(L is not None, f"H: {name} seasonalLag 누락 (미션 5가 참조)")
        if not L:
            continue
        ck(L["solstice"]["summer"] == 172, f"H: {name} 하지 doy={L['solstice']['summer']} (172 기대)")
        ck(L["solstice"]["winter"] == 356, f"H: {name} 동지 doy={L['solstice']['winter']} (356 기대)")
        for pk in ("past", "present"):
            P = L[pk]
            ck(1 <= P["hotDoy"] <= 365, f"H: {name}.{pk} hotDoy 범위 밖 {P['hotDoy']}")
            ck(1 <= P["coldDoy"] <= 365, f"H: {name}.{pk} coldDoy 범위 밖 {P['coldDoy']}")
            ck(20 <= P["hotLag"] <= 70, f"H: {name}.{pk} 여름 지연 {P['hotLag']}일 (20~70 기대) — 열관성 결론이 깨짐")
            ck(0 <= P["coldLag"] <= 70, f"H: {name}.{pk} 겨울 지연 {P['coldLag']}일 (0~70 기대)")
            ck(P["hotT"] > P["coldT"], f"H: {name}.{pk} 최고({P['hotT']}) <= 최저({P['coldT']}) — 극값 탐색 오류")
            ck(15 <= P["hotT"] <= 35, f"H: {name}.{pk} hotT {P['hotT']}°C 비현실")
            ck(-25 <= P["coldT"] <= 15, f"H: {name}.{pk} coldT {P['coldT']}°C 비현실")
        lag_s.append(L["present"]["hotLag"])
        lag_w.append(L["present"]["coldLag"])
    if lag_s:
        # "전국 어디서나 거의 같다"(여름) / "지역마다 다르다"(겨울) — 두 결론문의 근거
        ck(max(lag_s) - min(lag_s) <= 12,
           f"H: 여름 지연 전국 퍼짐 {min(lag_s)}~{max(lag_s)}일 — '어디서나 같다' 문장이 거짓이 됨")
        ck(max(lag_w) - min(lag_w) >= 10,
           f"H: 겨울 지연 전국 퍼짐 {min(lag_w)}~{max(lag_w)}일 — '지역마다 다르다' 문장이 거짓이 됨")
        print(f"  계절 지연(현재·16지점): 여름 {min(lag_s)}~{max(lag_s)}일 · 겨울 {min(lag_w)}~{max(lag_w)}일")

    # ── H2. 극값일 안정성 ───────────────────────────────────────
    # 예전에는 argmin이 평탄한 겨울 곡선에서 0.2°C 차이로 날짜를 정해
    # 서울 최한일이 12/24로 나왔다(실제 한국 내륙 최한기는 1월 중순).
    # 지금은 극값 ±0.4°C 안에 드는 날들의 원형 중앙을 쓴다.
    # 아래 검사는 그 방식이 되돌아가는 것을 막는다.
    inland = {"서울", "대구", "대전", "경기", "충북", "전북", "경북", "강원", "광주"}
    for name, c in cities.items():
        L = c.get("seasonalLag")
        if not L:
            continue
        cur = c["temp"]["present"]
        for key, doy_key in (("hot", "hotDoy"), ("cold", "coldDoy")):
            doy = L["present"][doy_key]
            v = cur[doy - 1]
            peak = max(cur) if key == "hot" else min(cur)
            # 고원 중앙이므로 절대 극값과 0.4°C 안쪽이어야 한다
            ck(abs(v - peak) <= 0.45,
               f"H2: {name} {key}Doy={doy} 값 {v} 가 극값 {round(peak,1)} 에서 0.45°C 넘게 벗어남 — argmin 회귀 의심")
        # 내륙의 최한일은 동지 뒤 5~25일 (12/27 ~ 1/16). 12월 하순 argmin 재발 차단
        if name in inland:
            ck(5 <= L["present"]["coldLag"] <= 25,
               f"H2: {name} 내륙 겨울 지연 {L['present']['coldLag']}일 (5~25 기대) — 평탄 구간 argmin 재발 의심")
    # ── L. 계절 지연의 안정성 (R4-P0-4) ──────────────────────────
    # 예전에는 여기서 "해안(제주·강릉·전남) 평균 > 내륙 평균 + 5"만 검사했다.
    # 그런데 화면은 해안을 7곳으로 정의했고(인천·포항 포함), 그 7곳 평균으로는
    # 격차가 훨씬 작으며, 5년 중 한 해만 빼면 11일 → 2일로 사라진다.
    # 즉 게이트가 화면보다 쉬운 명제를 검사해 통과시키고 있었다.
    # 이분법 검사를 폐기하고, '흔들림을 기록했는가'와 '화면이 단정하지 않는가'를 본다.
    LS = D.get("lagSummary") or {}
    for season in ("summer", "winter"):
        g = LS.get(season)
        ck(bool(g), f"L: lagSummary.{season} 없음 — 잭나이프 안정성이 계산되지 않았다")
        if not g:
            continue
        ck(g.get("jackMaxSpan") is not None,
           f"L: {season} 잭나이프 흔들림이 기록되지 않음 (화면이 강건성을 말할 수 없다)")
        # 지점 간 퍼짐이 잭나이프 흔들림의 2배를 넘지 못하면 '지역 차이'를 신호로 주장하면 안 된다
        ck(g["robust"] is False or g["spread"] >= 2 * g["jackMaxSpan"],
           f"L: {season} robust=True인데 퍼짐 {g['spread']}일 < 잭나이프 {g['jackMaxSpan']}일 ×2 — 판정 기준 모순")
    for name, c in cities.items():
        st = c.get("lagStability")
        ck(bool(st), f"L: {name} lagStability 없음")
        if st:
            ck(st["hot"]["span"] <= 12,
               f"L: {name} 여름 지연 잭나이프 흔들림 {st['hot']['span']}일 — '어디서나 같다' 문장이 위태롭다")
    # 화면이 폐기한 해안/내륙 이분법을 되살리지 못하게 막는다
    vjs_txt = (BASE / "prototype" / "verify.js").read_text(encoding="utf-8")
    ck(not re.search(r"^\s*var COASTAL\s*=", vjs_txt, re.M),
       "L: verify.js에 COASTAL 이분법이 되살아났다 — 인천·포항에서 성립하지 않고 표본에 무너지는 분류다")
    ck(not re.search(r"해안\(평균 '\s*\+|'해안 평균 '\s*\+", vjs_txt),
       "L: verify.js가 '해안 평균 …일' 인과 단정을 다시 쓰고 있다 (R4-P0-4)")

    # ── I. 이동창 (기간 선택 조작) ───────────────────────────────
    # "어느 5년을 고르든 방향은 같다"를 보이려는 기능. 창이 어긋나면
    # 학습자가 엉뚱한 기간을 비교하게 된다.
    for name, c in cities.items():
        W = c.get("windows")
        ck(W is not None, f"I: {name} windows 누락 (기간 조작이 참조)")
        if not W:
            continue
        ck(W["span"] == 5, f"I: {name} windows.span={W['span']} (5 기대)")
        lst = W["list"]
        ck(len(lst) >= 20, f"I: {name} 창 {len(lst)}개 (20개 이상 기대)")
        prev = None
        for w in lst:
            ck(w["y1"] - w["y0"] == 4, f"I: {name} 창 {w['y0']}~{w['y1']} 폭이 5년이 아님")
            ck(prev is None or w["y0"] > prev, f"I: {name} 창 시작연도 역순 ({prev} → {w['y0']})")
            prev = w["y0"]
            bad = [(t, v) for t, v in w["days"].items() if not (0 <= v <= 366)]
            ck(not bad, f"I: {name} 창 {w['y0']} 일수 범위 밖 {bad[:3]}")
        ck(lst[-1]["y1"] == c["years"]["present"][-1],
           f"I: {name} 마지막 창 끝 {lst[-1]['y1']} != 현재 구간 끝 {c['years']['present'][-1]}")
        ck(W["long"]["y1"] - W["long"]["y0"] >= 20, f"I: {name} 장기창이 20년 미만")

    # ── F. 하드코딩 수치 일치 ───────────────────────────────────
    s = cities["서울"]["temp"]
    d_past, d_now = s["exceedDays"]["past"]["25"], s["exceedDays"]["present"]["25"]
    l_past, l_now = s["lastDoy"]["past"]["25"], s["lastDoy"]["present"]["25"]
    drift = l_now[0] - l_past[0]
    print(f"\n  현재 기준값(서울·25℃): 연평균 {d_past}일 → {d_now}일 · 마지막초과 doy {l_past[0]} → {l_now[0]} (시차 {drift:+d}일)")
    # 여기까지가 '데이터 검사'다. 아래 F축은 문서 내용에 따라 건수가 달라지므로
    # 문서가 인용하는 대표 숫자는 이 시점의 값으로 고정한다(문서를 고칠 때마다 숫자가 흔들리지 않게).
    DATA_CHECKS[0] = checks[0]

    # ── F. 문서 대조 — 블랙리스트 → 화이트리스트로 뒤집었다 (R4-P0-2) ──
    # 데이터에서 값을 뽑아, 문서에 '그 값이' 적혀 있는지 확인한다.
    # 낡은 값을 목록으로 관리하면 새 오류를 영원히 못 잡는다.
    # 방식: '값을 요구'하지 않고 '틀린 값을 금지'한다.
    #   모든 문서가 모든 수치를 담지는 않는다. 담았다면 반드시 현재 값이어야 한다.
    LSw = LS.get("winter") or {}
    hot_lags = [c["seasonalLag"]["present"]["hotLag"] for c in cities.values() if c.get("seasonalLag")]
    jack = [c["lagStability"] for c in cities.values() if c.get("lagStability")]
    seoul = cities.get("서울", {})
    seoul_past_hot = seoul.get("seasonalLag", {}).get("past", {}).get("hotLag")
    seoul_now_hot = seoul.get("seasonalLag", {}).get("present", {}).get("hotLag")
    ok_ranges = {(min(hot_lags), max(hot_lags)), (LSw.get("min"), LSw.get("max"))}
    ok_ranges |= {(s["hot"]["min"], s["hot"]["max"]) for s in jack} | {(s["cold"]["min"], s["cold"]["max"]) for s in jack}
    ok_lag_days = {seoul_past_hot, seoul_now_hot, LSw.get("median"), LSw.get("max"), LSw.get("min")}
    ok_lag_days |= {c["seasonalLag"]["present"][k] for c in cities.values() if c.get("seasonalLag") for k in ("hotLag", "coldLag")}
    ok_lag_days |= {c["seasonalLag"]["past"][k] for c in cities.values() if c.get("seasonalLag") for k in ("hotLag", "coldLag")}
    ok_lag_days |= {s["hot"]["span"] for s in jack} | {s["cold"]["span"] for s in jack}
    ok_lag_days.discard(None)

    DOCS = ["prototype/교사_학습지.html", "데모_대본.md", "발표_10분_구성안.md", "README.md", "AI_활용_기록.md"]
    for rel in DOCS:
        f = BASE / rel
        if not f.exists():
            continue
        for ln, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if "지연" not in line and "하지보다" not in line and "동지보다" not in line:
                continue
            for a, b in re.findall(r"(\d{1,3})\s*~\s*(\d{1,3})\s*일", line):
                ck((int(a), int(b)) in ok_ranges,
                   f"F: {rel}:{ln} 계절지연 범위 '{a}~{b}일'이 현재 데이터에 없다 "
                   f"(여름 {min(hot_lags)}~{max(hot_lags)} · 겨울 {LSw.get('min')}~{LSw.get('max')})")
            for m in re.finditer(r"(?:에도|이었고|였고|지연은|지연이|보다)\s*\**(\d{1,3})\s*일", line):
                ck(int(m.group(1)) in ok_lag_days,
                   f"F: {rel}:{ln} 계절지연 값 '{m.group(1)}일'이 현재 데이터에 없다 "
                   f"(서울 과거 {seoul_past_hot}일 → 현재 {seoul_now_hot}일)")
        txt = f.read_text(encoding="utf-8")
        # 서울 25℃ 더위일을 'A → B' 형태로 적었다면 현재 값이어야 한다.
        # 단 '무엇이 틀렸었나' 식의 정정 기록(같은 줄에 옛값과 현재값이 함께 있는 표)은 예외다 —
        # 그건 낡은 수치가 아니라 고친 이력이고, 지우면 오히려 과정 기록이 사라진다.
        for ln, line in enumerate(txt.splitlines(), 1):
            pairs = re.findall(r"더위일[^\n]{0,40}?([\d.]+)\s*일?\s*(?:→|->)\s*([\d.]+)", line)
            if not pairs:
                continue
            corrected = f"{d_past}" in line and f"{d_now}" in line
            for a, b in pairs:
                ck(corrected or (abs(float(a) - d_past) < 0.6 and abs(float(b) - d_now) < 0.6),
                   f"F: {rel}:{ln} 서울 더위일 표기 '{a} → {b}'가 현재 값({d_past} → {d_now})과 다르다")
    DOC_COUNT_TARGETS.extend(DOCS + ["제출_체크리스트.md"])
    vjs = (BASE / "prototype" / "verify.js").read_text(encoding="utf-8")
    for pat, why in [(r"1969–73 vs 2022–26", "무결성 문구의 현재 기간(2021–25)과 불일치"),
                     (r"2022–2026", "AI 증거카드 period가 현재 기간과 불일치"),
                     (r"lastExceed\('past', 25, city, 'temp'\)", "고향카드가 평활 곡선 함수를 직접 호출")]:
        if re.search(pat, vjs):
            warns.append(f"F: verify.js 에 '{pat}' — {why}")
    # ── J. 절기 대표 날짜 (R4-P2) ───────────────────────────────
    # 예전에는 하지·동지 2개만 검사했다. 그 사이에 입하(5/6)·입추(8/8)가
    # 자기 산출 규칙("1969~2026 최빈")을 어긴 채 남아 있었고,
    # 자체 감사는 "앱 표기가 최빈"이라고 반대 결론을 기록했다. 24개 전부 검산한다.
    terms = D["terms"]
    ck(len(terms) == 24, f"J: 절기가 {len(terms)}개 (24 기대)")
    for i, t in enumerate(terms):
        target = ((i * 15) + 285) % 360          # 소한(i=0) = 황경 285°
        (mo, dd), n, tot = _term_mode_date(target)
        ck(t["date"] == f"{mo}/{dd}",
           f"J: {t['name']} 표기 {t['date']} ≠ 태양황경 최빈일 {mo}/{dd} ({n}/{tot}회) — 산출 규칙 위반")

    # ── K. 전지구 자료 완결성 (R4-P1-9) ─────────────────────────
    cc = BASE / "web_data" / "climate_change.json"
    if cc.exists():
        gj = json.loads(cc.read_text(encoding="utf-8"))
        rows = [r for r in gj["series"] if r.get("co2_ppm") is not None and r.get("temp_anomaly_C") is not None]
        last = max(r["year"] for r in rows)
        co2raw = pd.read_csv(BASE / "data_collectors" / "output" / "noaa_gml_co2_monthly_FULL.csv")
        full = co2raw.groupby("year")["average"].size()
        complete = [int(y) for y, k in full.items() if k >= 12]
        ck(last <= max(complete),
           f"K: 전지구 시계열 마지막 연도 {last} 가 불완결(월 12개 미만) — 한국 자료의 완결 연도 규칙과 어긋난다")
        # r² 독립 재계산
        x = np.array([r["co2_ppm"] for r in rows]); y = np.array([r["temp_anomaly_C"] for r in rows])
        s, b = np.polyfit(x, y, 1)
        r2 = 1 - ((y - (s * x + b)) ** 2).sum() / ((y - y.mean()) ** 2).sum()
        ck(abs(r2 - gj["relationship"]["r2"]) < 0.005,
           f"K: r² 불일치 (파일 {gj['relationship']['r2']} vs 재계산 {round(float(r2),3)})")
        srcs = (gj.get("meta") or {}).get("sources") or []
        ck(any(isinstance(s2, dict) and s2.get("license") for s2 in srcs),
           "K: climate_change.json에 라이선스가 담긴 출처가 없다 — 화면이 CC BY 저작자표시를 렌더할 수 없다")
        ck("globalSourceHTML" in vjs_txt, "K: verify.js가 지구 패널 출처를 렌더하지 않는다")

    # ── M. 폭염·열대야 (R4-P1-1) ────────────────────────────────
    nex = [n for n, c in cities.items() if c.get("extremes")]
    ck(len(nex) >= 8, f"M: 폭염·열대야 지수가 {len(nex)}지점뿐 (8지점 기대)")
    for n in nex:
        ex = cities[n]["extremes"]
        for k in ("heatwave", "tropicalNight"):
            v = ex["idx"].get(k)
            ck(v and v["past"] is not None and v["present"] is not None, f"M: {n}.{k} 값 누락")
    ck("계산할 수 없" not in vjs_txt.split("열대야")[1][:200] if "열대야" in vjs_txt else True,
       "M: verify.js가 여전히 열대야를 '계산할 수 없다'고 말한다 — 원자료에는 minTa/maxTa가 있다")

    return report()


def report():
    # 문서가 인용한 '검사 건수'가 이번 실행값과 같은가 (4,810 vs 4,852 재발 차단).
    # 최종 건수는 모든 검사가 끝나야 알 수 있으므로 여기서 본다.
    total = DATA_CHECKS[0] or checks[0]
    for rel in dict.fromkeys(DOC_COUNT_TARGETS):
        f = BASE / rel
        if not f.exists():
            continue
        txt = f.read_text(encoding="utf-8")
        nums = {n.replace(",", "") for n in re.findall(r"([0-9],?[0-9]{3})\s*(?:개\s*)?(?:assert|검사|건)", txt)}
        wrong = sorted(n for n in nums if n.isdigit() and 1000 <= int(n) <= 99999 and int(n) != total)
        if wrong:
            warns.append(f"F: {rel} 의 검사 건수 표기 {wrong} ≠ 데이터 검사 {total}건 — 문서를 갱신하세요")
    print()
    if fails:
        print(f"  ✗ 실패 {len(fails)}건 / 검사 {checks[0]}건 (데이터 {DATA_CHECKS[0]} + 문서 {checks[0]-DATA_CHECKS[0]})")
        for m in fails[:40]:
            print("    -", m)
        if len(fails) > 40:
            print(f"    … 외 {len(fails) - 40}건")
    else:
        print(f"  ✓ 전체 통과 — 검사 {checks[0]}건 (데이터 {DATA_CHECKS[0]} + 문서 {checks[0]-DATA_CHECKS[0]})")
    if warns:
        print(f"\n  ⚠ 경고 {len(warns)}건 (배포 차단은 아니지만 반드시 확인)")
        for m in warns:
            print("    -", m)
    print("=" * 70)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
