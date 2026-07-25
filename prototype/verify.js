(function () {
  'use strict';
  var D = window.SOLAR_DATA;
  var stage = document.getElementById('stage');
  if (!D) { stage.innerHTML = '<p class="load-fail">데이터를 불러오지 못했습니다. 새로고침해 주세요.</p>'; return; }

  /*
   * 절기의 약속 검증소 — 예측 봉인 → 히어로 조작(더위 기준선 드래그) → CERL 판정.
   * 절기는 고정된 천문 날짜(움직이지 않는 세로선), 기후는 움직이는 곡선.
   * AI 없이 100% 동작하며, 결과 화면에서 '무엇을 배웠는지'가 남는다.
   */
  var CITIES = Object.keys(D.cities);
  var COLORS = { past: '#a7bdc5', present: '#ff8066', term: '#ffbe58', threshold: '#caa8ff' };
  var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], CUM = [];
  (function () { var s = 0; for (var i = 0; i < 12; i++) { CUM.push(s); s += MONTH_DAYS[i]; } })();

  var METRICS = {
    temp: { key: 'temp', label: '기온', unit: '°C', verb: '덥다', day: '더위일', last: '더위가 그치는 날', showLast: true, range: function (b) { return { lo: 20, hi: Math.max(28, Math.min(34, Math.round(b.hi))) }; }, def: 25 },
    precip: { key: 'precip', label: '강수', unit: 'mm', verb: '비가 많다', day: '비 온 날', last: null, showLast: false, range: function (b) { return { lo: 1, hi: Math.max(6, Math.min(20, Math.round(b.hi))) }; }, def: 3 },
    humidity: { key: 'humidity', label: '습도', unit: '%', verb: '습하다', day: '습한 날', last: null, showLast: false, range: function (b) { return { lo: 55, hi: Math.max(75, Math.min(95, Math.round(b.hi))) }; }, def: 70 }
  };

  var PRE_QUESTION = {
    q: '요즘 “처서가 지났는데도 덥다”는 말을 자주 합니다. 이 현상을 가장 정확히 설명한 것은?',
    options: [
      { v: 'a', t: '‘처서’라는 절기 자체가 옛날보다 더워졌다.', s: '절기와 기온을 섞은 설명' },
      { v: 'b', t: '절기 날짜는 그대로인데, 같은 처서 무렵 ‘덥다’ 기준을 넘는 날이 예전보다 늦게까지 이어진다.', s: '절기와 기후를 구분한 설명' },
      { v: 'c', t: '잘 모르겠다.', s: '지금 확인해 봅니다' }
    ],
    correct: 'b'
  };

  var MISSIONS = [
    {
      id: 'chuseo', goal: '목표 ① 절기(천문 날짜) ≠ 기후(관측)',
      title: '처서, 약속은 유효한가',
      city: '서울', ti: 15, metric: 'temp', thr: 25, lockCity: true, lockTerm: true,
      brief: '처서(8/23)는 “더위가 그침”을 뜻합니다. 서울의 과거(1969–73)와 현재(2022–26)를 비교해, 이 약속이 아직 유효한지 검증하세요.',
      predict: {
        q: '처서가 지난 뒤의 더위는 지금 어떻게 되었을까?',
        options: [{ v: 'ended', t: '더위가 끝났다', s: '약속대로' }, { v: 'longer', t: '더위가 더 길어졌다', s: '약속이 어긋남' }, { v: 'unknown', t: '잘 모르겠다', s: '비교 후 판단' }]
      },
      task: '그래프 위 보라색 ‘덥다 기준선’을 위아래로 끌어, 과거와 현재의 ‘더위가 그치는 날’을 비교하세요.',
      verdict: function (n) {
        if (n.pl >= 0 && n.cl >= 0) return '서울의 ‘덥다 ' + n.thr + '°C’ 기준으로, 더위가 그치는 날이 과거 <b>' + n.plStr + '</b> → 현재 <b class="hot">' + n.clStr + '</b>로 <b class="hot">' + n.drift + '일</b> 늦어졌습니다. 처서(더위가 그침)가 지나도 더위가 이어집니다 — 절기 날짜는 그대로인데, 관측된 더위가 늦게까지 이어지는 것입니다.';
        if (n.pl < 0 && n.cd > 0) return '서울에서 과거(1969–73)엔 ‘' + n.thr + '°C 이상’ 더위가 거의 없었는데, 현재(2022–26)는 <b class="hot">' + n.cd + '일</b>이나 나타납니다. 절기 날짜(처서)는 그대로인데, 관측된 더위가 크게 늘어난 것입니다.';
        return '서울의 ‘덥다 ' + n.thr + '°C’ 기준으로는 과거·현재 모두 더위일이 적습니다. 기준선을 조금 낮춰, 과거·현재의 ‘더위가 그치는 날’을 함께 비교해 보세요.';
      },
      selfCheck: {
        q: '‘덥다’ 기준선을 25°C에서 28°C로 올리면, 기준 이상 더위일 수는?',
        options: [{ v: 'up', t: '늘어난다' }, { v: 'down', t: '줄어든다' }, { v: 'same', t: '그대로다' }], correct: 'down',
        explain: '기준이 높을수록 그 기준을 넘는 날은 줄어듭니다. 그래서 ‘덥다’를 몇 도로 정하는지에 따라 결론이 달라지고, 우리는 늘 그 기준을 밝혀야 합니다.'
      },
      askPost: true
    },
    {
      id: 'summer', goal: '목표 ③ 모호한 말(‘여름’)을 기준으로 정의',
      title: '여름은 며칠일까',
      city: '부산', ti: 13, metric: 'temp', thr: 25, lockCity: false, lockTerm: true,
      brief: '‘여름’을 “일평균 몇 °C 이상인 날”로 정하느냐에 따라 여름의 길이가 달라집니다. 기준을 바꿔 가며 과거와 현재의 여름 길이를 비교하세요. (지역도 바꿔 볼 수 있어요.)',
      predict: {
        q: '‘덥다(여름)’ 기준을 높게 잡을수록, 세어지는 여름 일수는?',
        options: [{ v: 'short', t: '짧아진다', s: '' }, { v: 'long', t: '길어진다', s: '' }, { v: 'unknown', t: '잘 모르겠다', s: '' }]
      },
      task: '기준선을 여러 높이로 끌어, 과거·현재의 ‘기준 이상 더위일(=여름 길이)’이 얼마나 달라지는지 확인하세요.',
      verdict: function (n) {
        return n.city + '에서 ‘여름 = ' + n.thr + '°C 이상’으로 정하면 여름은 과거 <b>' + n.pd + '일</b> → 현재 <b class="hot">' + n.cd + '일</b>(<b class="hot">' + (n.dd >= 0 ? '+' + n.dd : n.dd) + '일</b>)입니다. 기준을 바꾸면 이 숫자도 함께 바뀝니다 — 그래서 “여름이 길어졌다”고 말하려면 <b>어떤 기준</b>으로, <b>어느 기간</b>을 비교했는지를 반드시 함께 밝혀야 합니다.';
      },
      selfCheck: {
        q: '“여름이 길어졌다”고 자료로 말하려면, 반드시 함께 밝혀야 하는 것은?',
        options: [{ v: 'crit', t: '기준 온도와 비교 기간' }, { v: 'feel', t: '그날의 내 기분' }, { v: 'none', t: '아무것도 필요 없다' }], correct: 'crit',
        explain: '“여름”, “덥다” 같은 말은 기준을 정해야 자료가 됩니다. 기준 온도와 비교 기간(지역·지표)이 빠지면 같은 자료로도 다른 결론이 나옵니다.'
      }
    },
    {
      id: 'region', goal: '목표 ② 자료의 범위(지역·기간·지표) 읽기',
      title: '우리 지역만 그럴까',
      city: '제주', ti: 15, metric: 'temp', thr: 25, lockCity: false, lockTerm: true, compare: ['제주', '강원'],
      brief: '한 지역에서 더위가 길어졌다고, 전국이 똑같이 변했을까요? 남쪽 제주와 산간 강원을 번갈아 보며 반증해 보세요.',
      predict: {
        q: '제주와 강원, 두 지역의 ‘더위가 그치는 날’ 변화는?',
        options: [{ v: 'same', t: '거의 같을 것이다', s: '' }, { v: 'diff', t: '지역마다 다를 것이다', s: '' }, { v: 'unknown', t: '잘 모르겠다', s: '' }]
      },
      task: '제주 칩과 강원 칩을 번갈아 눌러, 처서 뒤 ‘더위가 그치는 날’의 시차가 지역마다 어떻게 다른지 비교하세요.',
      verdict: function (n) {
        var a = n.driftFor('제주'), b = n.driftFor('강원');
        var aStr = a == null ? '비교 불가' : (a >= 0 ? '+' + a : a) + '일', bStr = b == null ? '비교 불가' : (b >= 0 ? '+' + b : b) + '일';
        return '같은 처서·같은 ' + n.thr + '°C 기준인데도, ‘더위가 그치는 날’의 시차는 제주 <b class="hot">' + aStr + '</b>, 강원 <b class="hot">' + bStr + '</b>로 <b>지역마다 다릅니다</b>. 그러므로 한 지역(예: 서울)의 결과만으로 “전국의 계절이 똑같이 변했다”고 넓혀 말할 수 없습니다 — 자료가 말하는 범위 안에서만 결론을 씁니다.';
      },
      selfCheck: {
        q: '서울 한 지역의 자료만으로 “전국의 계절이 똑같이 변했다”고 말할 수 있을까?',
        options: [{ v: 'no', t: '말할 수 없다' }, { v: 'yes', t: '말할 수 있다' }], correct: 'no',
        explain: '한 지역의 신호는 그 지역의 범위 안에서만 유효합니다. 전국을 말하려면 여러 지역을 함께 비교해야 합니다.'
      }
    }
  ];

  var state = load();

  function $(id) { return document.getElementById(id); }
  function term(ti) { return D.terms[ti == null ? state.ti : ti]; }
  function metricOf() { return METRICS[state.metric] || METRICS.temp; }
  function series(period, city, metric) { return D.cities[city || state.city][metric || state.metric][period]; }
  function dateStr(day0) { var d = ((day0 % 365) + 365) % 365, m = 0; while (m < 11 && d >= CUM[m + 1]) m++; return (m + 1) + '월 ' + (d - CUM[m] + 1) + '일'; }
  function batchim(w) { var ch = w.charCodeAt(w.length - 1); return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0; }
  function eunNeun(w) { return batchim(w) ? '은' : '는'; }

  function load() {
    var base = { phase: 'pre', mi: 0, city: '서울', ti: 15, thr: 25, metric: 'temp', pre: null, post: null, predicts: {}, done: [], touched: false };
    try { var s = JSON.parse(localStorage.getItem('weather24_verify_v2')); if (s && typeof s === 'object') return Object.assign(base, s); } catch (e) {}
    return base;
  }
  function save() { try { localStorage.setItem('weather24_verify_v2', JSON.stringify(state)); } catch (e) {} }

  function bounds(city, metric) {
    var all = series('past', city, metric).concat(series('present', city, metric));
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pad = (hi - lo) * 0.08 || 1;
    return { lo: lo - pad, hi: hi + pad };
  }
  function exceed(period, thr, city, metric) { return series(period, city, metric).filter(function (v) { return v >= thr; }).length; }
  function lastExceed(period, thr, city, metric) { var a = series(period, city, metric); for (var i = 364; i >= 0; i--) if (a[i] >= thr) return i; return -1; }

  /* ---------- 진행 표시 ---------- */
  function renderProgress() {
    var steps = MISSIONS.map(function (m, i) {
      var st = state.done.indexOf(m.id) !== -1 ? 'done' : (state.phase === 'mission' && state.mi === i ? 'on' : '');
      return '<span class="pstep ' + st + '"><i>' + (st === 'done' ? '✓' : i + 1) + '</i><small>' + m.title + '</small></span>';
    }).join('<span class="pline" aria-hidden="true"></span>');
    var freeOn = state.phase === 'free' ? ' on' : '';
    $('progress').innerHTML = steps + '<span class="pline" aria-hidden="true"></span><span class="pstep' + freeOn + '"><i>✦</i><small>자유탐구</small></span>';
  }

  /* ---------- 히어로(SVG) ---------- */
  var W = 720, H = 340, L = 46, R = 16, TP = 20, BT = 28;
  function xf(i) { return L + i / 364 * (W - L - R); }
  function heatRange(b) { return metricOf().range(b); }

  function drawHero() {
    var svg = $('heroSvg'); if (!svg) return;
    var mc = metricOf(), b = bounds(), hr = heatRange(b), tm = term();
    if (state.thr < hr.lo) state.thr = hr.lo; if (state.thr > hr.hi) state.thr = hr.hi;
    function yf(v) { return TP + (b.hi - v) / (b.hi - b.lo) * (H - TP - BT); }
    function path(a) { var d = ''; for (var i = 0; i < 365; i++) d += (i ? 'L' : 'M') + xf(i).toFixed(1) + ' ' + yf(a[i]).toFixed(1); return d; }
    var thr = state.thr, yT = yf(thr), pres = series('present'), past = series('past'), fill = '', seg = null;
    function segPath(s) { var d = 'M' + xf(s[0]).toFixed(1) + ' ' + yT.toFixed(1); for (var k = s[0]; k <= s[1]; k++) d += 'L' + xf(k).toFixed(1) + ' ' + yf(pres[k]).toFixed(1); return d + 'L' + xf(s[1]).toFixed(1) + ' ' + yT.toFixed(1) + 'Z'; }
    for (var i = 0; i < 365; i++) { if (pres[i] >= thr) { if (!seg) seg = [i, i]; else seg[1] = i; } else if (seg) { fill += segPath(seg); seg = null; } }
    if (seg) fill += segPath(seg);
    var tx = xf(tm.doy - 1), pl = lastExceed('past', thr), cl = lastExceed('present', thr);
    var grid = '';
    [0, 0.5, 1].forEach(function (f) { var v = b.lo + (b.hi - b.lo) * f, y = yf(v); grid += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '" stroke="rgba(217,238,238,.14)"/><text x="8" y="' + (y + 4).toFixed(1) + '" fill="#8ba0a8" font-size="11">' + Math.round(v) + '</text>'; });
    [['1월', 0], ['4월', 90], ['7월', 181], ['10월', 273]].forEach(function (t) { grid += '<text x="' + xf(t[1]).toFixed(1) + '" y="' + (H - 8) + '" fill="#8ba0a8" font-size="11" text-anchor="middle">' + t[0] + '</text>'; });
    svg.innerHTML = grid
      + '<path d="' + fill + '" fill="' + COLORS.present + '" fill-opacity="0.16"/>'
      + '<path d="' + path(past) + '" fill="none" stroke="' + COLORS.past + '" stroke-width="2" stroke-dasharray="5 4"/>'
      + '<path d="' + path(pres) + '" fill="none" stroke="' + COLORS.present + '" stroke-width="2.7"/>'
      + '<line x1="' + tx.toFixed(1) + '" y1="' + TP + '" x2="' + tx.toFixed(1) + '" y2="' + (H - BT) + '" stroke="' + COLORS.term + '" stroke-width="1.7" stroke-dasharray="4 3"/>'
      + '<text x="' + (tx + 5).toFixed(1) + '" y="' + (TP + 11) + '" fill="' + COLORS.term + '" font-size="11.5">' + tm.name + ' ' + tm.date + ' · 고정(천문)</text>'
      + '<line x1="' + L + '" y1="' + yT.toFixed(1) + '" x2="' + (W - R) + '" y2="' + yT.toFixed(1) + '" stroke="' + COLORS.threshold + '" stroke-width="2.2"/>'
      + '<rect x="' + (W - R - 96) + '" y="' + (yT - 11).toFixed(1) + '" width="96" height="20" rx="6" fill="' + COLORS.threshold + '"/>'
      + '<text x="' + (W - R - 48) + '" y="' + (yT + 3.5).toFixed(1) + '" fill="#20143a" font-size="12" font-weight="700" text-anchor="middle">' + mc.verb + ' ' + thr + mc.unit + '</text>'
      + (mc.showLast && pl >= 0 ? '<circle cx="' + xf(pl).toFixed(1) + '" cy="' + yT.toFixed(1) + '" r="4" fill="' + COLORS.past + '"/>' : '')
      + (mc.showLast && cl >= 0 ? '<circle cx="' + xf(cl).toFixed(1) + '" cy="' + yT.toFixed(1) + '" r="5.5" fill="' + COLORS.present + '" stroke="#2a0f0a" stroke-width="1"/>' : '');
    $('thrRange').min = hr.lo; $('thrRange').max = hr.hi; $('thrRange').step = 1; $('thrRange').value = thr;
    $('thrOut').textContent = thr + mc.unit;
    renderReadouts(thr, pl, cl);
    updateLiveSentence();
  }

  function liveSentence() {
    var n = stat(), mc = metricOf(), tm = term();
    if (mc.showLast && n.drift != null && n.drift > 0) return '<b>' + n.city + '</b>에서 ‘' + mc.verb + '’를 <b>' + n.thr + mc.unit + '</b>로 정하면, ' + mc.last + '이 과거보다 <b class="hot">' + n.drift + '일</b> 늦어졌습니다. <span class="cerl-tag">— ' + tm.name + ' 무렵 · 5년 관측 신호</span>';
    return '<b>' + n.city + '</b> · ‘' + mc.verb + ' ' + n.thr + mc.unit + '’ 기준 ' + mc.day + '은 과거 <b>' + n.pd + '일</b> → 현재 <b class="hot">' + n.cd + '일</b>입니다. <span class="cerl-tag">— 5년 관측 신호(30년 기후평년 아님)</span>';
  }
  function updateLiveSentence() { var el = $('freeCerl'); if (el) el.innerHTML = liveSentence(); }

  function stat() {
    var thr = state.thr, mc = metricOf();
    var pd = exceed('past', thr), cd = exceed('present', thr), pl = lastExceed('past', thr), cl = lastExceed('present', thr);
    return { thr: thr, city: state.city, pd: pd, cd: cd, dd: cd - pd, pl: pl, cl: cl, plStr: pl >= 0 ? dateStr(pl) : '없음', clStr: cl >= 0 ? dateStr(cl) : '없음', drift: (pl >= 0 && cl >= 0) ? cl - pl : null, mc: mc,
      driftFor: function (city) { var a = lastExceed('past', thr, city, 'temp'), b = lastExceed('present', thr, city, 'temp'); return (a >= 0 && b >= 0) ? b - a : null; } };
  }

  function renderReadouts(thr, pl, cl) {
    var el = $('readouts'); if (!el) return;
    var mc = metricOf(), pd = exceed('past', thr), cd = exceed('present', thr), dd = cd - pd;
    var cards = '<div class="readout"><div class="ro-k">기준 이상 ' + mc.day + ' (연중)</div><div class="ro-v"><span class="v-past">과거 ' + pd + '일</span> <i>→</i> <span class="v-now">현재 ' + cd + '일</span></div><div class="ro-s">' + (dd >= 0 ? '+' : '') + dd + '일 변화</div></div>';
    if (mc.showLast) {
      var ld = (pl >= 0 && cl >= 0) ? cl - pl : null;
      cards += '<div class="readout"><div class="ro-k">' + mc.last + ' (마지막 기준초과일)</div><div class="ro-v"><span class="v-past">' + (pl >= 0 ? dateStr(pl) : '없음') + '</span> <i>→</i> <span class="v-now">' + (cl >= 0 ? dateStr(cl) : '없음') + '</span></div><div class="ro-s">' + (ld == null ? '두 시기 모두 나타나면 시차를 계산합니다' : (ld >= 0 ? '+' : '') + ld + '일 늦게 그침') + '</div></div>';
    }
    el.innerHTML = cards;
  }

  /* ---------- 히어로 셸(조작 화면) ---------- */
  function heroShell(opts) {
    var mc = metricOf();
    var legend = '<div class="chart-legend" aria-hidden="true"><span><i class="lg lg-past"></i> 과거 1969–73</span><span><i class="lg lg-now"></i> 현재 2022–26</span><span><i class="lg lg-term"></i> 절기(고정)</span><span><i class="lg lg-thr"></i> 내가 정한 ‘' + mc.verb + '’</span></div>';
    var pickers = '';
    if (opts.cityChips) pickers += '<div class="picker-block"><span class="picker-label">지역</span><div class="chips" id="cityChips" role="tablist" aria-label="관측 지역"></div></div>';
    if (opts.termStrip) pickers += '<div class="picker-block"><span class="picker-label">절기 <small>(태양 위치로 정한 24개 천문 날짜)</small></span><div class="terms" id="termStrip" aria-label="절기 선택"></div></div>';
    if (opts.metricTabs) pickers += '<div class="picker-block"><span class="picker-label">지표</span><div class="metric-tabs" id="metricTabs" role="tablist" aria-label="지표 선택"></div></div>';
    return (pickers ? '<div class="picker">' + pickers + '</div>' : '')
      + '<div class="chart-card">' + legend
      + '<svg id="heroSvg" viewBox="0 0 720 340" role="img" aria-label="과거와 현재의 하루 관측 곡선, 고정된 절기 세로선, 드래그 가능한 기준선"></svg>'
      + '<div class="range-row"><span>‘' + mc.verb + '’ 기준을 위아래로 끌어 보세요</span><input id="thrRange" type="range" aria-label="기준값" /><output id="thrOut" aria-live="polite"></output></div></div>'
      + '<div class="readouts" id="readouts" aria-live="polite"></div>'
      + '<p class="integrity"><span aria-hidden="true">◈</span> 1969–73 vs 2022–26 · <b>5년 관측 신호</b>(30년 기후평년 아님) · 절기는 태양 위치로 정한 <b>천문 날짜</b>라 움직이지 않습니다</p>';
  }
  function bindCityChips() {
    var el = $('cityChips'); if (!el) return;
    el.innerHTML = CITIES.map(function (c) { return '<button class="chip' + (c === state.city ? ' is-on' : '') + '" role="tab" aria-selected="' + (c === state.city) + '" data-city="' + c + '"><b>' + c + '</b><small>' + (D.cities[c].type === 'city' ? '도시' : '도') + '</small></button>'; }).join('');
    el.querySelectorAll('[data-city]').forEach(function (btn) { btn.addEventListener('click', function () { state.city = btn.dataset.city; state.touched = true; save(); refreshChipsOn(el, 'city', btn.dataset.city); drawHero(); }); });
  }
  function bindCompareChips(list) {
    var el = $('cityChips'); if (!el) return;
    el.innerHTML = list.map(function (c) { return '<button class="chip' + (c === state.city ? ' is-on' : '') + '" role="tab" aria-selected="' + (c === state.city) + '" data-city="' + c + '"><b>' + c + '</b><small>' + (D.cities[c].type === 'city' ? '도시' : '도') + '</small></button>'; }).join('');
    el.querySelectorAll('[data-city]').forEach(function (btn) { btn.addEventListener('click', function () { state.city = btn.dataset.city; state.touched = true; save(); refreshChipsOn(el, 'city', btn.dataset.city); drawHero(); }); });
  }
  function bindTermStrip() {
    var el = $('termStrip'); if (!el) return;
    el.innerHTML = D.terms.map(function (t, i) { return '<button class="term-pill' + (i === state.ti ? ' is-on' : '') + '" data-term="' + i + '" aria-pressed="' + (i === state.ti) + '"><b>' + t.name + '</b><small>' + t.date + '</small></button>'; }).join('');
    el.querySelectorAll('[data-term]').forEach(function (btn) { btn.addEventListener('click', function () { state.ti = Number(btn.dataset.term); state.touched = true; save(); refreshChipsOn(el, 'term', btn.dataset.term); drawHero(); }); });
    var on = el.querySelector('.is-on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function bindMetricTabs() {
    var el = $('metricTabs'); if (!el) return;
    el.innerHTML = Object.keys(METRICS).map(function (k) { return '<button class="mtab' + (k === state.metric ? ' is-on' : '') + '" data-metric="' + k + '" role="tab" aria-selected="' + (k === state.metric) + '">' + METRICS[k].label + '</button>'; }).join('');
    el.querySelectorAll('[data-metric]').forEach(function (btn) { btn.addEventListener('click', function () { state.metric = btn.dataset.metric; state.thr = METRICS[state.metric].def; state.touched = true; save(); el.querySelectorAll('.mtab').forEach(function (x) { x.classList.toggle('is-on', x.dataset.metric === state.metric); x.setAttribute('aria-selected', x.dataset.metric === state.metric); }); drawHero(); }); });
  }
  function refreshChipsOn(el, kind, val) {
    el.querySelectorAll('button').forEach(function (b) { var on = b.dataset[kind] === val; b.classList.toggle('is-on', on); b.setAttribute(kind === 'city' ? 'aria-selected' : 'aria-pressed', on); });
  }
  function bindThreshold() {
    var svg = $('heroSvg'), dragging = false;
    function setY(clientY) { var r = svg.getBoundingClientRect(), vy = (clientY - r.top) / r.height * H, b = bounds(), hr = heatRange(b), v = b.hi - (vy - TP) / (H - TP - BT) * (b.hi - b.lo); state.thr = Math.max(hr.lo, Math.min(hr.hi, Math.round(v))); state.touched = true; save(); drawHero(); onTouched(); }
    svg.addEventListener('pointerdown', function (e) { dragging = true; try { svg.setPointerCapture(e.pointerId); } catch (x) {} setY(e.clientY); });
    svg.addEventListener('pointermove', function (e) { if (dragging) setY(e.clientY); });
    window.addEventListener('pointerup', function () { dragging = false; });
    $('thrRange').addEventListener('input', function () { state.thr = Number($('thrRange').value); state.touched = true; save(); drawHero(); onTouched(); });
  }
  var onTouched = function () {};

  /* ---------- 페이즈 렌더 ---------- */
  function setStage(html) { stage.innerHTML = html; renderProgress(); document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { $(b.dataset.close).close(); }); }); }

  function renderPre() {
    state.phase = 'pre'; save();
    var q = PRE_QUESTION;
    setStage('<section class="card pre-card"><p class="eyebrow">시작 전 · 생각 꺼내기</p><h1 class="stage-h">' + q.q + '</h1><p class="sub">정답을 맞히는 게 아니에요. 지금 생각을 기록해 두고, 검증이 끝나면 다시 확인합니다.</p><div class="choice-col" id="preChoices"></div></section>');
    $('preChoices').innerHTML = q.options.map(function (o) { return '<button class="choice-lg" data-v="' + o.v + '"><b>' + o.t + '</b><small>' + o.s + '</small></button>'; }).join('');
    $('preChoices').querySelectorAll('[data-v]').forEach(function (btn) { btn.addEventListener('click', function () { state.pre = btn.dataset.v; state.phase = 'mission'; state.mi = 0; save(); startMission(0); }); });
  }

  var HEADLINES = { chuseo: '처서의 약속은 아직 유효할까?', summer: '‘여름’은 며칠이 되었을까?', region: '이 변화, 우리 지역만 그럴까?' };
  var demoPlayed = false, demoTimer = null, overlayOpen = false;
  function stopDemo() { if (demoTimer) { clearInterval(demoTimer); demoTimer = null; } }

  function startMission(i) {
    var m = MISSIONS[i];
    state.phase = 'mission'; state.mi = i; state.city = m.city; state.ti = m.ti; state.metric = m.metric; state.thr = m.thr; state.touched = false; overlayOpen = false; save();
    renderExplore();
  }

  /* 첫 화면부터 히어로. 예측(선개념)은 텍스트 게이트가 아니라 첫 조작 직후 오버레이로 봉인한다. */
  function missionAsk(m) {
    return m.id === 'chuseo'
      ? { q: PRE_QUESTION.q, options: PRE_QUESTION.options, get: function () { return state.pre; }, set: function (v) { state.pre = v; } }
      : { q: m.predict.q, options: m.predict.options, get: function () { return state.predicts[m.id]; }, set: function (v) { state.predicts[m.id] = v; } };
  }
  function missionAsked(m) { return missionAsk(m).get() != null; }
  function updateGate(m) {
    var btn = $('toVerdict'), hint = $('touchHint'); if (!btn) return;
    btn.disabled = !(state.touched && missionAsked(m));
    hint.textContent = !state.touched ? '‘덥다’ 기준선을 위아래로 끌어 보세요.' : (!missionAsked(m) ? '예측을 봉인하면 판정할 수 있어요.' : '좋아요 — 준비되면 판정하세요.');
  }
  function showPredictOverlay(m) {
    var a = missionAsk(m), el = $('predictOverlay'); if (!el || overlayOpen || a.get() != null) return;
    overlayOpen = true; el.hidden = false;
    el.innerHTML = '<div class="po-inner"><p class="po-eyebrow">방금 만져 봤죠 · 예측 봉인</p><p class="po-q">' + a.q + '</p><div class="po-choices">' + a.options.map(function (o) { return '<button class="po-choice" data-v="' + o.v + '"><b>' + o.t + '</b>' + (o.s ? '<small>' + o.s + '</small>' : '') + '</button>'; }).join('') + '</div><p class="po-note">정답을 맞히는 게 아니에요. 지금 생각을 봉인해 두고, 검증이 끝나면 다시 확인합니다.</p></div>';
    el.querySelectorAll('[data-v]').forEach(function (btn) { btn.addEventListener('click', function () { a.set(btn.dataset.v); save(); overlayOpen = false; el.hidden = true; el.innerHTML = ''; updateGate(m); var t = $('toVerdict'); if (t) t.focus(); }); });
  }
  function autoDemo(m) {
    var svg = $('heroSvg'); if (!svg) return;
    var hr = heatRange(bounds()), start = hr.hi, end = m.thr, steps = 16, i = 0;
    state.thr = start; drawHero();
    demoTimer = setInterval(function () { i++; state.thr = Math.round(start + (end - start) * (i / steps)); drawHero(); if (i >= steps) { state.thr = end; drawHero(); stopDemo(); } }, 70);
  }

  function renderExplore() {
    var m = MISSIONS[state.mi], useCompare = !!m.compare;
    stopDemo(); overlayOpen = false;
    setStage('<section class="card explore-card">'
      + '<h1 class="hero-headline">' + (HEADLINES[m.id] || m.title) + '</h1>'
      + '<div class="mhead"><span class="mno">미션 ' + (state.mi + 1) + ' / 3</span><span class="goal-chip">' + m.goal + '</span></div>'
      + '<p class="hero-sub">' + m.task + '</p>'
      + heroShell({ cityChips: !m.lockCity || useCompare, termStrip: !m.lockTerm })
      + '<div class="explore-actions"><button class="primary-btn" id="toVerdict" disabled>이 결과로 판정하기 →</button><small id="touchHint">‘덥다’ 기준선을 위아래로 끌어 보세요.</small></div>'
      + '<div class="predict-overlay" id="predictOverlay" hidden></div>'
      + '</section>');
    if (useCompare) bindCompareChips(m.compare); else if (!m.lockCity) bindCityChips();
    if (!m.lockTerm) bindTermStrip();
    bindThreshold();
    drawHero();
    onTouched = function () { stopDemo(); if (!missionAsked(m)) showPredictOverlay(m); updateGate(m); };
    updateGate(m);
    $('toVerdict').addEventListener('click', function () { if (state.touched && missionAsked(m)) renderVerdict(); });
    if (!demoPlayed && state.mi === 0 && state.pre == null && !state.touched) { demoPlayed = true; setTimeout(function () { autoDemo(m); }, 450); }
  }

  function renderVerdict() {
    var m = MISSIONS[state.mi], n = stat();
    if (state.done.indexOf(m.id) === -1) state.done.push(m.id);
    save();
    var html = '<section class="card verdict-card"><h1 class="sr-only">미션 ' + (state.mi + 1) + ' 판정 — ' + m.title + '</h1><div class="mhead"><span class="mno">미션 ' + (state.mi + 1) + ' / 3 · 판정</span><span class="goal-chip">' + m.goal + '</span></div>'
      + '<p class="eyebrow">판정 (주장·근거·추론·한계)</p><p class="cerl">' + m.verdict(n) + '</p>'
      + '<div class="selfcheck" id="selfcheck"><p class="sc-q"><b>자가진단</b> — ' + m.selfCheck.q + '</p><div class="choice-row" id="scChoices"></div><p class="sc-explain" id="scExplain" hidden></p></div>';
    if (m.askPost) html += '<div class="post-box" id="postBox" hidden></div>';
    html += '<div class="mission-audit" id="missionAudit" hidden></div>';
    html += '<div class="verdict-actions" id="verdictActions" hidden></div></section>';
    setStage(html);
    var sc = m.selfCheck;
    $('scChoices').innerHTML = sc.options.map(function (o) { return '<button class="choice" data-v="' + o.v + '"><b>' + o.t + '</b></button>'; }).join('');
    $('scChoices').querySelectorAll('[data-v]').forEach(function (btn) { btn.addEventListener('click', function () { onSelfCheck(btn, sc, m); }); });
  }

  function onSelfCheck(btn, sc, m) {
    var right = btn.dataset.v === sc.correct;
    $('scChoices').querySelectorAll('[data-v]').forEach(function (b) { b.disabled = true; if (b.dataset.v === sc.correct) b.classList.add('is-right'); else if (b === btn) b.classList.add('is-wrong'); });
    var ex = $('scExplain'); ex.hidden = false; ex.innerHTML = (right ? '<b class="ok">맞아요.</b> ' : '<b class="no">다시 볼까요.</b> ') + sc.explain;
    if (m.askPost) renderPost(); else revealVerdictActions();
  }

  function renderPost() {
    var box = $('postBox'); box.hidden = false;
    box.innerHTML = '<p class="eyebrow">한 번 더 · 처음 생각과 비교</p><p class="sc-q">' + PRE_QUESTION.q + '</p><div class="choice-col" id="postChoices"></div><p class="post-growth" id="postGrowth" hidden></p>';
    $('postChoices').innerHTML = PRE_QUESTION.options.map(function (o) { return '<button class="choice-lg" data-v="' + o.v + '"><b>' + o.t + '</b></button>'; }).join('');
    $('postChoices').querySelectorAll('[data-v]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.post = btn.dataset.v; save();
        $('postChoices').querySelectorAll('[data-v]').forEach(function (b) { b.disabled = true; if (b.dataset.v === PRE_QUESTION.correct) b.classList.add('is-right'); else if (b === btn) b.classList.add('is-wrong'); });
        var g = $('postGrowth'); g.hidden = false;
        var preRight = state.pre === PRE_QUESTION.correct, postRight = state.post === PRE_QUESTION.correct;
        if (!preRight && postRight) g.innerHTML = '<b class="ok">생각이 자랐어요.</b> 처음엔 다른 답을 골랐는데, 이제 절기(천문 날짜)와 기후(관측)를 구분했습니다.';
        else if (postRight) g.innerHTML = '<b class="ok">정확합니다.</b> 절기 날짜는 그대로, 관측된 더위가 늦게까지 이어지는 것 — 처음부터 끝까지 일관되게 구분했습니다.';
        else g.innerHTML = '핵심은 이것이에요: <b>절기 날짜는 그대로인데</b>, 같은 절기 무렵 ‘덥다’ 기준을 넘는 날이 늦게까지 이어지는 것입니다. 절기 자체가 더워진 것이 아닙니다.';
        revealVerdictActions();
      });
    });
  }

  function buildDraftSeed(m) {
    var n = stat();
    if (m.id === 'region') { var a = n.driftFor('제주'), b = n.driftFor('강원'); return '처서 뒤 더위가 그치는 날의 시차는 제주 ' + (a == null ? '?' : (a >= 0 ? '+' + a : a)) + '일, 강원 ' + (b == null ? '?' : (b >= 0 ? '+' + b : b)) + '일로 지역마다 다르다. 그래서 한 지역 결과를 전국으로 넓혀 말하기는 어렵다.'; }
    return n.city + '에서 ‘덥다’를 ' + n.thr + '°C로 정하면 기준 이상 더위일이 과거 ' + n.pd + '일 → 현재 ' + n.cd + '일로 나타났다. 다만 이는 5년 관측 신호라 전국이나 원인으로 넓히기는 어렵다.';
  }
  function revealVerdictActions() {
    var m = MISSIONS[state.mi], au = $('missionAudit');
    if (au && au.hidden) {
      au.hidden = false;
      au.innerHTML = '<div class="judge-box"><p class="eyebrow">✦ AI 증거 감사관 (선택)</p><label class="draft-label" for="freeDraft">내 판정을 한 문장으로 <small>고쳐 써도 좋아요</small></label><textarea id="freeDraft" maxlength="400"></textarea><div class="ai-row"><button class="ai-btn" id="askAudit"><span aria-hidden="true">✦</span> AI 감사 요청</button><p class="audit-status" id="auditStatus">AI가 과장·범위·인과를 점검합니다. 꺼져 있어도 규칙 점검이 작동해요.</p></div><div class="audit-result" id="auditResult" hidden></div></div>';
      $('freeDraft').value = buildDraftSeed(m);
      $('askAudit').addEventListener('click', doAudit);
    }
    var acts = $('verdictActions'); acts.hidden = false;
    var next = state.mi + 1;
    if (next < MISSIONS.length) acts.innerHTML = '<button class="primary-btn" id="nextMission">다음 미션 →</button><button class="ghost-btn" id="retry">다시 조작</button>';
    else acts.innerHTML = '<button class="primary-btn" id="toFree">자유탐구 열기 ✦</button><button class="ghost-btn" id="retry">다시 조작</button>';
    if ($('nextMission')) $('nextMission').addEventListener('click', function () { startMission(next); });
    if ($('toFree')) $('toFree').addEventListener('click', function () { renderComplete(); });
    $('retry').addEventListener('click', renderExplore);
  }

  function renderComplete() {
    state.phase = 'free'; save();
    setStage('<section class="card done-card"><div class="burst" aria-hidden="true">✦</div><p class="eyebrow">3개 미션 완료</p><h1 class="stage-h">검증을 마쳤어요.</h1><p class="sub">당신은 절기(고정)와 기후(이동)를 구분하고, 기준을 정의하고, 자료의 범위를 지켜 판정했습니다.</p><div class="skill-row"><span>① 절기≠기후</span><span>② 자료의 범위</span><span>③ 기준 정의</span><span>④ 근거만큼 결론</span></div><button class="primary-btn" id="startFree">내 지역·지표로 자유탐구 →</button></section>');
    $('startFree').addEventListener('click', renderFree);
  }

  function renderFree() {
    state.phase = 'free'; save();
    setStage('<section class="card explore-card"><h1 class="sr-only">자유탐구 — 내 지역·절기·지표로 검증</h1><div class="mhead"><span class="mno">자유탐구</span><span class="goal-chip">내 지역 · 절기 · 지표를 자유롭게</span></div><p class="task">지역·절기·지표를 바꾸고 기준선을 끌어, 내 관심 주제를 직접 검증하세요. 모든 결론은 지역·기간·기준이 붙은 문장으로 말합니다.</p>'
      + heroShell({ cityChips: true, termStrip: true, metricTabs: true })
      + '<p class="cerl" id="freeCerl"></p>'
      + '<div class="judge-box"><label class="draft-label" for="freeDraft">내 판정문 <small>지역·기간·기준을 넣어 한 문장으로</small></label>'
      + '<textarea id="freeDraft" maxlength="400" placeholder="예: 서울에서 ‘덥다’를 25°C로 정하면, 처서 무렵 더위가 그치는 날이 과거보다 25일 늦어졌다. 다만 이는 5년 관측 신호로, 전국이나 원인으로 넓혀 말하기는 어렵다."></textarea>'
      + '<div class="ai-row"><button class="ai-btn" id="askAudit"><span aria-hidden="true">✦</span> AI 감사 요청</button><p class="audit-status" id="auditStatus">판정문을 쓰면 과장·범위·인과를 점검해 드려요. AI가 꺼져 있어도 규칙 점검이 작동합니다.</p></div>'
      + '<div class="audit-result" id="auditResult" hidden></div></div></section>');
    bindCityChips(); bindTermStrip(); bindMetricTabs(); bindThreshold();
    onTouched = function () {}; drawHero();
    var saved = state.freeDraft || ''; $('freeDraft').value = saved;
    $('freeDraft').addEventListener('input', function () { state.freeDraft = $('freeDraft').value.slice(0, 400); save(); });
    $('askAudit').addEventListener('click', doAudit);
  }

  /* ---------- AI 감사관 (+ 규칙기반 fallback) ---------- */
  function buildEvidence() {
    var n = stat(), mc = metricOf(), tm = term(), ev = [];
    ev.push({ id: 'E-1', statement: n.city + '의 ‘' + mc.verb + ' ' + n.thr + mc.unit + '’ 기준 ' + mc.day + '은 과거 ' + n.pd + '일, 현재 ' + n.cd + '일이다.', source: '기상청 ASOS 일자료(절기 기후평년)', period: '1969–1973 vs 2022–2026', kind: mc.label + ' · 기준 이상 일수' });
    if (mc.showLast && n.pl >= 0 && n.cl >= 0) ev.push({ id: 'E-2', statement: n.city + '의 ' + mc.last + '은 과거 ' + n.plStr + ', 현재 ' + n.clStr + '로 ' + n.drift + '일 늦어졌다.', source: '기상청 ASOS 일자료(절기 기후평년)', period: '1969–1973 vs 2022–2026', kind: tm.name + ' · 마지막 기준초과일' });
    else ev.push({ id: 'E-2', statement: '이 비교는 ' + n.city + '의 5년(1969–73 vs 2022–26) 관측 신호이며, 30년 기후평년이나 전국을 뜻하지 않는다.', source: '해석 범위', period: '5년 관측 비교', kind: '자료의 한계' });
    return ev;
  }
  function renderAudit(fb, viaLocal) {
    var el = $('auditResult'); el.hidden = false;
    var parts = '<div class="audit-head"><b>' + (viaLocal ? '증거 점검 (규칙 기반)' : '증거 감사관 (AI)') + '</b><span class="audit-badge ' + (fb.evidence_status || 'revise') + '">' + ({ ready: '근거 충분', revise: '보완 필요', insufficient: '근거 부족' }[fb.evidence_status] || '보완 필요') + '</span></div>';
    if (fb.feedback) parts += '<p>' + escapeHTML(fb.feedback) + '</p>';
    if (fb.overclaim_warning) parts += '<p class="audit-warn"><span aria-hidden="true">⚠</span> ' + escapeHTML(fb.overclaim_warning) + '</p>';
    if (fb.socratic_question) parts += '<p class="audit-q"><b>다음 질문</b> ' + escapeHTML(fb.socratic_question) + '</p>';
    el.innerHTML = parts;
  }
  function escapeHTML(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function localAudit(draft) {
    var n = stat(), t = draft;
    /* 부정(‘…하기 어렵다/없다/아니다’)이 붙은 범위·인과 언급은 한계 진술로 보고 칭찬한다 — 잘 쓴 결론을 오탐하지 않게. */
    var neg = '(어렵|어려우|없다|없이|없으|없음|아니|못\\s|못한|않|단정(할|하기)?\\s*(수\\s*)?없|말(할|하기)?\\s*수\\s*없|일반화(할|하기)?\\s*(수\\s*)?없|넓히기\\s*(는\\s*)?어렵)';
    var hasLimitation = new RegExp('(전국|전체|모든|전\\s*지역|원인|인과|일반화|넓)[^.!?]{0,20}' + neg).test(t);
    var overWord = /전국|모든\s*지역|우리나라\s*전체|한국\s*전체|전\s*지역|전세계|전 세계|어디(나|든)/.test(t);
    var causalWord = /기후변화가?\s*(원인|때문)|원인이(다|라|야)|이(것| 것)?이?\s*원인|탓(이다|으로|에)|초래|야기/.test(t);
    var overGeneral = overWord && !hasLimitation, causal = causalWord && !hasLimitation;
    var hasRegion = t.indexOf(n.city) !== -1 || /지역|서울|부산|인천|대구|광주|대전|제주|강릉|경기|충북|충남|전북|전남|경북|경남|강원/.test(t);
    var hasPeriod = /과거|현재|\d{4}|5년|기간|1969|2022/.test(t);
    var hasCriterion = /기준|°|℃|이상|\d\s*도|mm|%|더위|여름|습|비/.test(t);
    var fb = { evidence_status: 'ready' }, warns = [], missing = [];
    if (overGeneral) { warns.push('한 지역·5년 자료로 ‘전국/전체’까지 넓혀 말하고 있어요. 결론을 선택한 지역의 범위로 좁혀 보세요.'); fb.evidence_status = 'revise'; }
    if (causal) { warns.push('관측된 변화의 ‘원인’을 단정하고 있어요. 이 자료는 무엇이 함께 변했는지는 보여 줘도 원인을 증명하지는 않습니다.'); fb.evidence_status = 'revise'; }
    if (!hasRegion) missing.push('지역');
    if (!hasPeriod) missing.push('비교 기간(과거·현재)');
    if (!hasCriterion) missing.push('기준(‘덥다/여름’의 정의)');
    if (missing.length) { warns.push('결론에 ' + missing.join('·') + '이(가) 빠졌어요. 자료로 뒷받침되려면 이 요소가 문장에 있어야 합니다.'); if (fb.evidence_status === 'ready') fb.evidence_status = 'revise'; }
    fb.overclaim_warning = warns.join(' ');
    if (fb.evidence_status === 'ready') {
      fb.feedback = '좋아요. 지역·기간·기준이 문장에 들어 있어, 이 자료가 말할 수 있는 범위 안에서 판정했습니다.' + (hasLimitation ? ' 한계(전국·원인으로 넓히지 않음)까지 밝힌 점이 특히 좋습니다.' : '');
    } else {
      fb.feedback = '핵심 근거는 있지만, 아래를 보완하면 자료가 말하는 범위에 정확히 맞습니다.';
    }
    fb.socratic_question = overGeneral ? '이 결론을 다른 지역에서도 확인하려면 무엇을 비교해야 할까요?'
      : (causal ? '함께 변했다는 것과 원인이라는 것은 어떻게 다를까요?'
      : (hasLimitation ? '기준(‘덥다’ 온도)을 바꾸면 이 결론은 그대로 유지될까요?' : '이 결론이 다른 지역·다른 기준에서도 유지되는지 어떻게 확인할까요?'));
    return fb;
  }

  async function doAudit() {
    var draft = ($('freeDraft').value || '').trim(), btn = $('askAudit'), status = $('auditStatus');
    if (draft.replace(/\s/g, '').length < 12) { status.textContent = '판정문을 12자 이상 써 주세요 (지역·기간·기준 포함).'; $('freeDraft').focus(); return; }
    btn.disabled = true; status.textContent = 'AI 감사관에게 확인 중…';
    var payload = { case: { id: 'FREE', title: '자유탐구 판정', question: '선택한 지역·기간·기준으로 어디까지 말할 수 있는가?' }, verdict: 'free', draft: draft, evidence: buildEvidence() };
    try {
      var res = await fetch('/api/ai-turn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      var data = await res.json();
      if (!res.ok || !data.feedback) throw new Error('ai');
      renderAudit(data.feedback, false); status.textContent = 'AI 감사 완료 — 필요하면 판정문을 고쳐 다시 요청하세요.';
    } catch (e) {
      renderAudit(localAudit(draft), true); status.textContent = 'AI가 꺼져 있어 규칙 기반으로 점검했어요 — 동일한 항목(범위·과장·인과)을 확인합니다.';
    } finally { btn.disabled = false; }
  }

  /* ---------- 부팅 ---------- */
  $('openGuide').addEventListener('click', function () { $('guideDialog').showModal(); });
  $('homeLink').addEventListener('click', function (e) { e.preventDefault(); if (confirm('처음부터 다시 시작할까요? 진행 기록은 유지됩니다.')) { startMission(0); } });

  if (state.phase === 'free') renderFree();
  else { state.phase = 'mission'; state.mi = Math.min(Math.max(state.mi || 0, 0), MISSIONS.length - 1); renderExplore(); }
})();
