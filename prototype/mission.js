(function () {
  'use strict';
  var D = window.SOLAR_DATA;
  if (!D) return;

  var MISSIONS = [
    {
      id:'season', caseId:'A-05', code:'01', duration:'8분', chapter:'절기의 약속',
      title:'처서 뒤, 더위는 끝났나?',
      learningItem:'절기·날씨·기후 구분',
      rumor:'"처서가 지났는데도 밤이 덥다"는 제보가 들어왔어요.',
      briefing:'처서는 태양 위치로 정해지는 천문 기준입니다. 오늘의 수사는 그 무렵에 만나는 실제 계절 조건을 관측 자료로 확인하는 일입니다.',
      term:15, city:'서울', compareCity:'부산', metric:'temp',
      tool:{ title:'더위 기준선', min:23, max:30, step:1, initial:25, unit:'°C', scope:'window', description:'처서 뒤 15일 중, 설정한 기온 이상인 날의 수' }
    },
    {
      id:'rain', caseId:'C-01', code:'02', duration:'8분', chapter:'비와 바람',
      title:'비가 줄었다는 말, 맞을까?',
      learningItem:'강수 지표와 비교 범위',
      rumor:'"요즘 비가 예전보다 적어진 것 같아"라는 동네 방송 제보예요.',
      briefing:'비가 적다는 말은 총량, 비가 온 날 수, 강하게 내린 날을 섞어 말하기 쉽습니다. 무엇을 비교하는지부터 정해야 합니다.',
      term:12, city:'서울', compareCity:'광주', metric:'precip',
      tool:{ title:'비의 기준선', min:1, max:10, step:1, initial:3, unit:'mm', scope:'window', description:'소서 전후 15일 중, 설정한 강수량 이상인 날의 수' }
    },
    {
      id:'summer', caseId:'B-03', code:'03', duration:'8분', chapter:'시간 지도',
      title:'여름은 며칠이 되었을까?',
      learningItem:'기준선과 열적 계절',
      rumor:'"여름이 더 길어진 것 같다"는 체감 제보가 도착했어요.',
      briefing:'계절의 길이는 하나의 정답이 아닙니다. 먼저 여름을 판별할 기준을 정하고, 기준을 바꿨을 때 결론이 어떻게 달라지는지 살펴봅니다.',
      term:11, city:'서울', compareCity:'부산', metric:'temp',
      tool:{ title:'여름 기준선', min:20, max:30, step:1, initial:25, unit:'°C', scope:'year', description:'1년 중, 설정한 평균기온 이상인 날의 수' }
    }
  ];
  var state = loadCampaign();
  var METRIC = {};
  D.metrics.forEach(function (item) { METRIC[item.key] = item; });
  var LEARNING_TARGETS = [
    { id:'concept', code:'목표 1', title:'24절기·날씨·기후를 구분한다', text:'24절기는 태양의 위치를 기준으로 한 천문·달력 표지이고, 날씨는 짧은 시간의 지역 상태, 기후는 여러 해의 통계적 경향이다.' },
    { id:'scope', code:'목표 2', title:'자료가 말하는 범위를 읽는다', text:'지역·기간·지표가 적힌 비교만 해석하고, 한 지역의 관측을 전국이나 원인으로 넓히지 않는다.' },
    { id:'definition', code:'목표 3', title:'측정 기준을 정의하고 비교한다', text:'“덥다”, “비가 많다”, “여름”의 기준을 먼저 정한 뒤, 기준을 바꿨을 때 결과가 어떻게 달라지는지 설명한다.' },
    { id:'argument', code:'목표 4', title:'근거의 크기만큼 결론을 쓴다', text:'두 개 이상의 근거와 한계를 연결해, 조건부 결론을 만든다.' }
  ];
  var STEP_GUIDES = {
    intro:{ code:'학습 목표', title:'오늘 무엇을 할 수 있게 될까?', text:'생활 속 절기 제보를 실제 기상 관측으로 검증하며, “자료가 어디까지 말하는가”를 연습합니다.' },
    hypothesis:{ code:'목표 1 준비', title:'내 생각을 가설로 남기기', text:'예측은 맞혀야 하는 답이 아닙니다. 나중에 자료를 보고 생각을 수정할 출발점입니다.' },
    concept:{ code:'목표 1', title:'천문 기준과 기상 조건을 구분하기', text:'24절기 자체와 그 무렵의 기온은 서로 다른 종류의 정보입니다.' },
    scope:{ code:'목표 2', title:'자료가 말하는 범위를 읽기', text:'한 숫자를 볼 때는 먼저 지역·기간·지표를 확인합니다.' },
    definition:{ code:'목표 3', title:'측정 기준을 정의하고 비교하기', text:'기준선을 바꾸면 결과가 달라질 수 있습니다. 중요한 것은 내가 쓴 기준을 밝히는 일입니다.' },
    counter:{ code:'목표 4 준비', title:'반증으로 결론의 범위 정하기', text:'다른 지역이나 기간을 비교해, 내가 말할 수 있는 범위를 조절합니다.' },
    argument:{ code:'목표 4', title:'근거와 한계를 연결해 주장하기', text:'좋은 결론은 근거보다 더 크게 말하지 않습니다.' },
    review:{ code:'학습 점검', title:'오늘 할 수 있게 된 것 확인하기', text:'수사 기술이 실제로 개념과 자료 해석에 연결되었는지 짧게 확인합니다.' }
  };

  function $(id) { return document.getElementById(id); }
  function loadCampaign() {
    try {
      var stored = JSON.parse(localStorage.getItem('weather24_mission_campaign_v1'));
      if (stored && Array.isArray(stored.completed)) return { mission:'season', phase:'intro', prediction:'', threshold:25, signals:[], completed:stored.completed.filter(function (id) { return ['season','rain','summer'].indexOf(id) !== -1; }), toolTouched:false, compared:false, verdict:'' };
    } catch (error) {}
    return { mission:'season', phase:'intro', prediction:'', threshold:25, signals:[], completed:[], toolTouched:false, compared:false, verdict:'' };
  }
  function saveCampaign() { try { localStorage.setItem('weather24_mission_campaign_v1', JSON.stringify({ completed:state.completed })); } catch (error) {} }
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
  function learningLens(key) {
    var guide = STEP_GUIDES[key] || STEP_GUIDES.intro;
    var overview = key === 'intro' ? '<div class="learning-target-mini">' + LEARNING_TARGETS.map(function (target) { return '<span><b>' + target.code + '</b>' + target.title + '</span>'; }).join('') + '</div>' : '';
    return '<aside class="learning-lens"><div><span>' + guide.code + '</span><b>' + guide.title + '</b><p>' + guide.text + '</p></div><button class="mission-text-btn" data-open-learning-guide>전체 목표 보기</button>' + overview + '</aside>';
  }
  function stage(html, guideKey) {
    var phaseGuide = { intro:'intro', prediction:'hypothesis', concept:'concept', observation:'scope', tool:'definition', counter:'counter', verdict:'argument', complete:'review', check:'review' };
    $('missionStage').innerHTML = learningLens(guideKey || phaseGuide[state.phase] || 'intro') + html;
    var guideButton = document.querySelector('[data-open-learning-guide]'); if (guideButton) guideButton.addEventListener('click', openLearningGuide);
    updateHud();
  }
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
    document.querySelectorAll('[data-predict]').forEach(function (button) { button.addEventListener('click', function () { state.prediction = button.dataset.predict; renderConceptCheck(); }); });
  }
  function renderConceptCheck() {
    state.phase = 'concept';
    stage('<section class="mission-card concept-card"><div class="mission-progress"><span>개념 확인</span><b>절기 · 날씨 · 기후</b></div><p class="eyebrow">STEP 01.5 · 개념 렌즈</p><h1>처서는 무엇이고,<br /><em>27.1°C</em>는 무엇일까?</h1><p class="mission-lead">같은 화면에 놓여도 두 정보의 역할은 다릅니다. 먼저 구분해야 자료를 과장하지 않고 읽을 수 있습니다.</p><div class="concept-pair"><div><span>처서</span><b>태양 위치를 기준으로 한<br />24절기</b><small>천문·달력 기준</small></div><div><span>27.1°C</span><b>서울에서 관측한<br />기온 조건</b><small>특정 지역·기간의 기상 자료</small></div></div><div class="mission-question"><strong>가장 정확한 설명은 무엇일까요?</strong>' + choiceButtons([
      { value:'distinguish', label:'처서는 천문 기준이고, 27.1°C는 지역의 관측 조건이다.', hint:'기후 판단에는 더 긴 기간의 자료도 필요하다' },
      { value:'same', label:'처서가 더워졌다는 뜻이므로 절기 자체가 바뀌었다.', hint:'절기와 관측 조건을 같은 것으로 본다' },
      { value:'climate', label:'한 번의 기온 비교만으로 기후변화를 확정할 수 있다.', hint:'짧은 비교의 한계를 넘는다' }
    ], 'data-concept') + '</div><div class="mission-feedback" id="conceptFeedback" hidden></div></section>', 'concept');
    document.querySelectorAll('[data-concept]').forEach(function (button) {
      button.addEventListener('click', function () {
        var box = $('conceptFeedback'); box.hidden = false;
        if (button.dataset.concept === 'distinguish') {
          box.className = 'mission-feedback is-good';
          box.innerHTML = '<strong>개념 렌즈 장착</strong><p>맞아요. 24절기는 태양의 황경을 15°씩 나눈 천문 기준입니다. 양력 날짜는 해마다 하루 안팎 달라질 수 있지만, 실제 기온으로 정해지지는 않습니다. 지금의 5년 평균 비교는 관측 신호이고, 장기 기후 판단에는 더 긴 시계열이 필요합니다.</p><button class="mission-primary" id="toObservation">관측 봉투 열기</button>';
          $('toObservation').addEventListener('click', renderObservation);
        } else {
          box.className = 'mission-feedback is-try';
          box.innerHTML = '<strong>두 정보를 분리해 볼까요?</strong><p>절기는 태양 위치로 정하고, 기온은 장소와 시기에 따라 관측됩니다. 한 번의 비교와 장기 기후 판단도 구분해 보세요.</p>';
        }
      });
    });
  }
  function comparisonLimitNote() {
    return '<p class="data-limit"><strong>해석의 경계</strong> 이 화면의 과거·현재 5년 평균은 비교를 시작하는 관측 신호입니다. 기후 평년이나 장기 변화 판단에는 여러 해의 시계열(국제 표준 평년은 통상 30년)을 함께 살펴야 합니다.</p>';
  }
  function renderObservation() {
    var m = mission(), f = fact(m, m.city);
    state.phase = 'observation';
    stage('<section class="mission-card"><div class="mission-progress"><span>신호 1 / 3</span><b>관측값의 범위를 읽기</b></div><p class="eyebrow">STEP 02 · 첫 관측 신호</p><h1>봉투 속 숫자는<br />무엇까지 말해 줄까?</h1>' + metricScene(m, m.city) + '<div class="mission-question"><strong>지금 증거의 범위와 가장 잘 맞는 문장은?</strong>' + choiceButtons([
      { value:'scope', label:m.city + '의 ' + term(m).name + ' 무렵 ' + label(m.metric) + '은 과거와 현재가 다르다.', hint:'관측한 지역·시점 안에서만 말한다' },
      { value:'all', label:'우리나라 전체의 ' + label(m.metric) + '이 같은 방식으로 변했다.', hint:'한 지역의 관측을 전국으로 넓힌다' },
      { value:'date', label:term(m).name + ' 날짜 자체가 이동했다.', hint:'절기 날짜와 계절 조건을 섞는다' }
    ], 'data-scope') + '</div><div class="mission-feedback" id="scopeFeedback" hidden></div></section>');
    var scopeQuestion = document.querySelector('.mission-question'); if (scopeQuestion) scopeQuestion.insertAdjacentHTML('afterbegin', comparisonLimitNote());
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
    var lab = document.querySelector('.threshold-lab'); if (lab) lab.insertAdjacentHTML('afterend', comparisonLimitNote());
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
    stage('<section class="mission-card"><div class="mission-progress"><span>마지막 신호</span><b>반증으로 결론 지키기</b></div><p class="eyebrow">STEP 04 · 다른 지역 구조 요청</p><h1>' + m.city + '만 보고<br />결론을 내려도 될까?</h1><div class="ai-brief"><span aria-hidden="true">✦</span><div><strong>AI 안내관 루프</strong><p>한 지역의 변화는 중요한 신호지만, 그 신호의 범위는 비교해 봐야 알 수 있어요.</p></div><button id="askMissionAi">AI에게 반증 힌트 받기</button></div><div id="missionAiResult" class="mission-ai-result" hidden></div><button class="compare-card" id="compareCity"><span>비교 관측소</span><b>' + m.compareCity + '</b><small>같은 절기 · 같은 지표로 확인</small><i>열기 →</i></button><div class="mission-feedback" id="counterFeedback" hidden></div></section>');
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
    stage('<section class="mission-card mission-verdict"><div class="mission-progress"><span>기록 완성</span><b>주장 · 근거 · 한계</b></div><p class="eyebrow">STEP 05 · 조건부 판정</p><h1>이제 결론을<br />너무 넓지 않게 쓰세요.</h1><div class="verdict-builder"><span>주장</span><p>' + m.city + '의 ' + term(m).name + ' 무렵 ' + label(m.metric) + ' 조건은 과거보다 <strong>' + direction + '</strong>.</p><span>근거</span><p>관측값, 내가 정한 기준선, ' + m.compareCity + ' 비교를 확인했다.</p><span>한계</span><p>이 비교는 선택한 지역·기간의 신호다. 24절기는 온도로 정하지 않으며, 장기 기후 평년 판단에는 더 긴 시계열이 필요하다.</p></div><div class="mission-question"><strong>어떤 판정이 가장 근거에 맞을까요?</strong>' + choiceButtons([
      { value:'conditional', label:'조건부 뒷받침', hint:'선택한 지역·기간·기준 안에서만 주장한다' },
      { value:'overclaim', label:'전국적 확정', hint:'모든 지역·원인까지 단정한다' },
      { value:'discard', label:'자료 폐기', hint:'기준을 정했어도 비교 자체를 포기한다' }
    ], 'data-verdict') + '</div><div class="mission-feedback" id="verdictFeedback" hidden></div></section>');
    document.querySelectorAll('[data-verdict]').forEach(function (button) { button.addEventListener('click', function () { var box = $('verdictFeedback'); box.hidden = false; if (button.dataset.verdict === 'conditional') { state.verdict = 'conditional'; addSignal('verdict'); box.className = 'mission-feedback is-good'; box.innerHTML = '<strong>수사 기록 완성</strong><p>좋은 결론은 자신이 가진 근거의 크기만큼만 말합니다.</p><button class="mission-primary" id="finishMission">사건 기록 보관</button>'; $('finishMission').addEventListener('click', renderComplete); } else { box.className = 'mission-feedback is-try'; box.innerHTML = '<strong>판정 범위를 조절해 보세요.</strong><p>자료를 포기할 필요는 없지만, 자료가 말하지 않은 전국·원인까지 넓혀서도 안 됩니다.</p>'; } }); });
  }
  function renderComplete() {
    var m = mission(); state.phase = 'complete'; if (state.completed.indexOf(m.id) === -1) state.completed.push(m.id); saveCampaign();
    stage('<section class="mission-card mission-complete"><div class="case-seal" aria-hidden="true">✓</div><p class="eyebrow">CASE ARCHIVED</p><h1>' + m.title + '<br /><em>수사 완료</em></h1><p class="mission-lead">당신은 수치를 읽는 데서 멈추지 않고, 기준을 정하고 다른 지역으로 반증했습니다.</p><div class="skill-badges"><span>◉ 예측 기록</span><span>↔ 기준 비교</span><span>◌ 범위 감지</span></div><section class="can-do-list" aria-label="이번 수사로 할 수 있게 된 것"><p>이번 수사 뒤, 나는 …</p><ul><li>24절기와 실제 기상 조건을 구분할 수 있다.</li><li>지역·기간·지표가 붙은 범위 안에서 자료를 설명할 수 있다.</li><li>내 기준과 한계를 밝힌 조건부 결론을 쓸 수 있다.</li></ul></section><button class="mission-primary" id="showNextMissions">다음 8분 수사 선택</button><button class="mission-secondary" id="goArchive">이 사건의 데이터 보관실 열기</button></section>');
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
      var action = document.createElement('button'); action.textContent = data.feedback.action_label + ' →'; action.addEventListener('click', function () {
        if (data.feedback.next_action === 'compare_region') { $('compareCity').focus(); $('compareCity').scrollIntoView({ behavior:'smooth', block:'center' }); }
        else if (data.feedback.next_action === 'check_period') { question.textContent = '현재 비교 기간은 ' + D.periods.past + '와 ' + D.periods.present + '입니다. 같은 절기와 같은 지표를 비교한 뒤 결론의 범위를 정해 보세요.'; }
        else { question.textContent = '한계 문장 힌트: 지금 자료는 선택한 지역과 기간의 신호를 보여 줍니다. 더 넓은 결론에는 추가 지역과 기간이 필요합니다.'; }
      });
      result.append(message, question, action);
    } catch (error) { result.hidden = false; result.textContent = '지금 가진 두 지역의 비교만으로 어디까지 말할 수 있는지 먼저 생각해 보세요.'; }
    finally { button.disabled = false; button.textContent = 'AI에게 반증 힌트 받기'; }
  }
  function renderBoard() {
    $('missionBoard').innerHTML = MISSIONS.map(function (item, index) {
      var unlocked = index === 0 || state.completed.indexOf('season') !== -1, done = state.completed.indexOf(item.id) !== -1;
      return '<button class="mission-board-card' + (unlocked ? '' : ' is-locked') + '" data-mission="' + item.id + '" ' + (unlocked ? '' : 'disabled') + '><span>' + (done ? '✓ 완료' : unlocked ? item.duration + ' 수사' : '잠김') + '</span><strong>CASE ' + item.code + '</strong><b>' + item.title + '</b><small>' + item.learningItem + '</small></button>';
    }).join('');
    document.querySelectorAll('[data-mission]').forEach(function (button) { button.addEventListener('click', function () { $('missionBoardDialog').close(); state.mission = button.dataset.mission; renderIntro(); window.scrollTo({ top:0, behavior:'smooth' }); }); });
  }
  function openBoard() { renderBoard(); $('missionBoardDialog').showModal(); }
  function openLearningGuide() {
    $('learningGuide').innerHTML = '<h2>이 자료로<br />정확히 배우는 것</h2><p class="guide-intro">Weather24는 절기 상식을 맞히는 퀴즈가 아닙니다. 실제 관측 자료로 생활 속 말을 검증하고, 자료의 범위 안에서 결론을 쓰는 기상·기후 탐구입니다.</p><div class="guide-goals">' + LEARNING_TARGETS.map(function (target) { return '<article><span>' + target.code + '</span><h3>' + target.title + '</h3><p>' + target.text + '</p></article>'; }).join('') + '</div><section class="guide-concepts"><h3>먼저 기억할 세 가지</h3><dl><div><dt>24절기</dt><dd>태양의 황경을 15° 간격으로 나눈 천문·달력 기준. 실제 기온이 아니라 태양 위치로 정한다.</dd></div><div><dt>날씨</dt><dd>특정 시간·장소에서 관측되는 기온·비·바람 같은 상태.</dd></div><div><dt>기후</dt><dd>긴 기간에 걸쳐 나타나는 날씨의 통계적 특성. 이 활동의 5년 비교는 탐구를 시작하는 신호이며, 장기 평년 판단에는 더 긴 시계열이 필요하다.</dd></div></dl></section><section class="guide-path"><h3>수업에서 쓰는 방법</h3><p><b>8분</b> 한 사건 완주: 개념 구분→관측 범위→기준선→조건부 결론.</p><p><b>25분</b> 세 사건 비교: 기온·강수·열적 계절의 지표가 왜 달라지는지 설명.</p><p><b>45분</b> 데이터 보관실 확장: 근거 2개와 반증 1개로 CERL(주장·근거·추론·한계) 브리핑.</p></section>';
    $('learningGuideDialog').showModal();
  }
  function openArchive() {
    var m = mission(); $('missionGame').hidden = true; document.body.classList.remove('mission-mode');
    window.dispatchEvent(new CustomEvent('weather24:open-investigation', { detail:{ caseId:m.caseId, prediction:state.prediction || 'unknown', city:m.city, metric:m.metric, term:m.term } }));
    window.setTimeout(function () { $('top').scrollIntoView({ behavior:'smooth', block:'start' }); }, 50);
  }
  $('openMissionBoard').addEventListener('click', openBoard); $('openLearningGuide').addEventListener('click', openLearningGuide); $('openArchive').addEventListener('click', openArchive);
  document.querySelectorAll('[data-mission-close]').forEach(function (button) { button.addEventListener('click', function () { $(button.dataset.missionClose).close(); }); });
  renderIntro();
})();
