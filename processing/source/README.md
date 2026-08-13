# processing/source — 빌드 입력 원문

`build_future_scenarios.py`가 읽는 **원문 텍스트**를 둡니다.
숫자를 손으로 옮겨 적지 않고 원문에서 파싱하기 위한 자리입니다 —
손으로 옮기면 어디서 틀렸는지 되짚을 수 없기 때문입니다.

## region_report_2024.txt (460KB)

| | |
|---|---|
| **원본** | 기상청 국립기상과학원 「지역 기후변화 전망보고서 개정판」 |
| **발간** | 2024-02-29 · 발간등록번호 **11-1360000-001799-01** · 215쪽 |
| **원본 URL** | <http://www.climate.go.kr/home/cc_data/2024/> |
| **이 파일** | 위 PDF에서 텍스트만 추출한 것 (`=== PAGE n ===` 구분자 포함) |
| **이용 조건** | 공공저작물 — 출처표시. 원자료(PDF·격자자료)는 재배포하지 않고, **보고서에 게재된 수치만** 가공해 앱에 싣습니다 |

### 여기서 뽑아 쓰는 표 3개

| 표 | 내용 | 산출물의 키 |
|---|---|---|
| 표 4-113 | 17개 광역시·도 계절길이 및 계절시작일 전망 | `seasons` |
| 표 4-22 | 17개 광역시·도 폭염일수 전망 및 편차 | `heatDays` |
| 표 4-23 | 17개 광역시·도 열대야일수 전망 및 편차 | `tropicalNights` |

### 왜 이 보고서 하나만 쓰는가

기상청 **기후변화 상황지도**(`climate.go.kr/atlas`)의 내부 JSON도 같은 종류의 값을 주지만
**보고서와 수치가 다릅니다**(서울 SSP5-8.5 후반기 겨울 길이: 보고서 28일 vs 상황지도 12일).
두 출처를 섞으면 어느 쪽도 검증할 수 없게 되므로, **발간등록번호가 있는 보고서 한 곳**만 쓰고
화면에도 그 출처를 판본까지 적습니다.

> 참고 — 기후정보포털의 자료 다운로드 기능은 2024-07-01자로 종료되어 상황지도로 이관됐고,
> 상황지도의 원자료 다운로드는 로그인이 필요합니다. 기상청 API허브에는 시나리오 API가 없습니다.
> 그래서 이 앱은 **빌드 타임에 정적 JSON으로 굽는 방식**만 씁니다(런타임 호출 없음).

## 재생성 방법

PDF를 받아 텍스트로 풀어 같은 경로에 두면 됩니다(`pip install pymupdf` 필요).

```bash
python -c "import fitz,sys; d=fitz.open('지역기후변화전망보고서_개정판_240229.pdf'); \
open('processing/source/region_report_2024.txt','w',encoding='utf-8').write( \
''.join('=== PAGE %d ===\n%s\n'%(i+1,p.get_text()) for i,p in enumerate(d)))"
```

그다음:

```bash
python processing/build_future_scenarios.py     # → web_data/future_scenarios.json, prototype/future_scenarios.js
python processing/verify_future_scenarios.py    # 보고서 앵커 31건 + 구조·정합·매핑 검증 (실패 시 exit 1)
```
