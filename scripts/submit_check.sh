#!/usr/bin/env bash
# 제출 직전 안전 검사. 실패가 하나라도 있으면 종료코드 1.
# 목적은 '실격 사유와 요건 미비를 사람이 아니라 스크립트가 잡는 것'이다.
cd "$(dirname "$0")/.." || exit 1
APP="https://weather-24solar-terms.vercel.app"
fail=0
ok(){ printf '  \033[32m✓\033[0m %s\n' "$1"; }
no(){ printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); }

echo "── 1. 비밀값 노출 (실격 사유) ────────────────────────────"
if git ls-files | grep -qE '^\.env'; then no ".env 파일이 git에 추적되고 있습니다"; else ok ".env* git 미추적"; fi
if git log --all -p 2>/dev/null | grep -qiE 'sk-[a-zA-Z0-9]{20}|sk-proj-[a-zA-Z0-9]{20}'; then
  no "git 히스토리에 API 키 패턴"; else ok "git 히스토리 깨끗"; fi
for f in index.html verify.js base.css verify.css solar_terms_data.js korea_geo.js; do
  if curl -fsS "$APP/$f" 2>/dev/null | grep -qiE 'sk-[a-zA-Z0-9]{20}|OPENAI_API_KEY *= *["'"'"'][A-Za-z0-9]'; then
    no "배포본 $f 에 키 패턴"; fi
done
ok "배포 자산 키 스캔 완료"
if [ -f .env.local ]; then
  printf '  \033[33m!\033[0m .env.local 이 로컬에 있습니다 — zip 제출 시 반드시 제외하세요 (git archive 사용 권장)\n'
fi

echo "── 2. 제출물 5종 ─────────────────────────────────────────"
if ls 발표자료*.pdf >/dev/null 2>&1; then
  pg=$(python -c "import fitz,glob;print(fitz.open(glob.glob('발표자료*.pdf')[0]).page_count)" 2>/dev/null)
  emb=$(python -c "import fitz,glob;d=fitz.open(glob.glob('발표자료*.pdf')[0]);print(sum(1 for p in range(d.page_count) for f in d[p].get_fonts() if 'Malgun' in f[3]))" 2>/dev/null)
  if [ "${emb:-0}" -gt 0 ]; then ok "① 발표자료 PDF ${pg}장 · 한글 폰트 임베드"; else no "① 발표자료에 한글 폰트가 임베드되지 않음 — 주최측 PC에서 깨질 수 있음"; fi
