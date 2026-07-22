(function () {
  'use strict';
  var D = window.SOLAR_DATA;
  var entryPrediction = '';
  var ENTRY_CASE = { id:'A-05', title:'처서 뒤 무더위는 끝났을까?', question:'처서 무렵 서울의 평균 기온은 과거보다 얼마나 달라졌을까?' };
  var PREDICTION_COPY = {
    support:{ label:'그럴 것 같아요', tone:'계절의 약속을 믿는 예측' },
    refute:{ label:'아직 아닐 것 같아요', tone:'관측값을 의심하는 예측' },
    unknown:{ label:'직접 보고 싶어요', tone:'데이터로 판단하겠다는 예측' }
  };
  var ACTION_LABELS = {
    compare_region:'다른 지역과 비교하기',
    change_metric:'다른 지표 보기',
    check_period:'비교 기간 확인하기',
    add_counter_evidence:'반증 자료 추가하기',
    state_limitation:'한계 문장 쓰기',
    save_evidence:'현재 결과를 증거로 저장',
    open_investigation:'내 근거로 수사실 열기'
  };
  function $(id) { return document.getElementById(id); }
  function unit(metric) { return metric === 'temp' ? '°C' : metric === 'humidity' ? '%' : 'mm'; }
  function round(value) { return Math.round(value * 10) / 10; }
  function entryFacts() {
    var termIndex = 15, term = D.terms[termIndex], city = D.cities['서울'];
    var day = term.doy - 1, past = city.temp.past[day], present = city.temp.present[day];
    return { city:'서울', termIndex:termIndex, term:term.name, past:past, present:present, delta:present - past, statement:'서울의 ' + term.name + ' 무렵 평균기온은 과거 ' + round(past) + '°C, 현재 ' + round(present) + '°C로 비교된다.', source:'기상청 ASOS 16지점 일자료', period:D.periods.past + ' vs ' + D.periods.present, kind:'절기 기온 비교' };
  }
  function renderEntry() {
    var choices = $('entryChoices');
    choices.innerHTML = Object.keys(PREDICTION_COPY).map(function (key) {
      var item = PREDICTION_COPY[key];
      return '<button class="entry-choice' + (entryPrediction === key ? ' is-selected' : '') + '" data-entry-choice="' + key + '"><b>' + item.label + '</b><small>' + item.tone + '</small></button>';
    }).join('');
    choices.querySelectorAll('[data-entry-choice]').forEach(function (button) {
      button.addEventListener('click', function () { entryPrediction = button.dataset.entryChoice; showEntrySignal(); });
    });
  }
  function showEntrySignal() {
    var facts = entryFacts(), copy = PREDICTION_COPY[entryPrediction];
    renderEntry();
    $('entryAfterChoice').hidden = false;
    $('entryStep').textContent = '첫 관측 신호';
    $('entryLead').textContent = '좋아요. 이제 한 장의 관측 신호만 열어 볼게요. 결론은 아직 보류합니다.';
    $('entryPredictionChip').textContent = '나의 첫 예측 · ' + copy.label;
    $('entryPastValue').textContent = round(facts.past) + '°C';
    $('entryPresentValue').textContent = round(facts.present) + '°C';
    $('entryDelta').textContent = '차이 ' + (facts.delta >= 0 ? '+' : '') + round(facts.delta) + '°C · 이 한 장의 신호만으로 무엇을 더 확인해야 할까요?';
  }
  function makeCoachPayload(message, phase, availableActions, context) {
    var facts = entryFacts();
    return Object.assign({
      mode:'coach',
      case:ENTRY_CASE,
      phase:phase,
      prediction:entryPrediction || 'unknown',
      learnerMessage:message || '다음에는 무엇을 확인하면 좋을까요?',
      facts:[{ statement:facts.statement, source:facts.source, period:facts.period, kind:facts.kind }],
      evidence:[],
      availableActions:availableActions
    }, context || {});
  }
  function renderCoachResult(target, feedback, onAction) {
    target.hidden = false;
    target.replaceChildren();
    var response = document.createElement('p'); response.className = 'coach-response'; response.textContent = feedback.message;
    var questionLabel = document.createElement('strong'); questionLabel.textContent = '다음에 생각할 질문';
    var question = document.createElement('p'); question.className = 'coach-question'; question.textContent = feedback.socratic_question;
    var action = document.createElement('button'); action.className = 'coach-action'; action.textContent = (feedback.action_label || ACTION_LABELS[feedback.next_action] || '다음 행동') + ' →';
    action.addEventListener('click', function () { onAction(feedback.next_action); });
    target.append(response, questionLabel, question, action);
  }
  async function askEntryCoach(message) {
    if (!entryPrediction) return;
    var button = $('askEntryCoach');
    button.disabled = true; button.textContent = 'AI가 다음 질문을 고르는 중…';
    try {
      var response = await fetch('/api/ai-turn', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(makeCoachPayload(message || $('entryCoachQuestion').value.trim(), 'first_signal', ['compare_region','check_period','open_investigation'])) });
      var data = await response.json();
      if (!response.ok || !data.feedback) throw new Error(data.error || 'coach error');
      renderCoachResult($('entryCoachResult'), data.feedback, function (action) { enterInvestigation(action); });
    } catch (error) {
      var result = $('entryCoachResult'); result.hidden = false; result.textContent = 'AI 연결이 잠시 지연되고 있어요. 관측값을 직접 조작하며 다음 근거를 찾아볼 수 있습니다.';
    } finally { button.disabled = false; button.textContent = 'AI에게 힌트 받기'; }
  }
  function enterInvestigation(action) {
    document.body.classList.remove('entry-mode');
    window.dispatchEvent(new CustomEvent('weather24:open-investigation', { detail:{ prediction:entryPrediction || 'unknown', city:'서울', metric:'temp', term:15 } }));
    window.setTimeout(function () {
      if (action && action !== 'open_investigation' && window.weather24Investigation) window.weather24Investigation.applyCoachAction(action);
      document.getElementById('top').scrollIntoView({ behavior:'smooth', block:'start' });
    }, 50);
  }
  function bindEntry() {
    $('entryPromptChips').querySelectorAll('[data-entry-prompt]').forEach(function (button) {
      button.addEventListener('click', function () { $('entryCoachQuestion').value = button.dataset.entryPrompt; askEntryCoach(button.dataset.entryPrompt); });
    });
    $('askEntryCoach').addEventListener('click', function () { askEntryCoach(); });
    $('entryContinue').addEventListener('click', function () { enterInvestigation('open_investigation'); });
    $('entrySkip').addEventListener('click', function () { enterInvestigation('open_investigation'); });
  }
  function renderInteractiveResult(feedback) {
    renderCoachResult($('interactiveCoachResult'), feedback, function (action) {
      if (window.weather24Investigation) window.weather24Investigation.applyCoachAction(action);
    });
  }
  async function askInteractiveCoach(message) {
    if (!window.weather24Investigation) return;
    var button = $('askInteractiveCoach'), context = window.weather24Investigation.getContext();
    button.disabled = true; button.innerHTML = '<span aria-hidden="true">✦</span> 생각 중…';
    try {
      var payload = Object.assign(makeCoachPayload(message || $('interactiveCoachQuestion').value.trim(), 'investigation', context.availableActions, context), { mode:'coach' });
      var response = await fetch('/api/ai-turn', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(payload) });
      var data = await response.json();
      if (!response.ok || !data.feedback) throw new Error(data.error || 'coach error');
      renderInteractiveResult(data.feedback);
    } catch (error) {
      var result = $('interactiveCoachResult'); result.hidden = false; result.textContent = 'AI 연결이 잠시 지연되고 있어요. 먼저 지역·지표·절기를 직접 바꿔 보세요.';
    } finally { button.disabled = false; button.innerHTML = '<span aria-hidden="true">✦</span> 다음 질문 받기'; }
  }
  function bindInteractiveCoach() {
    $('interactivePromptChips').querySelectorAll('[data-coach-prompt]').forEach(function (button) {
      button.addEventListener('click', function () { $('interactiveCoachQuestion').value = button.dataset.coachPrompt; askInteractiveCoach(button.dataset.coachPrompt); });
    });
    $('askInteractiveCoach').addEventListener('click', function () { askInteractiveCoach(); });
  }
  if (!D || !window.weather24Investigation) return;
  renderEntry();
  bindEntry();
  bindInteractiveCoach();
})();
