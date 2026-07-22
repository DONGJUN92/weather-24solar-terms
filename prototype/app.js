(function () {
  'use strict';
  var D = window.SOLAR_DATA;
  var G = window.KOREA_GEO;
  if (!D || !G) {
    document.body.innerHTML = '<main style="padding:2rem;font-family:system-ui">Weather24 데이터를 불러오지 못했습니다. 새로고침해 주세요.</main>';
    return;
  }

  var METRICS = {};
  D.metrics.forEach(function (metric) { METRICS[metric.key] = metric; });
  var CITY_KEYS = Object.keys(D.cities);
  var CHAPTERS = [
    { id: 'A', name: '절기의 약속', count: 6, color: '#ffbe58' },
    { id: 'B', name: '시간 지도', count: 4, color: '#3bd0c0' },
    { id: 'C', name: '비와 바람', count: 4, color: '#77bff7' },
    { id: 'D', name: '증거의 사슬', count: 4, color: '#ff8066' },
    { id: 'E', name: '나의 기록', count: 2, color: '#caa8ff' }
  ];
  var CASES = [
    { id:'A-01', ch:'A', title:'입춘인데 겨울인가?', question:'입춘 무렵의 기온은 과거와 현재에 어떻게 다른가?', term:1, city:'서울', metric:'temp', mode:'solar', core:true },
    { id:'A-02', ch:'A', title:'춘분은 봄의 한가운데인가?', question:'낮 길이의 기준점과 기온 변화의 정점은 같은 시점인가?', term:3, city:'서울', metric:'temp', mode:'solar' },
    { id:'A-03', ch:'A', title:'곡우의 비는 약속을 지키는가?', question:'곡우 무렵 강수는 총량과 빈도에서 어떻게 달라졌을까?', term:5, city:'광주', metric:'precip', mode:'solar' },
    { id:'A-04', ch:'A', title:'대서는 가장 더운가?', question:'가장 더운 시점은 대서 전후 어디에 나타나는가?', term:11, city:'대구', metric:'temp', mode:'solar', core:true },
    { id:'A-05', ch:'A', title:'처서 뒤 더위는 끝났나?', question:'처서 뒤의 더위 기준일은 과거보다 얼마나 달라졌을까?', term:15, city:'서울', metric:'temp', mode:'solar', core:true },
    { id:'A-06', ch:'A', title:'동지는 가장 추운가?', question:'일조가 짧은 날과 가장 추운 날은 왜 다르게 나타날까?', term:23, city:'대전', metric:'temp', mode:'solar' },
    { id:'B-01', ch:'B', title:'57년 뒤, 바뀐 지도', question:'내 지역의 장기 변화는 다른 지역과 어떻게 닮고 다를까?', term:15, city:'서울', metric:'temp', mode:'solar', core:true },
    { id:'B-02', ch:'B', title:'남쪽이 항상 먼저 더워질까?', question:'지역별 계절 변화는 정말 한 방향으로만 나타날까?', term:11, city:'부산', metric:'temp', mode:'solar' },
    { id:'B-03', ch:'B', title:'여름은 며칠인가?', question:'여름의 기준온도를 바꾸면 계절의 길이는 어떻게 달라질까?', term:11, city:'서울', metric:'temp', mode:'thermal', core:true },
    { id:'B-04', ch:'B', title:'습도도 같은 방향일까?', question:'기온이 달라진 만큼 상대습도도 같은 방향으로 변했을까?', term:15, city:'제주', metric:'humidity', mode:'solar' },
    { id:'C-01', ch:'C', title:'비가 늘었다는 말의 함정', question:'강수량 증가와 비 오는 날 증가를 같은 말로 할 수 있을까?', term:12, city:'서울', metric:'precip', mode:'solar', core:true },
    { id:'C-02', ch:'C', title:'장마의 얼굴', question:'여름 강수는 다른 계절보다 더 크게 바뀌었을까?', term:13, city:'광주', metric:'precip', mode:'solar' },
    { id:'C-03', ch:'C', title:'지역마다 다른 빗줄기', question:'같은 절기라도 해안과 내륙의 강수는 같은 모습을 보일까?', term:14, city:'부산', metric:'precip', mode:'solar' },
    { id:'C-04', ch:'C', title:'태풍의 길, 비의 길', question:'실제 태풍 경로와 강도 기록을 보고 어떤 정보를 확인해야 할까?', city:'부산', metric:'temp', mode:'typhoon', core:true },
    { id:'D-01', ch:'D', title:'올해 더웠다 = 기후변화?', question:'한 해의 날씨와 장기 기후 추세를 어떻게 다르게 말해야 할까?', term:15, city:'서울', metric:'temp', mode:'solar', core:true },
    { id:'D-02', ch:'D', title:'CO₂는 계속 늘었나?', question:'장기 CO₂ 관측은 무엇을 보여 주며, 무엇을 보여 주지 않을까?', mode:'global', city:'서울', metric:'temp' },
    { id:'D-03', ch:'D', title:'기온과 바다는 함께 변했나?', question:'전지구 기온과 해수면 자료에서 어떤 공통 패턴을 읽을 수 있을까?', mode:'global', city:'서울', metric:'temp' },
    { id:'D-04', ch:'D', title:'상관과 원인의 거리', question:'두 그래프가 함께 움직인다는 사실만으로 어디까지 말할 수 있을까?', mode:'global', city:'서울', metric:'temp' },
    { id:'E-01', ch:'E', title:'내 기후 연대기', question:'선택한 지역의 과거와 현재를 어떤 문장으로 기록할 수 있을까?', term:15, city:'서울', metric:'temp', mode:'solar' },
    { id:'E-02', ch:'E', title:'기후 뉴스룸', question:'우리 지역의 계절이 달라졌다는 주장을 공개해도 될까?', term:15, city:'서울', metric:'temp', mode:'solar', core:true }
  ];
  var PREDICTIONS = [
    { value:'support', label:'그렇다', hint:'자료가 내 생각을 뒷받침할 것 같다' },
    { value:'refute', label:'아니다', hint:'다른 모습이 나타날 것 같다' },
    { value:'unknown', label:'아직 모르겠다', hint:'자료를 비교한 뒤 판단하겠다' }
  ];
  var VERDICTS = [
    { value:'support', label:'뒷받침', hint:'선택한 범위 안에서 주장을 지지한다' },
    { value:'refute', label:'반박', hint:'선택한 범위 안에서 주장과 다르다' },
    { value:'hold', label:'판단 보류', hint:'현재 근거만으로는 결론이 부족하다' }
  ];
  var state = loadState();
  var globalData = null;
  var typhoonData = null;
  var activeChapter = null;

  function $(id) { return document.getElementById(id); }
  function currentCase() { return CASES.filter(function (item) { return item.id === state.caseId; })[0] || CASES[4]; }
  function record() {
    if (!state.records[state.caseId]) state.records[state.caseId] = { prediction:'', verdict:'', draft:'', evidence:[], counter:false };
    return state.records[state.caseId];
  }
  function loadState() {
    try {
      var stored = JSON.parse(localStorage.getItem('weather24_investigation_v1'));
      if (stored && stored.records) return Object.assign({ caseId:'A-05', city:'서울', metric:'temp', term:15, threshold:25, records:{}, completed:[] }, stored);
    } catch (error) {}
    return { caseId:'A-05', city:'서울', metric:'temp', term:15, threshold:25, records:{}, completed:[] };
  }
  function persist() { try { localStorage.setItem('weather24_investigation_v1', JSON.stringify(state)); } catch (error) {} }
  function escapeHTML(value) { return String(value).replace(/[&<>"']/g, function (char) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]; }); }
  function r1(value) { return Math.round(value * 10) / 10; }
  function dayIndex(day) { return ((Math.round(day) - 1) % 365 + 365) % 365; }
  function cityValue(city, metric, period, day) { return D.cities[city][metric][period][dayIndex(day)]; }
  function metricLabel(metric) { return (METRICS[metric] || {}).label || metric; }
  function unit(metric) { return metric === 'temp' ? '℃' : metric === 'humidity' ? '%' : 'mm'; }
  function format(metric, value) {
    if (metric === 'precip') return Math.round(value) + 'mm';
    if (metric === 'humidity') return Math.round(value) + '%';
    return r1(value) + '℃';
  }
  function delta(metric, value) { var prefix = value >= 0 ? '+' : ''; return prefix + format(metric, value); }
  function mean(values) { var valid = values.filter(function (value) { return value != null; }); return valid.reduce(function (total, value) { return total + value; }, 0) / (valid.length || 1); }
  function sum(values) { return values.reduce(function (total, value) { return total + (value || 0); }, 0); }
  function seasonalValue(city, metric, period) { var values = D.cities[city][metric][period]; return metric === 'precip' ? sum(values.slice(151, 243)) : mean(values.slice(151, 243)); }
  function colorRamp(metric, t) {
    var ramps = { temp:['#2d79b8','#98d9ec','#ffe99d','#ffb264','#e85b51'], humidity:['#c6a56c','#ece5cb','#4d9bc0'], precip:['#e8faf7','#82d8c7','#2d9aa8','#176183'] };
    var colors = ramps[metric] || ramps.temp;
    var at = Math.max(0, Math.min(1, t));
    var index = Math.min(colors.length - 2, Math.floor(at * (colors.length - 1)));
    var ratio = at * (colors.length - 1) - index;
    function rgb(hex) { return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]; }
    var a = rgb(colors[index]), b = rgb(colors[index + 1]);
    return '#' + [0,1,2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * ratio).toString(16).padStart(2,'0'); }).join('');
  }
  function project(width, height, padding) {
    var box = G.bbox, k = Math.cos((box[1] + box[3]) / 2 * Math.PI / 180), mapWidth = (box[2] - box[0]) * k, mapHeight = box[3] - box[1], scale = Math.min((width - padding * 2) / mapWidth, (height - padding * 2) / mapHeight), ox = (width - mapWidth * scale) / 2, oy = (height - mapHeight * scale) / 2;
    return { x:function (lon) { return ox + (lon - box[0]) * k * scale; }, y:function (lat) { return height - oy - (lat - box[1]) * scale; } };
  }

  function renderChapters() {
    $('chapterTrack').innerHTML = CHAPTERS.map(function (chapter) {
      var active = activeChapter === chapter.id;
      return '<button class="chapter-btn' + (active ? ' is-active' : '') + '" role="tab" aria-selected="' + active + '" style="--chapter:' + chapter.color + '" data-chapter="' + chapter.id + '"><span class="chapter-token"></span><b>' + chapter.name + '</b><small>' + chapter.count + '개 사건</small></button>';
    }).join('');
    $('chapterTrack').querySelectorAll('[data-chapter]').forEach(function (button) {
      button.addEventListener('click', function () {
        activeChapter = button.dataset.chapter;
        var first = CASES.filter(function (item) { return item.ch === activeChapter; })[0];
        selectCase(first.id);
      });
    });
  }
  function renderCaseList() {
    var visible = activeChapter ? CASES.filter(function (item) { return item.ch === activeChapter; }) : CASES;
    $('caseCount').textContent = visible.length;
    $('caseList').innerHTML = visible.map(function (item) {
      var chapter = CHAPTERS.filter(function (entry) { return entry.id === item.ch; })[0];
      var active = item.id === state.caseId;
      var done = state.completed.indexOf(item.id) !== -1 ? ' ✓' : '';
      return '<button class="case-card' + (active ? ' is-active' : '') + '" style="--card-color:' + chapter.color + '" data-case="' + item.id + '"><span class="case-id">' + item.id + '</span><span><strong>' + escapeHTML(item.title) + done + '</strong><small>' + escapeHTML(item.question) + '</small></span></button>';
    }).join('');
    $('caseList').querySelectorAll('[data-case]').forEach(function (button) { button.addEventListener('click', function () { selectCase(button.dataset.case); }); });
  }
  function selectCase(id) {
    var next = CASES.filter(function (item) { return item.id === id; })[0];
    if (!next) return;
    state.caseId = id;
    state.city = next.city || state.city;
    state.metric = next.metric || state.metric;
    state.term = next.term == null ? state.term : next.term;
    activeChapter = next.ch;
    persist();
    renderAll();
    if (window.innerWidth < 760) document.querySelector('.workbench').scrollIntoView({ behavior:'smooth', block:'start' });
  }
  function renderHeader() {
    var item = currentCase(), chapter = CHAPTERS.filter(function (entry) { return entry.id === item.ch; })[0], index = CASES.indexOf(item) + 1;
    $('caseKicker').textContent = chapter.name + ' · CASE ' + item.id + (item.core ? ' · 핵심 사건' : '');
    $('caseTitle').textContent = item.title;
    $('caseQuestion').textContent = item.question;
    $('caseIndex').textContent = String(index).padStart(2, '0');
  }
  function renderPrediction() {
    var current = record();
    $('predictionChoices').innerHTML = PREDICTIONS.map(function (option) {
      return '<button class="choice' + (current.prediction === option.value ? ' is-selected' : '') + '" data-prediction="' + option.value + '"><b>' + option.label + '</b> · ' + option.hint + '</button>';
    }).join('');
    $('predictionChoices').querySelectorAll('[data-prediction]').forEach(function (button) {
      button.addEventListener('click', function () { record().prediction = button.dataset.prediction; persist(); renderPrediction(); setStatus('예측을 봉인했습니다. 이제 데이터를 바꿔 확인해 보세요.'); });
    });
  }
  function fieldHTML(label, id, inner, className) { return '<div class="field ' + (className || '') + '"><label for="' + id + '">' + label + '</label>' + inner + '</div>'; }
  function renderControls() {
    var item = currentCase(), html = '';
    if (item.mode === 'solar' || item.mode === 'thermal') {
      var cityOptions = CITY_KEYS.map(function (city) { return '<option value="' + city + '"' + (city === state.city ? ' selected' : '') + '>' + city + '</option>'; }).join('');
      var metricOptions = D.metrics.map(function (metric) { return '<option value="' + metric.key + '"' + (metric.key === state.metric ? ' selected' : '') + '>' + metric.label + '</option>'; }).join('');
      var termOptions = D.terms.map(function (term, index) { return '<option value="' + index + '"' + (index === state.term ? ' selected' : '') + '>' + term.name + ' · ' + term.date + '</option>'; }).join('');
      html += fieldHTML('관측 지점', 'citySelect', '<select id="citySelect">' + cityOptions + '</select>');
      html += fieldHTML('지표', 'metricSelect', '<select id="metricSelect">' + metricOptions + '</select>');
      html += fieldHTML('절기', 'termSelect', '<select id="termSelect">' + termOptions + '</select>');
      if (item.mode === 'thermal') html += fieldHTML('여름 기준', 'threshold', '<div class="range-row"><input id="threshold" type="range" min="20" max="30" step="1" value="' + state.threshold + '"><output id="thresholdOut">' + state.threshold + '℃ 이상</output></div>', 'range-field');
      $('sourceChip').textContent = '기상청 ASOS · ' + D.periods.past + ' vs ' + D.periods.present;
    } else if (item.mode === 'global') {
      html += '<div class="field"><label>관측 묶음</label><div class="source-chip">NOAA · OWID · 기상청</div></div>';
      html += '<div class="field"><label>비교 범위</label><div class="source-chip">1958년 이후 장기 시계열</div></div>';
      $('sourceChip').textContent = 'NOAA GML · OWID';
    } else {
      html += '<div class="field"><label>태풍 기록</label><div class="source-chip">NOAA IBTrACS 서태평양</div></div>';
      html += '<div class="field"><label>관측 포인트</label><div class="source-chip">경로 · 풍속 · 중심기압</div></div>';
      $('sourceChip').textContent = 'NOAA IBTrACS';
    }
    $('controls').innerHTML = html;
    ['citySelect','metricSelect','termSelect'].forEach(function (id) {
      var element = $(id); if (!element) return;
      element.addEventListener('change', function () { if (id === 'citySelect') state.city = element.value; if (id === 'metricSelect') state.metric = element.value; if (id === 'termSelect') state.term = Number(element.value); persist(); renderLab(); });
    });
    var threshold = $('threshold');
    if (threshold) threshold.addEventListener('input', function () { state.threshold = Number(threshold.value); $('thresholdOut').textContent = state.threshold + '℃ 이상'; persist(); renderLab(); });
  }

  function mapSVG(metric, day) {
    var width = 330, height = 290, projection = project(width, height, 12), values = CITY_KEYS.map(function (city) { return cityValue(city, metric, 'past', day); }).concat(CITY_KEYS.map(function (city) { return cityValue(city, metric, 'present', day); }));
    var low = Math.min.apply(null, values), high = Math.max.apply(null, values), span = high - low || 1;
    var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="과거와 현재 관측값을 비교하는 한반도 지도">';
    G.provinces.forEach(function (province) { province.rings.forEach(function (ring) { var path = ring.map(function (point, index) { return (index ? 'L' : 'M') + r1(projection.x(point[0])) + ' ' + r1(projection.y(point[1])); }).join(''); svg += '<path d="' + path + 'Z" fill="#123b52" stroke="rgba(218,239,241,.25)" stroke-width=".7"/>'; }); });
    CITY_KEYS.forEach(function (city) {
      var station = D.cities[city], past = cityValue(city, metric, 'past', day), present = cityValue(city, metric, 'present', day), diff = present - past, x = r1(projection.x(station.lon)), y = r1(projection.y(station.lat)), selected = city === state.city, color = colorRamp(metric, (present - low) / span);
      svg += '<g class="station" data-station="' + city + '" role="button" tabindex="0" aria-label="' + city + ' 선택"><circle cx="' + x + '" cy="' + y + '" r="' + (selected ? 10 : 7) + '" fill="' + color + '" stroke="' + (selected ? '#ffbe58' : '#eaf7f5') + '" stroke-width="' + (selected ? 3 : 1.2) + '"/><text x="' + (x + 10) + '" y="' + (y + 4) + '" fill="#ecf5f7" font-size="9" font-weight="700">' + city + '</text><title>' + city + ': 과거 ' + format(metric,past) + ', 현재 ' + format(metric,present) + ', 변화 ' + delta(metric,diff) + '</title></g>';
    });
    return svg + '<text x="12" y="276" fill="#a7bdc5" font-size="9">점의 색: 현재값 · 금색 테두리: 선택 지점</text></svg>';
  }
  function curveSVG(metric, term) {
    var width = 540, height = 290, left = 36, right = 12, top = 20, bottom = 27, past = D.cities[state.city][metric].past, present = D.cities[state.city][metric].present, all = past.concat(present), low = Math.min.apply(null, all), high = Math.max.apply(null, all);
    if (metric === 'precip') low = 0;
    var pad = (high - low || 1) * .13; low -= pad; high += pad;
    function x(index) { return left + index / 364 * (width - left - right); }
    function y(value) { return top + (high - value) / (high - low) * (height - top - bottom); }
    function path(values) { return values.map(function (value, index) { return (index ? 'L' : 'M') + r1(x(index)) + ' ' + r1(y(value)); }).join(''); }
    var day = D.terms[term].doy - 1, selectedPast = past[day], selectedPresent = present[day];
    var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + state.city + '의 과거와 현재 연중 ' + metricLabel(metric) + ' 곡선">';
    [0,.5,1].forEach(function (fraction) { var value = low + (high - low) * fraction, yy = y(value); svg += '<line x1="' + left + '" x2="' + (width - right) + '" y1="' + yy + '" y2="' + yy + '" stroke="rgba(218,239,241,.16)"/><text x="2" y="' + (yy + 3) + '" fill="#a7bdc5" font-size="9">' + format(metric,value) + '</text>'; });
    svg += '<path d="' + path(past) + '" fill="none" stroke="#a7bdc5" stroke-width="2" stroke-dasharray="5 4"/><path d="' + path(present) + '" fill="none" stroke="' + (metric === 'temp' ? '#ff8066' : metric === 'humidity' ? '#77bff7' : '#3bd0c0') + '" stroke-width="2.7"/>';
    svg += '<line x1="' + x(day) + '" x2="' + x(day) + '" y1="' + top + '" y2="' + (height-bottom) + '" stroke="#ffbe58" stroke-width="1.5" stroke-dasharray="3 3"/><circle cx="' + x(day) + '" cy="' + y(selectedPast) + '" r="4" fill="#a7bdc5"/><circle cx="' + x(day) + '" cy="' + y(selectedPresent) + '" r="4.5" fill="#ffbe58"/>';
    [['1월',0],['4월',90],['7월',181],['10월',273]].forEach(function (tick) { svg += '<text x="' + x(tick[1]) + '" y="' + (height-7) + '" fill="#a7bdc5" font-size="9" text-anchor="middle">' + tick[0] + '</text>'; });
    return svg + '<text x="' + (width-right) + '" y="16" fill="#a7bdc5" font-size="9" text-anchor="end">점선 과거 · 실선 현재</text></svg>';
  }
  function solarFacts() {
    var item = currentCase(), term = D.terms[state.term], metric = state.metric, past = cityValue(state.city, metric, 'past', term.doy), present = cityValue(state.city, metric, 'present', term.doy), change = present - past;
    if (item.mode === 'thermal') {
      var pastDays = D.cities[state.city].temp.past.filter(function (value) { return value >= state.threshold; }).length;
      var presentDays = D.cities[state.city].temp.present.filter(function (value) { return value >= state.threshold; }).length;
      return { title:'열적 계절 길이', statement:state.city + '에서 일평균 ' + state.threshold + '℃ 이상인 날은 과거 ' + pastDays + '일, 현재 ' + presentDays + '일이다.', source:'기상청 ASOS 16지점 일자료', period:D.periods.past + ' vs ' + D.periods.present, kind:'열적 계절 기준', past:pastDays, present:presentDays, change:presentDays-pastDays };
    }
    return { title:term.name + ' 무렵 ' + metricLabel(metric), statement:state.city + '의 ' + term.name + ' 무렵 ' + metricLabel(metric) + '은 과거 ' + format(metric,past) + ', 현재 ' + format(metric,present) + '으로 ' + delta(metric,change) + ' 변화했다.', source:'기상청 ASOS 16지점 일자료', period:D.periods.past + ' vs ' + D.periods.present, kind:term.name + ' · ' + metricLabel(metric), past:past, present:present, change:change };
  }
  function renderSolar() {
    var item = currentCase(), term = D.terms[state.term], metric = state.metric, facts = solarFacts(), seasonPast = seasonalValue(state.city, metric, 'past'), seasonPresent = seasonalValue(state.city, metric, 'present');
    $('labTitle').textContent = item.mode === 'thermal' ? '열적 계절 정의 실험실' : term.name + ' 관측 지도 실험실';
    $('dataStage').className = 'data-stage solar-stage';
    $('dataStage').innerHTML = '<div class="map-wrap"><p class="stage-label">지점의 현재값을 눌러 비교하세요</p><div id="mapMount">' + mapSVG(metric, term.doy) + '</div></div><div class="chart-wrap"><p class="stage-label">' + state.city + ' · 연중 곡선에서 절기 위치</p>' + curveSVG(metric, state.term) + '</div>';
    $('mapMount').querySelectorAll('[data-station]').forEach(function (station) {
      function choose() { state.city = station.dataset.station; persist(); renderLab(); }
      station.addEventListener('click', choose); station.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
    });
    var first = item.mode === 'thermal' ? '과거 ' + facts.past + '일 → 현재 ' + facts.present + '일' : '과거 ' + format(metric,facts.past) + ' → 현재 ' + format(metric,facts.present);
    var second = metric === 'precip' ? '여름 강수: ' + format(metric,seasonPast) + ' → ' + format(metric,seasonPresent) : '여름 평균: ' + format(metric,seasonPast) + ' → ' + format(metric,seasonPresent);
    $('labSummary').innerHTML = '<div class="metric-chip"><small>' + facts.kind + '</small><b>' + first + '</b></div><div class="metric-chip"><small>변화량</small><b>' + (item.mode === 'thermal' ? (facts.change >= 0 ? '+' : '') + facts.change + '일' : delta(metric,facts.change)) + '</b></div><div class="metric-chip"><small>같은 지점의 계절 맥락</small><b>' + second + '</b></div>';
    return facts;
  }
  function lineChart(points, key, color, label, width, height, scale) {
    var valid = points.filter(function (point) { return point[key] != null; });
    var values = valid.map(function (point) { return point[key]; }), low = scale ? scale[0] : Math.min.apply(null, values), high = scale ? scale[1] : Math.max.apply(null, values), left = 36, right = 18, top = 18, bottom = 28;
    var start = valid[0].year, end = valid[valid.length - 1].year;
    function x(year) { return left + (year - start) / (end - start || 1) * (width-left-right); }
    function y(value) { return top + (high-value)/(high-low || 1)*(height-top-bottom); }
    var path = valid.map(function (point, index) { return (index ? 'L' : 'M') + r1(x(point.year)) + ' ' + r1(y(point[key])); }).join('');
    return { path:path, low:low, high:high, x:x, y:y, start:start, end:end, label:label, color:color };
  }
  async function renderGlobal() {
    $('labTitle').textContent = '전지구 증거의 사슬';
    $('dataStage').className = 'data-stage global-stage';
    $('dataStage').innerHTML = '<div class="empty-state">전지구 관측 시계열을 불러오는 중…</div>';
    try {
      if (!globalData) globalData = await fetch('/web_data/climate_change.json').then(function (response) { if (!response.ok) throw new Error('data'); return response.json(); });
      var points = globalData.series.filter(function (point) { return point.year >= 1958 && point.co2_ppm != null; });
      var width = 760, height = 290, co2 = lineChart(points,'co2_ppm','#ffbe58','CO₂ ppm',width,height), temp = lineChart(points,'temp_anomaly_C','#ff8066','기온 이상 ℃',width,height), latest = points[points.length-1], first = points[0];
      var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="1958년 이후 CO2와 전지구 기온 이상 시계열">';
      [0,.5,1].forEach(function (fraction) { var y = 18 + fraction * (height-46); svg += '<line x1="36" x2="742" y1="' + y + '" y2="' + y + '" stroke="rgba(218,239,241,.16)"/>'; });
      svg += '<path d="' + co2.path + '" fill="none" stroke="' + co2.color + '" stroke-width="3"/><path d="' + temp.path + '" fill="none" stroke="' + temp.color + '" stroke-width="2.5" transform="translate(0,0)"/>';
      svg += '<text x="42" y="16" fill="#ffbe58" font-size="11">CO₂: ' + r1(first.co2_ppm) + ' → ' + r1(latest.co2_ppm) + ' ppm</text><text x="742" y="16" fill="#ff8066" font-size="11" text-anchor="end">기온 이상: ' + r1(first.temp_anomaly_C) + ' → ' + r1(latest.temp_anomaly_C) + '℃</text>';
      [1958,1980,2000,2020,latest.year].forEach(function (year) { var xx = co2.x(year); svg += '<text x="' + xx + '" y="278" fill="#a7bdc5" font-size="10" text-anchor="middle">' + year + '</text>'; });
      svg += '<text x="38" y="256" fill="#a7bdc5" font-size="10">두 선은 서로 다른 단위를 각각의 축 범위로 정규화해 비교한 것입니다.</text></svg>';
      $('dataStage').innerHTML = svg;
      var statement = '1958년 CO₂ ' + r1(first.co2_ppm) + 'ppm에서 ' + latest.year + '년 ' + r1(latest.co2_ppm) + 'ppm으로 증가했고, 같은 기간 전지구 기온 이상치는 ' + r1(first.temp_anomaly_C) + '℃에서 ' + r1(latest.temp_anomaly_C) + '℃이다.';
      $('labSummary').innerHTML = '<div class="metric-chip"><small>대기 CO₂</small><b>' + r1(first.co2_ppm) + ' → ' + r1(latest.co2_ppm) + ' ppm</b></div><div class="metric-chip"><small>전지구 기온 이상</small><b>' + r1(first.temp_anomaly_C) + ' → ' + r1(latest.temp_anomaly_C) + '℃</b></div><div class="metric-chip"><small>해석의 한계</small><b>함께 움직여도 원인을 단정하지 않기</b></div>';
      return { title:'CO₂·기온 장기 시계열', statement:statement, source:'NOAA GML · Our World in Data', period:'1958–' + latest.year, kind:'전지구 장기 관측' };
    } catch (error) {
      $('dataStage').innerHTML = '<div class="empty-state">전지구 자료를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.</div>';
      $('labSummary').innerHTML = '';
      return null;
    }
  }
  async function renderTyphoon() {
    $('labTitle').textContent = '태풍 경로 관제실';
    $('dataStage').className = 'data-stage typhoon-stage';
    $('dataStage').innerHTML = '<div class="empty-state">서태평양 태풍 경로를 불러오는 중…</div>';
    try {
      if (!typhoonData) typhoonData = await fetch('/web_data/typhoon_tracks_wnp.json').then(function (response) { if (!response.ok) throw new Error('data'); return response.json(); });
      var tracks = typhoonData.tracks || typhoonData, candidates = tracks.filter(function (track) { return track.season === 2025 && track.peak_wind_kt != null; }), track = candidates.sort(function (a,b) { return b.peak_wind_kt - a.peak_wind_kt; })[0] || tracks[0], width = 760, height = 290, left = 38, top = 16, right = 20, bottom = 28;
      function x(lon) { return left + (lon - 100) / 70 * (width-left-right); }
      function y(lat) { return top + (50-lat) / 50 * (height-top-bottom); }
      var path = track.track.map(function (point, index) { return (index ? 'L' : 'M') + r1(x(point[2] == null ? point[1] : point[2])) + ' ' + r1(y(point[1])); });
      /* IBTrACS point format is [time, lat, lon, wind, pressure]. */
      path = track.track.map(function (point, index) { return (index ? 'L' : 'M') + r1(x(point[2])) + ' ' + r1(y(point[1])); }).join('');
      var peak = track.track.filter(function (point) { return point[3] != null; }).sort(function (a,b) { return (b[3] || 0) - (a[3] || 0); })[0];
      var svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHTML(track.name) + ' 태풍 경로 지도">';
      for (var lon=110; lon<=160; lon+=10) svg += '<line x1="' + x(lon) + '" x2="' + x(lon) + '" y1="16" y2="262" stroke="rgba(218,239,241,.13)"/><text x="' + x(lon) + '" y="278" fill="#a7bdc5" font-size="9" text-anchor="middle">' + lon + '°E</text>';
      for (var lat=10; lat<=40; lat+=10) svg += '<line x1="38" x2="740" y1="' + y(lat) + '" y2="' + y(lat) + '" stroke="rgba(218,239,241,.13)"/><text x="26" y="' + (y(lat)+3) + '" fill="#a7bdc5" font-size="9">' + lat + '°N</text>';
      svg += '<path d="' + path + '" fill="none" stroke="#77bff7" stroke-width="3"/><circle cx="' + x(track.track[0][2]) + '" cy="' + y(track.track[0][1]) + '" r="5" fill="#3bd0c0"/><circle cx="' + x(peak[2]) + '" cy="' + y(peak[1]) + '" r="7" fill="#ffbe58" stroke="#fff0d1" stroke-width="2"/><text x="' + (x(peak[2])+10) + '" y="' + (y(peak[1])-9) + '" fill="#fff0d1" font-size="12" font-weight="700">' + escapeHTML(track.name) + ' · ' + Math.round(track.peak_wind_kt) + 'kt</text><text x="38" y="16" fill="#a7bdc5" font-size="10">출발점</text><text x="612" y="16" fill="#ffbe58" font-size="10">최대 강도 지점</text></svg>';
      $('dataStage').innerHTML = svg;
      $('labSummary').innerHTML = '<div class="metric-chip"><small>선택 태풍</small><b>' + escapeHTML(track.name) + ' · ' + track.season + '</b></div><div class="metric-chip"><small>최대 풍속</small><b>' + Math.round(track.peak_wind_kt) + ' kt</b></div><div class="metric-chip"><small>최저 중심기압</small><b>' + Math.round(track.min_pres_mb) + ' hPa</b></div>';
      return { title:'태풍 ' + track.name + ' 경로', statement:track.season + '년 ' + track.name + '의 최고 풍속은 ' + Math.round(track.peak_wind_kt) + 'kt, 최저 중심기압은 ' + Math.round(track.min_pres_mb) + 'hPa로 기록되었다.', source:'NOAA IBTrACS 서태평양 태풍 경로', period:String(track.season), kind:'태풍 경로·강도' };
    } catch (error) {
      $('dataStage').innerHTML = '<div class="empty-state">태풍 자료를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.</div>';
      $('labSummary').innerHTML = '';
      return null;
    }
  }
  var latestFacts = null;
  async function renderLab() {
    renderControls();
    var item = currentCase();
    if (item.mode === 'solar' || item.mode === 'thermal') latestFacts = renderSolar();
    else if (item.mode === 'global') latestFacts = await renderGlobal();
    else latestFacts = await renderTyphoon();
  }
  function renderEvidence() {
    var current = record(), stack = $('evidenceStack');
    $('evidenceCount').textContent = current.evidence.length + ' / 3';
    stack.innerHTML = current.evidence.length ? '' : '<div class="empty-state">실험실의 결과를<br />증거 카드로 저장하세요.</div>';
    current.evidence.forEach(function (evidence, index) {
      var card = document.createElement('article'); card.className = 'evidence-card';
      card.innerHTML = '<button class="remove-evidence" aria-label="증거 카드 삭제" data-remove="' + index + '">×</button><strong></strong><small></small>';
      card.querySelector('strong').textContent = evidence.statement;
      card.querySelector('small').textContent = evidence.source + ' · ' + evidence.period;
      stack.appendChild(card);
    });
    stack.querySelectorAll('[data-remove]').forEach(function (button) { button.addEventListener('click', function () { current.evidence.splice(Number(button.dataset.remove),1); if (!current.evidence.some(function (e) { return e.isCounter; })) current.counter = false; persist(); renderEvidence(); updateFinish(); }); });
    $('counterSlot').classList.toggle('is-filled', current.counter);
    if (current.counter) $('counterSlot').querySelector('div').innerHTML = '<strong>반증 자료 확인됨</strong><small>다른 지역 또는 다른 지표의 결과가 보드에 저장되었습니다.</small>';
    else $('counterSlot').querySelector('div').innerHTML = '<strong>반증 슬롯</strong><small>내 결론과 다른 가능성 하나를 확인하세요.</small>';
    updateFinish();
  }
  function makeCounter() {
    var item = currentCase();
    if (item.mode === 'global') return { id:'COUNTER', statement:'CO₂·기온 자료가 함께 변화해도, 이 두 시계열만으로 단일 원인이나 특정 지역의 결과를 단정할 수 없다.', source:'NOAA GML · OWID · 해석 한계', period:'장기 시계열', kind:'반증·한계', isCounter:true };
    if (item.mode === 'typhoon') return { id:'COUNTER', statement:'한 태풍의 경로와 강도 기록만으로 기후변화가 그 태풍의 원인이라고 결론 내릴 수는 없다.', source:'NOAA IBTrACS · 해석 한계', period:'단일 사건', kind:'반증·한계', isCounter:true };
    var other = CITY_KEYS.filter(function (city) { return city !== state.city; })[0], term = D.terms[state.term], metric = state.metric, past = cityValue(other, metric, 'past', term.doy), present = cityValue(other, metric, 'present', term.doy);
    return { id:'COUNTER', statement:other + '의 같은 ' + term.name + ' 무렵 ' + metricLabel(metric) + '은 과거 ' + format(metric,past) + ', 현재 ' + format(metric,present) + '이다. 한 지역의 결과를 모든 지역에 일반화하기 전에 비교가 필요하다.', source:'기상청 ASOS 16지점 일자료', period:D.periods.past + ' vs ' + D.periods.present, kind:'다른 지역 비교', isCounter:true };
  }
  function saveEvidence(counter) {
    var current = record();
    if (!current.prediction) { setStatus('먼저 예측을 하나 골라 봉인해 주세요.'); return; }
    if (!latestFacts) { setStatus('자료를 불러온 뒤 증거를 저장할 수 있습니다.'); return; }
    if (current.evidence.length >= 3) { setStatus('증거 보드는 최대 3장입니다. 필요한 카드만 남겨 주세요.'); return; }
    var fact = counter ? makeCounter() : latestFacts;
    if (counter && current.counter) { setStatus('반증 자료는 이미 보드에 있습니다.'); return; }
    current.evidence.push(Object.assign({ id:'E-' + (current.evidence.length+1) }, fact));
    if (counter) current.counter = true;
    persist(); renderEvidence(); setStatus(counter ? '다른 해석을 반증 슬롯에 저장했습니다.' : '현재 실험 결과를 증거 카드로 저장했습니다.');
  }
  function renderVerdict() {
    var current = record();
    $('verdictOptions').innerHTML = VERDICTS.map(function (option) { return '<button class="verdict-option' + (current.verdict === option.value ? ' is-selected' : '') + '" data-verdict="' + option.value + '"><b>' + option.label + '</b><small>' + option.hint + '</small></button>'; }).join('');
    $('verdictOptions').querySelectorAll('[data-verdict]').forEach(function (button) { button.addEventListener('click', function () { record().verdict = button.dataset.verdict; persist(); renderVerdict(); updateFinish(); }); });
    $('draft').value = current.draft || '';
    $('draft').oninput = function () { record().draft = $('draft').value.slice(0,900); persist(); };
    $('coachResult').hidden = true;
  }
  function updateFinish() { $('finishCase').disabled = !(record().evidence.length >= 2 && record().counter && record().verdict); }
  function setStatus(message) { $('coachStatus').textContent = message; }
  async function askCoach() {
    var current = record();
    if (current.evidence.length < 2 || (current.draft || '').trim().length < 12) { setStatus('AI 감사에는 증거 카드 2장과 12자 이상의 판정문이 필요합니다.'); return; }
    var button = $('askCoach'); button.disabled = true; button.textContent = 'AI 감사 중…'; setStatus('선택한 증거 카드 안에서만 판정문을 점검하고 있습니다.');
    try {
      var item = currentCase();
      var response = await fetch('/api/ai-turn', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ case:{ id:item.id, title:item.title, question:item.question }, verdict:current.verdict, draft:current.draft, evidence:current.evidence }) });
      var data = await response.json();
      if (!response.ok || !data.feedback) throw new Error(data.error || 'AI error');
      var feedback = data.feedback, result = $('coachResult');
      result.hidden = false; result.innerHTML = '<strong>증거 감사관</strong><br><span></span><br><br><b>다음 질문</b><br><span></span>';
      result.querySelectorAll('span')[0].textContent = feedback.feedback + (feedback.overclaim_warning ? ' ' + feedback.overclaim_warning : '');
      result.querySelectorAll('span')[1].textContent = feedback.socratic_question;
      setStatus('다음 행동: ' + actionLabel(feedback.next_action));
    } catch (error) {
      setStatus('AI 감사관이 응답하지 않았습니다. 지도 탐구와 판정은 계속 진행할 수 있습니다.');
    } finally { button.disabled = false; button.innerHTML = '<span aria-hidden="true">✦</span> AI 증거 감사 요청'; }
  }
  function actionLabel(action) { return ({ compare_region:'다른 지역과 비교하기', change_metric:'다른 지표 보기', check_period:'비교 기간 확인하기', add_counter_evidence:'반증 자료 추가하기', state_limitation:'한계 문장 쓰기', submit_verdict:'판정 보관하기' })[action] || '근거 다시 확인하기'; }
  function coachContext() {
    var item = currentCase(), current = record(), facts = latestFacts ? [{ statement:latestFacts.statement, source:latestFacts.source, period:latestFacts.period, kind:latestFacts.kind }] : [];
    return {
      case:{ id:item.id, title:item.title, question:item.question },
      prediction:current.prediction || 'unknown',
      facts:facts,
      evidence:current.evidence.map(function (evidence) { return { statement:evidence.statement, source:evidence.source, period:evidence.period, kind:evidence.kind }; }),
      availableActions:['compare_region','change_metric','check_period','add_counter_evidence','state_limitation','save_evidence']
    };
  }
  function applyCoachAction(action) {
    if (action === 'compare_region') {
      var index = CITY_KEYS.indexOf(state.city);
      state.city = CITY_KEYS[(index + 1) % CITY_KEYS.length];
      persist(); renderLab(); setStatus(state.city + ' 자료로 바꿔 비교해 보세요. 같은 절기라도 지역마다 신호가 다를 수 있습니다.');
    } else if (action === 'change_metric') {
      var metricIndex = D.metrics.map(function (metric) { return metric.key; }).indexOf(state.metric);
      state.metric = D.metrics[(metricIndex + 1) % D.metrics.length].key;
      persist(); renderLab(); setStatus(metricLabel(state.metric) + ' 지표로 바꿨습니다. 같은 결론이 유지되는지 확인해 보세요.');
    } else if (action === 'check_period') {
      document.querySelector('#controls').scrollIntoView({ behavior:'smooth', block:'center' });
      setStatus('과거와 현재의 비교 기간, 그리고 선택한 절기를 먼저 확인해 보세요.');
    } else if (action === 'add_counter_evidence') {
      saveEvidence(true);
    } else if (action === 'state_limitation') {
      if (!(record().draft || '').trim()) record().draft = '이 자료는 선택한 지역과 기간의 관측 결과를 보여 준다. 따라서 다른 지역과 원인을 일반화하기 전에 추가 비교가 필요하다.';
      persist(); renderVerdict(); document.querySelector('.verdict-panel').scrollIntoView({ behavior:'smooth', block:'center' });
    } else if (action === 'save_evidence') {
      saveEvidence(false);
    }
  }
  function openInvestigation(detail) {
    var first = CASES[4];
    state.caseId = first.id;
    state.city = (detail && detail.city) || first.city;
    state.metric = (detail && detail.metric) || first.metric;
    state.term = detail && detail.term != null ? detail.term : first.term;
    if (detail && detail.prediction) record().prediction = detail.prediction;
    activeChapter = first.ch;
    persist(); renderAll();
    setStatus('첫 예측을 수사 노트에 옮겼습니다. 지도를 조작해 다음 근거를 찾아보세요.');
  }
  window.weather24Investigation = { getContext:coachContext, applyCoachAction:applyCoachAction, openInvestigation:openInvestigation };
  window.addEventListener('weather24:open-investigation', function (event) { openInvestigation(event.detail || {}); });
  function finishCase() {
    var item = currentCase();
    if (state.completed.indexOf(item.id) === -1) state.completed.push(item.id);
    persist(); renderCaseList();
    $('completeText').textContent = item.title + ' 사건에 대해 근거 ' + record().evidence.length + '장과 반증 자료를 남겼습니다. 다음 사건에서 다른 지표나 지역을 비교해 보세요.';
    $('completeDialog').showModal();
  }
  async function renderAll() { renderChapters(); renderCaseList(); renderHeader(); renderPrediction(); renderVerdict(); renderEvidence(); await renderLab(); }
  function bindStatic() {
    $('saveEvidence').addEventListener('click', function () { saveEvidence(false); });
    $('addCounter').addEventListener('click', function () { saveEvidence(true); });
    $('askCoach').addEventListener('click', askCoach);
    $('finishCase').addEventListener('click', finishCase);
    $('openGuide').addEventListener('click', function () { $('guideDialog').showModal(); });
    document.querySelectorAll('[data-close]').forEach(function (button) { button.addEventListener('click', function () { $(button.dataset.close).close(); }); });
  }
  bindStatic();
  renderAll();
})();
