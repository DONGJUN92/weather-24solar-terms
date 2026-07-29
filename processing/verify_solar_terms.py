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
  G. 강수전환 — 강수 미션의 rainFlip 수치와 방향이 올바른가
  H. 계절지연 — 더위 시작·종료 시차와 계절별 요약이 일관되는가
  H2. 극값안정 — 극값 날짜가 평활 고원에서 임의의 하루로 흔들리지 않는가
  I. 이동창   — 26개 비교 기간을 바꿀 때 수치와 메타데이터가 함께 바뀌는가
  F. 문서대조 — 데이터에서 뽑은 값이 문서에 실제로 그 값으로 적혀 있는가 (R4에서 방식을 뒤집었다)
  J. 절기날짜 — 24개 대표 날짜가 태양황경 교차 최빈일과 일치하는가
  K. 전지구   — web_data/*.json에 불완결 연도가 섞이지 않았는가, r²가 재계산과 일치하는가
  L. 안정성   — 계절 지연이 잭나이프에서 얼마나 흔들리는지 기록되어 있는가
  M. 극한지수 — 폭염·열대야·결빙일 계산과 비교 기간 고지가 일치하는가
  N. 학습계약 — 무자료 예측·학생 CERL 선행·외부 AI 동의·과잉 인과 방지가 실제 코드에 남아 있는가

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
PUBLISHED_DATA_CHECKS = 8213
PUBLISHED_AUX_CHECKS = 146
PUBLISHED_TOTAL_CHECKS = PUBLISHED_DATA_CHECKS + PUBLISHED_AUX_CHECKS


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
    # 주석은 학습자 화면에 렌더되지 않는다. '이 문구가 화면에 뜨는가'를 묻는 검사는
    # 주석을 지운 소스로 해야 한다 — 그러지 않으면 수정 이력을 주석에 남길 수 없다.
    vjs_code = re.sub(r"/\*.*?\*/", " ", vjs_txt, flags=re.S)
    vjs_code = re.sub(r"^[ \t]*//.*$", " ", vjs_code, flags=re.M)
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
        # 폭염일·열대야를 인용했다면 화면 표기와 같아야 한다 (R4-M).
        # 5차 F09 이후 화면은 fmtDays가 아니라 fmtNum으로 세 칸을 모두 소수 한 자리로 찍는다
        # (과거 + 변화 = 현재가 표 안에서 성립해야 하므로). 문서 대조 규약도 그것을 따른다.
        # fmtNum = String(Math.round(v*10)/10) 이라 22.5는 '22.5', 23.0은 '23'이 된다.
        sx = cities.get("서울", {}).get("extremes")
        if sx:
            def shown(v):
                v = round(v * 10) / 10
                return str(int(v)) if v == int(v) else f"{v:g}"
            for key, word in (("heatwave", "폭염일"), ("tropicalNight", "열대야")):
                r = sx["idx"].get(key)
                if not r or r["past"] is None:
                    continue
                for m in re.finditer(word + r"[^\n]{0,24}?([\d.]+)\s*일?\s*(?:→|->)\s*([\d.]+)", txt):
                    ck(m.group(1) == shown(r["past"]) and m.group(2) == shown(r["present"]),
                       f"F: {rel} 의 서울 {word} 표기 '{m.group(1)} → {m.group(2)}'가 화면 값"
                       f"({shown(r['past'])} → {shown(r['present'])})과 다르다")
        # 서울 25℃ 더위일을 'A → B' 형태로 적었다면 현재 값이어야 한다.
        # 단 '무엇이 틀렸었나' 식의 정정 기록(같은 줄에 옛값과 현재값이 함께 있는 표)은 예외다 —
        # 그건 낡은 수치가 아니라 고친 이력이고, 지우면 오히려 과정 기록이 사라진다.
        # 다른 지점을 명시한 줄은 대상이 아니다 — 가이드 화면의 기본 지역은 대구이고,
        # 미션 3은 제주·강원을 비교한다. 지점을 밝힌 줄까지 서울 값으로 검사하면
        # 정확히 적은 문서가 오히려 실패한다(5차 P2 문서 재작성에서 실제로 걸렸다).
        other_cities = tuple(c for c in cities if c != "서울")
        for ln, line in enumerate(txt.splitlines(), 1):
            pairs = re.findall(r"더위일[^\n]{0,40}?([\d.]+)\s*일?\s*(?:→|->)\s*([\d.]+)", line)
            if not pairs:
                continue
            if any(c in line for c in other_cities):
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

    # 5차 F09: 표에 찍히는 세 숫자(과거·현재·변화)가 서로 맞아야 한다.
    # 예전에는 과거·현재를 fmtDays(10 이상 정수 반올림)로, 변화를 fmtNum(소수 한 자리)으로
    # 찍어 32행 중 16행이 암산 검산에 실패했다(4.2 + 18.3 ≠ 23).
    # 화면은 이제 '표시된 두 값의 차'를 변화로 쓰므로 전 행이 성립해야 한다.
    def _fmtnum(v):
        v = round(v * 10) / 10
        return v
    for n in nex:
        ex = cities[n]["extremes"]
        for k in ("heatwave", "hot35", "tropicalNight", "iceDay"):
            v = ex["idx"].get(k)
            if not v or v.get("past") is None or v.get("present") is None:
                continue
            p, q = _fmtnum(v["past"]), _fmtnum(v["present"])
            d = round((q - p) * 10) / 10
            ck(abs(p + d - q) < 1e-9,
               f"M: {n}.{k} 표 검산 실패 — 표시값 {p} + 변화 {d} ≠ {q}")
    ck(re.search(r"var pastS = fmtNum\(v\.past\), nowS = fmtNum\(v\.present\)", vjs_code) is not None
       and re.search(r"Number\(nowS\) - Number\(pastS\)", vjs_code) is not None,
       "M: 극한지수 표의 변화 열이 '표시된 두 값의 차'로 계산되지 않는다 (표 안 검산이 깨진다)")

    # 5차 F10: 민감도는 파이프라인이 계산해 둔 정확한 값을 화면이 그대로 써야 한다.
    # 예전에는 이미 정수로 반올림된 창별 doy를 다시 차분해 이중 반올림 값을 인쇄했다.
    ck("Number(S.thr) === Number(thr)" in vjs_code and "c.sensitivity" in vjs_code,
       "M: sensitivityAt이 파이프라인의 sensitivity 값을 쓰지 않는다 (이중 반올림으로 문서와 어긋난다)")
    sen = cities.get("서울", {}).get("sensitivity")
    ck(sen and sen.get("long") is not None and sen.get("min") is not None,
       "M: 서울 sensitivity(min/max/long)가 데이터에 없다 — 화면이 폴백 경로로 떨어진다")

    # 5차 F14: 학습목표 ⑤(관측과 모형)이 필수 동선·완료 배지에 있어야 한다.
    ck("if (step === 'audit' && m.lagMode && !state.labSeen) step = 'expert';" in vjs_code,
       "N: 미션 5가 열관성 실험실을 거치지 않고 완료된다 — 학습목표 ⑤가 필수 동선 밖이다")
    ck("state.labSeen = true;" in vjs_code and "⑤ 관측과 모형" in vjs_code,
       "N: 완료 배지에 학습목표 ⑤가 없거나 실험실 방문 기록이 남지 않는다")
    ck("열관성 실험실 (목표 ⑤)" in vjs_code,
       "N: 내 기록에 모형 실험 결과가 남지 않는다 — 교사가 회수하는 산출물에 목표 ⑤이 빠진다")

    # 5차 COPY-AI: 학습자 노출 문구의 조사·2인칭
    ck("eulReul(f.label)" in vjs_code,
       "N: CERL 필수 오류 문구가 조사를 하드코딩한다 ('근거을'·'한계을' 비문)")
    ck(not re.search(r"driftStr \+ '</b>[와과]", vjs_code),
       "N: 전문가 판정문이 '+N일와' 형태의 비문을 만든다")
    ck("당신" not in vjs_code,
       "N: 학습자 화면에 2인칭 '당신'이 있다 — 이 앱의 나머지 표기('내/내가')와 어긋난다")

    # ── N. 학습·신뢰 계약 (레드팀 5차) ────────────────────────────
    # 숫자만 맞아도 교육 순서가 뒤집히거나 개인정보 안내가 거짓이면 최고상 수준이 아니다.
    # 대표 실패가 다시 들어오지 못하도록 코드·문서·배포 설정을 함께 게이트한다.
    pred0 = vjs_txt.find("function renderPrediction")
    pred1 = vjs_txt.find("function showLensGate", pred0)
    pred_src = vjs_txt[pred0:pred1] if pred0 >= 0 and pred1 > pred0 else ""
    cerl0 = vjs_txt.find("function studentCerlHTML")
    verdict0 = vjs_txt.find("function renderVerdict")
    check0 = vjs_txt.find("function renderSelfCheckStep")
    expert0 = vjs_txt.find("function renderExpertStep")
    flow0 = vjs_txt.find("function renderMissionFlow")
    flow1 = vjs_txt.find("function renderPrediction", flow0)
    flow_src = vjs_txt[flow0:flow1] if flow0 >= 0 and flow1 > flow0 else ""

    ck(pred0 >= 0 and "introChart" not in vjs_txt,
       "N: 관측 자료와 분리된 renderPrediction 화면이 없거나 소개 화면이 결과를 미리 노출한다")
    ck("if (!missionAsked(m)) { renderPrediction(m); return; }" in vjs_txt,
       "N: renderExplore 진입 시 예측 선행 가드가 없다")
    ck(re.search(r"mc\.showLast && pl > 0[^?]{0,80}!isSealed\(\)", vjs_txt) is not None,
       "N: 과거 마지막초과일 마커가 예측 봉인 중 노출될 수 있다")
    ck(re.search(r"mc\.showLast && cl > 0[^?]{0,80}!isSealed\(\)", vjs_txt) is not None,
       "N: 현재 마지막초과일 마커가 예측 봉인 중 노출될 수 있다")
    ck("방금 만져 봤죠" not in vjs_txt, "N: 조작 뒤 예측을 유도하는 낡은 문구가 남아 있다")
    ck("o.s" not in pred_src, "N: 예측 선택지에 정답 성격을 암시하는 보조문구를 렌더한다")

    # 5차 F01(P0) 회귀 방지 — 봉인 문항 위에 결론 문구를 인쇄하지 않는가.
    # 21:50 리팩터가 단계 헤더를 통합하면서 goal-chip(미션 결론 요약)이 예측 화면까지
    # 올라와 미션 1·4·5의 사전 문항 정답을 그대로 적어 주었다. 세 채널을 모두 잠근다.
    ck(re.search(r"goal-chip\">'\s*\+\s*m\.goal", vjs_txt) is None
       and "goalChipText(m, step)" in vjs_txt,
       "N: 단계 헤더가 학습목표 결론 문구를 단계와 무관하게 인쇄한다 (예측 화면 정답 누출)")
    ck(re.search(r"if \(step === 'predict'\) return '자료를 보기 전 예측'", vjs_txt) is not None,
       "N: 예측 화면의 목표 칩이 내용 중립 라벨이 아니다")
    ck(re.search(r"NO_GOAL_TEXT\s*=\s*\[(?=[^\]]*'predict')(?=[^\]]*'lens')"
                 r"(?=[^\]]*'check')(?=[^\]]*'transfer')[^\]]*\]", vjs_txt) is not None,
       "N: 예측·개념준비·자가진단·전이 중 목표 결론 문구가 노출되는 문항 단계가 있다")

    lens0 = vjs_code.find("var LENS = {")
    lens1 = vjs_code.find("function lensDone", lens0)
    lens_src = vjs_code[lens0:lens1] if lens0 >= 0 and lens1 > lens0 else ""
    seoul = cities.get("서울", {})
    m1_now = seoul.get("temp", {}).get("exceedDays", {}).get("present", {}).get("25")
    m1_past = seoul.get("temp", {}).get("exceedDays", {}).get("past", {}).get("25")
    ck(bool(lens_src), "N: 개념 준비(LENS) 블록을 찾지 못했습니다")
    ck("25°C를 넘는 날" not in lens_src,
       "N: 개념 준비 예시가 미션 1의 결론(기준 초과 일수)을 조작 전에 인쇄한다")
    # 누출은 '며칠'로 표현된다 — 날씨 예시의 '31°C'처럼 숫자만 우연히 겹치는 경우를
    # 오탐하지 않도록 일수 표기(예: '68일')로 좁혀서 본다.
    for label, v in (("현재", m1_now), ("과거", m1_past)):
        if v is None:
            continue
        ck(f"{int(round(v))}일" not in lens_src,
           f"N: 개념 준비 예시에 미션 1 기본 기준의 {label} 결론 일수({int(round(v))}일)가 들어 있다")
    ck("yearMean('서울', 'temp', 'past')" in lens_src,
       "N: 개념 준비의 기후 예시 수치가 데이터에서 계산되지 않고 하드코딩됐다")
    ck("절기와 기후는 어떻게 다를까" not in vjs_code,
       "N: 학습 방법 화면이 사전 문항의 정답(절기와 기후의 구분)을 앞질러 인쇄한다")
    ck(0 <= cerl0 < verdict0 < check0 < expert0
       and "studentCerlHTML(m, n)" in vjs_txt[verdict0:check0]
       and "renderSelfCheckStep(m)" in vjs_txt[verdict0:check0]
       and "renderExpertStep(m, v)" in vjs_txt[verdict0:check0],
       "N: 학생 CERL → 자가진단 → 전문가 예시 순서가 아니다")
    ck("['check', 'expert', 'transfer', 'audit'].indexOf(step) !== -1"
       in flow_src and "!state.cerlSubmitted[m.id] || cerlErrors(m).length" in flow_src,
       "N: 학생 CERL 제출 전에 자가진단이 열려 있다")
    ck(all(f"k: '{k}'" in vjs_txt for k in ("c", "e", "r", "l")),
       "N: 학생 CERL의 주장·근거·추론·한계 네 필드가 모두 있지 않다")
    ck("!state.cerlSubmitted[m.id] || cerlErrors(m).length" in vjs_txt
       and "증거 조건 변경 감지" in vjs_txt
       and "state.evidenceById[m.id] = currentCfg" in vjs_txt
       and "state.cerlSubmitted[m.id] = false" in vjs_txt,
       "N: CERL 없이 진행하거나, 작성 뒤 바뀐 증거를 기존 CERL과 조용히 섞을 수 있다")
    ck('id="localAudit"' in vjs_txt, "N: 외부 전송 없는 기기 안 규칙 점검 버튼이 없다")
    ck('id="aiConsent"' in vjs_txt and "OpenAI API로 전송" in vjs_txt,
       "N: 외부 AI 전송 고지와 명시적 동의가 없다")
    ck("showExample" not in vjs_txt, "N: 앱이 학생 입력칸에 모범 판정문을 대신 넣는 버튼이 남아 있다")
    ck("한 달도 빠짐없이" not in vjs_txt and "품질관리·보간값" in vjs_txt,
       "N: NOAA 월별 기록의 관측 공백·보간을 숨기거나 연속 직접측정으로 오표기한다")
    ck("그래서 바닷가의 계절이 더 늦게 옵니다" not in vjs_txt and "유효 열용량 매개변수" in vjs_txt,
       "N: 유효 열용량을 실제 해안 인과로 단정하는 문구가 남아 있다")

    api_txt = (BASE / "api" / "ai-turn.js").read_text(encoding="utf-8")
    net_m = re.search(r"NETWORK_MAX\s*=\s*(\d+)", api_txt)
    ses_m = re.search(r"SESSION_MAX\s*=\s*(\d+)", api_txt)
    ck(bool(net_m and ses_m and int(net_m.group(1)) >= 40 and 1 <= int(ses_m.group(1)) <= 10),
       "N: 40명 공유망을 허용하면서 세션 남용을 막는 이중 한도가 아니다")
    ck('x-learning-session' in api_txt.lower() and "networkBuckets" in api_txt and "sessionBuckets" in api_txt,
       "N: AI 요청 한도가 학급 공유 IP와 개별 세션을 구분하지 않는다")

    vercel = (BASE / "vercel.json").read_text(encoding="utf-8")
    ck("Content-Security-Policy" in vercel and "frame-ancestors 'none'" in vercel and "X-Content-Type-Options" in vercel,
       "N: 배포 보안 헤더(CSP·frame-ancestors·nosniff)가 없다")
    index_txt = (BASE / "prototype" / "index.html").read_text(encoding="utf-8")
    ck('src="./theme-init.js' in index_txt and "<script>" not in index_txt,
       "N: CSP를 약화시키는 인라인 스크립트가 있거나 외부 테마 초기화 파일이 없다")
    time_texts = [
        (BASE / "README.md").read_text(encoding="utf-8"),
        (BASE / "prototype" / "교사_학습지.html").read_text(encoding="utf-8"),
        vjs_txt,
    ]
    final_claim_texts = [
        time_texts[0],
        (BASE / "발표_10분_구성안.md").read_text(encoding="utf-8"),
        (BASE / "제출_체크리스트.md").read_text(encoding="utf-8"),
    ]
    # 5차 F08: 예전 토큰('15~20분'·'55~70분')은 측정하지 않은 값을 완료 시간처럼 단정했다.
    # 이제 세 문서가 같은 두 가지를 말해야 한다 — 설계 시간의 합, 그리고 아직 재지 않았다는 사실.
    ck(
        all("69~76분" in txt for txt in time_texts),
        "N: 앱·README·교사 자료의 설계 시간(69~76분) 표기가 일치하지 않는다",
    )
    ck(
        all(("아직 측정하지 않" in txt) for txt in time_texts),
        "N: 세 자료 중 하나가 소요 시간을 측정한 것처럼 말한다 — 파일럿 전에는 '아직 측정하지 않았다'를 함께 적는다",
    )
    ck(
        all("15축" in txt and "100/100" in txt for txt in final_claim_texts),
        "N: README·발표·체크리스트의 15축/100점 주장이 일치하지 않는다",
    )

    return report()