else no "① 발표자료 PDF가 없습니다"; fi
if ls 발표자료*.pptx >/dev/null 2>&1; then ok "① 발표자료 PPTX 있음 (주최측 템플릿 기반)"
else no "① 발표자료 PPTX가 없습니다 — 제출은 pptx·pdf 둘 다"; fi
curl -fsS -o /dev/null "$APP/" 2>/dev/null && ok "② 구동 URL 200" || no "② 배포 URL 응답 없음"
[ -d .git ] && ok "③ 소스코드(git)" || no "③ git 저장소 아님"
n=$(ls prompt_sessions/*.md 2>/dev/null | grep -v README | wc -l)
[ "$n" -ge 3 ] && ok "④ 프롬프트 세션 ${n}건" || no "④ 프롬프트 세션 ${n}건 (3건 이상 필요)"
[ -f README.md ] && ok "⑤ README" || no "⑤ README 없음"

echo "── 3. README가 약속한 세션 파일이 실재하는가 ─────────────"
if [ -f prompt_sessions/README.md ]; then
  miss=0
  while read -r f; do
    [ -f "prompt_sessions/$f" ] || { no "prompt_sessions/$f 가 목록에는 있는데 실물이 없습니다"; miss=1; }
  done < <(grep -oE '`[0-9]{2}_[가-힣A-Za-z0-9_]+\.md`' prompt_sessions/README.md | tr -d '`' | sort -u)
  [ "$miss" -eq 0 ] && ok "목록과 실물 일치"
fi

echo "── 4. 배포 자산 ──────────────────────────────────────────"
for f in index.html base.css verify.css verify.js korea_geo.js solar_terms_data.js favicon-32.png og-image.jpg; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "$APP/$f")
  [ "$c" = "200" ] && ok "$f $c" || no "$f $c"
done

# R6: 가장 무거운 실격 사유는 "검증 중 핵심 로직 수정·소스 누락 발견"(제출_체크리스트 §머리말)인데,
#     게이트는 배포본이 200을 주는지만 보고 '배포된 파일 == 제출할 소스'인지는 검사하지 않았다.
#     HEAD 의 파일과 라이브 자산을 줄바꿈 정규화 후 SHA-256 으로 대조한다.
#     (Vercel 은 텍스트 자산을 그대로 서빙하므로 정규화만 하면 일치해야 한다.)
echo "   · HEAD ↔ 배포본 해시 대조"
hash_mismatch=0
for f in index.html base.css verify.css verify.js korea_geo.js solar_terms_data.js theme-init.js; do
  local_h=$(git show "HEAD:prototype/$f" 2>/dev/null | tr -d '\r' | sha256sum | cut -c1-16)
  live_h=$(curl -s "$APP/$f" | tr -d '\r' | sha256sum | cut -c1-16)
  if [ -z "$local_h" ]; then no "HEAD 에 prototype/$f 가 없습니다"; hash_mismatch=1
  elif [ "$local_h" = "$live_h" ]; then ok "$f 해시 일치 ($local_h)"
  else no "$f 가 HEAD($local_h) 와 배포본($live_h) 이 다릅니다 — 커밋 또는 배포가 밀렸습니다"; hash_mismatch=1; fi
done
[ "$hash_mismatch" -eq 0 ] && ok "배포본 = 제출 소스 (7개 자산 전부 일치)"

# 라이브에 남아 있으면 안 되는 폐기 경로 — R6에서 archive.html/app.js/style.css 를 제거했다.
# 이 셋은 본 앱이 참조하지 않으면서 외부 전송 동의 없이 학생 글을 API로 보내는 버튼을 갖고 있었다.
for f in archive.html app.js style.css thumbnail.png; do
  c=$(curl -s -o /dev/null -w '%{http_code}' "$APP/$f")
  [ "$c" = "404" ] && ok "$f 제거 확인 (404)" || no "$f 가 아직 라이브에 있습니다 ($c) — 폐기한 프로토타입이 노출됩니다"
done

echo "── 5. 제출용 zip 시험 생성 ───────────────────────────────"
TMP=$(mktemp -d 2>/dev/null || echo /tmp)
# 5차: `git archive HEAD` 만으로는 사무국 배포 자료(사무국 추가 공유 자료/·오리엔테이션/)가
# 빠지지 않는다 — 추적 파일이므로 그대로 담긴다(실측 10.2MB). 제출본 생성과 동일한
# pathspec 제외를 여기서도 써서, 게이트가 실제 제출물과 같은 것을 검사하게 한다.
if git archive --format=zip --output="$TMP/src.zip" HEAD ':(exclude)사무국 추가 공유 자료' ':(exclude)오리엔테이션' 2>/dev/null; then
  risky=$(python - "$TMP/src.zip" <<'PY'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
# R4: .claude/ 가 빠져 있어 git archive 산출물에 launch.json 이 실제로 포함됐다.
bad = [n for n in z.namelist()
       if '.env' in n or n.startswith('.git/') or n.startswith('.claude/')
       or 'node_modules' in n or n.endswith('.key') or n.endswith('.pyc')
       or '__pycache__' in n or n == '_raw_page.html' or '/_simulated/' in n
       # 사무국이 배포한 자료를 사무국에 되돌려 제출하지 않는다(제출_체크리스트 §3)
       or n.startswith('사무국') or n.startswith('오리엔테이션')]
print(' '.join(bad))
PY
)
  if [ -z "$risky" ]; then ok "git archive 결과에 비밀·불필요 파일 없음"; else no "zip에 위험 파일: $risky"; fi
else no "git archive 실패"; fi

echo "── 6. 검증 스크립트 ──────────────────────────────────────"
# R4: 게이트가 출력하는 검사 건수를 문서가 정확히 인용하는지까지 확인한다.
#     예전에는 종료코드만 보고 넘어가 README(4,810)와 발표자료(4,852)가 서로 달랐다.
gate=$(python processing/verify_solar_terms.py 2>&1)
if printf '%s' "$gate" | grep -q "전체 통과"; then
  ok "회귀 게이트 통과 ($(printf '%s' "$gate" | grep -oE '검사 [0-9]+건' | tail -1))"
else
  no "회귀 게이트 실패"; printf '%s
' "$gate" | grep -E '^    -' | head -8
fi
if printf '%s' "$gate" | grep -q "경고"; then
  printf '  [33m![0m 게이트 경고 있음 — 아래 확인
'; printf '%s
' "$gate" | grep -A20 '경고' | grep -E '^    -' | head -6
fi
node --check prototype/verify.js 2>/dev/null && ok "verify.js 구문" || no "verify.js 구문 오류"
ev=$(node eval_harness.js 2>&1)
if printf '%s' "$ev" | grep -qE "전체 +[0-9]+/100"; then
  ok "평가 하네스 $(printf '%s' "$ev" | grep -oE '[0-9]+/100' | tail -1)"
else no "평가 하네스 실패"; fi

echo "── 7. 문서-현실 정합성 ───────────────────────────────────"
# 문서에 적은 커밋 수는 '그 문서를 고친 커밋' 만큼 뒤처질 수밖에 없다 — 1 차이는 허용한다.
c=$(git rev-list --count HEAD)
# 커밋 수는 세 산출물에 각각 적혀 있다 — 하나만 검사하면 나머지가 조용히 어긋난다(5차 F05).
for pair in "README.md:요약: N개 커밋" "AI_활용_기록.md:커밋 N개"; do
  cf=${pair%%:*}
  if grep -qE "($c|$((c-1))|$((c+1)))(개|건) 커밋|커밋 ($c|$((c-1))|$((c+1)))(개|건)" "$cf" 2>/dev/null; then
    ok "$(basename "$cf") 커밋 수 표기 일치 (실제 ${c})"
  else no "$(basename "$cf") 커밋 수 표기가 실제(${c})와 2 이상 다릅니다"; fi
done

# 라이브 시연 문서가 코드보다 오래되면, 대본이 존재하지 않는 화면을 가리킨다(5차 F02).
# 발표는 시연이 절반이고 1분 초과가 −9점이라, 이 시차 자체를 실패로 잡는다.
# 커밋 시각이 아니라 '파일 수정 시각'을 본다 — 아직 커밋하지 않은 코드 수정도 잡아야
# '지금 배포할 코드'와 '지금 읽을 대본'이 어긋나는 것을 막을 수 있다.
mt() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }
vjs_t=$(mt prototype/verify.js)
for d in 데모_대본.md 발표_10분_구성안.md; do
  dt=$(mt "$d")
  if [ -z "$vjs_t" ] || [ -z "$dt" ]; then
    ok "$d 시차 검사 생략 (수정 시각을 읽을 수 없음)"
  elif [ "$dt" -ge "$vjs_t" ]; then
    ok "$d 가 verify.js와 같거나 더 최신"
  else
    no "$d 가 verify.js보다 오래됐습니다 — 시연 대본이 현재 화면과 다를 수 있습니다"
  fi
done

# 배포 자산 총량 표기 검증 — gzip 실측 합계가 발표자료 표기와 ±5% 안인지(5차 F05).
kb_doc=$(grep -oE "약 [0-9]{3}KB" 제출_체크리스트.md 2>/dev/null | head -1 | grep -oE "[0-9]{3}")
if [ -n "$kb_doc" ]; then
  tot=0
  for a in prototype/index.html prototype/base.css prototype/verify.css prototype/korea_geo.js prototype/solar_terms_data.js prototype/verify.js prototype/theme-init.js; do
    [ -f "$a" ] || continue
    sz=$(gzip -c "$a" 2>/dev/null | wc -c)
    tot=$((tot + sz))
  done
  kb_real=$((tot / 1024))
  lo=$((kb_doc * 95 / 100)); hi=$((kb_doc * 105 / 100))
  if [ "$kb_real" -ge "$lo" ] && [ "$kb_real" -le "$hi" ]; then ok "자산 총량 표기 일치 (문서 ${kb_doc}KB · 실측 ${kb_real}KB)"
  else no "자산 총량 표기가 실측과 5% 이상 다릅니다 (문서 ${kb_doc}KB · 실측 ${kb_real}KB)"; fi
fi
pg=$(python -c "import fitz,glob;print(fitz.open(glob.glob('발표자료*.pdf')[0]).page_count)" 2>/dev/null)
if [ -n "$pg" ] && grep -qE "PDF \*{0,2}${pg}\*{0,2}장" 제출_체크리스트.md 2>/dev/null; then ok "발표자료 장수 ${pg} 일치"
elif [ -n "$pg" ]; then no "발표자료 장수 표기 불일치 (실제 ${pg}장)"; fi
n=$(ls prompt_sessions/*.md 2>/dev/null | grep -v README | wc -l)
for f in prompt_sessions/*.md; do
  case "$f" in */README.md) continue;; esac
  b=$(basename "$f")
  grep -q "$b" AI_활용_기록.md || no "AI_활용_기록.md 목차에 $b 가 없습니다"
