/*
 * Weather24 AI 증거감사관 — 규칙기반 fallback(localAudit) 품질 평가 하니스.
 * verify.js에서 실제 배포되는 localAudit 함수를 추출해 100개 케이스에 대해 실행하고,
 * gold 라벨(status, should_flag)과 대조해 카테고리별 정확도를 산출한다.
 *   node eval_harness.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

// 1) verify.js에서 localAudit 소스 추출 (배포 로직을 그대로 테스트)
const src = fs.readFileSync(path.join(ROOT, 'prototype', 'verify.js'), 'utf8');
const start = src.indexOf('function localAudit(draft) {');
if (start < 0) throw new Error('localAudit를 찾지 못함');
let i = src.indexOf('{', start), depth = 0, end = -1;
for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } } }
const localAuditSrc = src.slice(start, end);

// 2) 의존성 목킹 후 함수 구성 (localAudit은 stat()의 n.city만 사용 — 지역 감지는 도시명 정규식이 겸함)
// localAudit이 참조하는 조사 헬퍼도 함께 뽑는다.
// 본문만 잘라 실행하면 iGa·eunNeun 등이 스코프에 없어 ReferenceError로 죽는다.
// verify.js에서 추출하므로 헬퍼가 바뀌어도 이 하네스가 자동으로 따라간다.
function pluck(name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('헬퍼를 찾지 못함: ' + name);
  let j = src.indexOf('{', at), d2 = 0, e2 = -1;
  for (; j < src.length; j++) { if (src[j] === '{') d2++; else if (src[j] === '}') { d2--; if (d2 === 0) { e2 = j + 1; break; } } }
  return src.slice(at, e2);
}
const HELPERS = ['lastHangul', 'hasJong', 'eunNeun', 'eulReul', 'iGa'].map(pluck).join('\n');

const factory = new Function('stat', HELPERS + '\n' + localAuditSrc + '\nreturn localAudit;');
const localAudit = factory(() => ({ city: '서울', thr: 25, pd: 0, cd: 0 }));

// 3) doAudit의 12자 미만 가드 재현 + 케이스 실행
function audit(text) {
  if (text.replace(/\s/g, '').length < 12) return { evidence_status: 'insufficient', flags: ['insufficient'], overclaim_warning: '', socratic_question: '' };
  return localAudit(text);
}

// gold 플래그 ↔ 감지 플래그 동치 처리
// 관측된 답에서 gold가 표시한 문제 중 '적어도 하나'를 잡으면 통과(주 결함을 포착).
function goldSatisfied(goldFlags, det) {
  const f = det.flags || [];
  return goldFlags.some(g => {
    if (g === 'overclaim') return f.some(x => ['scope', 'causal', 'one_year'].includes(x));
    if (g === 'insufficient') return det.evidence_status === 'insufficient' || f.includes('missing') || f.includes('insufficient');
    if (g === 'missing') return f.includes('missing');
    if (g === 'injection') return f.includes('injection') || det.evidence_status === 'insufficient'; // <12자면 앱이 진행을 거부
    return f.includes(g);
  });
}

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval_set.json'), 'utf8'));
const cats = {};
const fails = [];
for (const c of data.cases) {
  const det = audit(c.text);
  let pass;
  if (c.status === 'ready') {
    // 좋은 답(범위 지킴/판단보류)은 경고 없이 통과해야 함 — 오탐 방지가 핵심
    pass = det.evidence_status === 'ready' && (det.flags || []).length === 0;
  } else {
    const flaggedSomething = det.evidence_status !== 'ready';
    const caughtGold = (c.should_flag || []).length ? goldSatisfied(c.should_flag, det) : flaggedSomething;
    pass = flaggedSomething && caughtGold;
  }
  cats[c.category] = cats[c.category] || { n: 0, pass: 0 };
  cats[c.category].n++; if (pass) cats[c.category].pass++;
  if (!pass) fails.push({ id: c.id, cat: c.category, text: c.text.slice(0, 46), gold: c.status + '/' + (c.should_flag || []).join(','), got: det.evidence_status + '/' + (det.flags || []).join(',') });
}

let totalN = 0, totalP = 0;
console.log('=== 규칙기반 fallback(localAudit) 카테고리별 정확도 ===');
for (const k of Object.keys(cats)) { const v = cats[k]; totalN += v.n; totalP += v.pass; console.log(`  ${k.padEnd(22)} ${v.pass}/${v.n}  (${Math.round(v.pass / v.n * 100)}%)`); }
console.log(`  ${'전체'.padEnd(22)} ${totalP}/${totalN}  (${Math.round(totalP / totalN * 100)}%)`);
console.log('\n=== 오답(fallback이 못 잡거나 오탐한 케이스) ===');
fails.forEach(f => console.log(`  [${f.id}] ${f.cat} | gold=${f.gold} got=${f.got} | ${f.text}`));

fs.writeFileSync(path.join(ROOT, 'eval_result.json'), JSON.stringify({ generated: 'run', total: totalN, passed: totalP, byCategory: cats, failures: fails }, null, 1));
console.log('\n결과 저장: eval_result.json');
