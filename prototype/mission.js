(function () {
  'use strict';
  var D = window.SOLAR_DATA;
  if (!D) return;

  /*
   * Weather24 is deliberately a short interactive lesson, not a dashboard.
   * One screen = one decision. Explanations follow an action, never precede it.
   */
  var LESSONS = [
    { id:'season', caseId:'A-05', no:1, term:15, city:'서울', compareCity:'부산', metric:'temp', icon:'☀', label:'절기와 날씨', title:'처서인데,\n더울 수 있을까?', lead:'날짜의 계절과 오늘의 공기를 구분해 보자.', rule:'덥다', min:23, max:30, initial:25, unit:'°C', scope:'window', claim:'서울의 처서 무렵은 과거보다 더웠다.' },
    { id:'rain', caseId:'C-01', no:2, term:12, city:'서울', compareCity:'광주', metric:'precip', icon:'☂', label:'비의 언어', title:'비가 줄었다는 말,\n무슨 뜻일까?', lead:'비의 양과 비가 온 날은 같은 말이 아니에요.', rule:'비가 많이 왔다', min:1, max:10, initial:3, unit:'mm', scope:'window', claim:'서울의 소서 무렵 강수량은 선택한 기준에서 다르게 나타났다.' },
    { id:'summer', caseId:'B-03', no:3, term:10, city:'서울', compareCity:'부산', metric:'temp', icon:'⌁', label:'여름의 길이', title:'여름은\n며칠일까?', lead:'먼저 “여름”의 온도 기준을 만들어 보자.', rule:'여름이다', min:20, max:30, initial:25, unit:'°C', scope:'year', claim:'서울에서 내가 정한 여름 기준을 만족한 날 수는 두 기간에 다르다.' }
  ];
  var metricMap = {};
  D.metrics.forEach(function (metric) { metricMap[metric.key] = metric; });
  var saved = loadProgress();
  var state = { lesson:saved.last || 'season', step:'start', threshold:25, touched:false, completed:saved.completed, prediction:'' };

  function $(id) { return document.getElementById(id); }
  function lesson() { return LESSONS.filter(function (item) { return item.id === state.lesson; })[0] || LESSONS[0]; }
  function term(m) { return D.terms[m.term]; }
  function day(index) { return ((index % 365) + 365) % 365; }
  function value(m, city, period) { return D.cities[city][m.metric][period][day(term(m).doy - 1)]; }
  function values(m, city, period) {
    var list = D.cities[city][m.metric][period];
    if (m.scope === 'year') return list.slice();
    return Array.from({ length:15 }, function (_, index) { return list[day(term(m).doy - 1 + index)]; });
  }
  function round(value) { return Math.round(value * 10) / 10; }
  function format(m, value) { return round(value) + (m.metric === 'temp' ? '°' : 'mm'); }
  function count(m, period, threshold) { return values(m, m.city, period).filter(function (item) { return item >= threshold; }).length; }
  function progressKey() { return 'weather24_learning_path_v2'; }
  function loadProgress() {
    try {
      var item = JSON.parse(localStorage.getItem(progressKey()));
      if (item && Array.isArray(item.completed)) return { completed:item.completed.filter(function (id) { return LESSONS.some(function (lesson) { return lesson.id === id; }); }), last:item.last || 'season' };
    } catch (error) {}
    return { completed:[], last:'season' };
  }
  function saveProgress() { try { localStorage.setItem(progressKey(), JSON.stringify({ completed:state.completed, last:state.lesson })); } catch (error) {} }
  function isUnlocked(index) { return index === 0 || LESSONS.slice(0, index).some(function (item) { return state.completed.indexOf(item.id) !== -1; }); }
  function updateChrome() {
    var m = lesson();
    $('missionCode').textContent = 'LESSON ' + m.no + ' / 3';
    ['signalOne','signalTwo','signalThree'].forEach(function (id, index) { $(id).classList.toggle('is-on', index < m.no); });
    $('missionFoot').textContent = m.label + ' · 실제 기상 관측으로 배우는 8분 레슨';
  }
  function screen(html) {
    $('missionStage').innerHTML = html;
    updateChrome();
  }
  function stepTop(m, number, skill) {
    return '<div class="learn-step"><span>' + m.icon + ' ' + skill + '</span><div class="learn-dots" aria-label="레슨 진행 ' + number + ' / 4"><i class="is-done"></i><i class="' + (number > 1 ? 'is-done' : '') + '"></i><i class="' + (number > 2 ? 'is-done' : '') + '"></i><i class="' + (number > 3 ? 'is-done' : '') + '"></i></div></div>';
  }
  function primary(label, id) { return '<button class="learn-primary" id="' + id + '">' + label + '<span aria-hidden="true">→</span></button>'; }
  function choice(value, icon, title, sub, attr) { return '<button class="learn-choice" ' + attr + '="' + value + '"><span class="choice-icon" aria-hidden="true">' + icon + '</span><span><b>' + title + '</b><small>' + sub + '</small></span><i aria-hidden="true">›</i></button>'; }
  function feedback(id, good, title, copy, action, label) {
    return '<div class="learn-feedback ' + (good ? 'is-good' : 'is-try') + '" id="' + id + '"><span aria-hidden="true">' + (good ? '✓' : '↻') + '</span><div><b>' + title + '</b><p>' + copy + '</p>' + (action ? '<button class="learn-mini-primary" id="' + action + '">' + label + ' →</button>' : '') + '</div></div>';
  }
  function temperatureStrip(m, period) {
    var source = values(m, m.city, period).slice(0, 15);
    var min = Math.min.apply(null, source), max = Math.max.apply(null, source), span = max - min || 1;
    return '<div class="weather-strip" aria-label="' + D.periods[period] + '의 15일 관측 분포">' + source.map(function (item) { var level = Math.round(((item - min) / span) * 4) + 1; return '<i class="heat-' + level + '"></i>'; }).join('') + '</div>';
  }
  function renderStart() {
    var m = lesson(); state.step = 'start'; state.threshold = m.initial; state.touched = false;
    $('openArchive').hidden = true;
    screen('<section class="learn-card learn-start"><div class="lesson-orbit" aria-hidden="true"><i></i><i></i><b>' + m.icon + '</b><span>' + term(m).name + '</span></div><p class="learn-overline">8분 마이크로 레슨 · ' + m.label + '</p><h1>' + m.title.replace('\n','<br />') + '</h1><p class="learn-lead">' + m.lead + '</p><div class="goal-chip"><span aria-hidden="true">✦</span> 오늘의 발견: <b>절기 ≠ 날씨</b></div>' + primary('시작하기', 'startLesson') + '<button class="learn-link" id="skipToMap">다른 레슨 보기</button></section>');
    $('startLesson').addEventListener('click', renderSort);
    $('skipToMap').addEventListener('click', openBoard);
  }
  function renderSort() {
    var m = lesson(); state.step = 'sort';
    screen('<section class="learn-card"><div class="learn-visual-pair"><div class="visual-token token-calendar"><span>📅</span><b>' + term(m).name + '</b><small>' + term(m).date + '</small></div><div class="visual-equals" aria-hidden="true">?</div><div class="visual-token token-weather"><span>' + (m.metric === 'temp' ? '🌡' : '💧') + '</span><b>' + format(m, value(m, m.city, 'present')) + '</b><small>' + m.city + ' 관측</small></div></div>' + stepTop(m, 1, '구분하기') + '<h2>날짜표는<br /><em>어느 쪽</em>일까?</h2><p class="learn-prompt">하나를 눌러 보세요.</p><div class="learn-choice-stack">' + choice('term','☀',term(m).name,'태양 위치로 정한 절기','data-sort') + choice('weather',m.metric === 'temp' ? '🌡' : '💧',format(m, value(m, m.city, 'present')),m.city + '의 관측값','data-sort') + '</div><div id="sortFeedback"></div></section>');
    document.querySelectorAll('[data-sort]').forEach(function (button) { button.addEventListener('click', function () {
      var box = $('sortFeedback');
      if (button.dataset.sort === 'term') {
        box.innerHTML = feedback('sortGood', true, '맞았어요!', term(m).name + '는 태양 위치로 정하는 날짜표예요.', 'toCompare', '온도 단서 보기');
        $('toCompare').addEventListener('click', renderCompare);
      } else box.innerHTML = feedback('sortTry', false, '다시 한 번', '관측값은 장소와 시기에 따라 달라져요. 날짜표를 찾아보세요.');
    }); });
  }
  function renderCompare() {
    var m = lesson(), oldValue = value(m, m.city, 'past'), newValue = value(m, m.city, 'present'), diff = round(newValue - oldValue);
    state.step = 'compare';
    screen('<section class="learn-card"><div class="compare-sky" aria-hidden="true"><span>☀</span><i></i><i></i><i></i></div>' + stepTop(m, 2, '비교하기') + '<h2>같은 ' + term(m).name + ',<br /><em>온도는 달랐을까?</em></h2><div class="compare-pods"><article><span>' + D.periods.past + '</span><b>' + format(m, oldValue) + '</b>' + temperatureStrip(m, 'past') + '</article><div class="compare-arrow" aria-label="변화 ' + (diff >= 0 ? '+' : '') + diff + '">→<small>' + (diff >= 0 ? '+' : '') + diff + '</small></div><article class="is-now"><span>' + D.periods.present + '</span><b>' + format(m, newValue) + '</b>' + temperatureStrip(m, 'present') + '</article></div><p class="micro-note">' + m.city + ' · ' + term(m).name + ' 무렵 · 5년 평균</p><p class="learn-prompt">이 숫자가 바로 말해 주는 것은?</p><div class="learn-choice-stack compact">' + choice('scope','◎',m.city + '의 ' + term(m).name + ' 무렵 ' + (metricMap[m.metric] || {}).label + '이 달랐다.','관측한 범위 안의 말','data-compare') + choice('all','⌁','전국의 계절이 모두 바뀌었다.','지금 자료보다 넓은 말','data-compare') + '</div><div id="compareFeedback"></div></section>');
    document.querySelectorAll('[data-compare]').forEach(function (button) { button.addEventListener('click', function () {
      var box = $('compareFeedback');
      if (button.dataset.compare === 'scope') {
        box.innerHTML = feedback('compareGood', true, '좋은 관찰!', '5년 비교는 첫 단서예요. 더 긴 기후 판단은 더 많은 해의 자료가 필요해요.', 'toRule', '나만의 기준 만들기');
        $('toRule').addEventListener('click', renderRule);
      } else box.innerHTML = feedback('compareTry', false, '범위를 줄여 볼까요?', '지금 보이는 것은 ' + m.city + '의 두 기간이에요. 그 안에서만 말해 보세요.');
    }); });
  }
  function updateRule() {
    var m = lesson(), threshold = Number($('ruleRange').value), past = count(m, 'past', threshold), present = count(m, 'present', threshold);
    state.threshold = threshold;
    $('ruleNumber').textContent = threshold + m.unit;
    $('pastDays').textContent = past + '일'; $('presentDays').textContent = present + '일';
    $('ruleButton').disabled = !state.touched;
  }
  function renderRule() {
    var m = lesson(); state.step = 'rule';
    screen('<section class="learn-card"><div class="rule-visual" aria-hidden="true"><div class="thermo-fill"></div><span>🌡</span></div>' + stepTop(m, 3, '기준 만들기') + '<h2>몇 ' + m.unit + '부터<br /><em>“' + m.rule + '”</em>일까?</h2><p class="learn-prompt">슬라이더를 움직여 나만의 기준을 정하세요.</p><div class="rule-lab"><output id="ruleNumber">' + m.initial + m.unit + '</output><input id="ruleRange" type="range" min="' + m.min + '" max="' + m.max + '" step="1" value="' + m.initial + '" aria-label="' + m.rule + ' 기준"><div class="rule-counts"><div><span>' + D.periods.past + '</span><b id="pastDays">—</b></div><div><span>' + D.periods.present + '</span><b id="presentDays">—</b></div></div></div><p class="micro-note">기준을 바꾸면 결과도 달라져요. 그래서 기준을 말해야 해요.</p>' + primary('이 기준으로 말하기', 'ruleButton') + '</section>');
    $('ruleRange').addEventListener('input', function () { state.touched = true; updateRule(); });
    updateRule();
    $('ruleButton').addEventListener('click', function () { if (state.touched) renderClaim(); });
  }
  function renderClaim() {
    var m = lesson(); state.step = 'claim';
    screen('<section class="learn-card"><div class="claim-stamp" aria-hidden="true">✎</div>' + stepTop(m, 4, '정확하게 말하기') + '<h2>데이터를<br /><em>한 줄로</em> 말해 볼까?</h2><p class="learn-prompt">지금 가진 단서와 가장 잘 맞는 문장을 고르세요.</p><div class="claim-options">' + choice('good','✓',m.claim,'지역·절기·관측 범위가 있다','data-claim') + choice('term','×',term(m).name + ' 자체가 더워졌다.','날짜표와 관측값을 섞었다','data-claim') + choice('all','×','전국의 계절이 모두 똑같이 바뀌었다.','자료의 범위를 넘었다','data-claim') + '</div><div id="claimFeedback"></div></section>');
    document.querySelectorAll('[data-claim]').forEach(function (button) { button.addEventListener('click', function () {
      var box = $('claimFeedback');
      if (button.dataset.claim === 'good') {
        box.innerHTML = feedback('claimGood', true, '정확한 문장이에요!', '무엇을, 어디에서, 언제 비교했는지가 보입니다.', 'finishLesson', '레슨 완료');
        $('finishLesson').addEventListener('click', renderFinish);
      } else box.innerHTML = feedback('claimTry', false, '단서를 다시 보세요', '절기 자체나 전국 전체까지 말하려면 지금보다 더 많은 자료가 필요해요.');
    }); });
  }
  function renderFinish() {
    var m = lesson(); state.step = 'finish';
    if (state.completed.indexOf(m.id) === -1) state.completed.push(m.id);
    saveProgress(); $('openArchive').hidden = false;
    var next = LESSONS[m.no] || null;
    screen('<section class="learn-card learn-finish"><div class="finish-burst" aria-hidden="true">✦</div><p class="learn-overline">LESSON COMPLETE</p><h1><em>발견</em>을<br />저장했어요.</h1><p class="learn-lead">당신은 숫자를 보고, 범위를 지키고, 기준을 만들었어요.</p><div class="skill-row"><span>☀ 절기</span><span>↔ 비교</span><span>✎ 기준</span></div><section class="coach-card"><span aria-hidden="true">✦</span><div><b>AI 루프에게 묻기</b><p>“이 결론으로 전국을 말해도 될까?”</p></div><button id="askLessonAi">질문</button></section><div id="lessonAiResult"></div>' + primary(next ? '다음 레슨 열기' : '레슨 경로 보기', 'nextLesson') + '<button class="learn-link" id="openDataAfter">실제 데이터 더 보기</button></section>');
    $('nextLesson').addEventListener('click', function () { if (next) { state.lesson = next.id; saveProgress(); renderStart(); } else openBoard(); });
    $('openDataAfter').addEventListener('click', openArchive);
    $('askLessonAi').addEventListener('click', askLessonAi);
  }
  async function askLessonAi() {
    var m = lesson(), button = $('askLessonAi'), result = $('lessonAiResult');
    button.disabled = true; button.textContent = '…';
    try {
      var response = await fetch('/api/ai-turn', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({
        mode:'coach', case:{ id:m.caseId, title:m.title, question:'선택한 지역과 기간의 관측 자료로 어디까지 말할 수 있을까?' }, phase:'lesson_reflection', prediction:'unknown', learnerMessage:'내 결론이 자료의 범위를 넘지 않았는지 한 문장으로 점검해 줘.',
        facts:[{ statement:m.city + '의 ' + term(m).name + ' 무렵 ' + (metricMap[m.metric] || {}).label + '을 ' + D.periods.past + '와 ' + D.periods.present + '로 비교했다.', source:'기상청 ASOS 16지점 일자료', period:D.periods.past + ' vs ' + D.periods.present, kind:'관측 비교' }], evidence:[], availableActions:['state_limitation','compare_region']
      }) });
      var data = await response.json(); if (!response.ok || !data.feedback) throw new Error('coach unavailable');
      result.innerHTML = '<p class="ai-answer"><b>AI 루프</b>' + data.feedback.message + '<small>' + data.feedback.socratic_question + '</small></p>';
    } catch (error) {
      result.innerHTML = '<p class="ai-answer"><b>AI 루프</b>지금 자료는 선택한 지역과 기간의 단서예요. 더 넓게 말하려면 다른 지역과 더 긴 기간을 비교해 보세요.</p>';
    } finally { button.disabled = false; button.textContent = '다시 질문'; }
  }
  function renderBoard() {
    $('missionBoard').innerHTML = '<div class="path-map">' + LESSONS.map(function (item, index) {
      var unlocked = isUnlocked(index), done = state.completed.indexOf(item.id) !== -1;
      return '<button class="path-node ' + (unlocked ? '' : 'is-locked') + '" data-lesson="' + item.id + '" ' + (unlocked ? '' : 'disabled') + '><span>' + (done ? '✓' : item.no) + '</span><div><b>' + item.label + '</b><small>' + (done ? '완료' : unlocked ? '8분 레슨' : '앞 레슨을 마치면 열려요') + '</small></div><i>' + item.icon + '</i></button>';
    }).join('') + '</div>';
    document.querySelectorAll('[data-lesson]').forEach(function (button) { button.addEventListener('click', function () { state.lesson = button.dataset.lesson; saveProgress(); $('missionBoardDialog').close(); renderStart(); }); });
  }
  function openBoard() { renderBoard(); $('missionBoardDialog').showModal(); }
  function openGuide() {
    $('learningGuide').innerHTML = '<h2>한 레슨은<br /><em>네 번의 행동</em></h2><div class="guide-path-lite"><article><span>1</span><b>구분</b><p>날짜표와 관측값</p></article><article><span>2</span><b>비교</b><p>같은 절기, 다른 기간</p></article><article><span>3</span><b>기준</b><p>내가 정한 “덥다”</p></article><article><span>4</span><b>한 줄</b><p>범위가 보이는 결론</p></article></div><p class="guide-foot-lite">짧게 해 보고, 바로 피드백 받고, 다음 데이터로 갑니다.</p>';
    $('learningGuideDialog').showModal();
  }
  function openArchive() {
    $('missionGame').hidden = true; document.body.classList.remove('mission-mode');
    window.dispatchEvent(new CustomEvent('weather24:open-investigation', { detail:{ caseId:lesson().caseId, city:lesson().city, metric:lesson().metric, term:lesson().term } }));
    window.setTimeout(function () { $('top').scrollIntoView({ behavior:'smooth', block:'start' }); }, 40);
  }
  $('openMissionBoard').addEventListener('click', openBoard);
  $('openLearningGuide').addEventListener('click', openGuide);
  $('openArchive').addEventListener('click', openArchive);
  document.querySelectorAll('[data-mission-close]').forEach(function (button) { button.addEventListener('click', function () { $(button.dataset.missionClose).close(); }); });
  renderStart();
})();