done
ok "세션 목차 ${n}건 대조 완료"
if grep -rqE "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}" prompt_sessions/*.md 2>/dev/null; then
  no "세션 로그에 이메일 평문이 있습니다"; else ok "세션 로그 이메일 0건"; fi
# 5차 최종 감사: Claude Code 내부 안내 문구를 타고 로컬 홈 경로(윈도우 사용자명)가 세션 로그에
# 섞여 들어왔다. 제출물에 있을 이유가 없는 정보라 export_sessions.py 가 마스킹하지만, 여기서 다시 본다.
#
# R6: 이 패턴이 백슬래시를 잃어 실제로는 아무것도 잡지 못하면서 항상 ✓를 찍고 있었다.
#     쌍따옴표 안의 "\+" 가 셸을 거쳐 ERE 의 "\+"(리터럴 +)가 되어 "C:+Users+" 를 찾았다 —
#     실제 경로 C:\Users\... 는 절대 걸리지 않는다. 홑따옴표 + [[:alpha:]] 로 다시 쓴다.
HOME_PATH_RE='([A-Za-z]:\\+[Uu]sers\\+|/(home|Users)/)[A-Za-z0-9._-]+'
if grep -rqE "$HOME_PATH_RE" prompt_sessions/*.md 2>/dev/null; then
  no "세션 로그에 마스킹되지 않은 로컬 홈 경로가 있습니다"; else ok "세션 로그 로컬 경로 마스킹 확인"; fi
# 제3자를 식별할 수 있는 서술 — export_sessions.py 가 구간 제외와 표현 치환 두 단계로 막지만,
# 두 단계의 순서를 뒤집으면 치환이 제외 지문을 지워 구간이 그대로 실린다(실제로 한 번 겪었다).
# 결과물을 직접 검사해 그 회귀를 잡는다.
if grep -rqE "합격팀|타 *팀 *실명|본선 *1?5?개? *팀 *실명" prompt_sessions/*.md 2>/dev/null; then
  no "세션 로그에 제3자를 식별할 수 있는 서술이 있습니다"; else ok "세션 로그 제3자 식별 서술 0건"; fi
# R6: 이 패턴도 \s 가 s 로 붕괴해 "^s*var COASTALs*=" 가 됐다 — 들여쓴 선언(실제 코드 형태)은
#     ^s* 에 걸리지 않아 회귀를 못 잡는다. 백슬래시가 필요 없는 문자 클래스로 다시 쓴다.
COASTAL_RE='^[[:space:]]*var[[:space:]]+COASTAL[[:space:]]*='
if grep -qE "$COASTAL_RE" prototype/verify.js; then no "verify.js에 폐기한 COASTAL 이분법이 남아 있습니다"; else ok "해안/내륙 이분법 제거 확인"; fi

# ── 게이트 자기검증 (R6) ──────────────────────────────────────────────
# 위 두 패턴은 '항상 통과'하는 상태로 오래 있었다. 검사기가 실제로 잡는지 스스로 시험한다.
# 일부러 위반 문자열을 만들어 패턴이 걸러 내는지 확인하고, 못 잡으면 게이트를 실패시킨다.
_selftest_dir=$(mktemp -d)
# printf 의 '형식' 자리에 백슬래시 문자열을 두면 \U 를 유니코드 이스케이프로 읽어 실패한다.
# 반드시 %s 로 '인수'로 넘긴다 (이 실수 때문에 자기검증이 거짓 실패를 냈다).
printf '%s\n' 'C:\Users\someone\project'    > "$_selftest_dir/home_win.txt"
printf '%s\n' '/home/someone/project'       > "$_selftest_dir/home_posix.txt"
printf '%s\n' '    var COASTAL = { x };'    > "$_selftest_dir/coastal.txt"
printf '%s\n' 'nothing sensitive here'      > "$_selftest_dir/clean.txt"
_st_fail=0
grep -qE "$HOME_PATH_RE" "$_selftest_dir/home_win.txt"   || { _st_fail=1; echo "  (자기검증) 윈도우 홈 경로 패턴이 실패"; }
grep -qE "$HOME_PATH_RE" "$_selftest_dir/home_posix.txt" || { _st_fail=1; echo "  (자기검증) POSIX 홈 경로 패턴이 실패"; }
grep -qE "$COASTAL_RE"   "$_selftest_dir/coastal.txt"    || { _st_fail=1; echo "  (자기검증) COASTAL 패턴이 실패"; }
grep -qE "$HOME_PATH_RE" "$_selftest_dir/clean.txt"      && { _st_fail=1; echo "  (자기검증) 깨끗한 파일을 오탐"; }
rm -rf "$_selftest_dir"
if [ "$_st_fail" -eq 0 ]; then ok "게이트 자기검증 — 위반 문자열을 실제로 잡는다"
else no "게이트의 검사 패턴이 위반 문자열을 잡지 못합니다 (검사기 자체가 고장)"; fi

# 캐시 버스팅 — 자산을 고쳤는데 ?v= 를 올리지 않으면 재방문자·주최측 PC가 옛 파일을 받는다.
# 마지막으로 ?v= 가 바뀐 커밋보다 자산이 더 최신이면 실패로 잡는다.
iv_t=$(mt prototype/index.html)
for asset in prototype/verify.js prototype/verify.css prototype/base.css prototype/solar_terms_data.js prototype/korea_geo.js prototype/theme-init.js; do
  at=$(mt "$asset")
  if [ -z "$iv_t" ] || [ -z "$at" ]; then continue; fi
  if [ "$at" -gt "$iv_t" ]; then
    no "$(basename "$asset") 가 index.html보다 최신입니다 — ?v= 버전을 올리세요(캐시된 옛 파일이 배포됩니다)"
  else
    ok "$(basename "$asset") 캐시 버스팅 최신"
  fi
done

echo
if [ "$fail" -eq 0 ]; then printf '\033[32m제출 가능 — 검사 전부 통과\033[0m\n'; else printf '\033[31m실패 %d건 — 고치기 전에는 제출하지 마세요\033[0m\n' "$fail"; fi
exit $fail
