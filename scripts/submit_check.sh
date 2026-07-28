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
else no "① 발표자료(PPT/PDF)가 없습니다"; fi
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

echo "── 5. 제출용 zip 시험 생성 ───────────────────────────────"
TMP=$(mktemp -d 2>/dev/null || echo /tmp)
if git archive --format=zip --output="$TMP/src.zip" HEAD 2>/dev/null; then
  risky=$(python - "$TMP/src.zip" <<'PY'
import sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
# R4: .claude/ 가 빠져 있어 git archive 산출물에 launch.json 이 실제로 포함됐다.
bad = [n for n in z.namelist()
       if '.env' in n or n.startswith('.git/') or n.startswith('.claude/')
       or 'node_modules' in n or n.endswith('.key') or n.endswith('.pyc')
       or '__pycache__' in n or n == '_raw_page.html' or '/_simulated/' in n]
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
c=$(git rev-list --count HEAD)
if grep -q "요약: ${c}개 커밋" README.md 2>/dev/null; then ok "README 커밋 수 ${c} 일치"
else no "README 커밋 수 표기가 실제(${c})와 다릅니다"; fi
pg=$(python -c "import fitz,glob;print(fitz.open(glob.glob('발표자료*.pdf')[0]).page_count)" 2>/dev/null)
if [ -n "$pg" ] && grep -q "PDF ${pg}장" 제출_체크리스트.md 2>/dev/null; then ok "발표자료 장수 ${pg} 일치"
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
if grep -qE '^s*var COASTALs*=' prototype/verify.js; then no "verify.js에 폐기한 COASTAL 이분법이 남아 있습니다"; else ok "해안/내륙 이분법 제거 확인"; fi

echo
if [ "$fail" -eq 0 ]; then printf '\033[32m제출 가능 — 검사 전부 통과\033[0m\n'; else printf '\033[31m실패 %d건 — 고치기 전에는 제출하지 마세요\033[0m\n' "$fail"; fi
exit $fail
