(function () {
  'use strict';
  var D = window.SOLAR_DATA;
  if (!D) return;

  var MISSIONS = [
    {
      id:'season', caseId:'A-05', code:'01', duration:'8분', chapter:'절기의 약속',
      title:'처서 뒤, 더위는 끝났나?',
      rumor:'"처서가 지났는데도 밤이 덥다"는 제보가 들어왔어요.',
      briefing:'절기의 날짜는 그대로입니다. 오늘의 수사는 그 날짜에 만나는 실제 계절 조건이 달라졌는지 확인하는 일입니다.',
      term:15, city:'서울', compareCity:'부산', metric:'temp',
      tool:{ title:'더위 기준선', min:23, max:30, step:1, initial:25, unit:'°C', scope:'window', description:'처서 뒤 15일 중, 설정한 기온 이상인 날의 수' }
    },
    {
      id:'rain', caseId:'C-01', code:'02', duration:'8분', chapter:'비와 바람',
      title:'비가 줄었다는 말, 맞을까?',
      rumor:'"요즘 비가 예전보다 적어진 것 같아"라는 동네 방송 제보예요.',
      briefing:'비가 적다는 말은 총량, 비가 온 날 수, 강하게 내린 날을 섞어 말하기 쉽습니다. 무엇을 비교하는지부터 정해야 합니다.',
      term:12, city:'서울', compareCity:'광주', metric:'precip',
      tool:{ title:'비의 기준선', min:1, max:10, step:1, initial:3, unit:'mm', scope:'window', description:'소서 전후 15일 중, 설정한 강수량 이상인 날의 수' }
    },
    {
      id:'summer', caseId:'B-03', code:'03', duration:'8분', chapter:'시간 지도',
      title:'여름은 며칠이 되었을까?',
      rumor:'"여름이 더 길어진 것 같다"는 체감 제보가 도착했어요.',
      briefing:'계절의 길이는 하나의 정답이 아닙니다. 먼저 여름을 판별할 기준을 정하고, 기준을 바꿨을 때 결론이 어떻게 달라지는지 살펴봅니다.',
      term:11, city:'서울', compareCity:'부산', metric:'temp',
      tool:{ title:'여름 기준선', min:20, max:30, step:1, initial:25, unit:'°C', scope:'year', description:'1년 중, 설정한 평균기온 이상인 날의 수' }
    }
  ];
  var state = { mission:'season', phase:'intro', prediction:'', threshold:25, signals:[], completed:[], toolTouched:false, compared:false, verdict:'' };
  var METRIC = {};
  D.metrics.forEach(function (item) { METRIC[item.key] = item; });

  function $(id) { return document.getElementById(id); }
  function mission() { return MISSIONS.filter(function (item) { return item.id === state.mission; })[0] || MISSIONS[0]; }
  function term(m) { return D.terms[m.term]; }
  function label(metric) { return (METRIC[metric] || {}).label || metric; }
  function r1(value) { return Math.round(value * 10) / 10; }
  function format(metric, value) { return metric === 'temp' ? r1(value) + '°C' : r1(value) + 'mm'; }
  function delta(metric, value) { return (value >= 0 ? '+' : '') + format(metric, value); }
  function day(index) { return ((index % 365) + 365) % 365; }
  function at(m, city, period) { return D.cities[city][m.metric][period][day(term(m).doy - 1)]; }
  function windowValues(m, city, period) {
    var values = D.cities[city][m.metric][period];
    if (m.tool.scope === 'year') return values.slice();
    return Array.from({ length:15 }, function (_, index) { return values[day(term(m).doy - 1 + index)]; });
  }
  function countAtThreshold(m, city, period, threshold) { return windowValues(m, city, period).filter(function (value) { return value >= threshold; }).length; }
  function fact(m, city) {
    var past = at(m, city, 'past'), present = at(m, city, 'present');
    return { past:past, present:present, difference:present - past, statement:city + '의 ' + term(m).name + ' 무렵 평균 ' + label(m.metric) + '은 과거 ' + format(m.metric, past) + ', 현재 ' + format(m.metric, present) + '로 비교된다.' };
  }
  function addSignal(id) { if (state.signals.indexOf(id) === -1) state.signals.push(id); updateHud(); }
  function updateHud() {
    var m = mission();
    $('missionCode').textContent = 'CASE ' + m.code + ' · ' + state.signals.length + ' / 3 신호';
    ['signalOne','signalTwo','signalThree'].forEach(function (id, index) { $(id).classList.toggle('is-on', index < state.signals.length); });
  }
  function stage(html) { $('missionStage').innerHTML = html; updateHud(); }
  function choiceButtons(items, attr) { return '<div class="mission-choices">' + items.map(function (item) { return '<button class="mission-choice" ' + attr + '="' + item.value + '"><b>' + item.label + '</b><small>' + item.hint + '</small></button>'; }).join('') + '</div>'; }
  function metricScene(m, city) {
    var f = fact(m, city);
    return '<div class="signal-visual"><div class="signal-sun" aria-hidden="true"></div><div class="signal-reading"><span>' + D.periods.past + '</span><b>' + format(m.metric, f.past) + '</b></div><div class="signal-arrow" aria-hidden="true">→</div><div class="signal-reading is-now"><span>' + D.periods.present + '</span><b>' + format(m.metric, f.present) + '</b></div><p>' + city + ' · ' + term(m).name + ' · 변화 ' + delta(m.metric, f.difference) + '</p></div>';
  }
  function renderIntro() {
    var m = mission();
    state.phase = 'intro'; state.signals = []; state.prediction = ''; state.threshold = m.tool.initial; state.toolTouched = false; state.compared = false; state.verdict = '';
    stage('<section class="mission-card mission-intro"><div class="mission-stamp">현장 제보 접수</div><p class="eyebrow">' + m.chapter.toUpperCase() + ' · ' + m.duration + ' 수사</p><h1>' + m.title + '</h1><div class="radio-message"><span aria-hidden="true">⌁</span><p>' + m.rumor + '</p></div><p class="mission-lead">' + m.briefing + '</p><button class="mission-primary" id="beginMission">제보 확인하기 <span aria-hidden="true">→</span></button><p class="mission-note">오늘의 보상은 점수가 아닙니다. 예측·비교·반증이라는 세 가지 수사 기술입니다.</p></section>');
    $('beginMission').addEventListener('click', renderPrediction);
  }
  function renderPrediction() {
    var m = mission(); state.phase = 'prediction';
    stage('<section class="mission-card"><div class="mission-progress"><span>수사 목표</span><b>1. 예측 · 2. 비교 · 3. 반증</b></div><p class="eyebrow">STEP 01 · 내 가설</p><h1>기록을 열기 전에<br />어떤 쪽일까요?</h1><p class="mission-lead">목표: <strong>' + term(m).name + ' 날짜</strong>와 <strong>실제 ' + label(m.metric) + ' 조건</strong>이 서로 다를 수 있는지, 두 개 이상의 근거로 판단합니다.</p>' + choiceButtons([
      { value:'support', label:'제보가 맞을 것 같아', hint:'내 경험을 먼저 가설로 남긴다' },
      { value:'refute', label:'제보가 과장 같아', hint:'다른 모습이 있을 거라 예상한다' },
      { value:'unknown', label:'아직 모르겠어', hint:'자료를 비교한 뒤 판단한다' }
    ], 'data-predict') + '<p class="mission-note">예측은 맞혀야 하는 답이 아니라, 나중에 바꿀 수 있는 생각의 출발점입니다.</p></section>');
    document.querySelectorAll('[data-predict]').forEach(function (button) { button.addEventListener('click', function () { state.prediction = button.dataset.predict; renderObservation(); }); });
  }
  function renderObservation() {
    var m = mission(), f = fact(m, m.city);
    state.phase = 'observation';
    stage('<section class="mission-card"><div class="mission-progress"><span>신호 1 / 3</span><b>관측값의 범위를 읽기</b></div><p class="eyebrow">STEP 02 · 첫 관측 신호</p><h1>봉투 속 숫자는<br />무엇까지 말해 줄까?</h1>' + metricScene(m, m.city) + '<div class="mission-question"><strong>지금 증거의 범위와 가장 잘 맞는 문장은?</strong>' + choiceButtons([
      { value:'scope', label:m.city + '의 ' + term(m).name + ' 무렵 ' + label(m.metric) + '은 과거와 현재가 다르다.', hint:'관측한 지역·시점 안에서만 말한다' },
      { value:'all', label:'우리나라 전체의 ' + label(m.metric) + '이 같은 방식으로 변했다.', hint:'한 지역의 관측을 전국으로 넓힌다' },
      { value:'date', label:term(m).name + ' 날짜 자체가 이동했다.', hint:'절기 날짜와 계절 조건을 섞는다' }
    ], 'data-scope') + '</div><div class="mission-feedback" id="scopeFeedback" hidden></div></section>');
    document.querySelectorAll('[data-scope]').forEach(function (button) {
      button.addEventListener('click', function () {
        var feedback = $('scopeFeedback'); feedback.hidden = false;
        if (button.dataset.scope === 'scope') { addSignal('scope'); feedback.className = 'mission-feedback is-good'; feedback.innerHTML = '<strong>범위 감지 완료</strong><p>맞아요. 이 숫자는 ' + m.city + '의 특정 절기 무렵을 보여 줍니다. 이제 “더위”나 “비”의 기준을 직접 정해 보세요.</p><button class="mission-primary" id="toTool">기준선 실험 시작</button>'; $('toTool').addEventListener('click', renderTool); }
        else { feedback.className = 'mission-feedback is-try'; feedback.innerHTML = '<strong>한 번 더 생각해 볼까요?</strong><p>지금 자료에는 ' + m.city + '과 ' + term(m).name + '이라는 범위가 있습니다. 자료가 말한 범위를 넘지 않는 문장을 골라 보세요.</p>'; }
      });
    });
  }
  function toolCopy(m, threshold) {
    var past = countAtThreshold(m, m.city, 'past', threshold), present = countAtThreshold(m, m.city, 'present', threshold);
    return { past:past, present:present, difference:present - past, period:m.tool.scope === 'year' ? '1년' : term(m).name + ' 뒤 15일' };
  }
  function updateToolReadout() {
    var m = mission(), threshold = state.threshold, result = toolCopy(m, threshold);
    $('thresholdValue').textContent = threshold + m.tool.unit;
    $('toolPast').textContent = result.past + '일'; $('toolPresent').textContent = result.present + '일';
    $('toolDelta').textContent = result.period + ' 기준 ' + (result.difference >= 0 ? '+' : '') + result.difference + '일';
    var button = $('takeToolEvidence'); button.disabled = !state.toolTouched; button.textContent = state.toolTouched ? '이 비교를 두 번째 근거로 채택' : '기준선을 한 번 움직여 보세요';
  }
  function renderTool() {
    var m = mission(); state.phase = 'tool';
    stage('<section class="mission-card"><div class="mission-progress"><span>신호 2 / 3</span><b>내 기준으로 비교하기</b></div><p class="eyebrow">STEP 03 · 기준선 실험</p><h1>“' + (m.metric === 'temp' ? '덥다' : '많이 왔다') + '”의 기준을<br />직접 정해 보세요.</h1><p class="mission-lead">기준이 바뀌면 같은 자료에서도 비교 결과가 달라질 수 있습니다. 이것이 수사를 더 공정하게 만듭니다.</p><div class="threshold-lab"><div><p class="eyebrow">' + m.tool.title.toUpperCase() + '</p><strong id="thresholdValue"></strong><input id="thresholdRange" type="range" min="' + m.tool.min + '" max="' + m.tool.max + '" step="' + m.tool.step + '" value="' + state.threshold + '" aria-label="' + m.tool.title + '"><p>' + m.tool.description + '</p></div><div class="threshold-result"><div><span>' + D.periods.past + '</span><b id="toolPast">—</b></div><div><span>' + D.periods.present + '</span><b id="toolPresent">—</b></div><p id="toolDelta"></p></div></div><button class="mission-primary" id="takeToolEvidence" disabled></button><p class="mission-note">숫자를 바꾸는 것은 답을 조작하는 일이 아닙니다. 내가 쓴 기준을 드러내는 일입니다.</p></section>');
    var range = $('thresholdRange'); range.addEventListener('input', function () { state.threshold = Number(range.value); state.toolTouched = true; updateToolReadout(); });
    updateToolReadout();
    $('takeToolEvidence').addEventListener('click', function () { if (!state.toolTouched) return; addSignal('tool'); renderCounter(); });
  }
  function compareFact(m) {
    var home = fact(m, m.city), other = fact(m, m.compareCity);
    return { home:home, other:other, statement:m.compareCity + '의 같은 ' + term(m).name + ' 무렵 변화는 ' + delta(m.metric, other.difference) + '이다.' };
  }
  function renderCounter() {
    var m = mission(); state.phase = 'counter';
    stage('<section class="mission-card"><div class="mission-progress"><span>신호 3 / 3</span><b>반증으로 결론 지키기</b></div><p class="eyebrow">STEP 04 · 다른 지역 구조 요청</p><h1>' + m.city + '만 보고<br />결론을 내려도 될까?</h1><div class="ai-brief"><span aria-hidden="true">✦</span><div><strong>AI 안내관 루프</strong><p>한 지역의 변화는 중요한 신호지만, 그 신호의 범위는 비교해 봐야 알 수 있어요.</p></div><button id="askMissionAi">AI에게 반증 힌트 받기</button></div><div id="missionAiResult" class="mission-ai-result" hidden></div><button class="compare-card" id="compareCity"><span>비교 관측소</span><b>' + m.compareCity + '</b><small>같은 절기 · 같은 지표로 확인</small><i>열기 →</i></button><div class="mission-feedback" id="counterFeedback" hidden></div></section>');
    $('compareCity').addEventListener('click', function () {
      state.compared = true; var info = compareFact(m), box = $('counterFeedback'); box.hidden = false; box.className = 'mission-feedback is-good';
      box.innerHTML = '<strong>비교 관측 확보</strong><p>' + info.statement + ' 서울의 변화와 같은지·다른지를 살펴볼 수 있지만, 두 도시만으로 전국 전체를 말할 수는 없습니다.</p><div class="mission-question"><strong>이제 가장 책임 있는 결론은?</strong>' + choiceButtons([
        { value:'careful', label:'두 지역의 신호는 비교할 수 있지만, 더 넓은 일반화에는 추가 자료가 필요하다.', hint:'비교가 늘수록 결론의 범위를 조절한다' },
        { value:'global', label:'두 도시를 봤으니 전국의 계절도 모두 똑같이 변했다.', hint:'표본의 범위를 넘는다' }
      ], 'data-counter') + '</div>';
      document.querySelectorAll('[data-counter]').forEach(function (button) { button.addEventListener('click', function () { if (button.dataset.counter === 'careful') { addSignal('counter'); renderVerdict(); } else { box.className = 'mission-feedback is-try'; box.querySelector('.mission-question').insertAdjacentHTML('beforeend', '<p class="inline-hint">두 도시의 비교는 좋은 시작이지만, “전국 전체”라는 결론에는 더 많은 지역·기간이 필요합니다.</p>'); } }); });
    });
    $('askMissionAi').addEventListener('click', askMissionAi);
  }
  function renderVerdict() {
    var m = mission(), f = fact(m, m.city), direction = f.difference >= 0 ? '높아졌다' : '낮아졌다';
    state.phase = 'verdict';
    stage('<section class="mission-card mission-verdict"><div class="mission-progress"><span>기록 완성</span><b>주장 · 근거 · 한계</b></div><p class="eyebrow">STEP 05 · 조건부 판정</p><h1>이제 결론을<br />너무 넓지 않게 쓰세요.</h1><div class="verdict-builder"><span>주장</span><p>' + m.city + '의 ' + term(m).name + ' 무렵 ' + label(m.metric) + ' 조건은 과거보다 <strong>' + direction + '</strong>.</p><span>근거</span><p>관측값, 내가 정한 기준선, ' + m.compareCity + ' 비교를 확인했다.</p><span>한계</span><p>절기 날짜가 이동했다거나 모든 지역이 같다고 말할 수는 없다.</p></div><div class="mission-question"><strong>어떤 판정이 가장 근거에 맞을까요?</strong>' + choiceButtons([
      { value:'conditional', label:'조건부 뒷받침', hint:'선택한 지역·기간·기준 안에서만 주장한다' },
      { value:'overclaim', label:'전국적 확정', hint:'모든 지역·원인까지 단정한다' },
      { value:'discard', label:'자료 폐기', hint:'기준을 정했어도 비교 자체를 포기한다' }
    ], 'data-verdict') + '</div><div class="mission-feedback" id="verdictFeedback" hidden></div></section>');
    document.querySelectorAll('[data-verdict]').forEach(function (button) { button.addEventListener('click', function () { var box = $('verdictFeedback'); box.hidden = false; if (button.dataset.verdict === 'conditional') { state.verdict = 'conditional'; addSignal('verdict'); box.className = 'mission-feedback is-good'; box.innerHTML = '<strong>수사 기록 완성</strong><p>좋은 결론은 자신이 가진 근거의 크기만큼만 말합니다.</p><button class="mission-primary" id="finishMission">사건 기록 보관</button>'; $('finishMission').addEventListener('click', renderComplete); } else { box.className = 'mission-feedback is-try'; box.innerHTML = '<strong>판정 범위를 조절해 보세요.</strong><p>자료를 포기할 필요는 없지만, 자료가 말하지 않은 전국·원인까지 넓혀서도 안 됩니다.</p>'; } }); });
  }
  function renderComplete() {
    var m = mission(); state.phase = 'complete'; if (state.completed.indexOf(m.id) === -1) state.completed.push(m.id);
    stage('<section class="mission-card mission-complete"><div class="case-seal" aria-hidden="true">✓</div><p class="eyebrow">CASE ARCHIVED</p><h1>' + m.title + '<br /><em>수사 완료</em></h1><p class="mission-lead">당신은 수치를 읽는 데서 멈추지 않고, 기준을 정하고 다른 지역으로 반증했습니다.</p><div class="skill-badges"><span>◉ 예측 기록</span><span>↔ 기준 비교</span><span>◌ 범위 감지</span></div><button class="mission-primary" id="showNextMissions">다음 8분 수사 선택</button><button class="mission-secondary" id="goArchive">이 사건의 데이터 보관실 열기</button></section>');
    $('showNextMissions').addEventListener('click', openBoard); $('goArchive').addEventListener('click', openArchive);
  }
  async function askMissionAi() {
    var m = mission(), button = $('askMissionAi'), result = $('missionAiResult'), mainFact = fact(m, m.city), compare = compareFact(m);
    button.disabled = true; button.textContent = 'AI가 근거를 점검 중…';
    try {
      var response = await fetch('/api/ai-turn', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({
        mode:'coach', case:{ id:m.caseId, title:m.title, question:'한 지역의 절기 관측으로 어디까지 말할 수 있을까?' }, phase:'counter_test', prediction:state.prediction || 'unknown', learnerMessage:'이 결론을 더 책임 있게 만들려면 무엇을 비교해야 할까요?',
        facts:[{ statement:mainFact.statement, source:'기상청 ASOS 16지점 일자료', period:D.periods.past + ' vs ' + D.periods.present, kind:'절기 관측' }, { statement:compare.statement, source:'기상청 ASOS 16지점 일자료', period:D.periods.past + ' vs ' + D.periods.present, kind:'지역 비교' }],
        evidence:[], availableActions:['compare_region','check_period','state_limitation']
      }) });
      var data = await response.json(); if (!response.ok || !data.feedback) throw new Error(data.error || 'coach error');
      result.hidden = false; result.replaceChildren();
      var message = document.createElement('p'); message.textContent = data.feedback.message;
      var question = document.createElement('strong'); question.textContent = data.feedback.socratic_question;
      var action = document.createElement('button'); action.textContent = data.feedback.action_label + ' →'; action.addEventListener('click', function () { $('compareCity').focus(); $('compareCity').scrollIntoView({ behavior:'smooth', block:'center' }); });
      result.append(message, question, action);
    } catch (error) { result.hidden = false; result.textContent = '지금 가진 두 지역의 비교만으로 어디까지 말할 수 있는지 먼저 생각해 보세요.'; }
    finally { button.disabled = false; button.textContent = 'AI에게 반증 힌트 받기'; }
  }
  function renderBoard() {
    $('missionBoard').innerHTML = MISSIONS.map(function (item, index) {
      var unlocked = index === 0 || state.completed.indexOf('season') !== -1, done = state.completed.indexOf(item.id) !== -1;
      return '<button class="mission-board-card' + (unlocked ? '' : ' is-locked') + '" data-mission="' + item.id + '" ' + (unlocked ? '' : 'disabled') + '><span>' + (done ? '✓ 완료' : unlocked ? item.duration + ' 수사' : '잠김') + '</span><strong>CASE ' + item.code + '</strong><b>' + item.title + '</b><small>' + item.chapter + '</small></button>';
    }).join('');
    document.querySelectorAll('[data-mission]').forEach(function (button) { button.addEventListener('click', function () { $('missionBoardDialog').close(); state.mission = button.dataset.mission; renderIntro(); window.scrollTo({ top:0, behavior:'smooth' }); }); });
  }
  function openBoard() { renderBoard(); $('missionBoardDialog').showModal(); }
  function openArchive() {
    var m = mission(); $('missionGame').hidden = true; document.body.classList.remove('mission-mode');
    window.dispatchEvent(new CustomEvent('weather24:open-investigation', { detail:{ caseId:m.caseId, prediction:state.prediction || 'unknown', city:m.city, metric:m.metric, term:m.term } }));
    window.setTimeout(function () { $('top').scrollIntoView({ behavior:'smooth', block:'start' }); }, 50);
  }
  $('openMissionBoard').addEventListener('click', openBoard); $('openArchive').addEventListener('click', openArchive);
  document.querySelectorAll('[data-mission-close]').forEach(function (button) { button.addEventListener('click', function () { $(button.dataset.missionClose).close(); }); });
  renderIntro();
})();