def report():
    # 문서가 인용한 '검사 건수'가 이번 실행값과 같은가 (4,810 vs 4,852 재발 차단).
    # 최종 건수는 모든 검사가 끝나야 알 수 있으므로 여기서 본다.
    data_total = DATA_CHECKS[0] or checks[0]
    aux_total = checks[0] - DATA_CHECKS[0]
    if not NO_RAW and data_total != PUBLISHED_DATA_CHECKS:
        fails.append(f"F: 데이터 검사 수 {data_total} ≠ 공개 기준 {PUBLISHED_DATA_CHECKS} — 검사 추가/삭제 시 공개 수와 문서를 함께 갱신하세요")
    if aux_total != PUBLISHED_AUX_CHECKS:
        fails.append(f"F: 인터페이스·문서 검사 수 {aux_total} ≠ 공개 기준 {PUBLISHED_AUX_CHECKS} — 공개 수와 문서를 함께 갱신하세요")
    allowed_counts = {PUBLISHED_DATA_CHECKS, PUBLISHED_TOTAL_CHECKS}
    for rel in dict.fromkeys(DOC_COUNT_TARGETS):
        f = BASE / rel
        if not f.exists():
            continue
        txt = f.read_text(encoding="utf-8")
        nums = {n.replace(",", "") for n in re.findall(r"([0-9],?[0-9]{3})\s*(?:개\s*)?(?:assert|검사|건)", txt)}
        wrong = sorted(n for n in nums if n.isdigit() and 1000 <= int(n) <= 99999 and int(n) not in allowed_counts)
        if wrong:
            warns.append(f"F: {rel} 의 검사 건수 표기 {wrong} ≠ 데이터 {PUBLISHED_DATA_CHECKS}건 또는 총 {PUBLISHED_TOTAL_CHECKS}건 — 문서를 갱신하세요")
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
