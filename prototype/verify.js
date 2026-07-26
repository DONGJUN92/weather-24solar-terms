(function () {
  'use strict';
  var D = window.SOLAR_DATA;
  var stage = document.getElementById('stage');
  if (!D || !D.cities) { stage.innerHTML = '<p class="load-fail">데이터를 불러오지 못했습니다. 새로고침해 주세요. (인터넷 연결을 확인해 주세요)</p>'; return; }

  /*
   * 절기의 약속 검증소 — 예측 봉인 → 기준선 조작 → CERL 판정.
   * 절기는 고정된 천문 날짜(움직이지 않는 세로선), 기후는 움직이는 곡선.
   * AI 없이 100% 동작하며, 결과 화면에 '무엇을 배웠는지'가 남는다.
   *
   * v4 (레드팀 반영):
   *  - 일수·마지막초과일은 평활 곡선이 아니라 사전계산된 '연도별 실측 통계'를 읽는다 (RC-A).
   *  - 비교 기간은 완결 5년(1969–73 vs 2021–25)이고 표본 수를 화면에 표기한다 (RC-C).
   *  - 경계값에서 침묵하거나 깨진 문장을 내지 않는다 (F-5).
   *  - 판정문에 한계(L) 절이 있고 4요소를 배지로 표시한다 (F-7).
   *  - 조작 결과 수치를 차트 위에 함께 둔다 (UX-2/F-8).
   *  - AI 감사 상자는 비어 있고, 실패 원인을 추측해 단정하지 않는다 (F-1, F-2).
   */
  var CITIES = Object.keys(D.cities);
  var COLORS = { past: '#a7bdc5', present: '#ff8066', term: '#ffbe58', threshold: '#caa8ff' };
  var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], CUM = [];
  (function () { var s = 0; for (var i = 0; i < 12; i++) { CUM.push(s); s += MONTH_DAYS[i]; } })();
  var REDUCE = false;
  try { REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var PERIOD_PAST = D.periods.past, PERIOD_NOW = D.periods.present;

  var METRICS = {
    temp: {
      key: 'temp', label: '기온', unit: '°C', verb: '덥다', basis: '하루 평균기온', day: '더위일', last: '더위가 그치는 날', showLast: true, def: 25,
      grid: [20, 34],
      presets: [{ v: 22, t: '22°C', s: '선선한 여름날' }, { v: 25, t: '25°C', s: '여름의 통상 기준' }, { v: 28, t: '28°C', s: '무더위' }],
      offGrid: { t: '폭염 33°C', s: '낮 최고기온 기준 — 이 자료로는 계산 불가' }
    },
    precip: {
      key: 'precip', label: '강수', unit: 'mm', verb: '비가 많다', basis: '하루 강수량', day: '비 온 날', last: null, showLast: false, def: 1,
      grid: [1, 80], coarse: true,
      presets: [{ v: 1, t: '1mm', s: '기상청 ‘비 온 날’ 기준' }, { v: 10, t: '10mm', s: '우산이 필요한 비' },
                { v: 30, t: '30mm', s: '하루 30mm 넘는 강한 비' }, { v: 50, t: '50mm', s: '하루 50mm 큰비' }]
    },
    humidity: {
      key: 'humidity', label: '습도', unit: '%', verb: '습하다', basis: '하루 평균습도', day: '습한 날', last: null, showLast: false, def: 70,
      grid: [55, 95],
      presets: [{ v: 60, t: '60%', s: '보통' }, { v: 70, t: '70%', s: '습함' }, { v: 80, t: '80%', s: '매우 습함' }]
    }
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

  /* 판정문은 {c 주장, e 근거, r 추론, l 한계} 4요소로 반환한다 (F-7). */
  var MISSIONS = [
    {
      id: 'chuseo', goal: '목표 ① 절기(천문 날짜) ≠ 기후(관측)',
      title: '처서, 약속은 유효한가',
      city: '서울', ti: 15, metric: 'temp', thr: 25, lockCity: true, lockTerm: true,
      brief: '처서(8/23)는 “더위가 그침”을 뜻합니다. 서울의 과거(' + PERIOD_PAST + ')와 현재(' + PERIOD_NOW + ')를 비교해, 이 약속이 아직 유효한지 검증하세요.',
      task: '그래프의 보라색 ‘덥다 기준선’을 위아래로 끌어(또는 아래 슬라이더·프리셋으로 정해), 과거와 현재의 ‘더위가 그치는 날’을 비교하세요.',
      verdict: function (n) {
        if (n.pl >= 0 && n.cl >= 0) return {
          c: '처서(더위가 그침)가 지나도 더위가 이어집니다.',
          e: n.city + '의 ‘덥다 ' + n.thr + '°C’ 기준으로, 더위가 그치는 날이 과거 <b>' + n.plStr + '</b> → 현재 <b class="hot">' + n.clStr + '</b>입니다.',
          r: '절기 날짜는 그대로인데, 관측된 더위가 <b class="hot">' + n.drift + '일</b> 늦게까지 이어진 것입니다.',
          l: n.city + ' 한 지역의 ' + n.sampleText + ' 관측 신호이고, ‘덥다’를 다른 온도로 정하면 이 날짜도 함께 바뀝니다 — 전국이나 그 원인까지 넓혀 말할 수는 없습니다.' + n.sensText
        };
        if (n.pl < 0 && n.cl >= 0) return {
          c: '이 기준에서는 과거에 ‘더위가 그치는 날’ 자체가 없었습니다.',
          e: n.city + '에서 ‘' + n.thr + '°C 이상’인 날은 과거 연평균 <b>' + n.pdStr + '</b>, 현재 <b class="hot">' + n.cdStr + '</b>입니다.',
          r: '과거에는 이 기준을 넘는 날이 거의 없어 시차를 계산할 수 없습니다. 두 시기를 <b>나란히</b> 비교하려면 기준선을 조금 낮춰 보세요.',
          l: '한쪽 시기에 값이 없으면 “몇 일 늦어졌다”고 말할 수 없습니다 — 비교 가능한 기준을 고르는 것도 자료를 다루는 일의 하나입니다.'
        };
        return {
          c: '이 기준으로는 과거·현재 모두 해당하는 날이 거의 없습니다.',
          e: n.city + '의 ‘' + n.thr + '°C 이상’ 날은 과거 <b>' + n.pdStr + '</b>, 현재 <b class="hot">' + n.cdStr + '</b>입니다.',
          r: '기준이 너무 높으면 두 시기 모두 0에 가까워져 비교할 것이 남지 않습니다. 기준선을 낮추면 비교가 시작됩니다.',
          l: '기준을 어디에 두는지가 결론을 바꿉니다 — 그래서 결론에는 반드시 기준을 함께 밝혀야 합니다.'
        };
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
      brief: '‘여름’을 “일평균 몇 °C 이상인 날”로 정하느냐에 따라 여름의 길이가 달라집니다. 기준을 바꿔 가며 과거와 현재의 여름 길이를 비교하세요.',
      /* RC-G: 미션1 자가진단('기준↑ → 일수↓')과 다른 축을 묻는다 — 직전 해설의 재인이 되지 않게 */
      predict: {
        q: '기준을 25°C에서 28°C로 올리면, 과거와 현재의 <b>격차</b>(현재 − 과거)는 어떻게 될까?',
        options: [{ v: 'wide', t: '격차가 커진다', s: '높은 기준일수록 차이가 두드러진다' }, { v: 'narrow', t: '격차가 작아진다', s: '둘 다 0에 가까워진다' }, { v: 'unknown', t: '잘 모르겠다', s: '직접 확인해 봅니다' }]
      },
      task: '기준선을 여러 높이로 옮겨, 과거·현재의 ‘기준 이상 더위일(=여름 길이)’이 얼마나 달라지는지 확인하세요. <b>지역 칩을 눌러 내 지역으로도 바꿔 볼 수 있어요.</b>',
      verdict: function (n) {
        if (n.pd < 0.5 && n.cd < 0.5) return {
          c: '이 기준으로는 여름이 과거·현재 모두 0일에 가깝습니다.',
          e: n.city + '에서 ‘여름 = ' + n.thr + '°C 이상’으로 정하면 과거 <b>' + n.pdStr + '</b>, 현재 <b class="hot">' + n.cdStr + '</b>입니다.',
          r: '기준을 높일수록 세어지는 날이 줄어든다는 것 자체가 이 미션의 답입니다 — 다만 여기서는 비교할 것이 남지 않으니 기준선을 25°C 쪽으로 내려 다시 판정해 보세요.',
          l: '‘여름’처럼 모호한 말은 기준을 정해야 자료가 됩니다. 기준을 잘못 고르면 자료가 아무 말도 하지 못합니다.'
        };
        if (n.pd < 0.5 && n.cd >= 0.5) return {
          c: '이 기준에서는 과거에 여름이 거의 없었습니다.',
          e: n.city + '에서 ‘여름 = ' + n.thr + '°C 이상’으로 정하면 과거 <b>' + n.pdStr + '</b>, 현재 <b class="hot">' + n.cdStr + '</b>입니다.',
          r: '과거가 0에 가까우면 <b>몇 배 늘었다</b>고는 말할 수 없습니다. 늘어난 <b>일수</b>(+' + n.ddStr + ')로만 말하고, 기준을 낮춰 두 시기를 함께 비교해 보세요.',
          l: '분모가 0에 가까운 비율은 과장을 만듭니다 — 배수 대신 차이로 말하는 것이 자료에 맞습니다.' + n.sensText
        };
        return {
          c: '‘여름’의 길이는 내가 정한 기준에 따라 달라집니다.',
          e: n.city + '에서 ‘여름 = ' + n.thr + '°C 이상’으로 정하면 여름은 과거 <b>' + n.pdStr + '</b> → 현재 <b class="hot">' + n.cdStr + '</b>(<b class="hot">' + n.ddStr + '</b>)입니다.',
          r: '기준을 바꾸면 이 숫자도 함께 바뀝니다 — 같은 자료로 다른 결론이 나올 수 있습니다.',
          l: '그래서 “여름이 길어졌다”고 말하려면 <b>어떤 기준</b>으로 <b>어느 지역</b>의 <b>어느 기간</b>을 비교했는지를 반드시 함께 밝혀야 합니다(여기서는 ' + n.city + ' · ' + n.sampleText + ').' + n.sensText
        };
      },
      selfCheck: {
        q: '“여름이 길어졌다”고 자료로 말하려면, 반드시 함께 밝혀야 하는 것은?',
        options: [{ v: 'crit', t: '기준 온도와 비교 기간' }, { v: 'feel', t: '체감온도만 밝히면 된다' }, { v: 'none', t: '작년과 올해만 비교하면 된다' }], correct: 'crit',
        explain: '“여름”, “덥다” 같은 말은 기준을 정해야 자료가 됩니다. 기준 온도와 비교 기간(지역·지표)이 빠지면 같은 자료로도 다른 결론이 나옵니다.'
      }
    },
    {
      id: 'region', goal: '목표 ② 자료의 범위(지역·기간·지표) 읽기',
      title: '우리 지역만 그럴까',
      city: '제주', ti: 15, metric: 'temp', thr: 25, lockCity: false, lockTerm: true, compare: ['제주', '강원'],
      brief: '한 지역에서 더위가 길어졌다고, 전국이 똑같이 변했을까요? 남쪽 제주와 산간 강원(춘천)을 번갈아 보며 반증해 보세요.',
      predict: {
        q: '제주와 강원(춘천), 두 지역의 ‘더위가 그치는 날’은?',
        options: [{ v: 'same', t: '날짜도 변화도 거의 같을 것이다', s: '' }, { v: 'diff', t: '지역마다 다를 것이다', s: '' }, { v: 'unknown', t: '잘 모르겠다', s: '' }]
      },
      task: '제주 칩과 강원 칩을 번갈아 눌러, 처서 뒤 ‘더위가 그치는 날’이 지역마다 어떻게 다른지 비교하세요.',
      verdict: function (n) {
        var A = n.regionOf('제주'), B = n.regionOf('강원');
        if (A.drift == null || B.drift == null) {
          var who = (A.drift == null ? '제주' : '') + (A.drift == null && B.drift == null ? '·' : '') + (B.drift == null ? '강원' : '');
          return {
            c: '이 기준에서는 두 지역을 나란히 비교할 수 없습니다.',
            e: '‘' + n.thr + '°C 이상’ 기준에서 ' + who + eunNeun(who) + ' 두 시기 중 한쪽에 기준을 넘은 날이 없습니다.',
            r: '한쪽에 값이 없으면 시차를 계산할 수 없습니다. 기준을 <b>26°C 이하</b>로 낮추면 두 지역을 함께 볼 수 있어요.',
            l: '비교가 성립하는 기준을 고르는 일 자체가 자료를 다루는 능력입니다.'
          };
        }
        var gap = Math.abs(A.drift - B.drift);
        var same = gap < 5;
        return {
          c: same ? '시차의 크기는 비슷하지만, 여름이 끝나는 날짜 자체는 지역마다 다릅니다.'
                  : '같은 절기·같은 기준인데도 변화의 크기가 지역마다 다릅니다.',
          e: '제주는 ' + A.pStr + ' → <b class="hot">' + A.cStr + '</b>(' + A.driftStr + '), 강원(춘천)은 ' + B.pStr + ' → <b class="hot">' + B.cStr + '</b>(' + B.driftStr + ')입니다.',
          r: same
            ? '시차는 <b>' + A.driftStr + '</b>와 <b>' + B.driftStr + '</b>로 비슷하지만, 더위가 그치는 <b>날짜</b>는 제주 ' + A.cStr + ', 강원 ' + B.cStr + '로 약 <b>' + Math.abs(A.c - B.c) + '일</b> 차이입니다.'
            : '시차의 크기가 <b>' + A.driftStr + '</b>와 <b>' + B.driftStr + '</b>로 <b>' + gap + '일</b> 다릅니다.',
          l: '그러므로 한 지역(예: 서울)의 결과만으로 “전국의 계절이 똑같이 변했다”고 넓혀 말할 수 없습니다. 또한 ‘제주’는 제주 관측소, ‘강원’은 춘천 관측소 <b>한 지점</b>의 기록이므로 도 전체를 대표하지도 않습니다.'
        };
      },
      selfCheck: {
        q: '서울 한 지역의 자료만으로 “전국의 계절이 똑같이 변했다”고 말할 수 있을까?',
        options: [{ v: 'no', t: '말할 수 없다' }, { v: 'yes', t: '말할 수 있다' }, { v: 'part', t: '평균만 내면 말할 수 있다' }], correct: 'no',
        explain: '한 지역의 신호는 그 지역의 범위 안에서만 유효합니다. 전국을 말하려면 여러 지역을 함께 비교해야 하고, 지점 하나가 도 전체를 대표하지도 않습니다.'
      }
    }
  ];

  /* RC-N: 앞의 세 미션과 다른 과학적 대상 — 강수의 '양'이 아니라 '강도 분포'.
     같은 자료가 기준을 어디에 두느냐에 따라 정반대 결론을 낸다는 것을 실측으로 보여 준다. */
  MISSIONS.push({
    id: 'rain', goal: '목표 ③④ 같은 자료, 반대 결론 — 강수는 ‘얼마나 자주’와 ‘얼마나 세게’가 다르다',
    title: '비는 줄었을까 늘었을까',
    city: '서울', ti: 12, metric: 'precip', thr: 1, lockCity: false, lockTerm: true,
    brief: '“요즘 비가 줄었다”와 “요즘 물난리가 잦다”는 둘 다 자주 듣는 말입니다. 하나의 강수 자료로 두 말이 동시에 맞을 수 있는지, 기준을 바꿔 가며 확인하세요.',
    task: '아래 프리셋을 <b>1mm → 10mm → 30mm → 50mm</b> 순서로 눌러, 변화의 <b>방향이 어디서 뒤집히는지</b> 찾아보세요.',
    predict: {
      q: '‘비 온 날(1mm 이상)’과 ‘하루 50mm 넘는 큰비’는 같은 방향으로 변했을까?',
      options: [{ v: 'same', t: '둘 다 같은 방향으로 변했다', s: '비는 비다' },
                { v: 'flip', t: '방향이 서로 다를 것이다', s: '약한 비와 강한 비는 다르다' },
                { v: 'unknown', t: '잘 모르겠다', s: '직접 확인해 봅니다' }]
    },
    verdict: function (n) {
      var lo = rainAt(n.city, 1), hi = rainAt(n.city, 50), cur = rainAt(n.city, n.thr);
      var nat = rainNationwide();
      var flipped = lo.d < 0 && hi.d > 0;
      return {
        c: flipped
          ? '‘비가 줄었다’와 ‘큰비가 늘었다’가 <b>동시에 참</b>일 수 있습니다.'
          : '같은 강수 자료라도 어떤 기준으로 세느냐에 따라 변화의 크기와 방향이 달라집니다.',
        e: n.city + '(' + cityOf(n.city).station + ' 관측소)에서 <b>비 온 날(1mm 이상)</b>은 연평균 <b>' + lo.p + '일 → ' + lo.c + '일</b>(' + lo.dStr + '), '
           + '<b>하루 50mm 넘는 큰비</b>는 <b class="hot">' + hi.p + '일 → ' + hi.c + '일</b>(' + hi.dStr + ')입니다.'
           + (n.thr !== 1 && n.thr !== 50 ? ' 지금 고른 ' + n.thr + 'mm 기준으로는 ' + cur.p + '일 → ' + cur.c + '일(' + cur.dStr + ')입니다.' : ''),
        r: flipped
          ? '비의 <b>횟수</b>는 줄었는데 <b>한 번의 세기</b>는 커졌습니다. 전국 16지점을 합쳐 보아도 1mm 이상은 <b>' + nat.lo + '</b>, 50mm 이상은 <b class="hot">' + nat.hi + '</b>로 같은 방향이 나타납니다 — 그래서 “비가 줄었다”만 말하면 물난리가 왜 잦아지는지 설명할 수 없습니다.'
          : n.city + '에서는 방향이 뚜렷하게 갈리지 않습니다. 다만 전국 16지점 합계로는 1mm 이상 <b>' + nat.lo + '</b>, 50mm 이상 <b class="hot">' + nat.hi + '</b>로 갈립니다 — 지역마다 다르다는 것 또한 자료가 말해 주는 사실입니다.',
        l: '이 값은 ' + n.sampleText + '의 관측 신호이고, 하루 강수량만으로 셌기 때문에 <b>같은 하루 안에 몇 시간 만에 쏟아졌는지</b>는 알 수 없습니다. 호우특보는 3시간·12시간 강우량으로 정하므로 이 화면의 일강수량과는 기준이 다릅니다.'
      };
    },
    selfCheck: {
      q: '“요즘 비가 줄었다”는 뉴스와 “물난리가 잦아졌다”는 뉴스가 함께 나올 때, 가장 정확한 판단은?',
      options: [{ v: 'both', t: '둘 중 하나는 틀렸다' }, { v: 'ok', t: '기준이 다르면 둘 다 맞을 수 있다' }, { v: 'no', t: '비는 하나이므로 함께 성립할 수 없다' }],
      correct: 'ok',
      explain: '강수는 ‘며칠 왔는가’와 ‘한 번에 얼마나 왔는가’가 서로 다른 지표입니다. 실제 관측에서도 비 온 날은 줄고 큰비의 날은 늘었습니다 — 그래서 강수 이야기는 반드시 <b>어떤 기준으로 셌는지</b>를 함께 말해야 합니다.'
    }
  });

  /* 미션4 계산 보조 — 화면에 나온 실측값만 사용한다 */
  function rainAt(city, thr) {
    var g = cityOf(city).precip.exceedDays, p = g.past[String(thr)], c = g.present[String(thr)];
    p = p == null ? 0 : p; c = c == null ? 0 : c;
    var d = Math.round((c - p) * 10) / 10;
    return { p: fmtNum(p), c: fmtNum(c), d: d, dStr: (d > 0 ? '+' : '') + fmtNum(d) + '일' };
  }
  function rainNationwide() {
    function sum(thr, k) { var t = 0; CITIES.forEach(function (c) { var v = cityOf(c).precip.exceedDays[k][String(thr)]; t += (v == null ? 0 : v); }); return t; }
    function part(thr) {
      var p = sum(thr, 'past'), c = sum(thr, 'present'), d = c - p;
      return fmtNum(p) + '일 → ' + fmtNum(c) + '일(' + (d > 0 ? '+' : '') + fmtNum(d) + '일, ' + (d > 0 ? '+' : '') + Math.round(d / p * 100) + '%)';
    }
    return { lo: part(1), hi: part(50) };
  }
  function fmtNum(v) { return String(Math.round(v * 10) / 10); }

  /* ── 미션 5: 계절 지연 ──────────────────────────────────────
     기존 네 미션이 모두 '세로(임계값)' 조작이라면, 이 미션은 '가로(날짜)' 조작이다.
     학습자가 가장 더울 것 같은 날을 직접 찍고 실제 극값일과 비교한다. */
  MISSIONS.push({
    id: 'lag', goal: '목표 ① 절기가 어긋나 보이는 또 하나의 이유 — 계절 지연',
    title: '가장 더운 날은 언제일까',
    city: '서울', ti: 11, metric: 'temp', thr: 25, lockCity: false, lockTerm: true, lagMode: true,
    brief: '낮이 가장 긴 날은 하지(6/21)입니다. 태양이 가장 높이 뜨는 날이죠. 그런데 우리가 가장 더위를 느끼는 날도 그날일까요? 직접 찍어서 확인해 보세요.',
    task: '그래프 위에서 <b>가장 더울 것 같은 날</b>을 좌우로 끌어 찍어 보세요. 실제 기록과 비교해 드립니다.',
    predict: {
      q: '낮이 가장 긴 날(하지, 6월 21일)이 1년 중 가장 더운 날일까?',
      options: [
        { v: 'same', t: '하지가 가장 덥다', s: '해가 가장 높으니까' },
        { v: 'later', t: '하지보다 나중이 더 덥다', s: '데워지는 데 시간이 걸린다' },
        { v: 'unknown', t: '잘 모르겠다', s: '직접 찍어 봅니다' }
      ]
    },
    verdict: function (n) {
      var L = lagOf(n.city), season = state.lagSeason === 'winter' ? 'winter' : 'summer';
      var isS = season === 'summer';
      var solDoy = isS ? L.solstice.summer : L.solstice.winter;
      var solName = isS ? '하지' : '동지';
      var actDoy = isS ? L.present.hotDoy : L.present.coldDoy;
      var lag = isS ? L.present.hotLag : L.present.coldLag;
      var temp = isS ? L.present.hotT : L.present.coldT;
      var nat = lagNationwide(season);
      var guess = state.markDoy || actDoy;
      var off = Math.abs(guess - actDoy);
      return {
        c: isS
          ? '가장 더운 날은 하지가 아니라, 하지보다 <b class="hot">약 ' + lag + '일 뒤</b>입니다.'
          : '가장 추운 날은 동지가 아니라, 동지보다 <b class="hot">약 ' + lag + '일 뒤</b>입니다.',
        e: n.city + '(' + cityOf(n.city).station + ' 관측소)에서 ' + solName + '은 <b>' + doyStr(solDoy) + '</b>인데, '
           + '실제로 ' + (isS ? '가장 더운' : '가장 추운') + ' 날은 <b class="hot">' + doyStr(actDoy) + '</b>(' + temp + '°C)입니다.'
           + (off <= 5 ? ' 당신이 찍은 <b>' + doyStr(guess) + '</b>과 ' + off + '일 차이 — 잘 짚었습니다.'
                       : ' 당신은 <b>' + doyStr(guess) + '</b>을 찍었고, 실제와 ' + off + '일 차이가 납니다.'),
        r: isS
          ? '해가 가장 높이 떠도 땅과 바다가 <b>데워지는 데 시간이 걸립니다</b>(열관성). 하지 뒤에도 들어오는 열이 나가는 열보다 많은 동안 기온은 계속 오릅니다. '
            + '전국 16지점에서 이 지연은 <b>' + nat.min + '~' + nat.max + '일</b>로 거의 같습니다 — 지역을 가리지 않는 <b>물리 현상</b>이라는 뜻입니다.'
          : '겨울 지연은 지역마다 크게 다릅니다 — 전국 <b>' + nat.min + '~' + nat.max + '일</b>. '
            + '바다는 천천히 식기 때문에 <b>해안(평균 ' + nat.coast + '일)이 내륙(평균 ' + nat.inland + '일)보다 훨씬 늦게</b> 가장 추워집니다. 미션 3의 “지역마다 다르다”에는 이런 물리적 이유가 있습니다.',
        l: '<b>이 지연은 기후변화가 아닙니다.</b> 과거(' + PERIOD_PAST + ')에도 지연은 ' + (isS ? L.past.hotLag : L.past.coldLag) + '일이었고, 16지점 평균으로 거의 변하지 않았습니다. '
           + '반면 같은 기간 ' + n.city + '의 더위일은 ' + fmtDays(exceed('past', 25, n.city, 'temp')) + ' → ' + fmtDays(exceed('present', 25, n.city, 'temp')) + '로 늘었습니다. '
           + '<b>절기가 어긋나 보이는 데에는 두 가지 이유가 있고, 그 둘을 섞어 말하면 안 됩니다</b> — 늘 있던 계절 지연과, 관측된 온난화 신호.'
      };
    },
    selfCheck: {
      q: '“처서(8/23)가 지났는데도 덥다”의 이유로 <b>맞는 것을 모두 고르면</b>? (가장 정확한 설명 하나를 고르세요)',
      options: [
        { v: 'both', t: '원래 늦게까지 더운 데다(계절 지연), 최근 더위가 더 길어졌다' },
        { v: 'onlyclimate', t: '전부 기후변화 때문이다' },
        { v: 'onlylag', t: '전부 계절 지연 때문이고 기후변화와 무관하다' }
      ],
      correct: 'both',
      explain: '두 가지가 함께 작용합니다. <b>계절 지연</b>은 예전에도 있던 물리 현상이라 “원래 처서 무렵은 덥다”가 맞고, 동시에 <b>관측된 더위일 증가</b>는 최근의 변화입니다. 한쪽만 말하면 절반만 맞는 설명이 됩니다.'
    }
  });

  function lagOf(city) { return cityOf(city).seasonalLag; }
  var COASTAL = { '제주': 1, '전남': 1, '부산': 1, '강릉': 1, '인천': 1, '충남': 1, '경북': 1 };
  function lagNationwide(season) {
    var isS = season === 'summer', all = [], coast = [], inland = [];
    CITIES.forEach(function (c) {
      var L = lagOf(c); if (!L) return;
      var v = isS ? L.present.hotLag : L.present.coldLag;
      all.push(v); (COASTAL[c] ? coast : inland).push(v);
    });
    function avg(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : 0; }
    return { min: Math.min.apply(null, all), max: Math.max.apply(null, all), avg: avg(all), coast: avg(coast), inland: avg(inland) };
  }

  var state = load();

  function $(id) { return document.getElementById(id); }
  function term(ti) { var t = D.terms[ti == null ? state.ti : ti]; return t || D.terms[15]; }
  function metricOf() { return METRICS[state.metric] || METRICS.temp; }
  /* 강수는 기준에 따라 부르는 이름이 달라야 한다 — 50mm를 '비 온 날'이라 부르지 않는다 */
  function dayLabel(thr) {
    var mc = metricOf(), t = thr == null ? state.thr : thr;
    if (mc.key !== 'precip') return mc.day;
    if (t <= 1) return '비 온 날';
    if (t < 10) return t + 'mm 넘는 날';
    if (t < 30) return t + 'mm 넘는 제법 큰 비';
    return t + 'mm 넘는 큰비';
  }
  function cityOf(c) { return D.cities[c || state.city] || D.cities[CITIES[0]]; }
  function series(period, city, metric) { return cityOf(city)[metric || state.metric][period]; }
  function doyStr(doy1) { var d = Math.max(0, Math.min(364, doy1 - 1)), m = 0; while (m < 11 && d >= CUM[m + 1]) m++; return (m + 1) + '월 ' + (d - CUM[m] + 1) + '일'; }
  function fmtDays(v) { return (Math.round(v * 10) / 10).toFixed(v < 10 ? 1 : 0).replace(/\.0$/, '') + '일'; }

  /* ---------- 실측 통계 접근 (RC-A) ---------- */
  function exceed(period, thr, city, metric) {
    var m = cityOf(city)[metric || state.metric], g = m.exceedDays && m.exceedDays[period];
    var v = g ? g[String(thr)] : null;
    return v == null ? 0 : v;                                   // 연평균 일수
  }
  function lastInfo(period, thr, city, metric) {
    var m = cityOf(city)[metric || state.metric];
    if (!m.lastDoy || !m.lastDoy[period]) return null;
    return m.lastDoy[period][String(thr)] || null;              // [연평균 doy, 해당 연도 수]
  }
  function lastExceed(period, thr, city, metric) { var i = lastInfo(period, thr, city, metric); return i ? i[0] : -1; }
  function yearsOf(city) { var y = cityOf(city).years || {}; return { past: y.past || [], present: y.present || [] }; }
  function sampleText(city) {
    var y = yearsOf(city);
    return '과거 ' + y.past.length + '년(' + PERIOD_PAST + ') vs 현재 ' + y.present.length + '년(' + PERIOD_NOW + ')';
  }
  function sensitivityText(city) {
    var s = cityOf(city).sensitivity;
    if (!s || state.metric !== 'temp' || state.thr !== s.thr) return '';
    return ' 참고로 같은 기준(' + s.thr + '°C)에서 비교하는 5년 창을 옮겨 보면 시차는 <b>' + fmt1(s.min) + '~' + fmt1(s.max) + '일</b> 사이에서 움직이고, ' + s.longYears + '년(' + s.longSpan.join('–') + ')으로 보면 <b>' + fmt1(s.long) + '일</b>입니다.';
  }
  function fmt1(v) { return (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10); }
  /* 한국어 조사 — '강원은(는)' 같은 표기를 피한다 */
  function hasJong(w) { var ch = String(w).charCodeAt(String(w).length - 1); return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0; }
  function eunNeun(w) { return hasJong(w) ? '은' : '는'; }

  function load() {
    var base = { phase: 'intro', mi: 0, city: '서울', ti: 15, thr: 25, thr0: 25, metric: 'temp', pre: null, post: null,
                 predicts: {}, done: [], touched: false, moved: false, missionDraft: {}, selfChecks: {}, freeDraft: '', zoom: false, view: 'chart', markDoy: null, lagSeason: 'summer', winI: null };
    try {
      var s = JSON.parse(localStorage.getItem('weather24_verify_v3'));
      if (s && typeof s === 'object') {
        var o = Object.assign(base, s);
        /* 저장된 값이 현재 스키마를 벗어나면 기본값으로 되돌린다 (RC-R) */
        if (['intro', 'tutorial', 'terms', 'mission', 'verdict', 'complete', 'free'].indexOf(o.phase) === -1) o.phase = 'intro';
        if (CITIES.indexOf(o.city) === -1) o.city = base.city;
        if (!METRICS[o.metric]) o.metric = base.metric;
        if (!(o.ti >= 0 && o.ti < D.terms.length)) o.ti = base.ti;
        if (!isFinite(o.thr)) o.thr = base.thr;
        o.mi = Math.min(Math.max(Number(o.mi) || 0, 0), MISSIONS.length - 1);
        if (!o.missionDraft || typeof o.missionDraft !== 'object') o.missionDraft = {};
        if (!o.selfChecks || typeof o.selfChecks !== 'object') o.selfChecks = {};
        if (o.view !== 'table' && o.view !== 'map') o.view = 'chart';
        if (o.lagSeason !== 'winter') o.lagSeason = 'summer';
        if (!(o.markDoy >= 1 && o.markDoy <= 365)) o.markDoy = null;
        if (!(typeof o.winI === 'number' && o.winI >= 0 && o.winI < 60)) o.winI = null;
        o.zoom = !!o.zoom;
        return o;
      }
    } catch (e) {}
    return base;
  }
  function save() { try { localStorage.setItem('weather24_verify_v3', JSON.stringify(state)); } catch (e) {} }

  /* 상태 딥링크 — 교사가 '이 화면'을 그대로 배부하고, 모둠끼리 설정을 비교할 수 있게 한다. */
  function stateHash() {
    return '#c=' + encodeURIComponent(state.city) + '&m=' + state.metric + '&t=' + state.thr + '&s=' + state.ti
      + (state.phase === 'free' ? '&v=free' : (state.phase === 'mission' ? '&v=m' + state.mi : ''));
  }
  function applyHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) return false;
    var q = {};
    h.split('&').forEach(function (kv) { var a = kv.split('='); if (a[0]) q[a[0]] = decodeURIComponent(a[1] || ''); });
    var touched = false;
    if (q.c && CITIES.indexOf(q.c) !== -1) { state.city = q.c; touched = true; }
    if (q.m && METRICS[q.m]) { state.metric = q.m; touched = true; }
    if (q.s != null && q.s !== '' && isFinite(q.s) && q.s >= 0 && q.s < D.terms.length) { state.ti = Number(q.s); touched = true; }
    if (q.t != null && q.t !== '' && isFinite(q.t)) { state.thr = Number(q.t); touched = true; }
    if (q.v === 'free') { state.phase = 'free'; touched = true; }
    else if (/^m[0-9]+$/.test(q.v || '')) {
      var i = Number(q.v.slice(1));
      if (i >= 0 && i < MISSIONS.length) { state.phase = 'mission'; state.mi = i; touched = true; }
    }
    if (touched) { clampThr(); save(); }
    return touched;
  }
  function copyLink(btn) {
    var url = location.origin + location.pathname + stateHash();
    function done(msg) { var t = btn.textContent; btn.textContent = msg; setTimeout(function () { btn.textContent = t; }, 1800); }
    try {
      navigator.clipboard.writeText(url).then(function () { done('링크 복사됨 ✓'); }, function () { prompt('이 링크를 복사하세요', url); });
    } catch (e) { prompt('이 링크를 복사하세요', url); }
  }

  /* y축은 기본적으로 연간 곡선 전체를 보여준다(계절 곡선의 형태가 학습 내용이므로 자르지 않는다).
     '기준 구간 확대'를 켜면 기준선 주변으로 축을 좁혀 드래그 해상도를 크게 올린다 (UX-1). */
  function fullBounds(city, metric) {
    var all = series('past', city, metric).concat(series('present', city, metric));
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pad = (hi - lo) * 0.08 || 1;
    return { lo: lo - pad, hi: hi + pad };
  }
  function bounds(city, metric) {
    var b = fullBounds(city, metric);
    /* 기준선이 축 밖으로 나가면 슬라이더를 끌어도 화면이 멈춘 것처럼 보인다.
       강수는 일별 평년값(하루 평균)이 20mm를 넘지 않는데 기준은 80mm까지 열려 있어
       서울 기준 80칸 중 61칸에서 기준선이 사라졌다. 곡선이 눌리더라도 기준선을
       축 안에 붙잡아 둔다 — 조작에 화면이 반응한다는 사실이 먼저다. */
    if ((metric || state.metric) === state.metric && isFinite(state.thr)) {
      var mg = Math.max(0.5, (b.hi - b.lo) * 0.10);
      if (state.thr > b.hi - mg) b = { lo: b.lo, hi: state.thr + mg };
      if (state.thr < b.lo + mg) b = { lo: state.thr - mg, hi: b.hi };
    }
    if (!state.zoom) return b;
    var hr = heatRange(city, metric), span = hr.hi - hr.lo, pad = Math.max(0.5, span * 0.10);
    return { lo: Math.max(b.lo, hr.lo - pad), hi: Math.min(b.hi, hr.hi + pad) };
  }
  /* 슬라이더 범위는 '데이터가 있는 구간'으로 잘라 죽은 칸을 없앤다 (UX-1).
     상한 = 현재 시기에 연평균 1일 이상 나타나는 마지막 기준 + 1 */
  function heatRange(city, metric) {
    var mc = METRICS[metric || state.metric] || METRICS.temp, lo = mc.grid[0], gmax = mc.grid[1], hi = lo + 4;
    var floor = mc.coarse ? 2 : 1;
    for (var t = lo; t <= gmax; t++) if (exceed('present', t, city, metric) >= floor) hi = t;
    hi = Math.min(gmax, hi + (mc.coarse ? 6 : 1));
    return { lo: lo, hi: Math.max(lo + 4, hi) };
  }
  function clampThr() {
    var hr = heatRange();
    if (!isFinite(state.thr)) state.thr = metricOf().def;
    state.thr = Math.max(hr.lo, Math.min(hr.hi, Math.round(state.thr)));
    return hr;
  }

  /* ---------- 진행 표시 (완료 단계 재방문 가능 · UX-6) ---------- */
  function renderProgress() {
    var html = MISSIONS.map(function (m, i) {
      var done = state.done.indexOf(m.id) !== -1;
      var st = done ? 'done' : (state.phase === 'mission' && state.mi === i ? 'on' : '');
      var tag = done ? 'button' : 'span';
      var attr = done ? ' type="button" data-goto="' + i + '" title="' + m.title + ' 다시 보기"' : '';
      return '<' + tag + ' class="pstep ' + st + '"' + attr + '><i>' + (done ? '✓' : i + 1) + '</i><small>' + m.title + '</small></' + tag + '>';
    }).join('<span class="pline" aria-hidden="true"></span>');
    var freeOn = (state.phase === 'free' || state.phase === 'complete') ? ' on' : '';
    $('progress').innerHTML = html + '<span class="pline" aria-hidden="true"></span><span class="pstep' + freeOn + '"><i>✦</i><small>자유탐구</small></span>';
    $('progress').querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { startMission(Number(b.dataset.goto)); });
    });
  }

  /* ---------- 히어로(SVG) ---------- */
  var W = 720, L = 46, R = 16, TP = 20, BT = 28;
  /* 모바일은 세로를 키워 드래그 해상도를 확보하고, 데스크톱은 슬라이더·프리셋이 폴드 안에 들어오게 살짝 낮춘다 (UX-1/UX-2) */
  function chartH() { return (window.innerWidth && window.innerWidth < 620) ? 470 : 306; }
  var H = chartH();
  function xf(i) { return L + i / 364 * (W - L - R); }

  function drawHero() {
    var svg = $('heroSvg'); if (!svg) return;
    var mc = metricOf(), b = bounds(), hr = clampThr(), tm = term();
    H = chartH(); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    function yf(v) { return TP + (b.hi - v) / (b.hi - b.lo) * (H - TP - BT); }
    function path(a) { var d = ''; for (var i = 0; i < 365; i++) d += (i ? 'L' : 'M') + xf(i).toFixed(1) + ' ' + yf(a[i]).toFixed(1); return d; }
    var thr = state.thr, yT = yf(thr), pres = series('present'), past = series('past'), fill = '', seg = null;
    function segPath(s) { var d = 'M' + xf(s[0]).toFixed(1) + ' ' + yT.toFixed(1); for (var k = s[0]; k <= s[1]; k++) d += 'L' + xf(k).toFixed(1) + ' ' + yf(pres[k]).toFixed(1); return d + 'L' + xf(s[1]).toFixed(1) + ' ' + yT.toFixed(1) + 'Z'; }
    for (var i = 0; i < 365; i++) { if (pres[i] >= thr) { if (!seg) seg = [i, i]; else seg[1] = i; } else if (seg) { fill += segPath(seg); seg = null; } }
    if (seg) fill += segPath(seg);
    var tx = xf(tm.doy - 1), pl = lastExceed('past', thr), cl = lastExceed('present', thr);
    var grid = '', narrow = window.innerWidth && window.innerWidth < 620;
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      var v = b.lo + (b.hi - b.lo) * f, y = yf(v);
      grid += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '" stroke="rgba(217,238,238,' + (f === 0 || f === 1 ? '.2' : '.11') + ')"/>'
            + '<text x="6" y="' + (y + 4).toFixed(1) + '" fill="#9fb3ba" font-size="11">' + (Math.round(v * 10) / 10) + (f === 1 ? mc.unit : '') + '</text>';
    });
    var months = narrow ? [1, 3, 5, 7, 9, 11] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    months.forEach(function (m) {
      var i = CUM[m - 1];
      grid += '<line x1="' + xf(i).toFixed(1) + '" y1="' + (H - BT) + '" x2="' + xf(i).toFixed(1) + '" y2="' + (H - BT + 5) + '" stroke="rgba(217,238,238,.28)"/>'
            + '<text x="' + xf(i + 14).toFixed(1) + '" y="' + (H - 8) + '" fill="#9fb3ba" font-size="11" text-anchor="middle">' + m + '월</text>';
    });
    svg.innerHTML = grid
      + '<path d="' + fill + '" fill="' + COLORS.present + '" fill-opacity="0.16"/>'
      + '<path d="' + path(past) + '" fill="none" stroke="' + COLORS.past + '" stroke-width="2" stroke-dasharray="5 4"/>'
      + '<path d="' + path(pres) + '" fill="none" stroke="' + COLORS.present + '" stroke-width="2.7"/>'
      + '<line x1="' + tx.toFixed(1) + '" y1="' + TP + '" x2="' + tx.toFixed(1) + '" y2="' + (H - BT) + '" stroke="' + COLORS.term + '" stroke-width="1.7" stroke-dasharray="4 3"/>'
      + '<text x="' + (tx + 5).toFixed(1) + '" y="' + (TP + 11) + '" fill="' + COLORS.term + '" font-size="11.5">' + tm.name + '(' + tm.hanja + ') ' + tm.date + ' · ' + tm.meaning + '</text>'
      + '<line x1="' + L + '" y1="' + yT.toFixed(1) + '" x2="' + (W - R) + '" y2="' + yT.toFixed(1) + '" stroke="' + COLORS.threshold + '" stroke-width="2.2"/>'
      /* 잡을 곳을 알려주는 그립 (F-11) */
      + '<circle cx="' + (L + 13) + '" cy="' + yT.toFixed(1) + '" r="8" fill="' + COLORS.threshold + '" stroke="#20143a" stroke-width="1.5"/>'
      + '<text x="' + (L + 13) + '" y="' + (yT + 3.6).toFixed(1) + '" fill="#20143a" font-size="10" font-weight="800" text-anchor="middle">⇅</text>'
      + '<rect x="' + (W - R - 104) + '" y="' + (yT - 11).toFixed(1) + '" width="104" height="20" rx="6" fill="' + COLORS.threshold + '"/>'
      + '<text x="' + (W - R - 52) + '" y="' + (yT + 3.5).toFixed(1) + '" fill="#20143a" font-size="12" font-weight="700" text-anchor="middle">' + mc.verb + ' ' + thr + mc.unit + '</text>'
      + lagOverlay(yf, b)
      + (mc.showLast && pl > 0 && !isLagMode() ? '<circle cx="' + xf(pl - 1).toFixed(1) + '" cy="' + yT.toFixed(1) + '" r="6.5" fill="' + COLORS.past + '" stroke="#0b2231" stroke-width="1.5"/>'
          + '<text x="' + xf(pl - 1).toFixed(1) + '" y="' + (yT - 12).toFixed(1) + '" fill="' + COLORS.past + '" font-size="11" text-anchor="middle">' + doyStr(pl) + '</text>' : '')
      + (mc.showLast && cl > 0 ? '<circle cx="' + xf(cl - 1).toFixed(1) + '" cy="' + yT.toFixed(1) + '" r="8" fill="' + COLORS.present + '" stroke="#2a0f0a" stroke-width="1.5"/>'
          + '<text x="' + xf(cl - 1).toFixed(1) + '" y="' + (yT + 22).toFixed(1) + '" fill="' + COLORS.present + '" font-size="11.5" font-weight="700" text-anchor="middle">' + doyStr(cl) + '</text>' : '');
    svg.setAttribute('aria-label', chartAlt());
    var ri = $('thrRange');
    if (ri) {
      ri.min = hr.lo; ri.max = hr.hi; ri.step = 1; ri.value = thr;
      ri.setAttribute('aria-valuetext', mc.verb + ' 기준 ' + thr + mc.unit + ' · ' + dayLabel(thr) + ' 과거 ' + fmtDays(exceed('past', thr)) + ', 현재 ' + fmtDays(exceed('present', thr)));
    }
    if ($('thrOut')) $('thrOut').textContent = thr + mc.unit;
    syncPresets();
    renderLiveNums();
    renderReadouts();
    updateSpark();
    updateHeatNote();
    updateLiveSentence();
    updateTable();
    if (state.view === 'map') updateMap();
    if ($('winMount')) updateWindow();
    if ($('kmaRefMount')) updateKmaRef();
    if ($('inqMount')) updateInquiry();
    updateMethod();
  }

  /* 계절 지연 모드 — 임계값 대신 '날짜'가 조작 대상이다. */
  function isLagMode() {
    return state.phase === 'mission' && MISSIONS[state.mi] && MISSIONS[state.mi].lagMode;
  }
  function lagInfo() {
    var L = lagOf(state.city); if (!L) return null;
    var isS = state.lagSeason !== 'winter';
    return {
      isSummer: isS,
      solDoy: isS ? L.solstice.summer : L.solstice.winter,
      solName: isS ? '하지' : '동지',
      solDesc: isS ? '낮이 가장 긴 날' : '밤이 가장 긴 날',
      actDoy: isS ? L.present.hotDoy : L.present.coldDoy,
      actT: isS ? L.present.hotT : L.present.coldT,
      lag: isS ? L.present.hotLag : L.present.coldLag,
      pastLag: isS ? L.past.hotLag : L.past.coldLag,
      word: isS ? '더운' : '추운'
    };
  }
  /* 학습자가 날짜를 찍기 전에는 정답(실제 극값일)을 그리지 않는다. */
  function lagOverlay(yf, b) {
    if (!isLagMode()) return '';
    var L = lagInfo(); if (!L) return '';
    var pres = series('present');
    var sx = xf(L.solDoy - 1), out = '';
    out += '<line x1="' + sx.toFixed(1) + '" y1="' + TP + '" x2="' + sx.toFixed(1) + '" y2="' + (H - BT) + '" stroke="#ffbe58" stroke-width="2" stroke-dasharray="5 4"/>'
      + '<text x="' + (sx + 6).toFixed(1) + '" y="' + (TP + 12) + '" fill="#ffbe58" font-size="12" font-weight="700">' + L.solName + ' ' + doyStr(L.solDoy) + '</text>'
      + '<text x="' + (sx + 6).toFixed(1) + '" y="' + (TP + 27) + '" fill="#ffbe58" font-size="10.5">' + L.solDesc + '</text>';
    if (state.markDoy) {
      var gx = xf(state.markDoy - 1), gy = yf(pres[state.markDoy - 1]);
      out += '<line x1="' + gx.toFixed(1) + '" y1="' + TP + '" x2="' + gx.toFixed(1) + '" y2="' + (H - BT) + '" stroke="#caa8ff" stroke-width="2.4"/>'
        + '<circle cx="' + gx.toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="8" fill="#caa8ff" stroke="#20143a" stroke-width="1.6"/>'
        + '<text x="' + gx.toFixed(1) + '" y="' + (H - BT + 18) + '" fill="#e6d8ff" font-size="11.5" font-weight="700" text-anchor="middle">내 예상 ' + doyStr(state.markDoy) + '</text>';
    }
    if (state.lagRevealed && missionAsked(MISSIONS[state.mi])) {
      var ax = xf(L.actDoy - 1), ay = yf(pres[L.actDoy - 1]);
      out += '<circle cx="' + ax.toFixed(1) + '" cy="' + ay.toFixed(1) + '" r="9" fill="#ff8066" stroke="#2a0f0a" stroke-width="1.8"/>'
        + '<text x="' + ax.toFixed(1) + '" y="' + (ay - 16).toFixed(1) + '" fill="#ff8066" font-size="12.5" font-weight="800" text-anchor="middle">실제 ' + doyStr(L.actDoy) + '</text>';
      var x1 = Math.min(sx, ax), x2 = Math.max(sx, ax), my = TP + 44;
      out += '<line x1="' + x1.toFixed(1) + '" y1="' + my + '" x2="' + x2.toFixed(1) + '" y2="' + my + '" stroke="#8de0a5" stroke-width="1.6"/>'
        + '<line x1="' + x1.toFixed(1) + '" y1="' + (my - 5) + '" x2="' + x1.toFixed(1) + '" y2="' + (my + 5) + '" stroke="#8de0a5" stroke-width="1.6"/>'
        + '<line x1="' + x2.toFixed(1) + '" y1="' + (my - 5) + '" x2="' + x2.toFixed(1) + '" y2="' + (my + 5) + '" stroke="#8de0a5" stroke-width="1.6"/>'
        + '<text x="' + ((x1 + x2) / 2).toFixed(1) + '" y="' + (my - 9) + '" fill="#8de0a5" font-size="12.5" font-weight="800" text-anchor="middle">' + L.lag + '일 늦다</text>';
    }
    return out;
  }

  function chartAlt() {
    var mc = metricOf(), n = stat(), tm = term();
    return state.city + ' ' + mc.label + ' 연간 곡선. 과거 ' + PERIOD_PAST + '(회색 점선)과 현재 ' + PERIOD_NOW + '(빨간 실선), '
      + tm.name + ' ' + tm.date + ' 고정 세로선, ' + mc.verb + ' 기준 ' + state.thr + mc.unit + ' 가로선. '
      + '기준 이상 ' + dayLabel() + ' 연평균 과거 ' + fmtDays(n.pd) + ', 현재 ' + fmtDays(n.cd) + '.'
      + (mc.showLast && n.drift != null ? ' ' + mc.last + ' 과거 ' + n.plStr + ', 현재 ' + n.clStr + ', 시차 ' + n.drift + '일.' : '');
  }

  /* 조작과 결과를 같은 화면에 둔다 (UX-2 / F-8) */
  function renderLiveNums() {
    var el = $('liveNums'); if (!el) return;
    /* RC-G: 예측을 봉인하기 전에는 값을 잠근다 — 곡선의 '모양' 변화는 보이되 정답 수치는 나중에 열린다 */
    if (state.phase === 'mission' && !missionAsked(MISSIONS[state.mi])) {
      el.classList.add('is-locked');
      el.innerHTML = isLagMode()
        ? '<span aria-hidden="true">🔒</span> 실제 기록은 <b>예측을 봉인한 뒤</b> 열립니다 — 먼저 가장 더울 것 같은 날을 찍고, 어떻게 될지 예측해 주세요.'
        : '<span aria-hidden="true">🔒</span> 숫자는 <b>예측을 봉인한 뒤</b> 열립니다 — 먼저 기준선을 움직여 보고, 어떻게 될지 예측해 주세요.';
      return;
    }
    el.classList.remove('is-locked');
    if (isLagMode()) {
      var Li = lagInfo();
      if (!Li) { el.innerHTML = ''; return; }
      var pick = state.markDoy ? '<b>내 예상</b> <span class="v-now">' + doyStr(state.markDoy) + '</span>' : '<b>내 예상</b> <span class="v-none">아직 안 찍음</span>';
      var ans = state.lagRevealed
        ? ' <span class="ln-sep">·</span> <b>실제 가장 ' + Li.word + ' 날</b> <span class="v-now">' + doyStr(Li.actDoy) + '</span> (' + Li.actT + '°C) <b class="hot">' + Li.solName + '보다 ' + Li.lag + '일 늦음</b>'
        : ' <span class="ln-sep">·</span> <span class="v-none">‘실제와 비교하기’를 누르면 열립니다</span>';
      el.innerHTML = '<b>' + Li.solName + '</b> <span class="v-past">' + doyStr(Li.solDoy) + '</span> <span class="ln-sep">·</span> ' + pick + ans;
      var mo = $('markOut');
      if (mo) mo.textContent = state.markDoy ? doyStr(state.markDoy) : '그래프를 좌우로 끌어 날짜를 찍으세요';
      return;
    }
    var mc = metricOf(), n = stat();
    var s = '<b>' + dayLabel() + '</b> <span class="v-past">과거 ' + fmtDays(n.pd) + '</span> <i>→</i> <span class="v-now">현재 ' + fmtDays(n.cd) + '</span>';
    if (mc.showLast) {
      s += ' <span class="ln-sep">·</span> <b>' + mc.last + '</b> ' + (n.pl > 0 ? '<span class="v-past">' + n.plStr + '</span>' : '<span class="v-none">없음</span>')
        + ' <i>→</i> ' + (n.cl > 0 ? '<span class="v-now">' + n.clStr + '</span>' : '<span class="v-none">없음</span>')
        + (n.drift != null ? ' <b class="hot">(' + (n.drift >= 0 ? '+' : '') + n.drift + '일)</b>' : '');
    }
    el.innerHTML = s;
  }

  function stat() {
    var thr = state.thr, mc = metricOf();
    var pd = exceed('past', thr), cd = exceed('present', thr);
    var pi = lastInfo('past', thr), ci = lastInfo('present', thr);
    var pl = pi ? pi[0] : -1, cl = ci ? ci[0] : -1;
    return {
      thr: thr, city: state.city, pd: pd, cd: cd, dd: cd - pd, pl: pl, cl: cl,
      pdStr: fmtDays(pd), cdStr: fmtDays(cd), ddStr: (cd - pd >= 0 ? '+' : '') + fmtDays(Math.abs(cd - pd)),
      plStr: pl > 0 ? doyStr(pl) : '없음', clStr: cl > 0 ? doyStr(cl) : '없음',
      drift: (pl > 0 && cl > 0) ? cl - pl : null, mc: mc,
      sampleText: sampleText(state.city), sensText: sensitivityText(state.city),
      regionOf: function (city) {
        var a = lastInfo('past', thr, city, 'temp'), b = lastInfo('present', thr, city, 'temp');
        var A = a ? a[0] : -1, B = b ? b[0] : -1;
        return { p: A, c: B, pStr: A > 0 ? doyStr(A) : '없음', cStr: B > 0 ? doyStr(B) : '없음',
                 drift: (A > 0 && B > 0) ? B - A : null,
                 driftStr: (A > 0 && B > 0) ? ((B - A >= 0 ? '+' : '') + (B - A) + '일') : '비교 불가' };
      }
    };
  }

  /* 경계값에서 다음 행동을 안내한다 (F-5) */
  function renderReadouts() {
    var el = $('readouts'); if (!el) return;
    if (state.phase === 'mission' && !missionAsked(MISSIONS[state.mi])) {
      el.innerHTML = '<div class="readout is-locked"><div class="ro-k">' + (isLagMode() ? '절기 → 실제 극값일의 시차' : '기준 이상 일수 · 마지막 초과일') + '</div>'
        + '<div class="ro-v">🔒 예측 봉인 후 공개</div>'
        + '<div class="ro-s">데이터를 보고 답을 고르는 것이 아니라, 내 예측을 검증하는 순서입니다.</div></div>';
      return;
    }
    if (isLagMode()) {
      var Li = lagInfo();
      if (!Li) { el.innerHTML = ''; return; }
      var nat = lagNationwide(Li.isSummer ? 'summer' : 'winter');
      el.innerHTML = '<div class="readout"><div class="ro-k">' + Li.solName + ' → 가장 ' + Li.word + ' 날</div>'
        + '<div class="ro-v">' + (state.lagRevealed ? '<span class="v-now">' + Li.lag + '일 늦음</span>' : '<span class="v-none">비교 전</span>') + '</div>'
        + '<div class="ro-s">' + (state.lagRevealed ? '과거(' + PERIOD_PAST + ')에도 ' + Li.pastLag + '일이었습니다 — 늘 있던 현상입니다.' : '날짜를 찍고 ‘실제와 비교하기’를 누르세요.') + '</div></div>'
        + '<div class="readout"><div class="ro-k">전국 16지점의 지연</div>'
        + '<div class="ro-v"><span class="v-now">' + nat.min + '~' + nat.max + '일</span></div>'
        + '<div class="ro-s">' + (Li.isSummer
            ? '어디서나 거의 같습니다 — 지역을 가리지 않는 물리 현상입니다.'
            : '해안 평균 ' + nat.coast + '일 vs 내륙 평균 ' + nat.inland + '일 — 바다가 천천히 식기 때문입니다.') + '</div></div>';
      return;
    }
    var mc = metricOf(), n = stat();
    var cards = '<div class="readout"><div class="ro-k">기준 이상 ' + dayLabel() + ' <small>(연평균, 연중)</small></div>'
      + '<div class="ro-v"><span class="v-past">과거 ' + n.pdStr + '</span> <i>→</i> <span class="v-now">현재 ' + n.cdStr + '</span></div>'
      + '<div class="ro-s">' + n.ddStr + ' 변화</div></div>';
    if (mc.showLast) {
      var note;
      if (n.pl > 0 && n.cl > 0) note = (n.drift >= 0 ? '+' : '') + n.drift + '일 늦게 그침';
      else if (n.pl < 0 && n.cl > 0) note = '과거에는 이 기준을 넘은 날이 없어 시차를 계산할 수 없어요 — 기준선을 조금 낮추면 두 시기를 비교할 수 있어요.';
      else if (n.pl > 0 && n.cl < 0) note = '현재에는 이 기준을 넘은 날이 없어 시차를 계산할 수 없어요 — 기준선을 조금 낮춰 보세요.';
      else note = '이 기준을 넘은 날이 과거·현재 모두 없어요 — 기준선을 낮추면 비교가 시작됩니다.';
      cards += '<div class="readout"><div class="ro-k">' + mc.last + ' <small>(그해 마지막으로 기준을 넘은 날)</small></div>'
        + '<div class="ro-v"><span class="v-past">' + n.plStr + '</span> <i>→</i> <span class="v-now">' + n.clStr + '</span></div>'
        + '<div class="ro-s">' + note + '</div></div>';
    }
    el.innerHTML = cards;
  }

  /* 검증 불가 사실을 밝히고, 허위 분기로 유도하지 않는다 (F-4 / RC-M) */
  function updateHeatNote() {
    var el = $('heatNote'); if (!el) return;
    if (state.metric === 'temp' && state.thr <= 23) {
      el.hidden = false;
      el.innerHTML = '<span aria-hidden="true">☀</span> 하루 <b>평균</b> ' + state.thr + '℃는 더위를 넓게 잡은 기준이에요. 기상청의 <b>열대야</b>는 밤 최저기온 25℃↑, <b>폭염</b>은 낮 최고기온 33℃↑로 정의하는데, <b>이 화면이 가진 자료는 하루 평균기온뿐</b>이라 그 두 기준은 여기서 계산할 수 없어요. 평균 <b>25~28℃</b> 사이에서 비교하면 과거·현재 양쪽에 값이 나옵니다.';
    } else if (state.metric === 'precip' && state.thr > 18) {
      /* 축을 늘려 기준선은 보이지만, 곡선이 바닥에 눌린 이유를 말해 주지 않으면
         "그래프가 망가졌다"로 읽힌다. 눌림 자체가 이 미션의 논점이다. */
      el.hidden = false;
      el.innerHTML = '<span aria-hidden="true">☔</span> 곡선이 바닥에 눌려 보이죠? 이 곡선은 <b>그날의 평년 강수량(하루 평균)</b>이라 ' + state.thr + 'mm를 넘는 일이 거의 없습니다. '
        + '<b>' + state.thr + 'mm는 평균이 아니라 개별 호우일에서만 넘는 값</b>이에요. 그래서 이 기준의 답은 곡선이 아니라 <b>아래 숫자</b>에 있습니다 — 그런 날이 <b>1년에 며칠</b>이었는지 세어 둔 값입니다.';
    } else { el.hidden = true; el.innerHTML = ''; }
  }

  /* ---------- 57년 장기 흐름 ---------- */
  function sparklineSVG(city, metric) {
    var tl = cityOf(city).timeline; if (!tl || !tl.years || !tl[metric]) return '';
    var ys = tl.years, vs = tl[metric], WW = 720, HH = 96, LL = 34, RR = 12, T = 10, B = 18;
    var ok = vs.filter(function (v) { return v != null; });
    if (!ok.length) return '';
    var lo = Math.min.apply(null, ok), hi = Math.max.apply(null, ok), pad = (hi - lo) * 0.14 || 1; lo -= pad; hi += pad;
    function x(i) { return LL + i / (ys.length - 1) * (WW - LL - RR); }
    function y(v) { return T + (hi - v) / (hi - lo) * (HH - T - B); }
    function xy(yr) { var i = ys.indexOf(yr); return i < 0 ? null : x(i); }
    var d = '', started = false;
    vs.forEach(function (v, i) { if (v == null) return; d += (started ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); started = true; });
    var py = yearsOf(city).past, cy = yearsOf(city).present;
    var pA = xy(py[0]), pB = xy(py[py.length - 1]), cA = xy(cy[0]), cB = xy(cy[cy.length - 1]);
    var svg = '<svg viewBox="0 0 ' + WW + ' ' + HH + '" role="img" aria-label="' + city + ' ' + ys[0] + '년부터 ' + ys[ys.length - 1] + '년까지 연간 ' + (METRICS[metric] || METRICS.temp).label + ' 장기 흐름. 비교에 쓴 과거·현재 구간이 표시되어 있습니다." class="spark">';
    if (pA != null && pB != null) svg += '<rect x="' + pA.toFixed(1) + '" y="' + T + '" width="' + Math.max(3, pB - pA).toFixed(1) + '" height="' + (HH - T - B) + '" fill="#a7bdc5" fill-opacity="0.22"/>';
    if (cA != null && cB != null) svg += '<rect x="' + cA.toFixed(1) + '" y="' + T + '" width="' + Math.max(3, cB - cA).toFixed(1) + '" height="' + (HH - T - B) + '" fill="#ff8066" fill-opacity="0.22"/>';
    svg += '<text x="2" y="' + (y(hi) + 4).toFixed(1) + '" fill="#9fb3ba" font-size="9">' + Math.round(hi) + '</text><text x="2" y="' + (y(lo)).toFixed(1) + '" fill="#9fb3ba" font-size="9">' + Math.round(lo) + '</text>';
    svg += '<path d="' + d + '" fill="none" stroke="#77bff7" stroke-width="1.6"/>';
    [ys[0], 1990, 2010, ys[ys.length - 1]].forEach(function (yr) { var bx = xy(yr); if (bx != null) svg += '<text x="' + bx.toFixed(1) + '" y="' + (HH - 5) + '" fill="#9fb3ba" font-size="9" text-anchor="middle">' + yr + '</text>'; });
    return svg + '</svg>';
  }
  function sparkBlock(city, metric) {
    var s = sparklineSVG(city, metric); if (!s) return '';
    var tl = cityOf(city).timeline;
    return '<div class="spark-wrap"><p class="spark-cap"><span aria-hidden="true">◷</span> ' + city + ' · ' + tl.years[0] + '–' + tl.years[tl.years.length - 1] + ' 연간 ' + (METRICS[metric] || METRICS.temp).label + ' 장기 흐름. <b class="past">과거</b>·<b class="now">현재</b> 비교 구간 표시 — <b>당신의 5년 비교는 이 긴 흐름의 양 끝입니다.</b></p>' + s + '</div>';
  }
  function updateSpark() { var el = $('sparkMount'); if (el) el.innerHTML = sparkBlock(state.city, state.metric); }

  function liveSentence() {
    var n = stat(), mc = metricOf(), tm = term();
    if (mc.showLast && n.drift != null) return '<b>' + n.city + '</b>에서 ‘' + mc.verb + '’를 <b>' + n.thr + mc.unit + '</b>로 정하면, ' + mc.last + '이 과거보다 <b class="hot">' + n.drift + '일</b> ' + (n.drift >= 0 ? '늦어졌습니다' : '빨라졌습니다') + '. <span class="cerl-tag">— ' + tm.name + ' 무렵 · ' + n.sampleText + '</span>';
    return '<b>' + n.city + '</b> · ‘' + mc.verb + ' ' + n.thr + mc.unit + '’ 기준 ' + dayLabel() + eunNeun(dayLabel()) + ' 연평균 과거 <b>' + n.pdStr + '</b> → 현재 <b class="hot">' + n.cdStr + '</b>입니다. <span class="cerl-tag">— ' + n.sampleText + ' · 30년 기후평년 아님</span>';
  }
  function updateLiveSentence() { var el = $('freeCerl'); if (el) el.innerHTML = liveSentence(); }

  /* ---------- 방법론 서랍 (F-9) ---------- */
  function methodHTML() {
    var c = cityOf(), y = yearsOf(), mc = metricOf();
    var stations = CITIES.map(function (n) {
      var s = D.cities[n];
      return (s.type === 'do' ? '<b>' + n + '</b>=' + s.station : n) + ' ' + s.sid;
    }).join(' · ');
    var sens = c.sensitivity;
    return '<details class="method" id="methodBox"><summary>이 숫자는 어떻게 나왔나 <small>(자료 · 계산 · 한계)</small></summary>'
      + '<div class="method-body">'
      + '<p><b>자료</b> 기상청 ASOS(전국 종관기상관측) 일자료. 16개 관측 지점의 하루 평균기온 · 하루 평균습도 · 일강수량.</p>'
      + '<p><b>지금 보는 지점</b> ' + state.city + ' = <b>' + c.station + ' 관측소</b>(지점번호 ' + c.sid + ')' + (c.type === 'do' ? ' — <b>‘' + state.city + '’는 ' + c.station + ' 한 지점의 기록이고, 도 전체의 평균이 아닙니다.</b>' : '') + '</p>'
      + '<p class="method-stations"><b>전체 지점</b> ' + stations + '</p>'
      + '<p><b>비교 기간과 표본 수</b> 과거 ' + y.past.length + '년(' + y.past.join(', ') + ') vs 현재 ' + y.present.length + '년(' + y.present.join(', ') + '). 관측일수가 350일 미만인 <b>불완결 연도는 제외</b>했습니다.</p>'
      + '<p><b>계산 방법</b> ① 화면의 <b>곡선</b>은 완결 연도의 날짜별 평균에 15일 이동평균을 걸어 매끄럽게 다듬은 <b>보기용 평년 곡선</b>입니다(2월 29일 제외). ② <b>일수와 날짜</b>는 곡선에서 세지 않습니다 — <b>연도별 실제 관측값</b>으로 각각 센 뒤 평균한 값(연평균)입니다.</p>'
      + '<p class="method-warn"><b>이 방법의 한계 (반드시 함께 읽어 주세요)</b></p>'
      + '<ol>'
      + '<li>5년 비교는 <b>관측 신호</b>이지 기후평년(국제 표준은 보통 30년)이 아닙니다.'
      + (sens ? ' 같은 ' + sens.thr + '°C 기준으로 5년 창을 옮겨 보면 시차가 <b>' + fmt1(sens.min) + '~' + fmt1(sens.max) + '일</b>에서 움직이고, ' + sens.longYears + '년(' + sens.longSpan.join('–') + ')으로 보면 <b>' + fmt1(sens.long) + '일</b>입니다. 지금 화면의 값은 <b>' + fmt1(sens.current) + '일</b>입니다.' : '') + '</li>'
      + '<li>자료에 하루 <b>평균값</b>만 있어 최저·최고기온이 없습니다. 그래서 <b>열대야</b>(밤 최저 25℃↑)와 <b>폭염</b>(낮 최고 33℃↑)은 이 화면에서 계산할 수 없습니다.</li>'
      + '<li>절기 날짜는 태양의 위치(황경)로 정해집니다. 화면에는 1969~2026년 <b>최빈 날짜</b>를 대표값으로 적었고, 해에 따라 하루 정도 다를 수 있습니다.</li>'
      + '<li>한 지점의 기록은 그 지점 주변의 신호입니다. 관측소 주변 <b>도시화</b>의 영향과 기후변화의 영향을 이 화면만으로 분리할 수는 없습니다.</li>'
      + '</ol>'
      + '<p><b>월별 요약</b> — ' + state.city + ' · ' + mc.label + ' · ‘' + mc.verb + ' ' + state.thr + mc.unit + '’ 기준</p>'
      + monthTable()
      + '</div></details>';
  }
  function monthTable() {
    var past = series('past'), pres = series('present'), mc = metricOf(), thr = state.thr;
    var rows = '';
    for (var m = 0; m < 12; m++) {
      var a = 0, b = 0, pa = 0, pb = 0, nd = MONTH_DAYS[m];
      for (var d = 0; d < nd; d++) {
        var i = CUM[m] + d;
        a += past[i]; b += pres[i];
        if (past[i] >= thr) pa++;
        if (pres[i] >= thr) pb++;
      }
      rows += '<tr><th scope="row">' + (m + 1) + '월</th><td>' + (a / nd).toFixed(1) + '</td><td>' + (b / nd).toFixed(1) + '</td><td>' + pa + '</td><td>' + pb + '</td></tr>';
    }
    return '<div class="table-wrap"><table class="method-table"><caption>보기용 평년 곡선의 월평균과, 그 곡선이 기준을 넘는 날수</caption>'
      + '<thead><tr><th scope="col">월</th><th scope="col">과거 평균(' + mc.unit + ')</th><th scope="col">현재 평균(' + mc.unit + ')</th><th scope="col">과거 기준초과(일)</th><th scope="col">현재 기준초과(일)</th></tr></thead><tbody>'
      + rows + '</tbody></table><p class="table-note">이 표의 일수는 <b>곡선</b>에서 센 값이라 위 카드의 <b>연평균 실측 일수</b>와 다릅니다 — 곡선은 오르내림이 줄어들어 있기 때문입니다.</p></div>';
  }
  /* 차트의 근거 데이터를 그대로 표로 — 스크린리더·저시력 사용자와 '숫자로 보고 싶은' 학습자 모두를 위한 대안 (UX-8) */
  function dataTable() {
    var mc = metricOf(), c = cityOf(), hr = heatRange(), rows = '', step = mc.coarse ? 5 : 1;
    var list = [];
    for (var t = hr.lo; t <= hr.hi; t += step) list.push(t);
    if (list.indexOf(state.thr) === -1) { list.push(state.thr); list.sort(function (a, b) { return a - b; }); }
    list.forEach(function (t) {
      var pv = exceed('past', t), qv = exceed('present', t), d = Math.round((qv - pv) * 10) / 10;
      var li = lastInfo('past', t), ci = lastInfo('present', t);
      rows += '<tr' + (t === state.thr ? ' class="is-cur"' : '') + '><th scope="row">' + t + mc.unit
        + (t === state.thr ? ' <span class="cur-tag">지금</span>' : '') + '</th>'
        + '<td>' + fmtDays(pv) + '</td><td>' + fmtDays(qv) + '</td>'
        + '<td class="' + (d > 0 ? 'up' : (d < 0 ? 'down' : '')) + '">' + (d > 0 ? '+' : '') + (Math.round(d * 10) / 10) + '일</td>'
        + (mc.showLast ? '<td>' + (li ? doyStr(li[0]) : '없음') + '</td><td>' + (ci ? doyStr(ci[0]) : '없음') + '</td>' : '')
        + '</tr>';
    });
    return '<div class="table-wrap"><table class="data-table">'
      + '<caption>' + state.city + '(' + c.station + ' 관측소) · ' + mc.label + ' · 기준별 연평균 ' + dayLabel()
      + ' — 과거 ' + PERIOD_PAST + ' vs 현재 ' + PERIOD_NOW + ' · 연도별 실측을 평균한 값</caption>'
      + '<thead><tr><th scope="col">기준</th><th scope="col">과거</th><th scope="col">현재</th><th scope="col">변화</th>'
      + (mc.showLast ? '<th scope="col">' + mc.last + '(과거)</th><th scope="col">' + mc.last + '(현재)</th>' : '')
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function updateTable() {
    var el = $('tableMount'); if (!el || el.hidden) return;
    if (state.phase === 'mission' && !missionAsked(MISSIONS[state.mi])) {
      el.innerHTML = '<p class="locked-note">🔒 표는 예측을 봉인한 뒤 열립니다.</p>';
      return;
    }
    el.innerHTML = dataTable();
  }
  /* ---------- 기상청 공식 기준표 (Mo1 p.31) ----------
     학습자가 정하는 기준선은 '내가 정한 약속'이고, 기상청 특보 기준은
     '사회가 합의한 약속'이다. 둘을 나란히 놓아야 내 기준이 임의값이
     아니라 하나의 선택지임을 알 수 있다. 동시에 이 앱이 계산할 수 있는
     것과 없는 것의 경계도 여기서 정직하게 드러난다. */
  var KMA_REF = {
    temp: {
      title: '기온 — 기상청 특보·현상 기준',
      rows: [
        ['폭염주의보', '일 <b>최고</b>기온 33℃ 이상 2일 이상 지속', 'no'],
        ['폭염경보', '일 <b>최고</b>기온 35℃ 이상 2일 이상 지속', 'no'],
        ['열대야', '밤(18:01~익일 09:00) <b>최저</b>기온 25℃ 이상', 'no'],
        ['한파주의보', '아침 <b>최저</b>기온이 전날보다 10℃ 이상 내려 3℃ 이하', 'no'],
        ['이 화면의 기준', '일 <b>평균</b>기온 20~34℃ 중 내가 고른 값', 'yes']
      ],
      note: '이 화면이 가진 자료는 <b>일 평균기온</b>뿐입니다. 그래서 위 네 가지 공식 기준은 여기서 계산할 수 없고, 대신 평균기온으로 ‘덥다’를 직접 정의해 봅니다. <b>공식 기준과 다른 값</b>이라는 점을 결론에 반드시 붙이세요.'
    },
    precip: {
      title: '강수 — 기상청 특보·강도 기준',
      rows: [
        ['호우주의보', '3시간 60mm 이상 또는 12시간 110mm 이상', 'no'],
        ['호우경보', '3시간 90mm 이상 또는 12시간 180mm 이상', 'no'],
        ['강한 비', '시간당 15~30mm', 'no'],
        ['매우 강한 비', '시간당 30mm 이상', 'no'],
        ['이 화면의 기준', '<b>하루 누적</b> 강수량 1~80mm 중 내가 고른 값', 'yes']
      ],
      note: '특보는 <b>3시간·12시간·1시간</b> 단위인데 이 화면의 자료는 <b>하루 누적</b>입니다. 단위가 달라 같은 숫자라도 뜻이 다릅니다 — “하루 50mm”는 호우주의보와 같은 말이 아닙니다.'
    },
    humidity: {
      title: '습도 — 참고 기준',
      rows: [
        ['쾌적 구간', '상대습도 40~60%', 'no'],
        ['불쾌지수 ‘높음’', '기온·습도를 함께 쓴 지수(습도 단독 아님)', 'no'],
        ['건조주의보', '실효습도 35% 이하 2일 이상 (실효습도 = 며칠치 누적)', 'no'],
        ['이 화면의 기준', '일 <b>평균</b> 상대습도 55~95% 중 내가 고른 값', 'yes']
      ],
      note: '습도는 기온과 함께 봐야 체감이 설명됩니다. 습도 하나만으로 ‘덥다·불쾌하다’를 단정하지 마세요. 건조주의보의 <b>실효습도</b>는 하루 평균습도와 계산법이 다릅니다.'
    }
  };
  function kmaRefHTML() {
    var r = KMA_REF[state.metric]; if (!r) return '';
    return '<details class="kma-ref"><summary><span aria-hidden="true">📋</span> 기상청은 어떤 기준을 쓸까? <small>공식 기준표 보기</small></summary>'
      + '<div class="kma-body"><p class="kma-title">' + r.title + '</p>'
      + '<table class="kma-table"><caption class="sr-only">' + r.title + ' 및 이 화면에서 계산 가능 여부</caption>'
      + '<thead><tr><th scope="col">기준</th><th scope="col">정의</th><th scope="col">이 화면에서</th></tr></thead><tbody>'
      + r.rows.map(function (x) {
        return '<tr class="' + (x[2] === 'yes' ? 'is-ours' : '') + '"><th scope="row">' + x[0] + '</th><td>' + x[1] + '</td>'
          + '<td class="kma-can">' + (x[2] === 'yes' ? '<b>계산함</b>' : '계산 불가') + '</td></tr>';
      }).join('') + '</tbody></table>'
      + '<p class="kma-note">' + r.note + '</p>'
      + '<p class="kma-src">출처: 기상청 기상특보 발표기준 · 기상청 날씨용어. 이 표는 학습용 요약이며 실제 발표기준은 기상청 공식 고시를 따릅니다.</p>'
      + '</div></details>';
  }
  function updateKmaRef() {
    var el = $('kmaRefMount'); if (!el) return;
    var open = el.querySelector('details') && el.querySelector('details').open;
    el.innerHTML = kmaRefHTML();
    if (open && el.querySelector('details')) el.querySelector('details').open = true;
  }

  /* ---------- 탐구 질문 패널 (Mo1 p.32) ----------
     "무엇이 보이나요?"는 관찰을, "왜 그럴까요?"는 설명을, "믿을 수 있나요?"는
     검증을 요구한다. 세 층을 한꺼번에 주면 아무것도 안 하므로 층을 나눠 놓는다.
     질문은 지금 보고 있는 지표·절기·지역에 맞춰 바뀐다 — 고정 문구는
     "읽고 넘기는 장식"이 되기 때문이다. */
  function inquiryQs() {
    var mc = metricOf(), t = term(), city = state.city, thr = state.thr;
    var pd = exceed('past', thr), cd = exceed('present', thr);
    var dir = (pd != null && cd != null) ? (cd > pd ? '늘었' : cd < pd ? '줄었' : '비슷했') : null;
    var L = cityOf().seasonalLag;
    var obs = [
      '이 그래프에서 <b>무엇이 보이나요?</b> 과거(회색)와 현재(주황) 두 선 중 <b>어느 계절에서 가장 벌어지나요?</b>',
      '‘' + mc.verb + ' ' + thr + mc.unit + '’ 기준선을 지금 위치에서 <b>위아래로 3칸씩</b> 옮겨 보세요. 숫자가 <b>가장 크게 바뀌는 구간</b>은 어디인가요?',
      t ? '<b>' + t.name + '(' + t.date + ')</b> 날짜에 세로선이 서 있습니다. 그 지점에서 두 선의 <b>높이 차이</b>는 얼마나 되나요?' : null
    ].filter(Boolean);
    var why = [
      dir ? '이 지역에서 기준 이상 날이 <b>' + dir + '습니다.</b> <b>왜</b> 그럴까요? 떠오르는 이유를 <b>두 가지</b> 적어 보세요.' : null,
      L ? '가장 더운 날은 하지보다 <b>약 ' + L.present.hotLag + '일 뒤</b>입니다. 해가 가장 높은 날과 가장 더운 날이 <b>다른 이유</b>는 무엇일까요?' : null,
      '지역을 <b>바다에 가까운 곳</b>(제주·부산·강릉)과 <b>내륙</b>(충북·경북)으로 바꿔 보세요. 차이가 있다면 <b>무엇 때문</b>일까요?'
    ].filter(Boolean);
    var test = [
      '이 결과는 <b>' + city + ' 관측소 1곳</b>의 기록입니다. 이것만으로 <b>전국</b>을 말할 수 있나요? 지도 보기로 <b>16지점</b>을 확인해 보세요.',
      '비교 기간을 <b>다른 5년</b>으로 바꿔도 같은 결론이 나오나요? 아래 <b>비교 기간</b> 조작으로 확인해 보세요.',
      '지표를 <b>습도·강수</b>로 바꾸면 방향이 같나요, 다른가요? <b>다르다면</b> 그것도 하나의 발견입니다.',
      '이 자료는 <b>5년 평균</b>입니다. 기후를 말하는 국제 기준은 <b>30년</b>입니다. 내 결론에 이 <b>한계</b>를 어떻게 적어야 할까요?'
    ];
    return [
      { k: '① 보이는 것', s: '관찰 — 판단하지 말고 눈에 띈 것만', qs: obs },
      { k: '② 그 이유', s: '설명 — 왜 그럴지 가설을 세워 보세요', qs: why },
      { k: '③ 믿어도 될까', s: '검증 — 내 결론을 스스로 흔들어 보세요', qs: test }
    ];
  }
  function inquiryHTML() {
    return '<div class="inq-panel"><p class="inq-head"><span aria-hidden="true">🔍</span> 탐구 질문 <small>순서대로 답해 보면 판정문이 저절로 만들어집니다</small></p>'
      + inquiryQs().map(function (g) {
        return '<details class="inq-g"><summary><b>' + g.k + '</b> <small>' + g.s + '</small></summary>'
          + '<ul class="inq-list">' + g.qs.map(function (q) { return '<li>' + q + '</li>'; }).join('') + '</ul></details>';
      }).join('') + '</div>';
  }
  function updateInquiry() {
    var el = $('inqMount'); if (!el) return;
    var open = [].slice.call(el.querySelectorAll('details')).map(function (d) { return d.open; });
    el.innerHTML = inquiryHTML();
    [].slice.call(el.querySelectorAll('details')).forEach(function (d, i) { if (open[i]) d.open = true; });
  }

  /* ---------- 비교 기간(창) 조작 ----------
     '현재'를 2021–2025로 고정해 둔 선택 자체를 학습자가 검증하게 한다. */
  function winsOf(city) {
    var w = cityOf(city).windows;
    return w && w.list && w.list.length ? w : null;
  }
  function winSupported() { return state.metric === 'temp' && !!winsOf(); }
  function winIndex() {
    var W = winsOf(); if (!W) return 0;
    /* state.winI 기본값은 null인데 JS에서 null >= 0 은 참이므로
       숫자 여부를 먼저 봐야 한다. 기본은 마지막 창(= 현재 구간). */
    var i = state.winI;
    return (typeof i === 'number' && isFinite(i) && i >= 0 && i < W.list.length) ? i : W.list.length - 1;
  }
  function winDays(w, thr) {
    var v = w.days[String(thr == null ? state.thr : thr)];
    return v == null ? null : v;
  }

  function windowSVG() {
    var W = winsOf(); if (!W) return '';
    var thr = state.thr, past = exceed('past', thr);
    var vals = W.list.map(function (w) { return winDays(w, thr); });
    if (vals.some(function (v) { return v === null; })) return '';
    var WW = 720, HH = 190, L = 46, R = 14, T = 16, B = 40;
    var all = vals.concat([past, W.long.days[String(thr)]]).filter(function (v) { return v != null; });
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var pad = Math.max(1, (hi - lo) * 0.16); lo = Math.max(0, lo - pad); hi = hi + pad;
    var xf = function (i) { return L + (WW - L - R) * (vals.length === 1 ? 0.5 : i / (vals.length - 1)); };
    var yf = function (v) { return T + (HH - T - B) * (1 - (v - lo) / (hi - lo || 1)); };

    var out = '';
    /* 과거 기준선 — 모든 창이 이 선 위에 있으면 "어느 5년을 골라도 같다" */
    var py = yf(past);
    out += '<line x1="' + L + '" y1="' + py.toFixed(1) + '" x2="' + (WW - R) + '" y2="' + py.toFixed(1) + '" stroke="#a7bdc5" stroke-width="1.8" stroke-dasharray="6 4"/>'
      + '<text class="wa-lab" x="' + (L + 4) + '" y="' + (py - 6).toFixed(1) + '">과거 ' + PERIOD_PAST + ' · ' + fmtDays(past) + '</text>';

    out += '<polyline fill="none" stroke="#ff8066" stroke-width="2.4" stroke-linejoin="round" points="'
      + vals.map(function (v, i) { return xf(i).toFixed(1) + ',' + yf(v).toFixed(1); }).join(' ') + '"/>';

    var sel = winIndex();
    vals.forEach(function (v, i) {
      var on = i === sel;
      out += '<circle cx="' + xf(i).toFixed(1) + '" cy="' + yf(v).toFixed(1) + '" r="' + (on ? 7 : 3) + '" fill="' + (on ? '#ffbe58' : '#ff8066') + '" stroke="' + (on ? '#20143a' : 'none') + '" stroke-width="' + (on ? 2 : 0) + '"/>';
    });

    /* x축 — 창의 시작 연도 몇 개만 */
    var step = Math.ceil(vals.length / 6);
    W.list.forEach(function (w, i) {
      if (i % step && i !== vals.length - 1) return;
      out += '<text class="wa-tick" x="' + xf(i).toFixed(1) + '" y="' + (HH - B + 18) + '" text-anchor="middle">' + w.y0 + '</text>';
    });
    out += '<text class="wa-tick" x="' + (WW / 2) + '" y="' + (HH - 6) + '" text-anchor="middle">← 5년 창의 시작 연도 →</text>';
    [lo, hi].forEach(function (v) {
      out += '<text class="wa-tick" x="' + (L - 8) + '" y="' + (yf(v) + 4).toFixed(1) + '" text-anchor="end">' + Math.round(v) + '일</text>';
    });
    return '<svg viewBox="0 0 ' + WW + ' ' + HH + '" class="win-chart" role="img" aria-label="5년 창을 한 해씩 옮겼을 때의 일수 변화. 점선은 과거 기준입니다."></svg>'.replace('></svg>', '>' + out + '</svg>');
  }

  function windowPanel() {
    if (state.metric !== 'temp') {
      return '<div class="win-panel"><p class="win-off">비교 기간 바꾸기는 <b>기온</b>에서만 제공합니다. '
        + '습도·강수는 연도별 창 통계를 계산해 두지 않았어요 — 없는 값을 추정해 보여 주지 않기 위해서입니다.</p></div>';
    }
    var W = winsOf(); if (!W) return '';
    var i = winIndex(), w = W.list[i], thr = state.thr, mc = metricOf();
    var past = exceed('past', thr), now = winDays(w, thr);
    if (past === null || now === null) return '';
    var d = now - past;
    var above = W.list.filter(function (x) { return winDays(x, thr) > past; }).length;
    var vals = W.list.map(function (x) { return winDays(x, thr); });
    var vlo = Math.min.apply(null, vals), vhi = Math.max.apply(null, vals);
    var verdict = above === W.list.length
      ? '<b>' + W.list.length + '개 창 전부</b>가 과거보다 많습니다 — <b class="hot">어느 5년을 골라도 방향은 같습니다.</b>'
      : above === 0
        ? '<b>' + W.list.length + '개 창 전부</b>가 과거보다 적습니다 — 어느 5년을 골라도 방향은 같습니다.'
        : '과거보다 많은 창 <b>' + above + '개</b> / ' + W.list.length + '개 — <b>고른 5년에 따라 결론이 갈립니다.</b> 이 기준에서는 단정하면 안 됩니다.';

    return '<div class="win-panel">'
      + '<div class="picker-block"><span class="picker-label">비교 기간 <small>(‘현재’로 쓸 5년을 직접 골라 보세요)</small></span></div>'
      + '<div class="win-row">'
      + '<button type="button" class="step-btn" id="winPrev" aria-label="이전 5년 창">−</button>'
      + '<input type="range" id="winRange" min="0" max="' + (W.list.length - 1) + '" step="1" value="' + i + '" '
      + 'aria-label="비교 기간 창 선택" aria-valuetext="' + w.y0 + '년부터 ' + w.y1 + '년까지 5년, 연평균 ' + fmtDays(now) + '" />'
      + '<button type="button" class="step-btn" id="winNext" aria-label="다음 5년 창">+</button>'
      + '<output class="win-out" id="winOut">' + w.y0 + '–' + w.y1 + '</output>'
      + '</div>'
      + '<p class="win-read">' + PERIOD_PAST + ' <b>' + fmtDays(past) + '</b> <i>→</i> ' + w.y0 + '–' + w.y1 + ' <b class="hot">' + fmtDays(now) + '</b> '
      + '<span class="win-delta">' + (d > 0 ? '+' : '') + fmtDays(d) + '</span></p>'
      + windowSVG()
      + '<p class="win-verdict">' + verdict + '<br><small>창마다 값은 ' + fmtDays(vlo) + '~' + fmtDays(vhi) + ' 사이에서 흔들립니다. '
      + '<b>숫자는 흔들리고 방향은 남는 것</b> — 이 차이를 구별하는 게 기후를 읽는 방법입니다. '
      + '30년으로 넓히면(' + W.long.y0 + '–' + W.long.y1 + ') ' + fmtDays(W.long.days[String(thr)]) + '입니다.</small></p>'
      + '<p class="win-note">기온 ' + thr + mc.unit + ' 기준 · ' + state.city + '(' + cityOf().station + ' 관측소) · 5년 창을 한 해씩 옮겨 26가지로 계산했습니다. '
      + '위 그래프의 곡선은 바뀌지 않습니다 — 곡선은 두 시기(과거·현재)만 미리 계산해 두었기 때문입니다.</p>'
      + '</div>';
  }

  function updateWindow() {
    var el = $('winMount'); if (!el) return;
    el.innerHTML = windowPanel();
    var r = $('winRange'); if (!r) return;
    function set(v) {
      var W = winsOf(); if (!W) return;
      state.winI = Math.max(0, Math.min(W.list.length - 1, v)); save(); updateWindow();
      var nr = $('winRange'); if (nr && nr.focus) nr.focus();
    }
    r.addEventListener('input', function () { state.winI = Number(r.value); save(); updateWindow(); var n = $('winRange'); if (n) n.focus(); });
    if ($('winPrev')) $('winPrev').addEventListener('click', function () { set(winIndex() - 1); });
    if ($('winNext')) $('winNext').addEventListener('click', function () { set(winIndex() + 1); });
  }

  /* ---------- 16지점 지도 ----------
     한 화면에서 '전국이 같은 방향인가'를 눈으로 확인시키는 보기.
     korea_geo.js가 없으면 버튼 자체를 감춰 조용히 퇴화한다. */
  function hasMap() { return !!(window.KOREA_GEO && KOREA_GEO.provinces && KOREA_GEO.provinces.length); }

  var MAP_W = 560, MAP_H = 660;
  function mapProj() {
    var b = KOREA_GEO.bbox, latMid = (b[1] + b[3]) / 2;
    var kx = Math.cos(latMid * Math.PI / 180);          /* 위도에 따른 경도 축소 */
    var w = (b[2] - b[0]) * kx, h = b[3] - b[1];
    var pad = 26, sc = Math.min((MAP_W - pad * 2) / w, (MAP_H - pad * 2) / h);
    var ox = (MAP_W - w * sc) / 2, oy = (MAP_H - h * sc) / 2;
    return {
      x: function (lon) { return ox + (lon - b[0]) * kx * sc; },
      y: function (lat) { return oy + (b[3] - lat) * sc; }
    };
  }

  /* 현재 지표·기준에서 각 지점의 변화량(현재-과거). 지도의 색과 크기를 정한다. */
  function mapDeltas() {
    var mc = metricOf(), out = [];
    CITIES.forEach(function (c) {
      var a = exceed('past', state.thr, c, state.metric), b = exceed('present', state.thr, c, state.metric);
      if (a === null || b === null) return;
      var s = D.cities[c];
      out.push({ city: c, lat: s.lat, lon: s.lon, station: s.station, sid: s.sid, past: a, now: b, d: b - a });
    });
    out.mc = mc;
    return out;
  }

  function mapColor(d, maxAbs) {
    if (!maxAbs) return '#7d94a0';
    var t = Math.min(1, Math.abs(d) / maxAbs);
    var a = (0.28 + t * 0.62).toFixed(2);
    /* 늘었다=주황(현재선 색), 줄었다=하늘(과거 대비 감소). 색만으로 읽히지 않도록
       기호(▲▼)와 숫자를 함께 붙인다 — 색각 이상 대응(WCAG 1.4.1). */
    return d > 0 ? 'rgba(255,128,102,' + a + ')' : d < 0 ? 'rgba(119,191,247,' + a + ')' : 'rgba(167,189,197,.34)';
  }

  function mapSVG() {
    if (!hasMap()) return '<p class="locked-note">지도 자료를 불러오지 못했습니다. ‘그래프’ 보기를 이용해 주세요.</p>';
    var P = mapProj(), rows = mapDeltas(), mc = rows.mc;
    var maxAbs = rows.reduce(function (m, r) { return Math.max(m, Math.abs(r.d)); }, 0);
    var up = rows.filter(function (r) { return r.d > 0; }).length;
    var dn = rows.filter(function (r) { return r.d < 0; }).length;
    var flat = rows.length - up - dn;

    var paths = KOREA_GEO.provinces.map(function (pv) {
      return pv.rings.map(function (ring) {
        return '<path d="' + ring.map(function (pt, i) {
          return (i ? 'L' : 'M') + P.x(pt[0]).toFixed(1) + ' ' + P.y(pt[1]).toFixed(1);
        }).join('') + 'Z" fill="rgba(16,53,76,.62)" stroke="rgba(217,238,238,.20)" stroke-width=".8"/>';
      }).join('');
    }).join('');

    /* 라벨이 겹치지 않도록 동해/서해 쪽으로 밀어낸다 */
    var dots = rows.map(function (r, i) {
      var x = P.x(r.lon), y = P.y(r.lat);
      var rad = 7 + Math.sqrt(Math.abs(r.d) / (maxAbs || 1)) * 13;
      var on = r.city === state.city;
      var sign = r.d > 0 ? '▲' : r.d < 0 ? '▼' : '·';
      var lab = sign + fmtDays(Math.abs(r.d));
      var right = r.lon >= 127.6;
      var lx = x + (right ? rad + 6 : -(rad + 6));
      var desc = r.city + ' ' + r.station + '관측소, ' + fmtDays(r.past) + '에서 ' + fmtDays(r.now) + '로 '
        + (r.d > 0 ? fmtDays(Math.abs(r.d)) + ' 늘었습니다' : r.d < 0 ? fmtDays(Math.abs(r.d)) + ' 줄었습니다' : '변화가 없습니다');
      return '<g class="mapdot' + (on ? ' is-on' : '') + '" data-city="' + r.city + '" tabindex="0" role="button" aria-label="' + desc + '">'
        + '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + rad.toFixed(1) + '" fill="' + mapColor(r.d, maxAbs) + '" stroke="' + (on ? '#ffbe58' : 'rgba(8,28,45,.75)') + '" stroke-width="' + (on ? 3 : 1.4) + '"/>'
        + '<text class="mapdot-city" x="' + lx.toFixed(1) + '" y="' + (y - 2).toFixed(1) + '" text-anchor="' + (right ? 'start' : 'end') + '">' + r.city + '</text>'
        + '<text class="mapdot-val" x="' + lx.toFixed(1) + '" y="' + (y + 11).toFixed(1) + '" text-anchor="' + (right ? 'start' : 'end') + '">' + lab + '</text>'
        + '</g>';
    }).join('');

    var verdict = up === rows.length
      ? '<b class="hot">' + rows.length + '지점 전부</b>에서 늘었습니다 — 한 곳의 사정이 아닙니다.'
      : dn === rows.length
        ? '<b>' + rows.length + '지점 전부</b>에서 줄었습니다 — 한 곳의 사정이 아닙니다.'
        : '늘어난 곳 <b class="hot">' + up + '</b> · 줄어든 곳 <b>' + dn + '</b>' + (flat ? ' · 변화 없음 ' + flat : '') + ' — 방향이 갈립니다.';

    return '<p class="map-verdict">' + mc.label + ' ' + state.thr + mc.unit + ' 기준 · ' + PERIOD_PAST + ' → ' + PERIOD_NOW + '<br>' + verdict + '</p>'
      + '<svg viewBox="0 0 ' + MAP_W + ' ' + MAP_H + '" class="korea-map" role="img" aria-label="전국 16개 관측지점의 변화 지도. 지점을 눌러 선택할 수 있습니다.">'
      + paths + dots + '</svg>'
      + '<p class="map-legend"><span><i class="mlg mlg-up"></i> ▲ 늘어남</span><span><i class="mlg mlg-dn"></i> ▼ 줄어듦</span>'
      + '<span>원 크기 = 변화의 크기 (최대 ' + fmtDays(maxAbs) + ')</span></p>'
      + '<p class="map-note">각 지점은 시·도별 대표 관측소 <b>1곳</b>의 기록입니다. 지도의 도 경계는 위치를 보여 주기 위한 배경일 뿐, 도 전체의 평균이 아닙니다.</p>';
  }

  function updateMap() {
    var el = $('mapMount'); if (!el) return;
    if (state.phase === 'mission' && !missionAsked(MISSIONS[state.mi])) {
      el.innerHTML = '<p class="locked-note">🔒 지도는 예측을 봉인한 뒤 열립니다.</p>';
      return;
    }
    el.innerHTML = mapSVG();
    el.querySelectorAll('.mapdot').forEach(function (g) {
      function pick() {
        state.city = g.dataset.city; state.touched = true; save();
        var chips = $('cityChips'); if (chips) refreshChipsOn(chips, 'city', state.city);
        drawHero(); updateMap(); onTouched();
        var next = document.querySelector('.mapdot[data-city="' + state.city + '"]');
        if (next && next.focus) next.focus();
      }
      g.addEventListener('click', pick);
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
      });
    });
  }

  function setView(mode) {
    if (mode === 'map' && !hasMap()) mode = 'chart';
    state.view = mode; save();
    var svg = $('heroSvg'), tbl = $('tableMount'), map = $('mapMount');
    if (!svg || !tbl) return;
    var isTable = mode === 'table', isMap = mode === 'map';
    svg.style.display = (isTable || isMap) ? 'none' : '';
    tbl.hidden = !isTable;
    if (map) map.hidden = !isMap;
    [['viewChart', !isTable && !isMap], ['viewMap', isMap], ['viewTable', isTable]].forEach(function (pair) {
      var b = $(pair[0]); if (!b) return;
      b.setAttribute('aria-pressed', String(pair[1])); b.classList.toggle('is-on', pair[1]);
    });
    if (isTable) updateTable();
    if (isMap) updateMap();
  }
  function bindViewTools() {
    if ($('viewChart')) $('viewChart').addEventListener('click', function () { setView('chart'); });
    if ($('viewMap')) $('viewMap').addEventListener('click', function () { setView('map'); });
    if ($('viewTable')) $('viewTable').addEventListener('click', function () { setView('table'); });
    var z = $('zoomChk');
    if (z) { z.checked = !!state.zoom; z.addEventListener('change', function () { state.zoom = z.checked; save(); drawHero(); }); }
    setView(state.view === 'table' || state.view === 'map' ? state.view : 'chart');
  }

  function updateMethod() {
    var box = $('methodMount'); if (!box) return;
    var open = box.querySelector('details') && box.querySelector('details').open;
    box.innerHTML = methodHTML();
    if (open) box.querySelector('details').open = true;
  }

  /* ---------- 히어로 셸 ---------- */
  function heroShell(opts) {
    var mc = metricOf(), y = yearsOf();
    var legend = '<div class="chart-legend"><span><i class="lg lg-past"></i> 과거 ' + PERIOD_PAST + '</span><span><i class="lg lg-now"></i> 현재 ' + PERIOD_NOW + '</span><span><i class="lg lg-term"></i> 절기(고정)</span><span><i class="lg lg-thr"></i> 내가 정한 ‘' + mc.verb + '’</span></div>';
    var pickers = '';
    if (opts.cityChips) pickers += '<div class="picker-block"><span class="picker-label">지역 <small>(각 지점 1곳의 관측)</small></span><div class="chips" id="cityChips" role="tablist" aria-label="관측 지역"></div></div>';
    if (opts.termStrip) pickers += '<div class="picker-block"><span class="picker-label">절기 <small>(태양 위치로 정한 24개 천문 날짜)</small></span><div class="terms" id="termStrip" aria-label="절기 선택"></div></div>';
    if (opts.metricTabs) pickers += '<div class="picker-block"><span class="picker-label">지표</span><div class="metric-tabs" id="metricTabs" role="tablist" aria-label="지표 선택"></div></div>';
    return (pickers ? '<div class="picker">' + pickers + '</div>' : '')
      + '<div class="chart-card">'
      + '<p class="live-nums" id="liveNums" aria-live="polite"></p>'
      + '<div class="view-tools">'
      + '<div class="seg" role="group" aria-label="보기 방식">'
      + '<button type="button" class="seg-btn" id="viewChart" aria-pressed="true">그래프</button>'
      + (hasMap() && !opts.lagMode ? '<button type="button" class="seg-btn" id="viewMap" aria-pressed="false">지도 <small>16지점</small></button>' : '')
      + '<button type="button" class="seg-btn" id="viewTable" aria-pressed="false">표</button>'
      + '</div>'
      + '<label class="zoom-toggle"><input type="checkbox" id="zoomChk" /> 기준 구간 확대 <small>(세밀 조절)</small></label>'
      + '</div>'
      + '<div id="mapMount" hidden></div>'
      + '<div id="tableMount" hidden></div>'
      + '<svg id="heroSvg" viewBox="0 0 720 340" role="img" aria-label="관측 곡선"></svg>'
      + (opts.lagMode ? lagControls() : '')
      + '<div class="range-row"' + (opts.lagMode ? ' hidden' : '') + '><span>‘' + mc.verb + '’ 기준<b class="basis">(' + mc.basis + ')</b></span>'
      + '<button class="step-btn" id="thrDown" type="button" aria-label="기준 1 낮추기">−</button>'
      + '<input id="thrRange" type="range" aria-label="' + mc.verb + ' 기준(' + mc.basis + ')" />'
      + '<button class="step-btn" id="thrUp" type="button" aria-label="기준 1 높이기">+</button>'
      + '<output id="thrOut" aria-live="polite"></output></div>'
      + '<div class="presets" id="presets" aria-label="자주 쓰는 기준"' + (opts.lagMode ? ' hidden' : '') + '></div>'
      + legend
      + '</div>'
      + '<div class="readouts" id="readouts" aria-live="polite"></div>'
      + '<p class="heat-note" id="heatNote" aria-live="polite" hidden></p>'
      + '<p class="integrity"><span aria-hidden="true">◈</span> 기상청 ASOS 실측 · 과거 <b>' + y.past.length + '년</b>(' + PERIOD_PAST + ') vs 현재 <b>' + y.present.length + '년</b>(' + PERIOD_NOW + ') — <b>관측 신호</b>이고 30년 <b>기후평년</b>이 아닙니다 · 절기는 태양 위치로 정한 <b>천문 날짜</b>라 해마다 거의 움직이지 않습니다</p>'
      + '<div id="methodMount"></div>';
  }

  /* 계절 지연 모드 전용 조작 패널 — 여름/겨울 전환 + 날짜 스테퍼 + 확인 버튼 */
  function lagControls() {
    return '<div class="lag-controls">'
      + '<div class="seg" role="group" aria-label="계절 선택">'
      + '<button type="button" class="seg-btn" id="lagSummer" aria-pressed="true">여름 · 하지 기준</button>'
      + '<button type="button" class="seg-btn" id="lagWinter" aria-pressed="false">겨울 · 동지 기준</button>'
      + '</div>'
      + '<div class="lag-pick"><button class="step-btn" id="markPrev" type="button" aria-label="하루 앞으로">−</button>'
      + '<output id="markOut" aria-live="polite">그래프를 좌우로 끌어 날짜를 찍으세요</output>'
      + '<button class="step-btn" id="markNext" type="button" aria-label="하루 뒤로">+</button>'
      + '<button class="primary-btn small-btn" id="lagReveal">실제와 비교하기</button></div>'
      + '</div>';
  }
  function bindLagControls() {
    var svg = $('heroSvg'); if (!svg) return;
    function setMark(d, silent) {
      var v = Math.max(1, Math.min(365, Math.round(d)));
      if (v === state.markDoy) { if (!silent) onTouched(); return; }
      state.markDoy = v; state.touched = true; state.moved = true; state.lagRevealed = false;
      save(); drawHero(); if (!silent) onTouched();
    }
    var dragging = false;
    function doyAt(clientX) {
      var r = svg.getBoundingClientRect(); if (!r.width) return null;
      var vx = (clientX - r.left) / r.width * W;
      var i = (vx - L) / (W - L - R) * 364;
      return Math.round(i) + 1;
    }
    svg.addEventListener('pointerdown', function (e) {
      if (!isLagMode()) return;
      dragging = true;
      try { svg.setPointerCapture(e.pointerId); } catch (x) {}
      var d = doyAt(e.clientX); if (d != null) setMark(d);
    });
    svg.addEventListener('pointermove', function (e) {
      if (!dragging || !isLagMode()) return;
      var d = doyAt(e.clientX); if (d != null) setMark(d);
    });
    svg.addEventListener('pointerup', function () { dragging = false; });
    svg.addEventListener('pointercancel', function () { dragging = false; });
    if ($('markPrev')) $('markPrev').addEventListener('click', function () { setMark((state.markDoy || lagInfo().solDoy) - 1); });
    if ($('markNext')) $('markNext').addEventListener('click', function () { setMark((state.markDoy || lagInfo().solDoy) + 1); });
    if ($('lagReveal')) $('lagReveal').addEventListener('click', function () {
      if (!state.markDoy) { var o = $('markOut'); o.textContent = '먼저 그래프에서 날짜를 찍어 주세요.'; flash(o); return; }
      state.lagRevealed = true; save(); drawHero(); onTouched();
    });
    function season(kind) {
      state.lagSeason = kind; state.markDoy = null; state.lagRevealed = false;
      state.ti = kind === 'winter' ? 23 : 11;
      save(); drawHero();
      $('lagSummer').classList.toggle('is-on', kind === 'summer');
      $('lagWinter').classList.toggle('is-on', kind === 'winter');
      $('lagSummer').setAttribute('aria-pressed', String(kind === 'summer'));
      $('lagWinter').setAttribute('aria-pressed', String(kind === 'winter'));
    }
    if ($('lagSummer')) $('lagSummer').addEventListener('click', function () { season('summer'); });
    if ($('lagWinter')) $('lagWinter').addEventListener('click', function () { season('winter'); });
    if ($('lagSummer')) $('lagSummer').classList.toggle('is-on', state.lagSeason !== 'winter');
    if ($('lagWinter')) $('lagWinter').classList.toggle('is-on', state.lagSeason === 'winter');
  }

  function renderPresets() {
    var el = $('presets'); if (!el) return;
    var mc = metricOf(), hr = heatRange();
    var html = mc.presets.filter(function (p) { return p.v >= hr.lo && p.v <= hr.hi; })
      .map(function (p) { return '<button class="preset" type="button" data-thr="' + p.v + '"><b>' + p.t + '</b><small>' + p.s + '</small></button>'; }).join('');
    if (mc.offGrid) html += '<button class="preset is-off" type="button" disabled title="이 자료에는 최고기온이 없어 계산할 수 없습니다"><b>' + mc.offGrid.t + '</b><small>' + mc.offGrid.s + '</small></button>';
    el.innerHTML = html;
    el.querySelectorAll('[data-thr]').forEach(function (b) {
      b.addEventListener('click', function () { setThr(Number(b.dataset.thr)); });
    });
  }
  function syncPresets() {
    var el = $('presets'); if (!el) return;
    el.querySelectorAll('[data-thr]').forEach(function (b) { b.classList.toggle('is-on', Number(b.dataset.thr) === state.thr); });
  }

  function bindCityChips(list) {
    var el = $('cityChips'); if (!el) return;
    var arr = list || CITIES;
    el.innerHTML = arr.map(function (c) {
      var s = D.cities[c];
      return '<button class="chip' + (c === state.city ? ' is-on' : '') + '" role="tab" aria-selected="' + (c === state.city) + '" data-city="' + c + '"><b>' + c + '</b><small>' + (s.type === 'city' ? '관측소' : s.station) + '</small></button>';
    }).join('');
    el.querySelectorAll('[data-city]').forEach(function (btn) {
      btn.addEventListener('click', function () { state.city = btn.dataset.city; state.touched = true; save(); refreshChipsOn(el, 'city', btn.dataset.city); drawHero(); onTouched(); });
    });
    var on = el.querySelector('.is-on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });   /* UX-10 */
  }
  function bindTermStrip() {
    var el = $('termStrip'); if (!el) return;
    el.innerHTML = D.terms.map(function (t, i) { return '<button class="term-pill' + (i === state.ti ? ' is-on' : '') + '" data-term="' + i + '" aria-pressed="' + (i === state.ti) + '"><b>' + t.name + '</b><small>' + t.date + '</small></button>'; }).join('');
    el.querySelectorAll('[data-term]').forEach(function (btn) { btn.addEventListener('click', function () { state.ti = Number(btn.dataset.term); state.touched = true; save(); refreshChipsOn(el, 'term', btn.dataset.term); drawHero(); onTouched(); }); });
    var on = el.querySelector('.is-on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function bindMetricTabs() {
    var el = $('metricTabs'); if (!el) return;
    el.innerHTML = Object.keys(METRICS).map(function (k) { return '<button class="mtab' + (k === state.metric ? ' is-on' : '') + '" data-metric="' + k + '" role="tab" aria-selected="' + (k === state.metric) + '">' + METRICS[k].label + '</button>'; }).join('');
    el.querySelectorAll('[data-metric]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.metric = btn.dataset.metric; state.thr = METRICS[state.metric].def; state.touched = true; save();
        el.querySelectorAll('.mtab').forEach(function (x) { x.classList.toggle('is-on', x.dataset.metric === state.metric); x.setAttribute('aria-selected', x.dataset.metric === state.metric); });
        renderPresets(); drawHero(); onTouched();
      });
    });
  }
  function refreshChipsOn(el, kind, val) {
    el.querySelectorAll('button').forEach(function (b) { var on = b.dataset[kind] === val; b.classList.toggle('is-on', on); b.setAttribute(kind === 'city' ? 'aria-selected' : 'aria-pressed', on); });
  }

  var framed = false;
  /* 값이 그대로여도 '만졌다'는 사실은 반영한다 — 현재값 프리셋을 눌렀을 때 아무 반응이 없으면 안 된다.
     단 '기준을 실제로 바꿨는가'(moved)는 값이 달라졌을 때만 참이 된다 (RC-E). */
  function setThr(v) {
    var hr = heatRange();
    var nv = Math.max(hr.lo, Math.min(hr.hi, Math.round(v)));
    var changed = nv !== state.thr;
    state.thr = nv; state.touched = true;
    if (changed) state.moved = true;
    save();
    if (changed) { drawHero(); frameOnce(); } else { syncPresets(); }
    onTouched();
  }
  function frameOnce() {
    if (framed) return; framed = true;
    var ro = $('readouts');
    if (ro && ro.scrollIntoView && !REDUCE) ro.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }

  function bindThreshold() {
    var svg = $('heroSvg'); if (!svg) return;
    var dragging = false;
    function yOfThr() {
      var b = bounds(), r = svg.getBoundingClientRect();
      return r.top + (TP + (b.hi - state.thr) / (b.hi - b.lo) * (H - TP - BT)) * (r.height / H);
    }
    function valueAt(clientY) {
      var r = svg.getBoundingClientRect(); if (!r.height) return null;
      var b = bounds(), vy = (clientY - r.top) / r.height * H;
      var v = b.hi - (vy - TP) / (H - TP - BT) * (b.hi - b.lo);
      return isFinite(v) ? v : null;
    }
    /* 히트테스트: 기준선 근처에서만 드래그를 받는다 — 곡선을 보려는 탭이 값을 바꾸지 않게 (F-6) */
    svg.addEventListener('pointerdown', function (e) {
      if (Math.abs(e.clientY - yOfThr()) > 22) return;
      dragging = true;
      try { svg.setPointerCapture(e.pointerId); } catch (x) {}
      var v = valueAt(e.clientY); if (v != null) setThr(v);
    });
    svg.addEventListener('pointermove', function (e) { if (!dragging) return; var v = valueAt(e.clientY); if (v != null) setThr(v); });
    svg.addEventListener('pointerup', function () { dragging = false; });
    svg.addEventListener('pointercancel', function () { dragging = false; });
    $('thrRange').addEventListener('input', function () { setThr(Number($('thrRange').value)); });
    $('thrDown').addEventListener('click', function () { setThr(state.thr - 1); });
    $('thrUp').addEventListener('click', function () { setThr(state.thr + 1); });
    renderPresets();
  }
  var onTouched = function () {};

  /* ---------- 페이즈 렌더 ---------- */
  var introTimer = null, demoTimer = null;
  function stopTimers() {
    if (introTimer) { clearInterval(introTimer); introTimer = null; }
    if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
  }
  function setStage(html) {
    stopTimers(); framed = false;
    stage.innerHTML = html;
    renderProgress();
    document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { $(b.dataset.close).close(); }); });
    /* 화면이 바뀌면 제목으로 포커스를 옮겨 키보드·스크린리더 사용자가 새 화면에서 시작하게 한다 */
    var h = stage.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
  }

  /* ---------- 소개 화면 ---------- */
  function renderIntro() {
    state.phase = 'intro'; save();
    var s = D.cities['서울'].sensitivity;
    setStage('<section class="card intro-card">'
      + '<p class="intro-badge">기상청 ASOS(전국 종관기상관측) 실측 · 1969–2026 · 16지역 × 24절기</p>'
      + '<h1 class="intro-h">24절기의 약속은<br>아직 유효할까?</h1>'
      + '<div class="intro-actions"><button class="primary-btn" id="introStart">시작하기 →</button>'
      + '<button class="ghost-btn" id="introTerms">🌍 24절기가 뭐예요?</button>'
      + '<button class="ghost-btn" id="introGuide"><span aria-hidden="true">✦</span> 가이드로 먼저 해볼게요</button></div>'
      + '<div class="intro-preview"><svg id="introChart" viewBox="0 0 560 186" role="img" aria-label="서울 처서 무렵 과거와 현재 기온 미리보기 — 기준을 넘는 더위일이 과거보다 현재에 늘어납니다"></svg><p class="intro-counter" id="introCounter"></p></div>'
      + '<p class="intro-lead">“처서가 지나면 더위가 그친다” 같은 <b>절기의 약속</b>을, 내 지역의 <b>실제 기상 관측</b>으로 직접 검증하는 기후 학습 도구예요. 기준선을 손으로 정해 과거와 현재를 비교하며 <b>절기·날씨·기후</b>를 구분하는 힘을 기릅니다.</p>'
      + '<div class="intro-goals"><span>① 절기와 기후는 어떻게 다를까</span><span>② 이 자료는 어디까지 말할 수 있을까</span><span>③ ‘덥다’는 몇 도부터일까</span><span>④ 근거만큼만 결론 쓰기</span></div>'
      + '<p class="intro-foot">미션 하나 <b>핵심 2분</b>(+선택 심화) · ' + MISSIONS.length + '미션 핵심만 약 <b>12분</b> · 심화·자유탐구까지 45~55분 · 설치·로그인 없이 · 모바일 지원</p>'
      + '<p class="intro-teacher"><a href="./교사_학습지.html" target="_blank" rel="noopener">📄 교사용 학습지 — 수업 흐름·활동지·오개념 표·평가 루브릭 →</a></p>'
      + '</section>');
    $('introStart').addEventListener('click', function () { startMission(0); });
    $('introTerms').addEventListener('click', renderTerms);
    $('introGuide').addEventListener('click', renderTutorial);
    introPreview();
  }

  function introPreview() {
    var svg = $('introChart'); if (!svg) return;
    var WW = 560, HH = 186, LL = 8, RR = 8, TT = 12, BB = 20;
    var C = D.cities['서울'];
    var past = C.temp.past, pres = C.temp.present, doy = D.terms[15].doy;
    var all = past.concat(pres), lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    function xf2(i) { return LL + i / 364 * (WW - LL - RR); }
    function yf2(v) { return TT + (hi - v) / (hi - lo) * (HH - TT - BB); }
    function pathOf(a) { var d = ''; for (var i = 0; i < 365; i++) d += (i ? 'L' : 'M') + xf2(i).toFixed(1) + ' ' + yf2(a[i]).toFixed(1); return d; }
    var tx = xf2(doy - 1), pastP = pathOf(past), presP = pathOf(pres);
    function draw(thr) {
      var yT = yf2(thr), fill = '', seg = null;
      function sp(s) { var d = 'M' + xf2(s[0]).toFixed(1) + ' ' + yT.toFixed(1); for (var k = s[0]; k <= s[1]; k++) d += 'L' + xf2(k).toFixed(1) + ' ' + yf2(pres[k]).toFixed(1); return d + 'L' + xf2(s[1]).toFixed(1) + ' ' + yT.toFixed(1) + 'Z'; }
      for (var i = 0; i < 365; i++) { if (pres[i] >= thr) { if (!seg) seg = [i, i]; else seg[1] = i; } else if (seg) { fill += sp(seg); seg = null; } }
      if (seg) fill += sp(seg);
      svg.innerHTML = '<path d="' + fill + '" fill="#ff8066" fill-opacity="0.15"/>'
        + '<path d="' + pastP + '" fill="none" stroke="#a7bdc5" stroke-width="1.6" stroke-dasharray="4 3"/>'
        + '<path d="' + presP + '" fill="none" stroke="#ff8066" stroke-width="2.3"/>'
        + '<line x1="' + tx.toFixed(1) + '" y1="' + TT + '" x2="' + tx.toFixed(1) + '" y2="' + (HH - BB) + '" stroke="#ffbe58" stroke-width="1.4" stroke-dasharray="3 3"/>'
        + '<text x="' + (tx + 4).toFixed(1) + '" y="' + (TT + 9) + '" fill="#ffbe58" font-size="10">처서(고정)</text>'
        + '<line x1="' + LL + '" y1="' + yT.toFixed(1) + '" x2="' + (WW - RR) + '" y2="' + yT.toFixed(1) + '" stroke="#caa8ff" stroke-width="1.8"/>';
      var c = $('introCounter');
      if (c) c.innerHTML = '서울 · <b class="ip-pill">덥다 ' + thr + '°</b> 기준 더위일 <b class="past">과거 연평균 ' + fmtDays(C.temp.exceedDays.past[String(thr)] || 0) + '</b> → <b class="now">현재 ' + fmtDays(C.temp.exceedDays.present[String(thr)] || 0) + '</b>';
    }
    if (REDUCE) { draw(25); return; }
    var startThr = 30, end = 25, steps = 12, n = 0;
    draw(startThr);
    introTimer = setInterval(function () {
      n++; draw(Math.round(startThr + (end - startThr) * (n / steps)));
      if (n >= steps) { draw(end); clearInterval(introTimer); introTimer = null; }
    }, 80);
  }

  /* ---------- 24절기 입문: 공전 궤도 시각화 ----------
     학생 대부분은 24절기를 모른다. 텍스트 설명 대신 '지구가 어디에 있을 때가 그 절기인가'를
     궤도 위에서 직접 보게 한다. 계절의 원인이 거리가 아니라 자전축 기울기라는 것도 함께 교정한다. */
  var SEASON_COLOR = { spring: '#8de0a5', summer: '#ff8066', autumn: '#ffbe58', winter: '#77bff7' };
  var SEASON_KR = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
  var orbitSel = 15;   /* 처서 */

  /* 근일점 1월 4일 기준 지구–태양 거리(AU). 계절이 거리 때문이 아님을 수치로 보이기 위한 값. */
  function sunDistance(doy) {
    var g = (357.528 + 0.9856003 * (doy - 1)) * Math.PI / 180;
    return 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  }
  function termLongitude(i) { return ((i * 15) + 285) % 360; }   /* 소한(i=0)=황경 285° */

  function renderTerms() {
    state.phase = 'terms'; save();
    setStage('<section class="card orbit-card"><h1 class="stage-h">24절기는 무엇일까?</h1>'
      + '<p class="sub">조상들이 1년을 <b>24칸</b>으로 나눈 달력이에요. 아래 궤도에서 <b>절기를 눌러</b> 보세요.</p>'
      + '<div class="orbit-wrap"><svg id="orbitSvg" viewBox="0 0 640 460" role="img" aria-label="지구 공전 궤도 위의 24절기 위치와 자전축 기울기"></svg></div>'
      + '<div id="termCard" class="term-card" aria-live="polite"></div>'
      + '<div class="why-box">'
      + '<h2 class="why-h">왜 조상들은 24절기를 만들었을까?</h2>'
      + '<p class="why-p">옛날 달력은 <b>달의 모양</b>을 기준으로 삼았어요(음력). 그런데 달 12번이 도는 데는 <b>354일</b>, 지구가 태양을 한 바퀴 도는 데는 <b>365.24일</b>이 걸립니다.</p>'
      + '<div id="driftViz"></div>'
      + '<p class="why-p">해마다 <b>약 11일</b>씩 어긋나서, <b>3년이면 한 달</b>이 밀립니다. 달력만 보고 씨를 뿌리면 해마다 시기가 달라져 농사를 망치죠.</p>'
      + '<p class="why-p">그래서 <b>태양의 위치</b>로 1년을 24칸으로 나눈 <b>24절기</b>를 함께 썼습니다. 절기는 <b>날씨 예보가 아니라 농사 일정표</b>였어요 — “곡우에 못자리”, “망종에 모내기”처럼요.</p>'
      + '<h2 class="why-h">그럼 절기와 기후는 무슨 관계일까?</h2>'
      + '<p class="why-p">절기 날짜는 <b>태양의 위치</b>로 정해져 해마다 거의 그대로입니다. 하지만 그 무렵의 <b>실제 날씨</b>는 해마다, 지역마다 다르고 <b>수십 년에 걸쳐 변합니다.</b> '
      + '이 앱이 하는 일이 바로 그 비교예요 — <b>움직이지 않는 절기</b>와 <b>움직이는 기후</b>를 나란히 놓고 봅니다.</p>'
      + '</div>'
      + '<div class="orbit-actions"><button class="primary-btn" id="orbitStart">이제 검증하러 가기 →</button>'
      + '<button class="ghost-btn" id="orbitBack">← 소개로</button></div>'
      + '</section>');
    drawOrbit();
    drawDrift();
    $('orbitStart').addEventListener('click', function () { startMission(0); });
    $('orbitBack').addEventListener('click', renderIntro);
  }

  function drawOrbit() {
    var svg = $('orbitSvg'); if (!svg) return;
    var CX = 320, CY = 214, RX = 250, RY = 158, sunR = 26;
    function pos(i) {
      var a = (termLongitude(i) - 90) * Math.PI / 180;
      return { x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a) };
    }
    var g = '';
    /* 계절 구간 호 — 색으로 사계절을 먼저 알아보게 */
    for (var k = 0; k < 24; k++) {
      var a = pos(k), b = pos((k + 1) % 24), c = D.terms[k];
      g += '<line x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1)
        + '" stroke="' + (SEASON_COLOR[c.season] || '#889') + '" stroke-width="5" stroke-linecap="round" opacity="0.5"/>';
    }
    /* 태양 */
    g += '<circle cx="' + CX + '" cy="' + CY + '" r="' + sunR + '" fill="url(#sunG)"/>'
      + '<text x="' + CX + '" y="' + (CY + 5) + '" text-anchor="middle" font-size="13" font-weight="800" fill="#4a2c00">태양</text>';
    /* 절기 점 + 이름 */
    for (var i = 0; i < 24; i++) {
      var pt = pos(i), t = D.terms[i], on = i === orbitSel;
      var lr = 1.13, lx = CX + (pt.x - CX) * lr, ly = CY + (pt.y - CY) * lr;
      g += '<g class="orb-term' + (on ? ' is-on' : '') + '" data-term="' + i + '" tabindex="0" role="button" aria-label="' + t.name + ' ' + t.date + '">'
        + '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="' + (on ? 11 : 6.5) + '" fill="' + (SEASON_COLOR[t.season] || '#889') + '"'
        + (on ? ' stroke="#fff" stroke-width="2.5"' : ' stroke="#0b2231" stroke-width="1"') + '/>'
        + '<text x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" text-anchor="middle" font-size="' + (on ? 13 : 11)
        + '" font-weight="' + (on ? 800 : 500) + '" fill="' + (on ? '#fff' : '#9fb3ba') + '">' + t.name + '</text></g>';
    }
    /* 선택 절기의 지구 — 자전축은 언제나 같은 방향을 가리킨다(계절의 진짜 원인) */
    var e = pos(orbitSel), tilt = 23.44 * Math.PI / 180, ax = Math.sin(tilt) * 26, ay = Math.cos(tilt) * 26;
    g += '<line x1="' + CX + '" y1="' + CY + '" x2="' + e.x.toFixed(1) + '" y2="' + e.y.toFixed(1) + '" stroke="#ffbe58" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.6"/>'
      + '<circle cx="' + e.x.toFixed(1) + '" cy="' + e.y.toFixed(1) + '" r="17" fill="#2f7fbf" stroke="#cfe9ff" stroke-width="1.5"/>'
      + '<path d="M' + (e.x - 17).toFixed(1) + ' ' + e.y.toFixed(1) + ' a17 17 0 0 1 34 0" fill="#3a9c6a" opacity="0.55"/>'
      + '<line x1="' + (e.x - ax).toFixed(1) + '" y1="' + (e.y + ay).toFixed(1) + '" x2="' + (e.x + ax).toFixed(1) + '" y2="' + (e.y - ay).toFixed(1)
      + '" stroke="#fff" stroke-width="2.4"/>'
      + '<circle cx="' + (e.x + ax).toFixed(1) + '" cy="' + (e.y - ay).toFixed(1) + '" r="3.4" fill="#fff"/>'
      + '<text x="' + (e.x + ax + 8).toFixed(1) + '" y="' + (e.y - ay - 4).toFixed(1) + '" font-size="10.5" fill="#dfeaee">북극</text>';
    /* 근일점·원일점 — 거리 오개념 교정의 근거 */
    var per = pos(0.13), aph = pos(12.13);
    g += '<text x="' + per.x.toFixed(1) + '" y="' + (per.y + 30).toFixed(1) + '" text-anchor="middle" font-size="10.5" fill="#8fd3f4">1월 초 · 가장 가까움</text>'
      + '<text x="' + aph.x.toFixed(1) + '" y="' + (aph.y - 22).toFixed(1) + '" text-anchor="middle" font-size="10.5" fill="#ffb0a0">7월 초 · 가장 멂</text>';
    svg.innerHTML = '<defs><radialGradient id="sunG"><stop offset="0%" stop-color="#fff3c4"/><stop offset="100%" stop-color="#ffbe58"/></radialGradient></defs>'
      + '<ellipse cx="' + CX + '" cy="' + CY + '" rx="' + RX + '" ry="' + RY + '" fill="none" stroke="rgba(217,238,238,.18)" stroke-width="1.5"/>' + g;
    svg.querySelectorAll('[data-term]').forEach(function (el) {
      function pick() { orbitSel = Number(el.dataset.term); drawOrbit(); }
      el.addEventListener('click', pick);
      el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
    });
    drawTermCard();
  }

  function drawTermCard() {
    var el = $('termCard'); if (!el) return;
    var t = D.terms[orbitSel], C = D.cities['서울'];
    var i = Math.max(0, Math.min(364, t.doy - 1));
    var past = C.temp.past[i], now = C.temp.present[i];
    var dist = sunDistance(t.doy);
    el.innerHTML = '<div class="tc-head"><span class="tc-season" style="background:' + (SEASON_COLOR[t.season] || '#889') + '">' + (SEASON_KR[t.season] || '') + '</span>'
      + '<b class="tc-name">' + t.name + '</b><span class="tc-hanja">' + t.hanja + '</span><span class="tc-date">양력 ' + t.date + ' 무렵</span></div>'
      + '<p class="tc-gloss">' + t.hanja_gloss + ' → <b>' + t.meaning + '</b></p>'
      + '<p class="tc-desc">' + t.desc + '</p>'
      + '<div class="tc-facts">'
      + '<div><small>서울 이 무렵 기온</small><b>' + past.toFixed(1) + '°C <i>→</i> <span class="hot">' + now.toFixed(1) + '°C</span></b>'
      + '<em>과거 ' + PERIOD_PAST + ' → 현재 ' + PERIOD_NOW + '</em></div>'
      + '<div><small>지구–태양 거리</small><b>' + dist.toFixed(3) + ' AU</b><em>1월 초 0.983 / 7월 초 1.017</em></div>'
      + '</div>'
      + '<p class="tc-myth"><b>흔한 오해</b> “여름은 지구가 태양에 가까워서 덥다”? — 실제로는 <b>가장 추운 1월 초에 가장 가깝습니다.</b> '
      + '거리 차이는 3.4%뿐이고, 계절을 만드는 것은 <b>자전축이 23.4° 기울어져 있다는 사실</b>이에요. '
      + '축은 늘 같은 방향을 가리키기 때문에, 지구가 궤도를 돌면 북반구가 태양 쪽으로 기울었다가(여름) 반대로 기울었다가(겨울) 합니다.</p>';
  }

  /* 음력과 태양년의 어긋남 — 24절기가 필요했던 이유를 막대로 */
  function drawDrift() {
    var el = $('driftViz'); if (!el) return;
    var W = 640, H = 118, L = 92, R = 18, maxD = 400;
    function w(d) { return (W - L - R) * d / maxD; }
    var rows = [['태양년 (지구 한 바퀴)', 365.24, '#ffbe58'], ['음력 12달', 354.37, '#77bff7']];
    var g = '';
    rows.forEach(function (r, k) {
      var y = 14 + k * 34;
      g += '<text x="0" y="' + (y + 14) + '" font-size="11.5" fill="#9fb3ba">' + r[0] + '</text>'
        + '<rect x="' + L + '" y="' + y + '" width="' + w(r[1]).toFixed(1) + '" height="20" rx="5" fill="' + r[2] + '" opacity="0.8"/>'
        + '<text x="' + (L + w(r[1]) + 7).toFixed(1) + '" y="' + (y + 15) + '" font-size="11.5" font-weight="700" fill="#dfeaee">' + r[1] + '일</text>';
    });
    var gap = 365.24 - 354.37;
    g += '<rect x="' + (L + w(354.37)).toFixed(1) + '" y="10" width="' + w(gap).toFixed(1) + '" height="58" fill="#ff8066" opacity="0.25"/>'
      + '<text x="' + (L + w(354.37) + w(gap) / 2).toFixed(1) + '" y="90" text-anchor="middle" font-size="11.5" font-weight="800" fill="#ff8066">해마다 ' + gap.toFixed(1) + '일 어긋남</text>'
      + '<text x="' + (L + w(354.37) + w(gap) / 2).toFixed(1) + '" y="107" text-anchor="middle" font-size="11" fill="#ffb0a0">3년이면 약 한 달</text>';
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="태양년 365.24일과 음력 12달 354.37일의 차이 약 11일" class="drift-svg">' + g + '</svg>';
  }

  /* ---------- 가이드 ---------- */
  var TUT = { city: '대구', ti: 12, metric: 'temp', thr: 25 };
  var tutStep = 0;
  var TUT_STEPS = [
    { html: '이 그래프는 <b>대구</b>의 하루 기온이에요. <b class="tc-past">회색 점선</b> = 옛날(' + PERIOD_PAST + '), <b class="tc-now">빨강</b> = 지금(' + PERIOD_NOW + ').', btn: '다음' },
    { html: '보라색 <b>‘덥다’ 기준선</b>의 <b>⇅ 손잡이</b>를 잡아 위아래로 <b>끌어 보세요.</b> (슬라이더·＋−·프리셋으로도 됩니다)', wait: true, highlight: 'chart' },
    { html: '기준이 바뀌는 순간 <b>차트 위의 숫자</b>가 과거 → 현재로 즉시 바뀌죠? 만지면 0초로 반응해요.', btn: '다음', highlight: 'live' },
    { html: '노란 세로선은 <b>소서(절기)</b>예요. 태양 위치로 정한 날짜라 <b>해마다 거의 움직이지 않아요</b> — 움직이는 건 기후(곡선)입니다.', btn: '다음' },
    { html: '조작법은 이게 전부예요! 이제 진짜 임무 <b>‘처서’</b>로 가 볼까요?', btn: '진짜 임무 시작 →', done: true }
  ];
  function renderTutorial() {
    state.phase = 'tutorial'; state.city = TUT.city; state.ti = TUT.ti; state.metric = TUT.metric; state.thr = TUT.thr;
    state.touched = false; state.moved = false; tutStep = 0; save();
    setStage('<section class="card tutorial-card"><h1 class="sr-only">가이드 — 조작법 익히기</h1>'
      + '<div class="tut-top"><span class="tut-badge">가이드 · 조작법 익히기</span><button class="tut-skip" id="tutSkip">건너뛰기 →</button></div>'
      + '<div class="tut-coach" id="tutCoach"></div>'
      + heroShell({})
      + '</section>');
    bindThreshold(); bindViewTools(); drawHero();
    $('tutSkip').addEventListener('click', function () { demoPlayed = true; startMission(0); });
    onTouched = function () { if (tutStep === 1) tutNext(); };
    renderCoach();
  }
  function renderCoach() {
    var s = TUT_STEPS[tutStep], c = $('tutCoach'); if (!c) return;
    c.innerHTML = '<div class="tut-dots" aria-hidden="true">' + TUT_STEPS.map(function (_, i) { return '<i class="' + (i <= tutStep ? 'on' : '') + '"></i>'; }).join('') + '</div>'
      + '<p class="tut-text">' + s.html + '</p>'
      + (s.btn ? '<button class="tut-btn" id="tutBtn">' + s.btn + '</button>' : '<span class="tut-hint">↑ 기준선을 옮기면 다음 단계로 넘어가요</span>');
    if (s.highlight === 'live') flash($('liveNums'));
    if (s.highlight === 'chart') flash($('heroSvg'));
    if ($('tutBtn')) $('tutBtn').addEventListener('click', function () { if (s.done) { demoPlayed = true; startMission(0); } else tutNext(); });
  }
  function tutNext() { if (tutStep < TUT_STEPS.length - 1) { tutStep++; renderCoach(); } }

  var HEADLINES = { chuseo: '처서의 약속은 아직 유효할까?', summer: '‘여름’은 며칠이 되었을까?', region: '이 변화, 우리 지역만 그럴까?', rain: '비는 줄었을까, 늘었을까?', lag: '가장 더운 날은 왜 하지가 아닐까?' };
  var demoPlayed = false, overlayOpen = false;

  function startMission(i) {
    var m = MISSIONS[i];
    state.phase = 'mission'; state.mi = i; state.city = m.city; state.ti = m.ti; state.metric = m.metric;
    state.thr = m.thr; state.thr0 = m.thr; state.touched = false; state.moved = false; overlayOpen = false;
    if (m.lagMode) { state.markDoy = null; state.lagSeason = 'summer'; state.ti = 11; }
    save();
    renderExplore();
  }

  function missionAsk(m) {
    return m.id === 'chuseo'
      ? { q: PRE_QUESTION.q, options: PRE_QUESTION.options, get: function () { return state.pre; }, set: function (v) { state.pre = v; } }
      : { q: m.predict ? m.predict.q : '', options: m.predict ? m.predict.options : [], get: function () { return state.predicts[m.id]; }, set: function (v) { state.predicts[m.id] = v; } };
  }
  function missionAsked(m) { var a = missionAsk(m); return !a.options.length || a.get() != null; }
  /* 판정 조건: 기준선을 '실제로 옮겼는가' — 칩만 눌러 통과하지 못하게 (RC-E) */
  function canJudge(m) {
    if (m.lagMode) return !!state.markDoy && !!state.lagRevealed && missionAsked(m);
    return state.moved && missionAsked(m);
  }
  function updateGate(m) {
    var btn = $('toVerdict'), hint = $('touchHint'); if (!btn) return;
    btn.classList.toggle('is-muted', !canJudge(m));
    hint.classList.remove('hint-urge');
    if (m.lagMode) {
      hint.innerHTML = !state.markDoy ? '그래프를 <b>좌우로</b> 끌어 가장 더울 것 같은 날을 찍어 보세요.'
        : (!state.lagRevealed ? '<b>‘실제와 비교하기’</b>를 눌러 실제 기록과 맞춰 보세요.'
        : (!missionAsked(m) ? '예측을 봉인하면 판정할 수 있어요.' : '좋아요 — 준비되면 판정하세요.'));
    } else {
      hint.innerHTML = !state.moved
        ? '보라색 기준선의 <b>⇅ 손잡이</b>를 잡아 위아래로 끌어 보세요. 아래 슬라이더·＋−로도 1' + metricOf().unit + '씩 맞출 수 있어요.'
        : (!missionAsked(m) ? '예측을 봉인하면 판정할 수 있어요.' : '좋아요 — 준비되면 판정하세요.');
    }
  }
  function flash(el) { if (!el) return; el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash'); }

  function showPredictOverlay(m) {
    var a = missionAsk(m), el = $('predictOverlay');
    if (!el || overlayOpen || a.get() != null || !a.options.length) return;
    overlayOpen = true; el.hidden = false;
    el.innerHTML = '<div class="po-inner" role="dialog" aria-label="예측 봉인"><p class="po-eyebrow">방금 만져 봤죠 · 예측 봉인</p><p class="po-q" id="poQ">' + a.q + '</p><div class="po-choices">'
      + a.options.map(function (o) { return '<button class="po-choice" data-v="' + o.v + '"><b>' + o.t + '</b>' + (o.s ? '<small>' + o.s + '</small>' : '') + '</button>'; }).join('')
      + '</div><p class="po-note">정답을 맞히는 게 아니에요. 지금 생각을 봉인해 두고, 검증이 끝나면 다시 확인합니다.</p></div>';
    /* 화면 밖에서 열리지 않게 스크롤·포커스를 옮긴다 (UX-3) */
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: REDUCE ? 'auto' : 'smooth' });
    var first = el.querySelector('.po-choice'); if (first) try { first.focus(); } catch (e) {}
    el.querySelectorAll('[data-v]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        a.set(btn.dataset.v); save(); overlayOpen = false; el.hidden = true; el.innerHTML = '';
        drawHero();                                   /* 봉인 완료 → 잠겼던 수치를 연다 */
        if (!demoPlayed && state.mi === 0) { demoPlayed = true; setTimeout(function () { autoDemo(m); }, 250); }
        updateGate(m); var t = $('toVerdict'); if (t) t.focus();
      });
    });
  }

  function autoDemo(m) {
    if (REDUCE) return;
    var hr = heatRange(), start = Math.min(hr.hi, m.thr + 4), end = m.thr, steps = 10, i = 0;
    state.thr = start; drawHero();
    demoTimer = setInterval(function () {
      i++; state.thr = Math.round(start + (end - start) * (i / steps)); drawHero();
      if (i >= steps) { state.thr = end; drawHero(); stopTimers(); }
    }, 80);
  }

  function renderExplore() {
    var m = MISSIONS[state.mi], useCompare = !!m.compare;
    state.phase = 'mission'; overlayOpen = false; save();
    setStage('<section class="card explore-card">'
      + '<h1 class="hero-headline">' + (HEADLINES[m.id] || m.title) + '</h1>'
      + '<div class="mhead"><span class="mno">미션 ' + (state.mi + 1) + ' / ' + MISSIONS.length + '</span><span class="goal-chip">' + m.goal + '</span><span class="time-chip">핵심 <b>2분</b></span></div>'
      + '<p class="hero-sub"><span class="step-tag">핵심</span> <b>지금 할 일</b> ' + m.task + '</p>'
      + '<details class="brief-box"><summary>이 미션은 무엇을 확인하나요?</summary><p>' + m.brief + '</p></details>'
      + '<p class="deep-hint"><span class="step-tag is-opt">선택 심화</span> 시간이 남으면 — 지역·절기를 바꿔 보고, ‘표’와 ‘지도’ 보기로 같은 결론이 나오는지 확인해 보세요. <b>핵심만 해도 미션은 완료됩니다.</b></p>'
      + heroShell({ cityChips: !m.lockCity || useCompare, termStrip: !m.lockTerm, lagMode: !!m.lagMode })
      + '<div id="kmaRefMount"></div>'
      + '<div class="explore-actions"><button class="primary-btn is-muted" id="toVerdict">이 결과로 판정하기 →</button><small id="touchHint"></small></div>'
      + '<div class="predict-overlay" id="predictOverlay" hidden></div>'
      + '</section>');
    if (useCompare) bindCityChips(m.compare); else if (!m.lockCity) bindCityChips();
    if (!m.lockTerm) bindTermStrip();
    if (m.lagMode) bindLagControls(); else bindThreshold();
    bindViewTools(); drawHero(); updateKmaRef();
    onTouched = function () { stopTimers(); if (!missionAsked(m)) showPredictOverlay(m); updateGate(m); };
    updateGate(m);
    $('toVerdict').addEventListener('click', function () {
      if (m.lagMode ? (!state.markDoy || !state.lagRevealed) : !state.moved) {
        var h = $('touchHint');
        h.innerHTML = m.lagMode
          ? (!state.markDoy ? '먼저 그래프를 <b>좌우로 끌어</b> 날짜를 찍어 주세요 ↑' : '<b>‘실제와 비교하기’</b>를 눌러 주세요 ↑')
          : '아직 판정할 수 없어요 — 먼저 <b>‘덥다’ 기준선</b>을 옮겨 과거·현재를 비교해 보세요 ↑';
        h.classList.add('hint-urge'); flash($('heroSvg')); flash(h); return;
      }
      if (!missionAsked(m)) { var h2 = $('touchHint'); h2.textContent = '예측을 먼저 봉인해 주세요 ↓'; h2.classList.add('hint-urge'); showPredictOverlay(m); return; }
      renderVerdict();
    });
    /* 자동 시연은 예측을 봉인한 뒤에 실행한다 (RC-G). 이미 봉인된 재방문 학습자에게는 바로 보여 준다. */
    if (!demoPlayed && state.mi === 0 && state.pre != null) { demoPlayed = true; setTimeout(function () { autoDemo(m); }, 400); }
  }

  /* ---------- 판정 ---------- */
  function cerlHTML(v) {
    return '<p class="cerl"><span class="t t-c">주장</span> ' + v.c + '</p>'
      + '<p class="cerl"><span class="t t-e">근거</span> ' + v.e + '</p>'
      + '<p class="cerl"><span class="t t-r">추론</span> ' + v.r + '</p>'
      + '<p class="cerl cerl-l"><span class="t t-l">한계</span> ' + v.l + '</p>';
  }
  function renderVerdict() {
    var m = MISSIONS[state.mi], n = stat(), v = m.verdict(n);
    state.phase = 'verdict';
    save();
    var html = '<section class="card verdict-card"><h1 class="sr-only">미션 ' + (state.mi + 1) + ' 판정 — ' + m.title + '</h1>'
      + '<div class="mhead"><span class="mno">미션 ' + (state.mi + 1) + ' / ' + MISSIONS.length + ' · 판정</span><span class="goal-chip">' + m.goal + '</span></div>'
      + '<p class="eyebrow">판정 — 주장 · 근거 · 추론 · 한계(CERL)</p>'
      + cerlHTML(v)
      + sparkBlock(state.city, 'temp')
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
    state.selfChecks[m.id] = { picked: btn.dataset.v, correct: right }; save();
    $('scChoices').querySelectorAll('[data-v]').forEach(function (b) { b.disabled = true; if (b.dataset.v === sc.correct) b.classList.add('is-right'); else if (b === btn) b.classList.add('is-wrong'); });
    var ex = $('scExplain'); ex.hidden = false;
    ex.innerHTML = (right ? '<b class="ok">맞아요.</b> ' : '<b class="no">다시 볼까요.</b> ') + sc.explain
      + (right ? '' : ' <button class="inline-btn" id="backToChart">기준선을 직접 옮겨 확인하기 →</button>');
    if ($('backToChart')) $('backToChart').addEventListener('click', renderExplore);
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
        var preRight = state.pre === PRE_QUESTION.correct, postRight = state.post === PRE_QUESTION.correct, preUnsure = state.pre === 'c';
        if (preUnsure && postRight) g.innerHTML = '<b class="ok">확인했어요.</b> 처음엔 “잘 모르겠다”였는데, 이제 절기(천문 날짜)와 기후(관측)를 구분해 설명했습니다.';
        else if (!preRight && postRight) g.innerHTML = '<b class="ok">생각이 자랐어요.</b> 처음엔 다른 답을 골랐는데, 이제 절기(천문 날짜)와 기후(관측)를 구분했습니다.';
        else if (postRight) g.innerHTML = '<b class="ok">정확합니다.</b> 절기 날짜는 그대로, 관측된 더위가 늦게까지 이어지는 것 — 처음부터 끝까지 일관되게 구분했습니다.';
        else g.innerHTML = '핵심은 이것이에요: <b>절기 날짜는 그대로인데</b>, 같은 절기 무렵 ‘덥다’ 기준을 넘는 날이 늦게까지 이어지는 것입니다. 절기 자체가 더워진 것이 아닙니다.';
        revealVerdictActions();
      });
    });
  }

  function revealVerdictActions() {
    var m = MISSIONS[state.mi], au = $('missionAudit');
    /* RC-S: 자가진단까지 마친 뒤에 완료(✓)로 표시한다 — 판정 화면 진입만으로 점등하지 않는다 */
    if (state.done.indexOf(m.id) === -1) { state.done.push(m.id); save(); renderProgress(); }
    if (au && au.hidden) {
      au.hidden = false;
      /* 감사 상자는 비워 둔다 — 앱이 학습자 대신 결론을 쓰지 않는다 (F-2) */
      au.innerHTML = '<div class="judge-box"><p class="eyebrow">✦ AI 증거 감사관 (선택)</p>'
        + '<label class="draft-label" for="freeDraft">내 판정문 <small>지역 · 기간 · 기준 · 한계를 넣어 <b>내 말로</b> 한 문장</small></label>'
        + '<textarea id="freeDraft" maxlength="400" placeholder="예: ' + escapeHTML(exampleSentence(m)) + '"></textarea>'
        + '<div class="ai-row"><button class="ghost-btn small-btn" id="showExample" type="button">✎ 예시 문장 넣기</button>'
        + '<button class="ai-btn" id="askAudit"><span aria-hidden="true">✦</span> AI 감사 요청</button></div>'
        + '<p class="audit-status" id="auditStatus">판정문을 쓰면 과장 · 범위 · 인과를 점검합니다. AI가 응답하지 않아도 같은 항목을 규칙 점검이 확인합니다.</p>'
        + '<div class="audit-result" id="auditResult" hidden></div></div>';
      var ta = $('freeDraft');
      ta.value = state.missionDraft[m.id] || '';
      ta.addEventListener('input', function () { state.missionDraft[m.id] = ta.value.slice(0, 400); save(); });
      $('showExample').addEventListener('click', function () {
        ta.value = exampleSentence(m); state.missionDraft[m.id] = ta.value; save(); ta.focus();
        $('auditStatus').textContent = '예시를 넣었어요 — 지역·숫자·한계 중 한 부분이라도 내 말로 바꾼 뒤 감사를 요청하세요.';
      });
      $('askAudit').addEventListener('click', function () { doAudit(exampleSentence(m)); });
    }
    var acts = $('verdictActions'); acts.hidden = false;
    var next = state.mi + 1;
    acts.innerHTML = (next < MISSIONS.length
      ? '<button class="primary-btn" id="nextMission">다음 미션 →</button>'
      : '<button class="primary-btn" id="toFree">검증 마치고 결과 받기 →</button>')
      + '<button class="ghost-btn" id="retry">기준 다시 조작하기 <small>(판정문은 유지)</small></button>';
    if ($('nextMission')) $('nextMission').addEventListener('click', function () { startMission(next); });
    if ($('toFree')) $('toFree').addEventListener('click', renderComplete);
    $('retry').addEventListener('click', renderExplore);
  }

  function exampleSentence(m) {
    var n = stat();
    if (m.id === 'region') {
      var A = n.regionOf('제주'), B = n.regionOf('강원');
      return '처서 뒤 더위가 그치는 날은 제주 ' + A.cStr + ', 강원(춘천) ' + B.cStr + '로 지역마다 다르다(' + n.sampleText + ' 비교). 그래서 한 지역 결과를 전국으로 넓혀 말하기는 어렵다.';
    }
    return n.city + '에서 ‘덥다’를 ' + n.thr + '°C로 정하면 기준 이상 더위일이 연평균 과거 ' + n.pdStr + ' → 현재 ' + n.cdStr + '로 나타났다(' + n.sampleText + '). 다만 이는 5년 관측 신호라 전국이나 원인으로 넓히기는 어렵다.';
  }

  /* ---------- 완료 · 고향 기후 카드 ---------- */
  function renderComplete() {
    state.phase = 'complete'; save();
    var sc = MISSIONS.map(function (m) { var s = state.selfChecks[m.id]; return '<li>' + m.title + ' — ' + (s ? (s.correct ? '자가진단 정답' : '자가진단 다시 확인') : '미응답') + '</li>'; }).join('');
    var drafts = MISSIONS.filter(function (m) { return (state.missionDraft[m.id] || '').trim(); })
      .map(function (m) { return '<li><b>' + m.title + '</b><br>' + escapeHTML(state.missionDraft[m.id]) + '</li>'; }).join('');
    var yrs = D.cities['서울'].timeline.years;
    setStage('<section class="card done-card"><div class="burst" aria-hidden="true">✦</div><p class="eyebrow">' + MISSIONS.length + '개 미션 완료</p>'
      + '<h1 class="stage-h">검증을 마쳤어요.</h1>'
      + '<p class="sub">당신은 절기(고정)와 기후(이동)를 구분하고, 기준을 정의하고, 자료의 범위를 지켜 판정했습니다.</p>'
      + '<div class="skill-row"><span>① 절기≠기후</span><span>② 자료의 범위</span><span>③ 기준 정의</span><span>④ 근거만큼 결론</span></div>'
      + '<div class="record"><p class="eyebrow">내 기록 <small>(수업에 제출할 때 이 부분을 복사하거나 인쇄하세요)</small></p><ul class="rec-list">' + sc + '</ul>'
      + (drafts ? '<p class="eyebrow">내가 쓴 판정문</p><ul class="rec-list">' + drafts + '</ul>' : '')
      + '<div class="rec-actions"><button class="ghost-btn" id="copyRec">기록 복사</button><button class="ghost-btn" id="printRec">인쇄 / PDF로 저장</button></div></div>'
      + '<div class="cardmaker"><p class="eyebrow">내 고향 기후 카드 · 공유용</p>'
      + '<p class="cardmaker-sub">내가 태어난 무렵과 지금, 우리 지역 기후가 어떻게 달라졌는지 실측으로 카드를 만들어요. (태어난 해 <b>±2년 평균</b>과 <b>최근 5년 평균</b>을 비교합니다 — 한 해만 비교하면 그 해 날씨에 휘둘리기 때문입니다.)</p>'
      + '<div class="cardmaker-row"><label>지역<select id="cardCity"></select></label><label>태어난 해<input id="cardYear" type="number" min="' + yrs[0] + '" max="' + yrs[yrs.length - 1] + '" value="2008" inputmode="numeric" /></label><button class="primary-btn" id="makeCard">카드 만들기</button></div>'
      + '<p class="card-hint" id="cardHint"></p>'
      + '<div id="cardPreview" class="card-preview" hidden></div><a id="cardSave" class="ghost-btn card-save" download="weather24_기후카드.png" hidden>이미지 저장 ↓</a></div>'
      + '<details class="global-box" id="globalBox"><summary>🌍 지구 전체는 어떨까? — 이산화탄소와 지구 평균기온</summary><div id="globalMount"></div></details>'
      + '<button class="ghost-btn" id="startFree">내 지역·지표로 자유탐구 →</button>'
      + '<p class="intro-teacher"><a href="./교사_학습지.html" target="_blank" rel="noopener">📄 교사용 학습지 (인쇄용) →</a></p></section>');
    $('cardCity').innerHTML = CITIES.map(function (c) { return '<option value="' + c + '"' + (c === state.city ? ' selected' : '') + '>' + c + ' (' + D.cities[c].station + ')</option>'; }).join('');
    /* 출생연도 ±2년 창이 '최근 5년' 창과 겹치면 차이가 0이 되므로 상한을 그 앞까지로 둔다 (RC-F) */
    function syncYearBounds() {
      var ys = cityOf($('cardCity').value).timeline.years, hi = ys[ys.length - 6] || ys[0];
      var el = $('cardYear'); el.min = ys[0]; el.max = hi;
      if (Number(el.value) > hi) el.value = hi;
      if (Number(el.value) < ys[0]) el.value = ys[0];
      $('cardHint').textContent = $('cardCity').value + '(' + cityOf($('cardCity').value).station + ') 관측소 · 고를 수 있는 해: ' + ys[0] + '~' + hi + ' (최근 5년과 겹치지 않는 해만 비교가 됩니다)';
    }
    $('cardCity').addEventListener('change', syncYearBounds); syncYearBounds();
    $('makeCard').addEventListener('click', function () {
      var city = $('cardCity').value, ys = cityOf(city).timeline.years, hi = ys[ys.length - 6] || ys[0];
      var y = Math.max(ys[0], Math.min(hi, Number($('cardYear').value) || 2008));
      $('cardYear').value = y;
      var cv = makeCard(city, y);
      var prev = $('cardPreview'); prev.hidden = false; prev.innerHTML = ''; cv.className = 'card-canvas'; prev.appendChild(cv);
      cv.toBlob(function (blob) { var a = $('cardSave'); if (a.href) URL.revokeObjectURL(a.href); a.href = URL.createObjectURL(blob); a.hidden = false; }, 'image/png');
    });
    $('copyRec').addEventListener('click', function () {
      var txt = stage.querySelector('.record').innerText;
      try { navigator.clipboard.writeText(txt); $('copyRec').textContent = '복사했어요 ✓'; }
      catch (e) { $('copyRec').textContent = '복사가 안 되면 직접 선택해 주세요'; }
    });
    $('printRec').addEventListener('click', function () { window.print(); });
    $('startFree').addEventListener('click', renderFree);
    var gb = $('globalBox');
    if (gb) gb.addEventListener('toggle', function () { if (gb.open) renderGlobal(); });
  }

  function cardText(g, s, x, y, color, weight, size) {
    g.fillStyle = color; g.font = weight + ' ' + size + 'px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'; g.fillText(s, x, y);
  }
  /* RC-F: 단년 차분이 아니라 '출생연도 ±2년 평균' vs '최근 5년 평균' */
  function meanAround(vals, idx, half) {
    var a = [], n = vals.length;
    for (var i = Math.max(0, idx - half); i <= Math.min(n - 1, idx + half); i++) if (vals[i] != null) a.push(vals[i]);
    return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null;
  }
  function makeCard(city, year) {
    var tl = cityOf(city).timeline, ys = tl.years, temps = tl.temp, last = ys.length - 1;
    var bi = ys.indexOf(year); if (bi < 0) bi = year <= ys[0] ? 0 : last;
    var tBirth = meanAround(temps, bi, 2), tNow = meanAround(temps, last, 2);
    var dT = Math.round((tNow - tBirth) * 10) / 10;
    var pi = lastInfo('past', 25, city, 'temp'), ci = lastInfo('present', 25, city, 'temp');
    var drift = (pi && ci) ? ci[0] - pi[0] : null;
    var st = D.cities[city];
    var cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1080; var g = cv.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 1080, 1080); grad.addColorStop(0, '#0e3350'); grad.addColorStop(1, '#071726');
    g.fillStyle = grad; g.fillRect(0, 0, 1080, 1080);
    cardText(g, 'WEATHER24', 80, 108, '#ffbe58', '800', 34);
    cardText(g, '절기의 약속 검증소 · 내 고향 기후 카드', 80, 150, '#a7bdc5', '400', 24);
    cardText(g, city + ' (' + st.station + ' 관측소)', 80, 262, '#ffffff', '800', 62);
    cardText(g, '내가 태어난 ' + year + '년 무렵(±2년) 연평균 기온', 80, 360, '#dfeaee', '400', 34);
    cardText(g, tBirth.toFixed(1) + '°C', 80, 438, '#a7bdc5', '800', 62);
    cardText(g, '최근 5년(' + ys[last - 4] + '–' + ys[last] + ') 평균은', 80, 534, '#dfeaee', '400', 34);
    cardText(g, tNow.toFixed(1) + '°C', 80, 620, '#ff8066', '800', 88);
    cardText(g, (dT >= 0 ? '+' : '') + dT + '°C', 430, 620, '#ffbe58', '800', 54);
    if (drift != null && drift > 0) {
      cardText(g, '처서(더위가 그침)가 지나도, 더위는 과거보다', 80, 706, '#dfeaee', '400', 30);
      cardText(g, drift + '일 더 이어집니다 (25°C 기준)', 80, 758, '#ff8066', '800', 42);
    }
    drawCardSpark(g, tl, 80, 800, 920, 126, bi);
    cardText(g, '기상청 ASOS 실측 · 5년 평균 비교(관측 신호, 30년 기후평년 아님)', 80, 1000, '#8ba0a8', '400', 21);
    cardText(g, 'weather-24solar-terms.vercel.app', 80, 1036, '#8ba0a8', '400', 21);
    return cv;
  }
  function drawCardSpark(g, tl, x, y, w, h, birthIdx) {
    var ys = tl.years, vs = tl.temp, n = ys.length;
    var ok = vs.filter(function (v) { return v != null; });
    var lo = Math.min.apply(null, ok), hi = Math.max.apply(null, ok), pad = (hi - lo) * 0.14 || 1; lo -= pad; hi += pad;
    function px(i) { return x + i / (n - 1) * w; } function py(v) { return y + (hi - v) / (hi - lo) * h; }
    g.strokeStyle = 'rgba(167,189,197,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w, y + h); g.stroke();
    g.strokeStyle = '#77bff7'; g.lineWidth = 3; g.beginPath();
    var started = false;
    vs.forEach(function (v, i) { if (v == null) return; var xx = px(i), yy = py(v); if (started) g.lineTo(xx, yy); else g.moveTo(xx, yy); started = true; });
    g.stroke();
    var bx = px(birthIdx); g.strokeStyle = '#ffbe58'; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(bx, y); g.lineTo(bx, y + h); g.stroke(); g.setLineDash([]);
    if (vs[birthIdx] != null) { g.fillStyle = '#ffbe58'; g.beginPath(); g.arc(bx, py(vs[birthIdx]), 7, 0, 7); g.fill(); }
    if (vs[n - 1] != null) { g.fillStyle = '#ff8066'; g.beginPath(); g.arc(px(n - 1), py(vs[n - 1]), 8, 0, 7); g.fill(); }
    cardText(g, ys[0] + '', x, y + h + 26, '#8ba0a8', '400', 20);
    cardText(g, ys[n - 1] + '', x + w - 40, y + h + 26, '#8ba0a8', '400', 20);
  }

  /* ---------- 지구 전체 맥락: CO2와 전지구 기온 ----------
     4개 미션에서 본 것은 '한 지점의 5년 신호'였다. 마지막에 그것이 지구 규모에서
     어디쯤인지 보여 준다. 상관은 보여 주되 인과로 단정하지 않는 것이 이 앱의 원칙이다. */
  var globalData = null, globalLoading = false;

  function loadGlobal(done) {
    if (globalData) return done(globalData);
    if (globalLoading) return;
    globalLoading = true;
    /* 배포는 /web_data/ 로 리라이트되고, 로컬 개발 서버는 prototype/ 만 서빙하므로 상위 경로도 시도한다. */
    function grab(name) {
      return fetch('/web_data/' + name).then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .catch(function () { return fetch('../web_data/' + name).then(function (r) { return r.json(); }); });
    }
    Promise.all([grab('co2_keeling_monthly.json'), grab('climate_change.json')]).then(function (arr) {
      globalData = { keeling: arr[0], combined: arr[1] };
      globalLoading = false;
      done(globalData);
    }).catch(function () {
      globalLoading = false;
      var el = $('globalMount');
      if (el) el.innerHTML = '<p class="global-fail">전지구 자료를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.</p>';
    });
  }

  function keelingSVG(k) {
    var W = 720, H = 200, L = 46, R = 14, T = 14, B = 26;
    var v = k.co2_ppm, dates = k.dates, n = v.length;
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), pad = (hi - lo) * 0.07;
    lo -= pad; hi += pad;
    function x(i) { return L + i / (n - 1) * (W - L - R); }
    function y(c) { return T + (hi - c) / (hi - lo) * (H - T - B); }
    var d = v.map(function (c, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(c).toFixed(1); }).join('');
    var g = '';
    [lo + pad, (lo + hi) / 2, hi - pad].forEach(function (c) {
      g += '<line x1="' + L + '" y1="' + y(c).toFixed(1) + '" x2="' + (W - R) + '" y2="' + y(c).toFixed(1) + '" stroke="rgba(217,238,238,.12)"/>'
        + '<text x="6" y="' + (y(c) + 4).toFixed(1) + '" font-size="11" fill="#9fb3ba">' + Math.round(c) + '</text>';
    });
    [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1].forEach(function (i) {
      g += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 7) + '" font-size="11" fill="#9fb3ba" text-anchor="middle">' + dates[i].slice(0, 4) + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="마우나로아 대기 중 이산화탄소 농도, ' + dates[0] + ' ' + v[0].toFixed(1) + 'ppm에서 ' + dates[n - 1] + ' ' + v[n - 1].toFixed(1) + 'ppm까지 증가. 해마다 오르내리는 톱니 모양이 함께 나타난다." class="gsvg">'
      + g + '<path d="' + d + '" fill="none" stroke="#8de0a5" stroke-width="1.6"/>'
      + '<text x="' + (W - R) + '" y="' + (y(v[n - 1]) - 8).toFixed(1) + '" font-size="12.5" font-weight="800" fill="#8de0a5" text-anchor="end">' + v[n - 1].toFixed(1) + ' ppm</text>'
      + '<text x="' + (L + 6) + '" y="' + (y(v[0]) + 16).toFixed(1) + '" font-size="12" fill="#9fb3ba">' + v[0].toFixed(1) + ' ppm</text></svg>';
  }

  function dualSVG(c) {
    var rows = c.series.filter(function (r) { return r.co2_ppm != null && r.temp_anomaly_C != null; });
    var W = 720, H = 210, L = 46, R = 46, T = 14, B = 26, n = rows.length;
    var co2 = rows.map(function (r) { return r.co2_ppm; }), tmp = rows.map(function (r) { return r.temp_anomaly_C; });
    var cLo = Math.min.apply(null, co2), cHi = Math.max.apply(null, co2);
    var tLo = Math.min.apply(null, tmp), tHi = Math.max.apply(null, tmp);
    var cPad = (cHi - cLo) * 0.1, tPad = (tHi - tLo) * 0.1;
    cLo -= cPad; cHi += cPad; tLo -= tPad; tHi += tPad;
    function x(i) { return L + i / (n - 1) * (W - L - R); }
    function yc(v) { return T + (cHi - v) / (cHi - cLo) * (H - T - B); }
    function yt(v) { return T + (tHi - v) / (tHi - tLo) * (H - T - B); }
    var dc = co2.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yc(v).toFixed(1); }).join('');
    var dt = tmp.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + yt(v).toFixed(1); }).join('');
    var g = '';
    [0, Math.floor(n / 2), n - 1].forEach(function (i) {
      g += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 7) + '" font-size="11" fill="#9fb3ba" text-anchor="middle">' + rows[i].year + '</text>';
    });
    g += '<text x="6" y="' + (T + 10) + '" font-size="11" fill="#8de0a5">ppm</text>'
      + '<text x="' + (W - 40) + '" y="' + (T + 10) + '" font-size="11" fill="#ff8066">°C</text>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + rows[0].year + '년부터 ' + rows[n - 1].year + '년까지 이산화탄소 농도와 전지구 기온 이상이 함께 오르는 모습" class="gsvg">'
      + g + '<path d="' + dc + '" fill="none" stroke="#8de0a5" stroke-width="2"/>'
      + '<path d="' + dt + '" fill="none" stroke="#ff8066" stroke-width="2"/></svg>';
  }

  function renderGlobal() {
    var el = $('globalMount'); if (!el) return;
    el.innerHTML = '<p class="global-loading">전지구 자료를 불러오는 중…</p>';
    loadGlobal(function (g) {
      var el2 = $('globalMount'); if (!el2) return;
      var k = g.keeling, c = g.combined;
      var n = k.co2_ppm.length, first = k.co2_ppm[0], last = k.co2_ppm[n - 1];
      var rows = c.series.filter(function (r) { return r.co2_ppm != null && r.temp_anomaly_C != null; });
      var r0 = rows[0], r1 = rows[rows.length - 1];
      var rel = c.relationship || {};
      el2.innerHTML =
        '<h3 class="global-h">① 대기 중 이산화탄소 — 마우나로아 관측소</h3>'
        + '<p class="global-p">1958년부터 하와이 마우나로아에서 한 달도 빠짐없이 재 온 값이에요. <b>' + first.toFixed(1) + ' ppm → ' + last.toFixed(1) + ' ppm</b>으로 올랐습니다.</p>'
        + keelingSVG(k)
        + '<p class="global-note"><b>톱니 모양이 보이나요?</b> 해마다 오르내리는 이 주기는 <b>북반구 식물</b> 때문이에요. 봄·여름에 잎이 자라며 이산화탄소를 빨아들이고, 가을·겨울에 잎이 지며 내놓습니다. '
        + '<b>지구가 1년에 한 번 숨을 쉬는 리듬</b>이고, 조상들이 24절기로 나눈 바로 그 1년의 리듬입니다.</p>'
        + '<h3 class="global-h">② 이산화탄소와 전지구 기온</h3>'
        + '<p class="global-p">' + r0.year + '년부터 ' + r1.year + '년까지, 이산화탄소는 <b>' + Math.round(r0.co2_ppm) + ' → ' + Math.round(r1.co2_ppm) + ' ppm</b>, '
        + '전지구 평균기온 이상은 <b>' + r0.temp_anomaly_C.toFixed(2) + '°C → ' + r1.temp_anomaly_C.toFixed(2) + '°C</b>로 <b>함께</b> 올랐습니다.</p>'
        + dualSVG(c)
        + '<div class="global-legend"><span><i style="background:#8de0a5"></i> CO₂ 농도(ppm)</span><span><i style="background:#ff8066"></i> 전지구 기온 이상(°C)</span></div>'
        + '<p class="global-warn"><b>여기서 멈춰야 하는 지점</b> 두 선이 함께 움직인다는 것(설명력 r² = ' + (rel.r2 != null ? rel.r2 : '—') + ')은 <b>상관</b>입니다. '
        + '그래프 두 개가 닮았다는 사실만으로는 <b>어느 쪽이 원인인지 증명되지 않습니다.</b> 원인을 말하려면 기체가 열을 가두는 <b>물리 실험</b>과 <b>기후 모델</b> 같은 다른 종류의 증거가 필요해요 — '
        + '그 증거들까지 합쳐서 IPCC는 인간 활동이 온난화의 주된 원인이라고 결론지었습니다.</p>'
        + '<p class="global-link">당신이 앞에서 본 <b>' + state.city + '의 기록</b>은 이 큰 흐름 속의 <b>한 점</b>입니다. 한 지점의 5년으로 지구를 말할 수 없고, 지구의 평균으로 우리 동네의 처서를 말할 수도 없어요 — '
        + '<b>자료마다 말할 수 있는 범위가 다르다</b>는 것, 그게 이 수업의 마지막 배움입니다.</p>';
    });
  }

  /* ---------- 자유탐구 ---------- */
  function renderFree() {
    state.phase = 'free'; save();
    setStage('<section class="card explore-card"><h1 class="sr-only">자유탐구 — 내 지역·절기·지표로 검증</h1>'
      + '<div class="mhead"><span class="mno">자유탐구</span><span class="goal-chip">내 지역 · 절기 · 지표를 자유롭게</span></div>'
      + '<p class="task">지역·절기·지표를 바꾸고 기준선을 옮겨, 내 관심 주제를 직접 검증하세요. 모든 결론은 지역·기간·기준이 붙은 문장으로 말합니다.</p>'
      + heroShell({ cityChips: true, termStrip: true, metricTabs: true })
      + '<p class="cerl" id="freeCerl"></p>'
      + '<p class="share-row"><button class="ghost-btn small-btn" id="copyLink" type="button">🔗 이 화면 링크 복사</button>'
      + '<small>지역·절기·지표·기준이 그대로 열리는 주소예요. 모둠끼리 비교하거나 선생님이 배부할 때 쓰세요.</small></p>'
      + '<div id="kmaRefMount"></div>'
      + '<div id="inqMount"></div>'
      + '<div id="winMount"></div>'
      + '<div id="sparkMount"></div>'
      + '<div class="judge-box"><label class="draft-label" for="freeDraft">내 판정문 <small>지역 · 기간 · 기준 · 한계를 넣어 한 문장으로</small></label>'
      + '<textarea id="freeDraft" maxlength="400" placeholder="예: 서울에서 ‘덥다’를 25°C로 정하면, 처서 무렵 더위가 그치는 날이 과거보다 13일 늦어졌다. 다만 이는 5년 관측 신호로, 전국이나 원인으로 넓혀 말하기는 어렵다."></textarea>'
      + '<div class="ai-row"><button class="ai-btn" id="askAudit"><span aria-hidden="true">✦</span> AI 감사 요청</button></div>'
      + '<p class="audit-status" id="auditStatus">판정문을 쓰면 과장 · 범위 · 인과를 점검합니다. AI가 응답하지 않아도 같은 항목을 규칙 점검이 확인합니다.</p>'
      + '<div class="audit-result" id="auditResult" hidden></div></div></section>');
    bindCityChips(); bindTermStrip(); bindMetricTabs(); bindThreshold(); bindViewTools();
    onTouched = function () {}; drawHero(); updateKmaRef(); updateInquiry(); updateWindow();
    $('freeDraft').value = state.freeDraft || '';
    $('freeDraft').addEventListener('input', function () { state.freeDraft = $('freeDraft').value.slice(0, 400); save(); });
    $('askAudit').addEventListener('click', function () { doAudit(null); });
    if ($('copyLink')) $('copyLink').addEventListener('click', function () { copyLink($('copyLink')); });
  }

  /* ---------- AI 감사관 (+ 규칙 점검) ---------- */
  function buildEvidence() {
    var n = stat(), mc = metricOf(), tm = term(), y = yearsOf(), ev = [];
    var period = PERIOD_PAST + ' vs ' + PERIOD_NOW + ' (완결 ' + y.past.length + '년/' + y.present.length + '년)';
    ev.push({ id: 'E-1', statement: n.city + '(' + cityOf().station + ' 관측소)의 ‘' + mc.verb + ' ' + n.thr + mc.unit + '’ 기준 ' + dayLabel() + eunNeun(dayLabel()) + ' 연평균 과거 ' + n.pdStr + ', 현재 ' + n.cdStr + '이다.', source: '기상청 ASOS 일자료(연도별 실측 집계)', period: period, kind: mc.label + ' · 기준 이상 일수' });
    if (mc.showLast && n.pl > 0 && n.cl > 0) ev.push({ id: 'E-2', statement: n.city + '의 ' + mc.last + '은 과거 ' + n.plStr + ', 현재 ' + n.clStr + '로 ' + n.drift + '일 늦어졌다.', source: '기상청 ASOS 일자료(연도별 실측 집계)', period: period, kind: tm.name + ' · 마지막 기준초과일' });
    else ev.push({ id: 'E-2', statement: '이 비교는 ' + n.city + '의 ' + n.sampleText + ' 관측 신호이며, 30년 기후평년이나 전국을 뜻하지 않는다.', source: '해석 범위', period: period, kind: '자료의 한계' });
    return ev;
  }
  function renderAudit(fb, viaLocal) {
    var el = $('auditResult'); el.hidden = false;
    var parts = '<div class="audit-head"><b>증거 감사관 ' + (viaLocal ? '(규칙 점검)' : '(AI)') + '</b><span class="audit-badge ' + (fb.evidence_status || 'revise') + '">'
      + ({ ready: '근거 충분', revise: '보완 필요', insufficient: '근거 부족' }[fb.evidence_status] || '보완 필요') + '</span></div>';
    if (fb.feedback) parts += '<p>' + escapeHTML(fb.feedback) + '</p>';
    if (fb.overclaim_warning) parts += '<p class="audit-warn"><span aria-hidden="true">⚠</span> ' + escapeHTML(fb.overclaim_warning) + '</p>';
    if (fb.socratic_question) parts += '<p class="audit-q"><b>다음 질문</b> ' + escapeHTML(fb.socratic_question) + '</p>';
    el.innerHTML = parts;
  }
  function escapeHTML(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  function localAudit(draft) {
    var n = stat(), t = draft;
    var neg = '(어렵|어려우|없다|없음|없고|없어|없으|없지|아니|아님|못\\s|못한|못함|못하|않|안\\s|안한|안함|모르|몰라|모름|유보|보류|무리|부족|섣부르|힘들|힘듦|우연|곤란|비약|조심|신중|아직|섣불|성급)';
    var hasLimitation = new RegExp('(전국|전체|모든|전\\s*지역|원인|인과|일반화|넓|단정|추세|장기|판단)[^.!?]{0,30}' + neg).test(t);
    var climateLimit = new RegExp('(기후|기후변화|추세|장기|표본|기간)[^.!?]{0,30}' + neg).test(t);
    var overWord = /전국|모든\s*(지역|도시|곳|데)|우리나라\s*(전체|다|기후|모든)|한국\s*(전체|기후|모든|다)|한반도|대한민국|전\s*지역|전세계|전 세계|어디(나|든)|지구\s*(전체|가)/.test(t);
    var causalWord = /기후변화가?\s*(원인|때문)|온난화\s*(때문|탓|가 원인)|온실가스\s*(때문|탓)|이산화탄소|co2|화석연료|탄소\s*배출|인간\s*활동|원인이(다|라|야)|이(것| 것)?이?\s*원인|때문(이다|에 이렇|에 더)|탓(이다|으로|에)|초래|야기|증거다/i.test(t);
    var solarMatch = t.match(/(입춘|우수|경칩|춘분|청명|곡우|입하|소만|망종|하지|소서|대서|입추|처서|백로|추분|한로|상강|입동|소설|대설|동지|소한|대한|절기)\s*(라는|이라는)?\s*(자체)?\s*(가|이|는|은|도)?\s*[^.!?]{0,14}?(더워|더웠|더 워|덥|더운|뜨거|따뜻|변했|변한|변해|바뀐|바뀌었|여름\s*절기)/);
    var overGeneral = overWord && !hasLimitation, causal = causalWord && !hasLimitation && !climateLimit;
    var oneYear = /기후변화(이다|다|라|야|지|임|입니|맞|진행|증명|확정|시작|온|왔|됐|되고|라고|인 거|인거)|기후가?\s*(바뀌|바뀐|바꼈|바꿨|변했|변한|변해|변화|달라|더워|더웠)/.test(t) && !climateLimit;
    var misconception = !!solarMatch && !/(무렵|때|즈음|쯤|이후|이전|뒤|전후|근처|부근|시기|하순|상순|중순|경에|사이|기온|온도)/.test(solarMatch[0]);
    var injection = /규칙[^.!?]{0,6}무시|프롬프트[^.!?]{0,4}무시|시스템[^.!?]{0,4}(무시|프롬프트)|지시[^.!?]{0,8}무시|위(에|에서)?[^.!?]{0,6}무시|무시하고|정답[^.!?]{0,8}(불러|알려|말해|줘|주라|달라|내놔|찍어|처리)|대신[^.!?]{0,4}(써|작성|적어)|써\s*줘|적어\s*줘|너는?\s*이제|지금부터[^.!?]{0,6}(교사|선생|채점|심사|모드)|(교사|선생|채점|심사|채점쌤|심사위원)[^.!?]{0,6}(모드|쌤|해|시켜|하)|역할[^.!?]{0,8}(바꿔|변경|해줘|맡|그만)|(100\s*점|만점|점수)[^.!?]{0,8}(줘|주라|주면|달라|매겨|처리)|무조건[^.!?]{0,5}(만점|합격|통과|정답|맞)|(ready|통과|맞다고|합격|우승|만점)[^.!?]{0,8}(해|처리|시켜|줘|주라|해줘|만)|위키(백과|피디아)|네이버|구글|검색(해|결과)|기사(에|에서)|나오(던데|더라)|출처[^.!?]{0,6}삽입/i.test(t);
    var hasRegion = t.indexOf(n.city) !== -1 || /지역|동네|서울|부산|인천|대구|광주|대전|제주|강릉|수원|청주|서산|전주|목포|포항|진주|춘천|경기|충북|충남|전북|전남|경북|경남|강원/.test(t);
    var hasPeriod = /과거|현재|예전|옛날|요즘|최근|\d{4}|5년|4년|기간|1969|1970|2021|2025/.test(t);
    var hasCriterion = /기준|°|℃|이상|\d\s*도|mm|%|더위|폭염|열대야|여름|밤|습|비|강수|기온|온도|최고기온|평균기온|최저기온/.test(t);
    var cautious = hasLimitation || climateLimit || /판단(을)?\s*(보류|유보|어렵|힘들|못|안)|단정(하기|짓기)?[^.!?]{0,5}(어렵|무리|힘들|못|안)|무리(인|다|라|고)|부족|섣부르|성급|충분(하지|치)\s*(않|못)|우연인지|진짜\s*(추세|변화)인지|근거가\s*부족|애매|모호|짧아|적어(서|어)|한\s*곳|한\s*지점/.test(t);
    var fb = { evidence_status: 'ready', flags: [] }, warns = [], missing = [];
    if (injection) { warns.push('프롬프트 지시·정답 요구·외부 자료 삽입은 따르지 않아요. 화면의 관측 자료 범위 안에서 스스로 결론을 써 주세요.'); fb.evidence_status = 'revise'; fb.flags.push('injection'); }
    if (overGeneral) { warns.push('한 지역·5년 자료로 ‘전국/전체’까지 넓혀 말하고 있어요. 결론을 선택한 지역의 범위로 좁혀 보세요.'); fb.evidence_status = 'revise'; fb.flags.push('scope'); }
    if (causal) { warns.push('관측된 변화의 ‘원인’을 단정하고 있어요. 이 자료는 무엇이 함께 변했는지는 보여 줘도 원인을 증명하지는 않습니다.'); fb.evidence_status = 'revise'; fb.flags.push('causal'); }
    if (oneYear) { warns.push('짧은 관측(5년)만으로 ‘기후가 변했다/기후변화다’로 단정하고 있어요. 이 자료는 관측 신호일 뿐, 장기 기후(보통 30년)를 확정하지 않습니다.'); fb.evidence_status = 'revise'; fb.flags.push('one_year'); }
    if (misconception) { warns.push('절기(예: 처서) 자체가 더워진 것이 아니에요. 절기는 태양 위치로 정한 날짜이고, 달라진 것은 그 무렵 관측된 기온·더위입니다.'); fb.evidence_status = 'revise'; fb.flags.push('misconception'); }
    if (!hasRegion) missing.push('지역');
    if (!hasPeriod) missing.push('비교 기간(과거·현재)');
    if (!hasCriterion) missing.push('기준(‘덥다/여름’의 정의)');
    if (missing.length && !cautious) { warns.push('결론에 ' + missing.join('·') + '이(가) 빠졌어요. 자료로 뒷받침되려면 이 요소가 문장에 있어야 합니다.'); if (fb.evidence_status === 'ready') fb.evidence_status = 'revise'; fb.flags.push('missing'); }
    /* 실제로 확인된 요소만 칭찬한다 (F-2) */
    var have = [];
    if (hasRegion) have.push('지역');
    if (hasPeriod) have.push('기간');
    if (hasCriterion) have.push('기준');
    fb.overclaim_warning = warns.join(' ');
    if (fb.evidence_status === 'ready') {
      fb.feedback = '좋아요. ' + (have.length ? have.join('·') + '이 문장에 들어 있어, ' : '') + '이 자료가 말할 수 있는 범위 안에서 판정했습니다.'
        + (hasLimitation || climateLimit ? ' 한계(전국·원인·장기 기후로 넓히지 않음)까지 밝힌 점이 특히 좋습니다.' : ' 한계를 한 절 더 붙이면 더 단단해집니다.');
    } else {
      fb.feedback = (have.length ? have.join('·') + '은 들어 있어요. ' : '') + '아래를 보완하면 자료가 말하는 범위에 정확히 맞습니다.'
        + (missing.length && cautious ? ' (신중하게 쓴 문장이라 감점하진 않았지만, ' + missing.join('·') + '을 넣으면 더 분명해집니다.)' : '');
    }
    fb.socratic_question = injection ? '이 자료(선택한 지역·기간·기준) 안에서, 당신은 무엇을 말할 수 있나요?'
      : oneYear ? '5년 관측과 30년 기후평년은 무엇이 다를까요?'
      : misconception ? '절기 날짜가 움직인 걸까요, 아니면 그 무렵의 기온이 달라진 걸까요?'
      : overGeneral ? '이 결론을 다른 지역에서도 확인하려면 무엇을 비교해야 할까요?'
      : causal ? '함께 변했다는 것과 원인이라는 것은 어떻게 다를까요?'
      : (hasLimitation || climateLimit) ? '기준(‘덥다’ 온도)을 바꾸면 이 결론은 그대로 유지될까요?'
      : '이 결론이 다른 지역·다른 기준에서도 유지되는지 어떻게 확인할까요?';
    return fb;
  }

  async function doAudit(seed) {
    var ta = $('freeDraft'), draft = (ta.value || '').trim(), btn = $('askAudit'), status = $('auditStatus');
    if (draft.replace(/\s/g, '').length < 12) { status.textContent = '판정문을 12자 이상 써 주세요 (지역 · 기간 · 기준을 넣어 한 문장으로).'; ta.focus(); return; }
    if (seed && draft === seed.trim()) { status.textContent = '예시 문장과 똑같아요 — 지역·숫자·한계 중 한 부분이라도 내 말로 바꾼 뒤 요청해 주세요.'; ta.focus(); return; }
    btn.disabled = true; status.textContent = '증거 감사관에게 확인 중…';
    var payload = { case: { id: 'FREE', title: '판정문 감사', question: '선택한 지역·기간·기준으로 어디까지 말할 수 있는가?' }, verdict: 'free', draft: draft, evidence: buildEvidence() };
    var res = null;
    try {
      res = await fetch('/api/ai-turn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      var data = await res.json();
      if (!res.ok || !data.feedback) throw new Error(data && data.error ? data.error : 'ai');
      renderAudit(data.feedback, false);
      status.textContent = 'AI 감사 완료 — 필요하면 판정문을 고쳐 다시 요청하세요.';
    } catch (e) {
      /* 실패 원인을 추측해 단정하지 않는다 (F-1) */
      renderAudit(localAudit(draft), true);
      status.textContent = !res
        ? '네트워크가 불안정해 규칙 점검으로 확인했어요 — AI와 같은 항목(범위 · 과장 · 인과)을 봅니다.'
        : res.status === 429 ? '요청이 몰려 잠시 대기 중이에요 — 규칙 점검으로 같은 항목을 방금 확인했어요. 잠시 후 다시 요청할 수 있어요.'
        : '지금은 규칙 점검으로 확인했어요 — AI와 같은 항목(범위 · 과장 · 인과)을 봅니다.';
    } finally { btn.disabled = false; }
  }

  /* ---------- 부팅 ---------- */
  $('openGuide').addEventListener('click', function () { var d = $('guideDialog'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); });
  $('homeLink').addEventListener('click', function (e) {
    e.preventDefault();
    if (confirm('처음(소개)으로 돌아갈까요? 진행 기록은 유지됩니다.')) renderIntro();
  });
  var rb = $('resetBtn');
  if (rb) rb.addEventListener('click', function () {
    if (confirm('기록을 지우고 처음부터 시작할까요?\n(공용 컴퓨터에서 다음 사람을 위해 초기화합니다)')) {
      try { localStorage.removeItem('weather24_verify_v3'); localStorage.removeItem('weather24_verify_v2'); } catch (e) {}
      location.reload();
    }
  });
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if ($('heroSvg')) drawHero(); }, 150);
  });

  applyHash();
  if (state.phase === 'free') renderFree();
  else if (state.phase === 'complete') renderComplete();
  else if (state.phase === 'verdict') { state.phase = 'mission'; renderExplore(); }
  else if (state.phase === 'terms') renderTerms();
  else if (state.phase === 'intro' || state.phase === 'tutorial') renderIntro();
  else { state.phase = 'mission'; renderExplore(); }
})();
