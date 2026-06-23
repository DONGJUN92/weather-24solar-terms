# web_data 활용 가이드 — 대회 결과물에 바로 쓰는 가공 데이터

> 수집한 원시 데이터를 **"브라우저에서 실데이터를 직접 조작하며 학습"**(대회 핵심)하는
> 웹 인터랙티브 도구에 곧바로 바인딩할 수 있도록 가공한 **컴팩트 JSON 모음**입니다.
> 모든 파일은 `fetch()` 한 번으로 슬라이더·지도·차트에 연결됩니다. 총 ~1.1MB.

---

## 1. 왜 이렇게 가공했나 (평가기준 정렬)

| 심사 기준(배점) | 이 데이터가 기여하는 방식 |
|---|---|
| **실현 가능성 (30)** | 백엔드 불필요 — 정적 JSON을 그대로 import/fetch. 슬라이더 범위·스텝까지 계산 제공 → 프로토타입 즉시 구동 |
| **체험·참여형 (25)** | 월별 평년값·변수범위·CO2-기온 회귀식 등 **"조작하면 반응하는"** 값으로 미리 환산 |
| **주제 적합성 (20)** | 기상청 실관측·ERA5·태풍 등 대회 지정 소스(참고사이트) 그대로 |
| **아이디어 독창성 (15)** | 태풍 경로, 한국 온난화 추세, 극값 기록 등 스토리 소재 |
| **학습 효과 (10)** | 극값·기록·평년 대비 등 '비교를 통한 이해' 데이터 |

---

## 2. 결과물 예시 6종 ↔ 데이터 매핑

| 예시 결과물 | 핵심 데이터 파일 | 활용 |
|---|---|---|
| **① 태풍 형성·발달 시뮬레이터** | `typhoon_tracks_wnp.json`, `variable_ranges.json` | 실제 태풍 경로/강도 재생, SST·기압 슬라이더로 강도 변화 체험 |
| **② 예보관 의사결정 체험** | `korea_daily/<지점>.json` | 특정 날짜까지 보여주고 "내일 기온/강수 예측" → 실제값 공개·비교 |
| **③ 기압·바람 인터랙티브 맵** | `korea_monthly_climatology.json`, `index.json`(지점좌표) | 8지점 기압·풍속·풍향을 지도에 배치, 계절 슬라이더 |
| **④ 강수 원리 시뮬레이터** | `korea_monthly_climatology.json`, `variable_ranges.json` | 습도·기온 조절→강수 비교, 월별 강수/강수일수 |
| **⑤ 기후변화 체험 도구** | `climate_change.json`, `co2_keeling_monthly.json` | **CO2 슬라이더→기온 반응**(회귀식 내장), Keeling 곡선, 한국 온난화 |
| **⑥ 수치예보모델 입문** | `korea_daily/<지점>.json` | 오늘 기온·습도·기압 입력→내일 기온 예측(간단 ML/회귀 학습 데모) |

---

## 3. 파일별 명세

### `index.json` — 카탈로그
데이터셋 목록·지점 좌표(8개)·일자료 파일 목록. 앱 시작 시 먼저 로드.

### `korea_monthly_climatology.json` — 월별 평년값(2022~2026)
8지점 × 12개월. 필드: `tavg/tmin/tmax`(℃), `precip`(월강수 mm), `rain_days`,
`wind`(m/s), `humidity`(%), `pressure`(hPa), `sunshine`(h).
```js
const c = await (await fetch('korea_monthly_climatology.json')).json();
c.stations['서울'].monthly[6];   // 7월: {tavg:27.4, precip:390.9, ...}
```

### `korea_annual_summary.json` — 연별 요약·온난화 추세
지점별 연 `tavg`, `precip_total`, `hottest/coldest/wettest`(날짜+값), `warming_per_decade`(℃/10년).

### `korea_daily/<지점>.json` — 일자료(컬럼형, 8파일)
`dates[]` 와 `tavg/tmin/tmax/precip/wind/humidity/pressure/wind_dir[]` 동일 길이 배열(약 1,632일).
컬럼형이라 차트 라이브러리에 그대로 투입.

### `climate_change.json` — 기후변화 결합 + 회귀
`series[]`: 연도별 `co2_ppm·temp_anomaly_C·sea_level_mm·korea_temp_C`.
`relationship`: **CO2→기온 선형회귀**(`co2_temp_per_100ppm_C`, `r2`) → 슬라이더에 바로 사용.
```js
const cc = await (await fetch('climate_change.json')).json();
const dT = cc.relationship.co2_temp_slope_C_per_ppm * (co2 - 280); // 산업화 이전 대비
```

### `co2_keeling_monthly.json` — 마우나로아 월별 CO2
`dates[]`, `co2_ppm[]` (1958~현재). Keeling 곡선 애니메이션용.

### `typhoon_tracks_wnp.json` — 서태평양 태풍(2022~2026, 120개)
`storms[]`: `name·season·peak_wind_kt·min_pres_mb·category` + `track[]`(6시간 간격
`[time, lat, lon, wind_kt, pres_mb]`). 지도 폴리라인·강도 색상에 직접 매핑.

### `variable_ranges.json` — 슬라이더 설정값
변수별 `min/max/mean/p5/p95/suggest_min/suggest_max` + 라벨·단위.
슬라이더 `min/max/step`을 데이터에서 자동 결정 → 비현실적 입력 방지.

### `extremes_records.json` — 전국 기록
`hottest/coldest/wettest_day/windiest/most_humid` (지점+날짜+값). 흥미 유발 카피.

---

## 4. 웹앱에서 쓰는 법 (정적 호스팅이면 끝)

```js
// 어떤 프레임워크든 동일
const base = './web_data/';
const [idx, clim, climate] = await Promise.all([
  fetch(base+'index.json').then(r=>r.json()),
  fetch(base+'korea_monthly_climatology.json').then(r=>r.json()),
  fetch(base+'climate_change.json').then(r=>r.json()),
]);
// 슬라이더 onChange → 회귀식으로 즉시 반응 (백엔드 0)
```
> 로컬에서 `file://` fetch가 막히면 `python -m http.server` 후 접속하거나
> 빌드 시 JSON을 코드에 import 하세요. (Vite/Next/CRA 모두 정적 import 지원)

---

## 5. 재생성
원시 CSV가 갱신되면:
```powershell
python ../processing/build_web_data.py   # web_data 재생성
python ../processing/verify_web_data.py  # 9종 물리 타당성 검증
```
