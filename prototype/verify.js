(function () {
  'use strict';
  var D = window.SOLAR_DATA;
  var stage = document.getElementById('stage');
  if (!D || !D.cities) { stage.innerHTML = '<p class="load-fail">자료를 불러오지 못했습니다. 새로고침해 주세요. (인터넷 연결을 확인해 주세요)</p>'; return; }

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
  var COLORS = { past: 'var(--muted)', present: 'var(--coral)', term: 'var(--sun)', threshold: 'var(--thr)' };
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
      offGrid: { t: '폭염 33°C', s: '낮 최고기온 기준 — 기준표 서랍에서 실측 확인' }
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

  /* R4-P1-13: 사후 문항을 사전 문항과 똑같이 내면 정답률 상승이 '학습'인지 '읽기'인지
     구분되지 않는다 — 게다가 같은 화면 위 CERL이 정답 문장을 거의 그대로 인쇄한다.
     절기만 바꾼 <b>동형 문항</b>으로 전이(transfer)를 묻고, 보기 길이도 맞춰
     '가장 긴 보기가 정답'이라는 단서를 없앤다. */
  var POST_QUESTION = {
    q: '이번엔 다른 절기입니다. “입동(11/7, 겨울의 시작)이 지났는데도 안 춥다”를 가장 정확히 설명한 것은?',
    options: [
      { v: 'a', t: '절기가 요즘 안 맞으니 입동 날짜를 뒤로 옮겨야 한다.', s: '절기를 기후에 맞추려는 설명' },
      { v: 'b', t: '입동 날짜는 그대로인데, 그 무렵 관측된 기온이 예전보다 높아진 것이다.', s: '절기와 기후를 구분한 설명' },
      { v: 'c', t: '입동은 원래 추위와 상관없는 이름뿐인 날짜라서 그렇다.', s: '절기의 뜻을 지운 설명' }
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
      task: '그래프의 보라색 ‘덥다 기준선’을 위아래로 끌거나 아래 슬라이더·프리셋으로 정한 뒤, 과거와 현재의 ‘더위가 그치는 날’을 비교하세요.',
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
          l: '한쪽 시기에 값이 없으면 “며칠 늦어졌다”고 말할 수 없습니다 — 비교할 수 있는 기준을 고르는 것도 자료를 다루는 일입니다.'
        };
        return {
          c: '이 기준으로는 과거·현재 모두 해당하는 날이 거의 없습니다.',
          e: n.city + '의 ‘' + n.thr + '°C 이상’ 날은 과거 <b>' + n.pdStr + '</b>, 현재 <b class="hot">' + n.cdStr + '</b>입니다.',
          r: '기준이 너무 높으면 두 시기 모두 0에 가까워져 비교할 것이 남지 않습니다. 기준선을 낮추면 비교가 시작됩니다.',
          l: '기준을 어디에 두는지가 결론을 바꿉니다 — 그래서 결론에는 반드시 기준을 함께 밝혀야 합니다.'
        };
      },
      selfCheck: {
        q: '‘덥다’ 기준선을 25°C에서 28°C로 올리면, 기준 이상 더위일은 어떻게 될까?',
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
          r: '기준을 높일수록 그 기준을 넘는 날이 줄어든다는 것 자체가 이 미션의 답입니다 — 다만 여기서는 비교할 것이 남지 않으니 기준선을 25°C 쪽으로 내려 다시 판정해 보세요.',
          l: '‘여름’처럼 모호한 말은 기준을 정해야 자료가 됩니다. 기준을 잘못 고르면 자료가 아무 말도 하지 못합니다.'
        };
        if (n.pd < 0.5 && n.cd >= 0.5) return {
          c: '이 기준에서는 과거에 여름이 거의 없었습니다.',
          e: n.city + '에서 ‘여름 = ' + n.thr + '°C 이상’으로 정하면 과거 <b>' + n.pdStr + '</b>, 현재 <b class="hot">' + n.cdStr + '</b>입니다.',
          r: '과거가 0에 가까우면 <b>몇 배 늘었다</b>고는 말할 수 없습니다. 늘어난 <b>일수</b>(+' + n.ddStr + ')로만 말하고, 기준을 낮춰 두 시기를 함께 비교해 보세요.',
          l: '분모가 0에 가까우면 비율은 실제보다 부풀려집니다 — 배수 대신 차이로 말하는 것이 자료에 맞습니다.' + n.sensText
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
      brief: '한 지역에서 더위가 길어졌다고 해서 전국이 똑같이 변했을까요? 남쪽 제주와 산간 강원(춘천)을 번갈아 보며 반증해 보세요.',
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
            r: '한쪽에 값이 없으면 시차를 계산할 수 없습니다. 기준을 <b>26°C 이하</b>로 낮추면 두 지역을 함께 볼 수 있습니다.',
            l: '비교가 성립하는 기준을 고르는 일 자체가 자료를 다루는 능력입니다.'
          };
        }
        var gap = Math.abs(A.drift - B.drift);
        var same = gap < 5;
        return {
          c: same ? '시차의 크기는 비슷하지만, 여름이 끝나는 날짜 자체는 지역마다 다릅니다.'
                  : '같은 절기·같은 기준인데도 변화의 크기가 지역마다 다릅니다.',
          /* R4-P1-8: '기준을 밝혀라'를 가르치는 미션인데 정작 이 근거 절에만 기준이 없었다.
             판정 화면에는 슬라이더가 없어 화면 어디에도 기준이 남지 않는다. */
          e: '‘' + n.thr + '°C 이상’ 기준으로, 제주는 ' + A.pStr + ' → <b class="hot">' + A.cStr + '</b>(' + A.driftStr + '), 강원(춘천)은 ' + B.pStr + ' → <b class="hot">' + B.cStr + '</b>(' + B.driftStr + ')입니다.',
          r: same
            ? '시차는 제주 <b>' + A.driftStr + '</b>, 강원 <b>' + B.driftStr + '</b>로 비슷하지만, 더위가 그치는 <b>날짜</b>는 제주 ' + A.cStr + ', 강원 ' + B.cStr + '로 약 <b>' + Math.abs(A.c - B.c) + '일</b> 차이입니다.'
            /* 5차 COPY-AI-02: driftStr은 '+14일' 형태라 '일와'는 비문이다('일'은 받침이 있어 '과').
               두 분기 모두 지점 이름을 붙여 조사 자체를 없앤다. */
            : '시차의 크기가 제주 <b>' + A.driftStr + '</b>, 강원 <b>' + B.driftStr + '</b>로 <b>' + gap + '일</b> 다릅니다.',
          l: '그러므로 한 지역(예: 서울)의 결과만으로 “전국의 계절이 똑같이 변했다”고 넓혀 말할 수 없습니다. 또한 ‘제주’는 제주 관측소, ‘강원’은 춘천 관측소 <b>한 지점</b>의 기록이므로 도 전체를 대표하지도 않습니다.'
             + regionGapNote(n.thr)
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
      options: [{ v: 'same', t: '둘 다 같은 방향으로 변했다', s: '비는 다 같은 비니까' },
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
          ? '비의 <b>횟수</b>는 줄었는데 <b>한 번의 세기</b>는 커졌습니다. 전국 16지점을 합쳐 보아도 1mm 이상은 <b>' + nat.lo + '</b>, 50mm 이상은 <b class="hot">' + nat.hi + '</b>로 방향이 똑같이 갈립니다 — 그래서 “비가 줄었다”만 말하면 물난리가 왜 잦아지는지 설명할 수 없습니다.'
          : n.city + '에서는 방향이 뚜렷하게 갈리지 않습니다. 다만 전국 16지점 합계로는 1mm 이상 <b>' + nat.lo + '</b>, 50mm 이상 <b class="hot">' + nat.hi + '</b>로 갈립니다 — 지역마다 다르다는 것 또한 자료가 말해 주는 사실입니다.',
        l: '이 값은 ' + n.sampleText + '의 관측 신호이고, 하루 강수량만으로 셌기 때문에 <b>그 비가 하루 중 몇 시간 만에 쏟아졌는지</b>는 알 수 없습니다. 호우특보는 3시간·12시간 강우량으로 정하므로 이 화면의 일강수량과는 기준이 다릅니다.'
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
    task: '그래프를 좌우로 끌어 <b>가장 더울 것 같은 날</b>을 찍어 보세요. 실제 기록과 비교해 볼 수 있어요.',
    /* 문항이 화면과 어긋나면 '예측 봉인'이라는 장치 자체가 무너진다.
       겨울 모드에서 동지를 보여 주면서 하지를 묻던 것을 계절별로 나눈다. */
    predict: function () {
      return state.lagSeason === 'winter'
        ? { q: '밤이 가장 긴 날(동지, 12월 22일)이 1년 중 가장 추운 날일까?',
            options: [
              { v: 'same', t: '동지가 가장 춥다', s: '해가 가장 낮으니까' },
              { v: 'later', t: '동지보다 나중이 더 춥다', s: '식는 데 시간이 걸린다' },
              { v: 'unknown', t: '잘 모르겠다', s: '직접 찍어 봅니다' }
            ] }
        : { q: '낮이 가장 긴 날(하지, 6월 21일)이 1년 중 가장 더운 날일까?',
            options: [
              { v: 'same', t: '하지가 가장 덥다', s: '해가 가장 높으니까' },
              { v: 'later', t: '하지보다 나중이 더 덥다', s: '데워지는 데 시간이 걸린다' },
              { v: 'unknown', t: '잘 모르겠다', s: '직접 찍어 봅니다' }
            ] };
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
      /* 1월 13일과 12월 24일은 20일 차이지, 345일 차이가 아니다. 연말·연초를
         가로지르는 겨울 미션에서 |a−b|를 그대로 쓰면 그런 값이 화면에 찍힌다. */
      var raw = Math.abs(guess - actDoy), off = Math.min(raw, 365 - raw);
      var chg = lagChange(season);
      return {
        c: isS
          ? '가장 더운 날은 하지가 아니라, 하지보다 <b class="hot">약 ' + lag + '일 뒤</b>입니다.'
          : '가장 추운 날은 동지가 아니라, 동지보다 <b class="hot">약 ' + lag + '일 뒤</b>입니다.',
        e: n.city + '(' + cityOf(n.city).station + ' 관측소)에서 ' + solName + eunNeun(solName) + ' <b>' + doyStr(solDoy) + '</b>인데, '
           + '실제로 ' + (isS ? '가장 더운' : '가장 추운') + ' 날은 <b class="hot">' + doyStr(actDoy) + '</b>(' + temp + '°C)입니다.'
           + (off <= 5 ? ' 내가 찍은 <b>' + doyStr(guess) + '</b>과 ' + off + '일 차이 — 잘 짚었습니다.'
                       : ' 내가 찍은 날은 <b>' + doyStr(guess) + '</b>, 실제와 ' + off + '일 차이가 납니다.'),
        r: isS
          ? '해가 가장 높이 떠도 땅과 바다가 <b>데워지는 데 시간이 걸립니다</b>(열관성). 하지 뒤에도 들어오는 열이 나가는 열보다 많은 동안 기온은 계속 오릅니다. '
            + '전국 16지점에서 이 지연은 <b>' + nat.min + '~' + nat.max + '일</b>로 거의 같고, 5년 중 한 해를 빼고 다시 계산해도 최대 <b>' + nat.jackMax + '일</b>밖에 움직이지 않습니다 — '
            + '표본을 바꿔도 남는, <b>지역을 가리지 않는 물리 현상</b>이라는 뜻입니다.'
          : '겨울은 지점마다 값이 크게 흩어집니다 — 전국 <b>' + nat.min + '~' + nat.max + '일</b>(가운데값 ' + nat.median + '일). '
            + (nat.outliers.length
                ? '<b>' + lagOutlierText(nat) + '</b>만 뚜렷하게 늦고, 나머지 지점은 ' + nat.typical[0] + '~' + nat.typical[1] + '일에 몰려 있습니다. '
                  + '바다가 천천히 식는 것이 그럴듯한 설명이지만 <b>‘해안이라서’로는 설명되지 않습니다</b> — 인천·포항도 바다에 접한 관측소인데 각각 '
                  + (lagOf('인천') ? lagOf('인천').present.coldLag : '?') + '일 · ' + (lagOf('경북') ? lagOf('경북').present.coldLag : '?') + '일로 내륙과 구별되지 않아요. '
                : '')
            + '<b>왜 그런지는 이 자료만으로 확정할 수 없습니다.</b> 미션 3의 “지역마다 다르다”가 왜 생기는지는, 원인을 단정하는 대신 '
            + '<b>열관성 실험실</b>에서 ‘열을 머금는 양’을 직접 바꿔 가며 확인해 보세요.',
        /* '거의 변하지 않았다'를 실제 변화와 무관하게 찍던 것을 값으로 분기한다.
           여름 지연은 16지점 평균 1일 안쪽으로 정말 안 변했지만, 겨울은 지점에 따라
           수십 일씩 흔들린다 — 겨울 곡선이 평탄해 최저점이 잘 정해지지 않기 때문이다.
           그 사실을 숨기면 이 미션이 가르치려는 '변동성과 신호의 구별'을 앱이 어긴다. */
        l: isS
          ? '<b>이 지연은 기후변화가 아닙니다.</b> 과거(' + PERIOD_PAST + ')에도 ' + n.city + '의 지연은 ' + L.past.hotLag + '일이었고, 16지점 평균으로도 ' + chg.pastAvg + '일 → ' + chg.nowAvg + '일로 거의 그대로입니다. '
            + '반면 같은 기간 ' + n.city + '의 더위일은 ' + fmtDays(exceed('past', 25, n.city, 'temp')) + ' → ' + fmtDays(exceed('present', 25, n.city, 'temp')) + '로 늘었습니다. '
            + '<b>절기가 어긋나 보이는 데에는 두 가지 이유가 있고, 그 둘을 섞어 말하면 안 됩니다</b> — 늘 있던 계절 지연, 그리고 관측된 온난화 신호입니다. '
            + '<b>왜</b> 늦는지는 관측만으로는 알 수 없어요 — <b>열관성 실험실</b>에서 ‘열을 머금는 양’을 직접 바꿔 보면, 온실효과를 아무리 올려도 지연이 움직이지 않는 것을 확인할 수 있습니다.'
          : (function () {
              var sm = lagNationwide('summer');
              return '<b>겨울 지연은 이 자료로 정밀하게 말하기 어렵습니다.</b> ' + n.city + eunNeun(n.city) + ' 과거 ' + L.past.coldLag + '일 → 현재 ' + L.present.coldLag + '일이고, 16지점 평균도 ' + chg.pastAvg + '일 → ' + chg.nowAvg + '일로 <b>거의 그대로입니다</b>. 문제는 시기가 아니라 <b>지점 사이의 퍼짐</b>이에요 — 같은 해에도 ' + nat.min + '일부터 ' + nat.max + '일까지 벌어집니다. '
                + '겨울 기온 곡선은 최저점 부근이 평탄해서, ' + n.city + eunNeun(n.city) + ' 가장 추운 날 전후 <b>' + chg.flatDays + '일이 ' + chg.flatSpan + '°C 안에</b> 들어옵니다. 하루 단위의 “가장 추운 날”은 <b>표본이 조금만 바뀌어도 달라집니다</b>. '
                + '<b>그래서 겨울 지연의 변화는 온난화 신호로 읽으면 안 됩니다.</b> 여름 지연이 16지점에서 ' + sm.min + '~' + sm.max + '일로 좁게 모이는 것과 비교해 보세요 — <b>흔들리는 숫자와 남는 방향을 구별하는 것</b>이 이 미션의 핵심입니다.';
            })()
      };
    },
    selfCheck: function () {
      if (state.lagSeason === 'winter') {
        return {
          q: '“동지가 지났는데 1월이 더 춥다”를 가장 잘 설명하는 것은?',
          options: [
            { v: 'both', t: '땅과 바다가 식는 데 시간이 걸려서(계절 지연)이고, 늦는 정도는 지점마다 달라 이 자료만으로 원인을 단정할 수 없다' },
            { v: 'onlyclimate', t: '기후변화로 겨울이 이상해져서다' },
            { v: 'onlysun', t: '동지 뒤에도 해가 계속 낮아지기 때문이다' }
          ],
          correct: 'both',
          /* R4-P0-4: 예전 해설은 "해안일수록 늦다"를 정답으로 채점했다. 그 주장은
             인천·포항에서 성립하지 않고 표본을 바꾸면 사라진다 — 앱이 스스로
             경계하는 과잉 단정을 '정답'으로 가르치고 있었다. */
          explain: '동지 뒤에는 해가 다시 높아집니다. 그런데도 더 추운 이유는 <b>나가는 열이 들어오는 열보다 아직 많기 때문</b>입니다(계절 지연). '
            + '다만 <b>얼마나 늦는지는 지점마다 크게 다르고</b>, 5년 중 한 해만 바꿔도 값이 흔들려 <b>“해안이라서”처럼 한 가지 이유로 단정할 수 없습니다</b>. '
            + '늘 있던 물리 현상이라는 것(방향)은 남고, 며칠인지(크기)는 흔들린다 — 이 둘을 구별하는 게 이 미션의 핵심이에요.'
        };
      }
      return {
        q: '“처서(8/23)가 지났는데도 덥다”의 이유로 <b>가장 정확한 설명</b>은?',
        options: [
          { v: 'both', t: '원래 늦게까지 더운 데다(계절 지연), 최근 더위가 더 길어졌다' },
          { v: 'onlyclimate', t: '전부 기후변화 때문이다' },
          { v: 'onlylag', t: '전부 계절 지연 때문이고 기후변화와 무관하다' }
        ],
        correct: 'both',
        explain: '두 가지가 함께 작용합니다. <b>계절 지연</b>은 예전에도 있던 물리 현상이라 “원래 처서 무렵은 덥다”가 맞고, 동시에 <b>관측된 더위일 증가</b>는 최근의 변화입니다. 한쪽만 말하면 절반만 맞는 설명이 됩니다.'
      };
    }
  });

  /* 미션 정의가 계절에 따라 달라질 수 있으므로 함수면 호출해서 쓴다. */
  function askOf(m) { return typeof m.predict === 'function' ? m.predict() : m.predict; }
  function checkOf(m) { return typeof m.selfCheck === 'function' ? m.selfCheck() : m.selfCheck; }
  /* 선택한 절기 무렵(±7일)의 평년값. 이미 있는 365일 곡선에서 뽑으므로
     새 데이터가 필요 없고, 절기를 바꾸면 이 값은 실제로 달라진다.
     연간 통계(기준 이상 일수)는 절기와 무관하므로 그쪽에 절기 이름을 붙이지 않는다. */
  function termWindow(city, metric) {
    var t = term(); if (!t) return null;
    var pa = series('past', city, metric), pr = series('present', city, metric);
    if (!pa || !pr) return null;
    var mid = t.doy - 1, half = 7, a = [], b = [];
    for (var k = -half; k <= half; k++) {
      var i = (mid + k + 365) % 365;
      if (pa[i] != null) a.push(pa[i]);
      if (pr[i] != null) b.push(pr[i]);
    }
    if (!a.length || !b.length) return null;
    function mean(x) { return x.reduce(function (p, q) { return p + q; }, 0) / x.length; }
    var pv = mean(a), cv = mean(b);
    return { name: t.name, date: t.date, past: pv, now: cv, diff: cv - pv, days: half * 2 + 1 };
  }
  /* R4-P1-8: 미션3이 가르치는 건 '자료의 범위 읽기'인데, 정작 그 미션의 결론(격차 N일)이
     기준과 비교 기간에 가장 취약하다. 제주·강원의 현재 값은 26개 창 중 최댓값이고,
     30년으로 넓히면 크기 순서가 뒤집힌다. 앱은 이미 그 답을 데이터로 갖고 있으면서
     한계 절에 쓰지 않았다 — 방어할 수 있는 것을 방어하지 않는 상태였다. */
  function regionGapNote(thr) {
    function d(city, t) {
      var a = lastInfo('past', t, city, 'temp'), b = lastInfo('present', t, city, 'temp');
      return (a && b) ? b[0] - a[0] : null;
    }
    var out = '', here = [d('제주', thr), d('강원', thr)];
    if (here[0] == null || here[1] == null) return '';
    var gapHere = Math.abs(here[0] - here[1]);
    /* 기준을 두 칸 옮기면 이 격차가 어떻게 되는지 — 실제로 계산해서 보여 준다 */
    var alt = null;
    [thr + 2, thr - 2, thr + 1, thr - 1].forEach(function (t) {
      if (alt) return;
      var a = d('제주', t), b = d('강원', t);
      if (a != null && b != null) alt = { t: t, gap: Math.abs(a - b), flip: (a - b) * (here[0] - here[1]) < 0 };
    });
    if (alt) {
      out += ' <b>이 격차는 고른 기준에 따라 달라집니다</b> — ' + thr + '°C에서 ' + gapHere + '일이지만 '
        + alt.t + '°C에서는 ' + alt.gap + '일' + (alt.flip ? '이고 <b>어느 쪽이 큰지도 뒤집힙니다</b>' : '입니다') + '.';
    }
    var sj = sensitivityAt('제주', thr), sg = sensitivityAt('강원', thr);
    if (sj && sg && sj.long != null && sg.long != null && sj.current != null && sg.current != null) {
      var maxed = (sj.current >= sj.max - 0.01) && (sg.current >= sg.max - 0.01);
      out += ' 또한 두 값은 5년 창 ' + sj.n + '개 중 ' + (maxed ? '<b>가장 큰 값</b>' : '한 창의 값')
        + '이고, ' + sj.longYears + '년(' + sj.longSpan.join('–') + ')으로 넓히면 제주 <b>' + fmt1(sj.long)
        + '일</b> · 강원 <b>' + fmt1(sg.long) + '일</b>'
        + ((sj.long - sg.long) * (here[0] - here[1]) < 0 ? '로 <b class="hot">순서가 뒤집힙니다</b>' : '입니다')
        + ' — <b>지역 차이의 방향은 남지만 크기는 고른 기준과 기간에 달려 있습니다.</b>';
    }
    return out;
  }
  function lagOf(city) { return cityOf(city).seasonalLag; }
  /* 16지점 평균 지연이 과거→현재로 얼마나 변했는지, 그리고 지금 도시의 극값
     부근이 얼마나 평탄한지. 후자는 '이 날짜를 하루 단위로 믿어도 되는가'의 답이다. */
  function lagChange(season) {
    var isS = season === 'summer', pa = [], na = [];
    CITIES.forEach(function (c) {
      var L = lagOf(c); if (!L) return;
      pa.push(isS ? L.past.hotLag : L.past.coldLag);
      na.push(isS ? L.present.hotLag : L.present.coldLag);
    });
    function avg(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : 0; }
    var L2 = lagOf(), cur = series('present'), ext = isS ? L2.present.hotDoy : L2.present.coldDoy;
    var v0 = cur[(ext - 1 + 365) % 365], tol = 0.5, n = 0;
    for (var k = -30; k <= 30; k++) {
      var v = cur[(ext - 1 + k + 365) % 365];
      if (v != null && Math.abs(v - v0) <= tol) n++;
    }
    return { pastAvg: avg(pa), nowAvg: avg(na), flatDays: n, flatSpan: tol * 2 };
  }
  /* R4-P0-4: 예전에는 여기 COASTAL 이분법(해안 7 vs 내륙 9)이 있었고, 화면은
     "바다가 천천히 식으니 해안이 늦다"를 인과로 단정했다. 그런데
       · 그 '해안' 7곳 중 인천(11일)·포항(10일)은 내륙 분포(10~13일) 안에 그대로 들어가고
       · 5년 중 한 해만 빼면 해안–내륙 격차가 11일 → 2일로 사라진다(잭나이프 실측)
       · 같은 저장소의 검증 스크립트는 같은 지점(경북)을 내륙으로 분류하고 있었다
     이 미션의 자기 선언이 "흔들리는 숫자와 남는 방향을 구별하라"인데 판정문이
     흔들리는 숫자로 인과를 단정하고 있었다. 이분법을 버리고, 빌드 단계에서 계산한
     lagSummary(사분위 이상치 + 잭나이프 안정성)가 말하는 것만 화면에 싣는다. */
  function lagNationwide(season) {
    var isS = season === 'summer', all = [];
    CITIES.forEach(function (c) {
      var L = lagOf(c); if (!L) return;
      all.push(isS ? L.present.hotLag : L.present.coldLag);
    });
    var s = (D.lagSummary && D.lagSummary[isS ? 'summer' : 'winter']) || null;
    function avg(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : 0; }
    return { min: Math.min.apply(null, all), max: Math.max.apply(null, all), avg: avg(all),
             median: s ? s.median : avg(all), typical: s ? s.typical : null,
             outliers: s ? s.outliers : [], outlierVals: s ? s.outlierVals : {},
             jackMax: s ? s.jackMaxSpan : null, jackMed: s ? s.jackMedianSpan : null,
             robust: !!(s && s.robust) };
  }
  /* '뚜렷하게 늦은 곳'을 이름과 값으로 부른다 — 범주가 아니라 지점으로 */
  function lagOutlierText(nat) {
    if (!nat.outliers || !nat.outliers.length) return '';
    return nat.outliers.map(function (n) {
      var st = D.cities[n];
      return n + (st && st.type === 'do' ? '(' + st.station + ')' : '') + ' ' + nat.outlierVals[n] + '일';
    }).join(' · ');
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
  /* SVG 텍스트 폭 어림 — 한글은 글자당 약 1.0em, 라틴·숫자는 약 0.55em.
     getComputedTextLength()는 노드를 붙인 뒤에만 쓸 수 있어서 그리기 전 판단에는 못 쓴다. */
  function estTextW(s, fs) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      w += (c >= 0x1100 && c <= 0xd7a3) || (c >= 0x3000 && c <= 0x9fff) ? 1.0 : 0.55;
    }
    return w * fs;
  }
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
  /* R4-P1-8: 예전에는 기준이 정확히 25℃일 때만 민감도 고지가 나왔다.
     그런데 미션 1·2가 시키는 행동이 바로 "기준선을 여러 높이로 옮겨"다 —
     학습자가 그 지시를 따르는 순간 유일한 강건성 고지가 사라졌다.
     windows 데이터에 20~34℃ 전 임계값의 창별 값이 이미 들어 있으므로
     현재 기준에서 직접 계산한다. 이제 어떤 기준에서도 고지가 따라온다. */
  function sensitivityAt(city, thr) {
    var c = cityOf(city), W = c.windows;
    if (state.metric !== 'temp' || !W || !W.list || !W.list.length) return null;
    /* 5차 F10: 파이프라인이 이미 정확한 민감도를 계산해 데이터에 넣어 두었는데
       (서울 thr=25 → min 4 · max 17.2 · 30년 9.6) 화면은 그것을 쓰지 않고
       '이미 정수로 반올림된 창별 doy'를 다시 차분해 이중 반올림 값(+9)을 인쇄했다.
       그래서 문서의 '+10일'(9.6의 올바른 반올림)과 화면이 어긋났다 — 문서가 옳고 화면이 틀렸다.
       기준값이 파이프라인이 계산한 기준과 같을 때는 그 값을 그대로 쓴다. */
    var S = c.sensitivity;
    if (S && Number(S.thr) === Number(thr) && S.min != null && S.max != null) {
      return { thr: thr, min: S.min, max: S.max, n: S.windows || W.list.length,
               long: S.long != null ? S.long : null,
               longSpan: S.longSpan || (W.long ? [W.long.y0, W.long.y1] : null),
               longYears: S.longYears || (W.long ? (W.long.n || (W.long.y1 - W.long.y0 + 1)) : null),
               current: S.current != null ? S.current : null, exact: true };
    }
    var pi = lastInfo('past', thr, city, 'temp');
    if (!pi) return null;
    var base = pi[0], ds = [];
    W.list.forEach(function (w) { var v = w.last && w.last[String(thr)]; if (v != null) ds.push(v - base); });
    if (ds.length < 5) return null;
    var lng = (W.long && W.long.last && W.long.last[String(thr)] != null) ? W.long.last[String(thr)] - base : null;
    var ci = lastInfo('present', thr, city, 'temp');
    /* 폴백 경로: 창별 doy가 이미 정수라 여기서 나온 값은 하루 안쪽에서 덜 정확하다.
       파이프라인이 계산한 기준값(보통 미션 기본 기준)에서는 위쪽 분기가 쓰인다. */
    return { thr: thr, min: Math.min.apply(null, ds), max: Math.max.apply(null, ds), n: ds.length,
             long: lng, longSpan: W.long ? [W.long.y0, W.long.y1] : null,
             longYears: W.long ? (W.long.n || (W.long.y1 - W.long.y0 + 1)) : null,
             current: ci ? ci[0] - base : null, exact: false };
  }
  function sensitivityText(city) {
    var s = sensitivityAt(city, state.thr);
    if (!s) return '';
    return ' 참고로 같은 기준(' + s.thr + '°C)에서 비교하는 5년 창 ' + s.n + '개를 옮겨 보면 시차는 <b>'
      + fmt1(s.min) + '~' + fmt1(s.max) + '일</b> 사이에서 움직이고'
      + (s.long != null ? ', ' + s.longYears + '년(' + s.longSpan.join('–') + ')으로 보면 <b>' + fmt1(s.long) + '일</b>입니다.' : '입니다.');
  }
  function fmt1(v) { return (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10); }
  /* fmt1은 증감용이라 항상 부호를 붙인다. 절대값 표기에는 이쪽을 쓴다. */
  function num1(v) { return String(Math.round(v * 10) / 10); }
  /* 한국어 조사 — '강원은(는)' 같은 표기를 피한다 */
  /* 조사 선택 — 괄호·따옴표로 끝나는 라벨(예: "기준(‘덥다’의 정의)")은
     소리 나는 마지막 한글 음절로 판단해야 한다. 안 그러면 "정의)을"이 된다. */
  function lastHangul(w) {
    var t = String(w);
    for (var i = t.length - 1; i >= 0; i--) {
      var ch = t.charCodeAt(i);
      if (ch >= 0xac00 && ch <= 0xd7a3) return ch;
    }
    return -1;
  }
  function hasJong(w) { var ch = lastHangul(w); return ch >= 0 && (ch - 0xac00) % 28 !== 0; }
  function eunNeun(w) { return hasJong(w) ? '은' : '는'; }
  function eulReul(w) { return hasJong(w) ? '을' : '를'; }
  function iGa(w) { return hasJong(w) ? '이' : '가'; }

  function load() {
    var base = { phase: 'intro', mi: 0, city: '서울', ti: 15, thr: 25, thr0: 25, metric: 'temp', pre: null, post: null,
                 predicts: {}, done: [], touched: false, moved: false, missionDraft: {}, missionCerl: {}, cerlSubmitted: {},
                 selfChecks: {}, freeDraft: '', zoom: false, view: 'chart',
                 missionStep: null, cerlStepById: {}, evidenceById: {}, introStep: 'landing', termIntroStep: 0,
                 completeStep: 0, freeTab: 0, labTab: 0,
                 markDoy: null, lagRevealed: false, lagSeason: 'summer', winI: null, lab: null, labFrom: null, labSeen: false };
    try {
      /* v4는 ‘자료를 보기 전 예측’과 학생 CERL 필수 제출을 상태 스키마에 포함한다.
         이전 버전의 완료 기록을 그대로 살리면 빈 CERL로 완료 화면에 들어갈 수 있으므로
         교육 흐름이 다른 v3 기록은 의도적으로 이어받지 않는다. */
      var s = JSON.parse(localStorage.getItem('weather24_verify_v4'));
      if (s && typeof s === 'object') {
        var o = Object.assign(base, s);
        /* 저장된 값이 현재 스키마를 벗어나면 기본값으로 되돌린다 (RC-R) */
        if (['intro', 'tutorial', 'terms', 'mission', 'verdict', 'complete', 'free', 'lab'].indexOf(o.phase) === -1) o.phase = 'intro';
        if (CITIES.indexOf(o.city) === -1) o.city = base.city;
        if (!METRICS[o.metric]) o.metric = base.metric;
        if (!(o.ti >= 0 && o.ti < D.terms.length)) o.ti = base.ti;
        if (!isFinite(o.thr)) o.thr = base.thr;
        o.mi = Math.min(Math.max(Number(o.mi) || 0, 0), MISSIONS.length - 1);
        if (!o.missionDraft || typeof o.missionDraft !== 'object') o.missionDraft = {};
        if (!o.missionCerl || typeof o.missionCerl !== 'object') o.missionCerl = {};
        if (!o.cerlSubmitted || typeof o.cerlSubmitted !== 'object') o.cerlSubmitted = {};
        if (!o.selfChecks || typeof o.selfChecks !== 'object') o.selfChecks = {};
        if (!o.cerlStepById || typeof o.cerlStepById !== 'object') o.cerlStepById = {};
        if (!o.evidenceById || typeof o.evidenceById !== 'object') o.evidenceById = {};
        if (['predict', 'lens', 'orient', 'explore', 'evidence', 'write', 'check', 'expert', 'transfer', 'audit'].indexOf(o.missionStep) === -1) o.missionStep = null;
        /* 실험실 진입 위치(5차 F04). 저장된 값이 스키마를 벗어나면 버린다 —
           복귀가 엉뚱한 화면으로 가는 것보다 미션 5로 가는 폴백이 안전하다. */
        if (o.labFrom && (typeof o.labFrom !== 'object'
            || ['intro', 'mission', 'complete', 'free'].indexOf(o.labFrom.phase) === -1)) o.labFrom = null;
        o.labSeen = !!o.labSeen;
        if (o.introStep !== 'method') o.introStep = 'landing';
        o.termIntroStep = Math.min(4, Math.max(0, Number(o.termIntroStep) || 0));
        o.completeStep = Math.min(3, Math.max(0, Number(o.completeStep) || 0));
        if (typeof o.freeTab === 'string') o.freeTab = ['workspace', 'evidence', 'verdict'].indexOf(o.freeTab);
        if (typeof o.labTab === 'string') o.labTab = ['model', 'experiment', 'findings', 'limits'].indexOf(o.labTab);
        o.freeTab = Math.min(2, Math.max(0, Number(o.freeTab) || 0));
        o.labTab = Math.min(3, Math.max(0, Number(o.labTab) || 0));
        if (o.view !== 'table' && o.view !== 'map') o.view = 'chart';
        if (o.lagSeason !== 'winter') o.lagSeason = 'summer';
        if (!(o.markDoy >= 1 && o.markDoy <= 365)) o.markDoy = null;
        /* R4-P0-5: '정답 공개' 상태가 날짜 없이 되살아나면 "아직 안 찍음"과
           "실제 7월 31일 · 40일 늦음"이 한 화면에 동시에 뜬다. */
        o.lagRevealed = !!o.lagRevealed && o.markDoy != null;
        if (!(typeof o.winI === 'number' && o.winI >= 0 && o.winI < 60)) o.winI = null;
        o.zoom = !!o.zoom;
        return o;
      }
    } catch (e) {}
    return base;
  }
  function save() {
    /* R4-P2(SHARE-01): 공용 PC에서 앞 사람 기록을 이어받는 사고를 막는다.
       저장 시각을 함께 남겨 두면, 오래 비어 있던 기기에서 다시 열 때 물어볼 수 있다. */
    try { state.savedAt = Date.now(); localStorage.setItem('weather24_verify_v4', JSON.stringify(state)); } catch (e) {}
  }

  /* 상태 딥링크 — 교사가 '이 화면'을 그대로 배부하고, 모둠끼리 설정을 비교할 수 있게 한다. */
  function stateHash() {
    return '#c=' + encodeURIComponent(state.city) + '&m=' + state.metric + '&t=' + state.thr + '&s=' + state.ti
      + (state.phase === 'free' ? '&v=free' : state.phase === 'lab' ? '&v=lab'
         : (state.phase === 'mission' ? '&v=m' + state.mi + (state.missionStep ? '&p=' + state.missionStep : '') : ''));
  }
  function applyHash() {
    var h = (location.hash || '').replace(/^#/, '');
    if (!h) return false;
    var q = {};
    h.split('&').forEach(function (kv) { var a = kv.split('='); if (a[0]) q[a[0]] = decodeURIComponent(a[1] || ''); });
    var touched = false;
    /* 미션 딥링크는 미션의 기본값(지표·기준·지역·절기)을 먼저 세운다.
       예전에는 phase와 mi만 바꿔 renderExplore를 불러서, 예컨대 #v=m3(강수 미션)이
       직전 화면의 기온·25℃를 그대로 들고 열렸다 — 프리셋이 22/25/28로 뜨고
       판정 게이트가 영원히 닫혀 있었다. 명시된 c·m·t·s는 그 뒤에 덮어쓴다. */
    if (/^m[0-9]+$/.test(q.v || '')) {
      var i = Number(q.v.slice(1));
      if (i >= 0 && i < MISSIONS.length) {
        var mm = MISSIONS[i];
        state.phase = 'mission'; state.mi = i;
        state.city = mm.city; state.metric = mm.metric; state.thr = mm.thr; state.thr0 = mm.thr;
        state.ti = mm.ti; state.view = 'chart'; state.touched = false; state.moved = false;
        var deepSteps = ['predict', 'lens', 'orient', 'explore', 'evidence', 'write', 'check', 'expert', 'transfer', 'audit'];
        state.missionStep = deepSteps.indexOf(q.p) !== -1 ? q.p : 'predict';
        if (mm.lagMode) { state.markDoy = null; state.lagRevealed = false; state.lagSeason = 'summer'; state.ti = 11; }
        touched = true;
      }
    } else if (q.v === 'free') { state.phase = 'free'; touched = true; }
    else if (q.v === 'lab') { state.phase = 'lab'; touched = true; }
    if (q.c && CITIES.indexOf(q.c) !== -1) { state.city = q.c; touched = true; }
    if (q.m && METRICS[q.m]) { state.metric = q.m; touched = true; }
    if (q.s != null && q.s !== '' && isFinite(q.s) && q.s >= 0 && q.s < D.terms.length) { state.ti = Number(q.s); touched = true; }
    if (q.t != null && q.t !== '' && isFinite(q.t)) { state.thr = Number(q.t); touched = true; }
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
  var PAD_L = L;   /* lagOverlay 안에서는 L이 lagInfo()로 가려지므로 별칭을 둔다 */
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
      grid += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '" stroke="rgba(var(--line-rgb),' + (f === 0 || f === 1 ? '.2' : '.11') + ')"/>'
            + '<text x="6" y="' + (y + 4).toFixed(1) + '" fill="var(--muted2)" font-size="11">' + (Math.round(v * 10) / 10) + (f === 1 ? mc.unit : '') + '</text>';
    });
    var months = narrow ? [1, 3, 5, 7, 9, 11] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    months.forEach(function (m) {
      var i = CUM[m - 1];
      grid += '<line x1="' + xf(i).toFixed(1) + '" y1="' + (H - BT) + '" x2="' + xf(i).toFixed(1) + '" y2="' + (H - BT + 5) + '" stroke="rgba(var(--line-rgb),.28)"/>'
            + '<text x="' + xf(i + 14).toFixed(1) + '" y="' + (H - 8) + '" fill="var(--muted2)" font-size="11" text-anchor="middle">' + m + '월</text>';
    });
    svg.innerHTML = grid
      + '<path d="' + fill + '" fill="' + COLORS.present + '" fill-opacity="0.16"/>'
      + '<path d="' + path(past) + '" fill="none" stroke="' + COLORS.past + '" stroke-width="2" stroke-dasharray="5 4"/>'
      + '<path d="' + path(pres) + '" fill="none" stroke="' + COLORS.present + '" stroke-width="2.7"/>'
      /* R4-P1-4: 절기선 라벨. ① 계절 지연 미션에서는 lagOverlay가 같은 자리에 자기
         라벨을 그리므로 여기서는 그리지 않는다(예전에는 1px 간격으로 두 글자가 포개졌다).
         ② 라벨이 viewBox 오른쪽을 넘으면 SVG가 overflow:hidden으로 잘라 버린다 —
         24절기 중 추분~동지 6개가 그랬고 동지는 절반 이상이 사라졌다. 넘칠 때는
         절기선 왼쪽에 붙여 끝을 맞춘다. */
      + '<line x1="' + tx.toFixed(1) + '" y1="' + TP + '" x2="' + tx.toFixed(1) + '" y2="' + (H - BT) + '" stroke="' + COLORS.term + '" stroke-width="1.7" stroke-dasharray="4 3"/>'
      + (isLagMode() ? '' : (function () {
          var s = tm.name + '(' + tm.hanja + ') ' + tm.date + ' · ' + tm.meaning;
          var flip = tx + 5 + estTextW(s, 11.5) > W - R;
          return '<text x="' + (flip ? tx - 5 : tx + 5).toFixed(1) + '" y="' + (TP + 11)
            + '" fill="' + COLORS.term + '" font-size="11.5" text-anchor="' + (flip ? 'end' : 'start') + '">' + s + '</text>';
        })())
      /* 미션5(계절 지연)는 '날짜'를 가로로 찍는 미션이다. 임계값 기준선과 ⇅ 그립을
         남겨 두면 학습자가 그것을 잡고 세로로 끌고, 그립이 차트 왼쪽 8% 지점에 있어
         '가장 더운 날 = 1월 8일'이 찍힌다. 이 미션에서는 아예 그리지 않는다. */
      + (isLagMode() ? '' :
          '<line x1="' + L + '" y1="' + yT.toFixed(1) + '" x2="' + (W - R) + '" y2="' + yT.toFixed(1) + '" stroke="' + COLORS.threshold + '" stroke-width="2.2"/>'
          /* 잡을 곳을 알려주는 그립 (F-11) */
          + '<circle cx="' + (L + 13) + '" cy="' + yT.toFixed(1) + '" r="8" fill="' + COLORS.threshold + '" stroke="var(--ink-on-accent)" stroke-width="1.5"/>'
          + '<text x="' + (L + 13) + '" y="' + (yT + 3.6).toFixed(1) + '" fill="var(--ink-on-accent)" font-size="10" font-weight="800" text-anchor="middle">⇅</text>'
          + '<rect x="' + (W - R - 104) + '" y="' + (yT - 11).toFixed(1) + '" width="104" height="20" rx="6" fill="' + COLORS.threshold + '"/>'
          + '<text x="' + (W - R - 52) + '" y="' + (yT + 3.5).toFixed(1) + '" fill="var(--ink-on-accent)" font-size="12" font-weight="700" text-anchor="middle">' + mc.verb + ' ' + thr + mc.unit + '</text>')
      + lagOverlay(yf, b)
      /* R4-P2: 이 두 마커는 '곡선 위의 점'이 아니라 <b>날짜</b> 표시다(연도별 실측에서 센 값).
         평활 곡선이 기준선에 닿지 않는 높은 기준에서는 마커만 허공에 뜬 것처럼 보였다.
         기준선에서 x축까지 점선을 내려 '날짜를 가리키는 표시'로 읽히게 한다. */
      + (mc.showLast && pl > 0 && !isLagMode() && !isSealed() ? '<line x1="' + xf(pl - 1).toFixed(1) + '" y1="' + yT.toFixed(1) + '" x2="' + xf(pl - 1).toFixed(1) + '" y2="' + (H - BT) + '" stroke="' + COLORS.past + '" stroke-width="1" stroke-dasharray="2 3" opacity="0.7"/>'
          + '<circle cx="' + xf(pl - 1).toFixed(1) + '" cy="' + yT.toFixed(1) + '" r="6.5" fill="' + COLORS.past + '" stroke="var(--ink-on-accent)" stroke-width="1.5"/>'
          + '<text x="' + xf(pl - 1).toFixed(1) + '" y="' + (yT - 12).toFixed(1) + '" fill="' + COLORS.past + '" font-size="11" text-anchor="middle">' + doyStr(pl) + '</text>' : '')
      + (mc.showLast && cl > 0 && !isSealed() ? '<line x1="' + xf(cl - 1).toFixed(1) + '" y1="' + yT.toFixed(1) + '" x2="' + xf(cl - 1).toFixed(1) + '" y2="' + (H - BT) + '" stroke="' + COLORS.present + '" stroke-width="1.2" stroke-dasharray="2 3" opacity="0.8"/>'
          + '<circle cx="' + xf(cl - 1).toFixed(1) + '" cy="' + yT.toFixed(1) + '" r="8" fill="' + COLORS.present + '" stroke="var(--ink-on-accent)" stroke-width="1.5"/>'
          + '<text x="' + xf(cl - 1).toFixed(1) + '" y="' + (yT + 22).toFixed(1) + '" fill="' + COLORS.present + '" font-size="11.5" font-weight="700" text-anchor="middle">' + doyStr(cl) + '</text>' : '');
    svg.setAttribute('aria-label', chartAlt());
    var ri = $('thrRange');
    if (ri) {
      ri.min = hr.lo; ri.max = hr.hi; ri.step = 1; ri.value = thr;
      ri.setAttribute('aria-valuetext', isSealed()
        ? mc.verb + ' 기준 ' + thr + mc.unit + ' · 수치는 예측을 봉인한 뒤 열립니다'
        : mc.verb + ' 기준 ' + thr + mc.unit + ' · ' + dayLabel(thr) + ' 과거 ' + fmtDays(exceed('past', thr)) + ', 현재 ' + fmtDays(exceed('present', thr)));
    }
    if ($('thrOut')) $('thrOut').textContent = thr + mc.unit;
    syncPresets();
    renderLiveNums();
    renderReadouts();
    updateSpark();
    updateHeatNote();
    updateLiveSentence();
    syncMetricLabels();
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
    /* 라벨이 오른쪽 밖으로 나가면 잘린다(동지는 절반 이상이 사라졌다). 넘치면 왼쪽으로 붙인다. */
    function side(x, s, fs) {
      var flip = x + 6 + estTextW(s, fs) > W - R;
      return { x: (flip ? x - 6 : x + 6).toFixed(1), a: flip ? 'end' : 'start' };
    }
    var s1 = L.solName + ' ' + doyStr(L.solDoy), p1 = side(sx, s1, 12);
    var p2 = side(sx, L.solDesc, 11.5);
    out += '<line x1="' + sx.toFixed(1) + '" y1="' + TP + '" x2="' + sx.toFixed(1) + '" y2="' + (H - BT) + '" stroke="var(--sun)" stroke-width="2" stroke-dasharray="5 4"/>'
      + '<text x="' + p1.x + '" y="' + (TP + 12) + '" fill="var(--sun)" font-size="12" font-weight="700" text-anchor="' + p1.a + '">' + s1 + '</text>'
      + '<text x="' + p2.x + '" y="' + (TP + 27) + '" fill="var(--sun)" font-size="11.5" text-anchor="' + p2.a + '">' + L.solDesc + '</text>';
    if (state.markDoy) {
      var gx = xf(state.markDoy - 1), gy = yf(pres[state.markDoy - 1]);
      /* 주의: 이 함수 안에서 L은 lagInfo()로 가려져 있다(바깥 L=차트 좌측 여백 46).
         예전 수정에서 그걸 놓쳐 클램프가 NaN이 되고 연초 라벨이 왼쪽으로 잘렸다. */
      var gs = '내 예상 ' + doyStr(state.markDoy), gw = estTextW(gs, 11.5) / 2;
      var gcx = Math.max(PAD_L + gw, Math.min(W - R - gw, gx));  /* 라벨이 축 밖으로 안 나가게 */
      out += '<line x1="' + gx.toFixed(1) + '" y1="' + TP + '" x2="' + gx.toFixed(1) + '" y2="' + (H - BT) + '" stroke="var(--thr)" stroke-width="2.4"/>'
        + '<circle cx="' + gx.toFixed(1) + '" cy="' + gy.toFixed(1) + '" r="8" fill="var(--thr)" stroke="var(--ink-on-accent)" stroke-width="1.6"/>'
        + '<text x="' + gcx.toFixed(1) + '" y="' + (H - BT + 18) + '" fill="var(--on-thr)" font-size="11.5" font-weight="700" text-anchor="middle">' + gs + '</text>';
    }
    if (state.lagRevealed && missionAsked(MISSIONS[state.mi])) {
      var ax = xf(L.actDoy - 1), ay = yf(pres[L.actDoy - 1]);
      var as = '실제 ' + doyStr(L.actDoy), aw = estTextW(as, 12.5) / 2;
      var acx = Math.max(PAD_L + aw, Math.min(W - R - aw, ax));
      out += '<circle cx="' + ax.toFixed(1) + '" cy="' + ay.toFixed(1) + '" r="9" fill="var(--coral)" stroke="var(--ink-on-accent)" stroke-width="1.8"/>'
        + '<text x="' + acx.toFixed(1) + '" y="' + (ay - 16).toFixed(1) + '" fill="var(--coral)" font-size="12.5" font-weight="800" text-anchor="middle">' + as + '</text>';
      /* R4-P2: 겨울은 극값일이 해를 넘어간다(동지 356 → 1/2). 두 점을 브래킷으로 이으면
         플롯 폭의 97%를 가로질러 "340일쯤 늦다"로 읽힌다. 해를 넘는 경우는 브래킷 대신 문장으로. */
      var wraps = L.actDoy < L.solDoy;
      if (!wraps) {
        var x1 = Math.min(sx, ax), x2 = Math.max(sx, ax), my = TP + 44;
        out += '<line x1="' + x1.toFixed(1) + '" y1="' + my + '" x2="' + x2.toFixed(1) + '" y2="' + my + '" stroke="var(--green)" stroke-width="1.6"/>'
          + '<line x1="' + x1.toFixed(1) + '" y1="' + (my - 5) + '" x2="' + x1.toFixed(1) + '" y2="' + (my + 5) + '" stroke="var(--green)" stroke-width="1.6"/>'
          + '<line x1="' + x2.toFixed(1) + '" y1="' + (my - 5) + '" x2="' + x2.toFixed(1) + '" y2="' + (my + 5) + '" stroke="var(--green)" stroke-width="1.6"/>'
          + '<text x="' + ((x1 + x2) / 2).toFixed(1) + '" y="' + (my - 9) + '" fill="var(--green)" font-size="12.5" font-weight="800" text-anchor="middle">' + L.lag + '일 늦다</text>';
      } else {
        var ws = doyStr(L.solDoy) + ' → 해를 넘겨 ' + doyStr(L.actDoy) + ' · ' + L.lag + '일 뒤';
        var wp = side(sx, ws, 12.5);
        out += '<text x="' + wp.x + '" y="' + (TP + 44) + '" fill="var(--green)" font-size="12.5" font-weight="800" text-anchor="' + wp.a + '">' + ws + '</text>'
          + '<text x="' + (W - R) + '" y="' + (H - BT - 6) + '" fill="var(--green)" font-size="11" text-anchor="end">1월로 이어짐 →</text>';
      }
    }
    return out;
  }

  function chartAlt() {
    var mc = metricOf(), n = stat(), tm = term();
    /* R4-P1-7: 봉인은 눈으로 보는 사람에게만 걸려 있었다. 스크린리더 사용자는
       aria-label로 잠긴 수치를 그대로 들었다 — 체험이 같지 않으면 접근성이 아니다. */
    if (isSealed()) {
      return state.city + ' ' + mc.label + ' 연간 곡선. 과거 ' + PERIOD_PAST + '와 현재 ' + PERIOD_NOW + ' 두 곡선, '
        + tm.name + ' ' + tm.date + ' 고정 세로선, ' + mc.verb + ' 기준 ' + state.thr + mc.unit + ' 가로선이 있습니다. '
        + '기준선을 움직이면 곡선 아래 채워지는 면적이 달라집니다. 구체적인 수치는 예측을 봉인한 뒤 열립니다.';
    }
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
        ? '<span aria-hidden="true">🔒</span> 실제 기록은 <b>예측을 봉인한 뒤</b> 열립니다 — 그래프를 좌우로 끌어 가장 ' + (state.lagSeason === 'winter' ? '추울' : '더울') + ' 것 같은 날을 찍으면 예측 문항이 나옵니다.'
        : '<span aria-hidden="true">🔒</span> 숫자는 <b>예측을 봉인한 뒤</b> 열립니다 — 먼저 기준선을 움직여 보고, 숫자가 어떻게 달라질지 예측해 주세요.';
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
      el.innerHTML = '<div class="readout is-locked"><div class="ro-k">' + (isLagMode() ? '절기 → 실제 극값일의 시차' : '기준 이상 일수 · 마지막으로 기준을 넘은 날') + '</div>'
        + '<div class="ro-v">🔒 예측 봉인 후 공개</div>'
        + '<div class="ro-s">자료를 보고 답을 고르는 것이 아니라, 내 예측을 검증하는 순서입니다.</div></div>';
      return;
    }
    if (isLagMode()) {
      var Li = lagInfo();
      if (!Li) { el.innerHTML = ''; return; }
      var nat = lagNationwide(Li.isSummer ? 'summer' : 'winter');
      el.innerHTML = '<div class="readout"><div class="ro-k">' + Li.solName + ' → 가장 ' + Li.word + ' 날</div>'
        + '<div class="ro-v">' + (state.lagRevealed ? '<span class="v-now">' + Li.lag + '일 늦음</span>' : '<span class="v-none">비교 전</span>') + '</div>'
        + '<div class="ro-s">' + (state.lagRevealed ? '과거(' + PERIOD_PAST + ')에도 ' + Li.pastLag + '일이었습니다 — 늘 있던 현상입니다.' : '날짜를 찍고 ‘실제와 비교하기’를 누르세요.') + '</div></div>'
        + '<div class="readout"><div class="ro-k">전국 16지점의 지연 <small>(가운데값 ' + nat.median + '일)</small></div>'
        + '<div class="ro-v"><span class="v-now">' + nat.min + '~' + nat.max + '일</span></div>'
        + '<div class="ro-s">' + (Li.isSummer
            ? '어디서나 거의 같고, 한 해를 빼고 다시 세어도 최대 ' + nat.jackMax + '일만 움직입니다 — 표본을 바꿔도 남는 물리 현상입니다.'
            : (nat.outliers.length ? '<b>' + lagOutlierText(nat) + '</b>만 뚜렷하게 늦고 나머지는 ' + nat.typical[0] + '~' + nat.typical[1] + '일에 몰려 있어요. '
                : '') + '한 해만 빼고 다시 세도 최대 <b>' + nat.jackMax + '일</b>이 흔들립니다 — <b>지점 차이를 한 가지 이유로 단정할 수 없습니다.</b>') + '</div></div>';
      return;
    }
    var mc = metricOf(), n = stat();
    /* 절기를 바꾸면 실제로 달라지는 유일한 수치. 이 카드가 없으면 24개 절기 선택이
       어떤 숫자와도 연결되지 않아 '조작이 작동하지 않는다'로 읽힌다. */
    var tw = termWindow();
    var cards = '';
    if (tw) {
      cards += '<div class="readout is-term"><div class="ro-k">' + tw.name + '(' + tw.date + ') 무렵 ' + mc.label + ' <small>(앞뒤 ' + tw.days + '일 평균)</small></div>'
        + '<div class="ro-v"><span class="v-past">과거 ' + num1(tw.past) + mc.unit + '</span> <i>→</i> <span class="v-now">현재 ' + num1(tw.now) + mc.unit + '</span>'
        + ' <span class="ro-delta">' + fmt1(tw.diff) + mc.unit + '</span></div>'
        + '<div class="ro-s">절기를 바꾸면 이 값이 달라집니다 — 아래 두 수치는 <b>1년 전체</b> 통계라 절기와 무관합니다.</div></div>';
    }
    cards += '<div class="readout"><div class="ro-k">기준 이상 ' + dayLabel() + ' <small>(1년 전체 · 해마다 센 값의 평균)</small></div>'
      + '<div class="ro-v"><span class="v-past">과거 ' + n.pdStr + '</span> <i>→</i> <span class="v-now">현재 ' + n.cdStr + '</span></div>'
      + '<div class="ro-s">' + n.ddStr + ' 변화</div></div>';
    if (mc.showLast) {
      var note;
      if (n.pl > 0 && n.cl > 0) note = (n.drift >= 0 ? '+' : '') + n.drift + '일 늦게 그침';
      else if (n.pl < 0 && n.cl > 0) note = '과거에는 이 기준을 넘은 날이 없어 시차를 계산할 수 없어요 — 기준선을 조금 낮추면 두 시기를 비교할 수 있어요.';
      else if (n.pl > 0 && n.cl < 0) note = '현재에는 이 기준을 넘은 날이 없어 시차를 계산할 수 없어요 — 기준선을 조금 낮춰 보세요.';
      else note = '이 기준을 넘은 날이 과거·현재 모두 없어요 — 기준선을 낮추면 비교를 시작할 수 있어요.';
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
      var exn = extremesOf();
      el.innerHTML = '<span aria-hidden="true">☀</span> 하루 <b>평균</b> ' + state.thr + '℃는 더위를 넓게 잡은 기준이에요. 기상청의 <b>열대야</b>는 밤 최저기온 25℃↑, <b>폭염</b>은 낮 최고기온 33℃↑로 정의합니다. '
        + (exn
            ? '이 기준으로 센 ' + state.city + '의 실측은 <b>기상청 기준표</b> 서랍에 있어요(폭염일 ' + fmtDays(exn.idx.heatwave.past) + ' → <b class="hot">' + fmtDays(exn.idx.heatwave.present) + '</b>, 열대야 ' + fmtDays(exn.idx.tropicalNight.past) + ' → <b class="hot">' + fmtDays(exn.idx.tropicalNight.present) + '</b>). 다만 <b>이 그래프의 곡선과 기준선은 일 평균기온</b>이라 서로 다른 값입니다. '
            : '다만 이 지점은 최고·최저기온 수집분이 없어 그 두 지수를 셀 수 없어요. ')
        + '평균 <b>25~28℃</b> 사이에서 비교하면 과거·현재 양쪽에 값이 나와요.';
    } else if (state.metric === 'precip' && state.thr > 18) {
      /* 축을 늘려 기준선은 보이지만, 곡선이 바닥에 눌린 이유를 말해 주지 않으면
         "그래프가 망가졌다"로 읽힌다. 눌림 자체가 이 미션의 논점이다. */
      el.hidden = false;
      el.innerHTML = '<span aria-hidden="true">☔</span> 곡선이 바닥에 눌려 보이죠? 이 곡선은 <b>그날의 평년 강수량(하루 평균)</b>이라 ' + state.thr + 'mm를 넘는 일이 거의 없습니다. '
        + '<b>' + state.thr + 'mm는 평균이 아니라 비가 크게 쏟아진 하루에만 넘는 값</b>이에요. 그래서 이 기준의 답은 곡선이 아니라 <b>아래 숫자</b>에 있습니다 — 그런 날이 <b>1년에 며칠</b>이었는지 세어 둔 값입니다.';
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
    if (pA != null && pB != null) svg += '<rect x="' + pA.toFixed(1) + '" y="' + T + '" width="' + Math.max(3, pB - pA).toFixed(1) + '" height="' + (HH - T - B) + '" fill="var(--muted)" fill-opacity="0.22"/>';
    if (cA != null && cB != null) svg += '<rect x="' + cA.toFixed(1) + '" y="' + T + '" width="' + Math.max(3, cB - cA).toFixed(1) + '" height="' + (HH - T - B) + '" fill="var(--coral)" fill-opacity="0.22"/>';
    svg += '<text x="2" y="' + (y(hi) + 4).toFixed(1) + '" fill="var(--muted2)" font-size="11">' + Math.round(hi) + '</text><text x="2" y="' + (y(lo)).toFixed(1) + '" fill="var(--muted2)" font-size="11">' + Math.round(lo) + '</text>';
    svg += '<path d="' + d + '" fill="none" stroke="var(--sky)" stroke-width="1.6"/>';
    [ys[0], 1990, 2010, ys[ys.length - 1]].forEach(function (yr) { var bx = xy(yr); if (bx != null) svg += '<text x="' + bx.toFixed(1) + '" y="' + (HH - 5) + '" fill="var(--muted2)" font-size="11" text-anchor="middle">' + yr + '</text>'; });
    return svg + '</svg>';
  }
  function sparkBlock(city, metric) {
    var s = sparklineSVG(city, metric); if (!s) return '';
    var tl = cityOf(city).timeline;
    return '<div class="spark-wrap"><p class="spark-cap"><span aria-hidden="true">◷</span> ' + city + ' · ' + tl.years[0] + '–' + tl.years[tl.years.length - 1] + ' 연간 ' + (METRICS[metric] || METRICS.temp).label + ' 장기 흐름. <b class="past">과거</b>·<b class="now">현재</b> 비교 구간 표시 — <b>내가 비교한 5년은 이 긴 흐름의 양 끝입니다.</b></p>' + s + '</div>';
  }
  function updateSpark() { var el = $('sparkMount'); if (el) el.innerHTML = sparkBlock(state.city, state.metric); }

  function liveSentence() {
    var n = stat(), mc = metricOf(), tm = term();
    if (mc.showLast && n.drift != null) {
      /* 이 문장의 수치는 1년 전체 통계다. 여기에 '소한 무렵'을 붙이면
         "소한 무렵 더위가 그치는 날이 13일 늦어졌습니다"라는 틀린 문장이 만들어진다.
         절기 정보는 그 절기 무렵의 기온 변화로 따로 붙인다. */
      var tw0 = termWindow();
      return '<b>' + n.city + '</b>에서 ‘' + mc.verb + '’를 <b>' + n.thr + mc.unit + '</b>로 정하면, ' + mc.last + '이 과거보다 <b class="hot">' + n.drift + '일</b> ' + (n.drift >= 0 ? '늦어졌습니다' : '빨라졌습니다') + '(1년 전체 기준). '
        + (tw0 ? '<b>' + tw0.name + '</b> 무렵만 보면 ' + mc.label + '이 ' + num1(tw0.past) + mc.unit + ' → ' + num1(tw0.now) + mc.unit + '입니다. ' : '')
        + '<span class="cerl-tag">— ' + n.sampleText + ' · 30년 기후평년 아님</span>';
    }
    return '<b>' + n.city + '</b> · ‘' + mc.verb + ' ' + n.thr + mc.unit + '’ 기준 ' + dayLabel() + eunNeun(dayLabel()) + ' 연평균 과거 <b>' + n.pdStr + '</b> → 현재 <b class="hot">' + n.cdStr + '</b>입니다. <span class="cerl-tag">— ' + n.sampleText + ' · 30년 기후평년 아님</span>';
  }
  function updateLiveSentence() { var el = $('freeCerl'); if (el) el.innerHTML = liveSentence(); }

  /* ---------- 방법론 서랍 (F-9) ---------- */
  /* 예측 봉인이 걸려 있는가 — 표·지도·수치와 같은 잣대를 방법론 서랍에도 적용한다 */
  function isSealed() {
    return state.phase === 'mission' && MISSIONS[state.mi] && !missionAsked(MISSIONS[state.mi]);
  }
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
      + '<p><b>지금 보는 지점</b> ' + state.city + ' = <b>' + c.station + ' 관측소</b>(지점번호 ' + c.sid + ')' + (c.type === 'do' ? ' — <b>‘' + state.city + '’' + eunNeun(state.city) + ' ' + c.station + ' 한 지점의 기록이고, 도 전체의 평균이 아닙니다.</b>' : '') + '</p>'
      + '<p class="method-stations"><b>전체 지점</b> ' + stations + '</p>'
      + '<p><b>비교 기간과 표본 수</b> 과거 ' + y.past.length + '년(' + y.past.join(', ') + ') vs 현재 ' + y.present.length + '년(' + y.present.join(', ') + '). 관측일수가 350일 미만인 <b>불완결 연도는 제외</b>했습니다.</p>'
      + '<p><b>계산 방법</b> ① 화면의 <b>곡선</b>은 완결 연도의 날짜별 평균에 15일 이동평균을 걸어 매끄럽게 다듬은 <b>보기용 평년 곡선</b>입니다(2월 29일 제외). ② <b>일수와 날짜</b>는 곡선에서 세지 않습니다 — <b>연도별 실제 관측값</b>으로 각각 센 뒤 평균한 값(연평균)입니다.</p>'
      + '<p class="method-warn"><b>이 방법의 한계 (반드시 함께 읽어 주세요)</b></p>'
      + '<ol>'
      /* R4-P1-10: 예전에는 이 문장이 지표·기준과 무관하게 늘 '25℃ 기준 +13.2일'을 찍었다.
         미션1의 판정 게이트가 기준 변경을 강제하므로, 28℃에서 서랍을 여는 학습자는
         거의 항상 거짓 문장을 봤다. 강수 미션에는 시차 지표 자체가 없는데도 나왔다.
         또 '지금 화면의 값'은 판독 카드(+13일)와 반올림 시점이 달라 +13.2일로 어긋났다 —
         같은 통계를 한 화면에서 두 번 다르게 쓰지 않도록 stat().drift로 통일한다. */
      + '<li>5년 비교는 <b>관측 신호</b>이지 기후평년(국제 표준은 보통 30년)이 아닙니다.'
      + (function () {
          if (isSealed()) return ' <b>(구체적인 수치는 예측을 봉인한 뒤 열립니다.)</b>';
          if (state.metric !== 'temp') return ' (아래 창 민감도 분석은 <b>기온</b>에서만 계산했습니다 — 지금 보는 ' + mc.label + '에는 해당하지 않습니다.)';
          var s = sensitivityAt(state.city, state.thr);
          if (!s) return ' (지금 기준에서는 두 시기 중 한쪽에 기준을 넘은 날이 없어 시차 민감도를 계산할 수 없습니다.)';
          var n = stat();
          return ' 같은 ' + s.thr + '°C 기준으로 5년 창 ' + s.n + '개를 옮겨 보면 시차가 <b>' + fmt1(s.min) + '~' + fmt1(s.max) + '일</b> 사이에서 움직이고'
            + (s.long != null ? ', ' + s.longYears + '년(' + s.longSpan.join('–') + ')으로 보면 <b>' + fmt1(s.long) + '일</b>입니다.' : '입니다.')
            + (n.drift != null ? ' 지금 화면의 값은 <b>' + fmt1(n.drift) + '일</b>입니다.' : '');
        })() + '</li>'
      /* R4-P1-1: 예전 문구 — "자료에 일평균만 있어 최저·최고기온이 없습니다".
         ASOS 원자료에는 있었고 통합 가공본에만 없었다. 사실대로 적는다. */
      + '<li>이 화면의 <b>곡선·기준선·일수</b>는 모두 <b>일 평균값</b>으로 계산합니다. 최고·최저기온은 통합 가공본(16지점 1969–2026)에 담지 않았기 때문입니다. '
      + '다만 <b>ASOS 원자료에는 최고·최저기온이 있어</b>, 8지점(' + CITIES.filter(function (c) { return extremesOf(c); }).join('·') + ')에 한해 '
      + '<b>폭염일·열대야·결빙일</b>을 따로 세어 ‘기상청 기준표’ 서랍에 실었습니다. 그 표는 <b>비교 기간이 달라</b>(현재 2022–2025) 위 수치와 나란히 놓을 수 없습니다.</li>'
      + '<li>절기 날짜는 태양의 위치(황경)로 정해집니다. 화면에는 1969~2026년 <b>최빈 날짜</b>를 대표값으로 적었고, 해에 따라 하루 정도 다를 수 있습니다.</li>'
      + '<li>한 지점의 기록은 그 지점 주변의 신호입니다. 관측소 주변 <b>도시화</b>의 영향과 기후변화의 영향을 이 화면만으로 분리할 수는 없습니다.</li>'
      + '</ol>'
      /* R4-P1-7: 표·지도·판독 카드는 봉인 중 잠기는데 이 서랍만 열려 있었다.
         월별 표는 미션2~5의 봉인 문항이 묻는 '방향과 격차'를 그대로 보여 준다. */
      + (isSealed()
          ? '<p class="locked-note">🔒 <b>월별 요약 표는 예측을 봉인한 뒤 열립니다.</b> 이 표에는 지금 봉인하려는 문항의 답이 들어 있어요.</p>'
          : '<p><b>월별 요약</b> — ' + state.city + ' · ' + mc.label + ' · ‘' + mc.verb + ' ' + state.thr + mc.unit + '’ 기준</p>' + monthTable())
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
  /* R4-P1-1: 예전에는 이 표의 기온 4행이 전부 '계산 불가'였고, 화면·README가
     "자료에 최저·최고기온이 없다"고 적었다. 그러나 ASOS 원자료에는 1969년부터
     minTa·maxTa가 채워져 있었고, 수집기가 KEEP에서 버렸을 뿐이다.
     이제 8지점의 폭염일·열대야를 실제로 세어 싣는다 — 주최기관인 기상청의
     대표 기후변화 지표를 "없다"고 말하던 것이 가장 아픈 사실오인이었다.
     다만 별도 수집분이라 비교 기간이 통합본과 다르므로(현재 4년) 그 사실을 함께 적는다. */
  var KMA_REF = {
    temp: {
      title: '기온 — 기상청 특보·현상 기준',
      rows: [
        ['폭염일', '일 <b>최고</b>기온 33℃ 이상 <small>(폭염주의보 기준온도)</small>', 'ext:heatwave'],
        ['35℃ 이상', '일 <b>최고</b>기온 35℃ 이상 <small>(폭염경보 기준온도)</small>', 'ext:hot35'],
        ['열대야', '밤 <b>최저</b>기온 25℃ 이상', 'ext:tropicalNight'],
        ['결빙일', '일 <b>최고</b>기온 0℃ 미만 <small>(하루 종일 영하)</small>', 'ext:iceDay'],
        ['폭염주의보·경보', '위 기준온도가 <b>2일 이상 지속</b>될 때 발표', 'no'],
        ['한파주의보', '아침 <b>최저</b>기온이 전날보다 10℃ 이상 내려 3℃ 이하', 'no'],
        ['이 화면의 기준선', '일 <b>평균</b>기온 20~34℃ 중 내가 고른 값', 'yes']
      ],
      note: '위 <b>폭염일·열대야·결빙일</b>은 기상청 원자료의 일 최고·최저기온으로 <b>실제로 세었습니다</b>(아래 표). '
        + '다만 <b>특보 발표</b>는 “2일 이상 지속” 같은 조건이 붙어 이 화면에서 재현하지 않습니다 — 기준온도를 넘은 <b>날수</b>만 셉니다. '
        + '그리고 학습자가 움직이는 기준선은 <b>일 평균기온</b>이라 공식 기준과 다른 값입니다. <b>내가 정한 기준과 사회가 합의한 기준이 다르다</b>는 것을 결론에 함께 적으세요.'
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
      note: '습도는 기온과 함께 봐야 체감을 설명할 수 있습니다. 습도 하나만으로 ‘덥다·불쾌하다’를 단정하지 마세요. 건조주의보의 <b>실효습도</b>는 하루 평균습도와 계산법이 다릅니다.'
    }
  };
  function extremesOf(city) { return (D.cities[city || state.city] || {}).extremes || null; }

  /* 폭염·열대야 실측 표 — 기상청 기준온도로 센 연평균 일수 */
  function extremeTableHTML() {
    /* 봉인 중에는 이 표도 잠근다 — 미션 2~5의 예측 문항이 묻는 '방향'을 그대로 보여 준다 */
    if (isSealed()) return '<p class="locked-note">🔒 폭염·열대야 실측 표는 예측을 봉인한 뒤 열립니다.</p>';
    var ex = extremesOf();
    if (!ex) {
      return '<p class="kma-note">이 지점은 최고·최저기온 수집분이 없어 폭염·열대야를 셀 수 없습니다. '
        + '<b>' + CITIES.filter(function (c) { return extremesOf(c); }).join(' · ') + '</b>에서 확인할 수 있어요.</p>';
    }
    var rows = '';
    ['heatwave', 'hot35', 'tropicalNight', 'iceDay'].forEach(function (k) {
      var v = ex.idx[k]; if (!v || v.past == null || v.present == null) return;
      /* 5차 F09: 과거·현재는 fmtDays(10일 이상이면 정수로 반올림)로, 변화는 fmtNum(항상 소수
         한 자리)으로 찍어서 표시된 세 숫자가 서로 맞지 않았다 — 서울 폭염일이 4.2 · 23 · +18.3으로
         나와 4.2 + 18.3 = 22.5 ≠ 23이 된다. '숫자를 정확한 범위로 말하라'를 가르치는 앱의 대표
         실측 표가 암산 한 번으로 반증되는 셈이다. 세 칸을 같은 소수 한 자리로 통일하고
         변화는 '표시된 두 값의 차'로 계산해, 표 안에서 검산이 항상 성립하게 한다. */
      var pastS = fmtNum(v.past), nowS = fmtNum(v.present);
      var d = Math.round((Number(nowS) - Number(pastS)) * 10) / 10;
      var up = d > 0;
      rows += '<tr><th scope="row">' + v.label + '<small>' + v.def + '</small></th>'
        + '<td>' + pastS + '일</td><td>' + nowS + '일</td>'
        + '<td class="' + (up ? 'up' : (d < 0 ? 'down' : '')) + '">' + (up ? '+' : '') + fmtNum(d) + '일</td></tr>';
    });
    return '<div class="table-wrap"><table class="data-table"><caption>'
      + state.city + '(' + cityOf().station + ' 관측소) · 기상청 기준온도로 센 연평균 일수 — 과거 '
      + ex.periods.past + '(' + ex.years.past.length + '년) vs 현재 ' + ex.periods.present + '(' + ex.years.present.length + '년)</caption>'
      + '<thead><tr><th scope="col">지수</th><th scope="col">과거</th><th scope="col">현재</th><th scope="col">변화</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table>'
      + '<p class="table-note"><b>주의 — 위쪽 미션들과 비교 기간이 다릅니다.</b> 미션의 5년 비교(' + PERIOD_NOW + ')와 달리 '
      + '이 표의 현재는 <b>' + ex.periods.present + ' ' + ex.years.present.length + '년</b>입니다. 최고·최저기온은 8지점 별도 수집분에만 있어서예요. '
      + '기간이 다르면 숫자를 나란히 놓고 비교할 수 없습니다 — 그것도 자료를 다루는 규칙입니다.</p></div>';
  }

  function kmaRefHTML() {
    var r = KMA_REF[state.metric]; if (!r) return '';
    var ex = extremesOf();
    function can(code) {
      if (code === 'yes') return { cls: 'is-ours', txt: '<b>계산함</b>' };
      if (code.indexOf('ext:') === 0) {
        var k = code.slice(4), v = ex && ex.idx[k];
        return (v && v.present != null)
          ? { cls: 'is-ours', txt: '<b>계산함</b><small>' + fmtDays(v.past) + ' → ' + fmtDays(v.present) + '</small>' }
          : { cls: '', txt: '이 지점 자료 없음' };
      }
      return { cls: '', txt: '계산 불가' };
    }
    return '<details class="kma-ref"><summary><span aria-hidden="true">📋</span> 기상청은 어떤 기준을 쓸까? <small>공식 기준표 · 폭염·열대야 실측</small></summary>'
      + '<div class="kma-body"><p class="kma-title">' + r.title + '</p>'
      + '<table class="kma-table"><caption class="sr-only">' + r.title + ' 및 이 화면에서 계산 가능 여부</caption>'
      + '<thead><tr><th scope="col">기준</th><th scope="col">정의</th><th scope="col">이 화면에서</th></tr></thead><tbody>'
      + r.rows.map(function (x) {
        var c = can(x[2]);
        return '<tr class="' + c.cls + '"><th scope="row">' + x[0] + '</th><td>' + x[1] + '</td>'
          + '<td class="kma-can">' + c.txt + '</td></tr>';
      }).join('') + '</tbody></table>'
      + '<p class="kma-note">' + r.note + '</p>'
      + (state.metric === 'temp' ? extremeTableHTML() : '')
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
      '‘' + mc.verb + ' ' + thr + mc.unit + '’ 기준선을 지금 위치에서 <b>위아래로 3칸씩</b> 옮겨 보세요. 기준 이상 일수가 <b>가장 크게 바뀌는 구간</b>은 어디인가요?',
      t ? '<b>' + t.name + '(' + t.date + ')</b> 날짜에 세로선이 서 있습니다. 그 지점에서 두 선의 <b>높이 차이</b>는 얼마나 되나요?' : null
    ].filter(Boolean);
    var why = [
      dir ? '이 지역에서 기준 이상 일수가 <b>' + dir + '습니다.</b> <b>왜</b> 그럴까요? 떠오르는 이유를 <b>두 가지</b> 적어 보세요.' : null,
      L ? '가장 더운 날은 하지보다 <b>약 ' + L.present.hotLag + '일 뒤</b>입니다. 해가 가장 높은 날과 가장 더운 날이 <b>다른 이유</b>는 무엇일까요?' : null,
      '지역을 <b>바다에 가까운 곳</b>(제주·부산·강릉)과 <b>내륙</b>(충북·경북)으로 바꿔 보세요. 차이가 있다면 <b>무엇 때문</b>일까요?'
    ].filter(Boolean);
    var test = [
      '이 결과는 <b>' + city + ' 관측소 1곳</b>의 기록입니다. 이것만으로 <b>전국</b>을 말할 수 있나요? ‘<b>지도</b>’ 보기로 <b>16지점</b>도 같은 방향인지 확인해 보세요.',
      '비교 기간을 <b>다른 5년</b>으로 바꿔도 같은 결론이 나오나요? 아래 <b>비교 기간</b> 슬라이더를 옮겨 확인해 보세요.',
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
    out += '<line x1="' + L + '" y1="' + py.toFixed(1) + '" x2="' + (WW - R) + '" y2="' + py.toFixed(1) + '" stroke="var(--muted)" stroke-width="1.8" stroke-dasharray="6 4"/>'
      + '<text class="wa-lab" x="' + (L + 4) + '" y="' + (py - 6).toFixed(1) + '">과거 ' + PERIOD_PAST + ' · ' + fmtDays(past) + '</text>';

    out += '<polyline fill="none" stroke="var(--coral)" stroke-width="2.4" stroke-linejoin="round" points="'
      + vals.map(function (v, i) { return xf(i).toFixed(1) + ',' + yf(v).toFixed(1); }).join(' ') + '"/>';

    var sel = winIndex();
    vals.forEach(function (v, i) {
      var on = i === sel;
      out += '<circle cx="' + xf(i).toFixed(1) + '" cy="' + yf(v).toFixed(1) + '" r="' + (on ? 7 : 3) + '" fill="' + (on ? 'var(--sun)' : 'var(--coral)') + '" stroke="' + (on ? 'var(--ink-on-accent)' : 'none') + '" stroke-width="' + (on ? 2 : 0) + '"/>';
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

  /* R4-P1-5: 예전에는 input 이벤트마다 패널 전체를 innerHTML로 다시 만들었다.
     그러면 <input type="range"> 노드 자체가 파괴되어 브라우저의 암묵적 포인터 캡처가
     끊기고, 손으로 끌면 한 칸에서 드래그가 멈춘다(값은 바뀌면서 손을 뿌리치는 형태).
     대본이 "슬라이더를 1996–2000 → 2021–2025로 훑는다"를 시연 동작으로 지정하고
     Q&A 답변도 이 조작에 걸려 있으므로, 골격은 한 번만 만들고 값만 갱신한다. */
  function windowShell() {
    if (state.metric !== 'temp') {
      return '<div class="win-panel"><p class="win-off">비교 기간 바꾸기는 <b>기온</b>에서만 제공합니다. '
        + '습도·강수는 연도별 창 통계를 계산해 두지 않았습니다 — 없는 값을 추정해 보여 주지 않기 위해서입니다.</p></div>';
    }
    var W = winsOf(); if (!W) return '';
    return '<div class="win-panel">'
      + '<div class="picker-block"><span class="picker-label">비교 기간 <small>(‘현재’로 쓸 5년을 직접 골라 보세요)</small></span></div>'
      + '<div class="win-row">'
      + '<button type="button" class="step-btn" id="winPrev" aria-label="이전 5년 창">−</button>'
      + '<input type="range" id="winRange" min="0" max="' + (W.list.length - 1) + '" step="1" value="' + winIndex() + '" aria-label="비교 기간 창 선택" />'
      + '<button type="button" class="step-btn" id="winNext" aria-label="다음 5년 창">+</button>'
      + '<output class="win-out" id="winOut"></output>'
      + '</div>'
      + '<p class="win-read" id="winRead"></p>'
      + '<div id="winChart"></div>'
      + '<p class="win-verdict" id="winVerdict"></p>'
      + '<p class="win-note" id="winNote"></p>'
      + '</div>';
  }

  /* 값만 갈아 끼운다 — #winRange 노드는 절대 교체하지 않는다 */
  function windowSync() {
    var W = winsOf(); if (!W || state.metric !== 'temp' || !$('winRange')) return;
    var i = winIndex(), w = W.list[i], thr = state.thr, mc = metricOf();
    var past = exceed('past', thr), now = winDays(w, thr);
    if (past === null || now === null) return;
    var d = now - past;
    var vals = W.list.map(function (x) { return winDays(x, thr); });
    var above = vals.filter(function (v) { return v > past; }).length;
    var below = vals.filter(function (v) { return v < past; }).length;
    var same = vals.length - above - below;
    var vlo = Math.min.apply(null, vals), vhi = Math.max.apply(null, vals);
    /* R4-P2: 예전에는 엄격 부등호 하나로 above만 세어, 동률이 하나라도 있으면
       "결론이 갈린다"로 잘못 판정했다(서울 26℃: 위 25 · 동률 1 · 아래 0).
       '과거보다 적은 창이 하나도 없다'가 실제로 말할 수 있는 사실이다. */
    var verdict = below === 0
      ? '<b>' + vals.length + '개 창 가운데 과거보다 적은 창은 <span class="hot">하나도 없습니다</span></b>'
        + (same ? '(같은 창 ' + same + '개)' : '') + ' — <b class="hot">어느 5년을 골라도 방향은 같습니다.</b>'
      : above === 0
        ? '<b>' + vals.length + '개 창 가운데 과거보다 많은 창이 하나도 없습니다</b>' + (same ? '(같은 창 ' + same + '개)' : '') + ' — 어느 5년을 골라도 방향은 같습니다.'
        : '많은 창 <b>' + above + '개</b> · 적은 창 <b>' + below + '개</b>' + (same ? ' · 같은 창 ' + same + '개' : '')
          + ' / 모두 ' + vals.length + '개 — <b>고른 5년에 따라 결론이 갈립니다.</b> 이 기준에서는 단정하면 안 됩니다.';

    $('winRange').max = W.list.length - 1;
    if (Number($('winRange').value) !== i) $('winRange').value = i;
    $('winRange').setAttribute('aria-valuetext', w.y0 + '년부터 ' + w.y1 + '년까지 5년, 연평균 ' + fmtDays(now));
    $('winOut').textContent = w.y0 + '–' + w.y1;
    $('winRead').innerHTML = PERIOD_PAST + ' <b>' + fmtDays(past) + '</b> <i>→</i> ' + w.y0 + '–' + w.y1
      + ' <b class="hot">' + fmtDays(now) + '</b> <span class="win-delta">' + (d > 0 ? '+' : '') + fmtDays(d) + '</span>';
    $('winChart').innerHTML = windowSVG();
    $('winVerdict').innerHTML = verdict + '<br><small>창마다 값은 ' + fmtDays(vlo) + '~' + fmtDays(vhi) + ' 사이에서 흔들립니다. '
      + '<b>숫자는 흔들리고 방향은 남는 것</b> — 이 차이를 구별하는 게 기후를 읽는 방법입니다. '
      + '30년으로 넓히면(' + W.long.y0 + '–' + W.long.y1 + ') ' + fmtDays(W.long.days[String(thr)]) + '입니다.</small>';
    $('winNote').innerHTML = '기온 ' + thr + mc.unit + ' 기준 · ' + state.city + '(' + cityOf().station + ' 관측소) · 5년 창을 한 해씩 옮겨 가며 ' + W.list.length + '개 창을 계산했습니다. '
      + '위쪽 연간 곡선 그래프는 창을 바꿔도 그대로입니다 — 그 곡선은 두 시기(과거·현재)만 미리 계산해 두었기 때문입니다.';
  }

  var winBuiltFor = null;
  function updateWindow() {
    var el = $('winMount'); if (!el) return;
    var sig = state.metric + '|' + state.city;
    if (winBuiltFor !== sig || !$('winRange')) {
      el.innerHTML = windowShell();
      winBuiltFor = sig;
      var r = $('winRange');
      if (r) {
        r.addEventListener('input', function () { state.winI = Number(r.value); save(); windowSync(); });
        function step(v) {
          var W = winsOf(); if (!W) return;
          state.winI = Math.max(0, Math.min(W.list.length - 1, v)); save(); windowSync();
          if (r.focus) r.focus();
        }
        if ($('winPrev')) $('winPrev').addEventListener('click', function () { step(winIndex() - 1); });
        if ($('winNext')) $('winNext').addEventListener('click', function () { step(winIndex() + 1); });
      }
    }
    windowSync();
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
    if (!maxAbs) return 'var(--muted3)';
    var t = Math.min(1, Math.abs(d) / maxAbs);
    var a = (0.28 + t * 0.62).toFixed(2);
    /* 늘었다=주황(현재선 색), 줄었다=하늘(과거 대비 감소). 색만으로 읽히지 않도록
       기호(▲▼)와 숫자를 함께 붙인다 — 색각 이상 대응(WCAG 1.4.1). */
    return d > 0 ? 'rgba(var(--coral-rgb),' + a + ')' : d < 0 ? 'rgba(var(--sky-rgb),' + a + ')' : 'rgba(var(--line-rgb),.34)';
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
        }).join('') + 'Z" fill="rgba(var(--shade-rgb),.62)" stroke="rgba(var(--line-rgb),.20)" stroke-width=".8"/>';
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
        + '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + rad.toFixed(1) + '" fill="' + mapColor(r.d, maxAbs) + '" stroke="' + (on ? 'var(--sun)' : 'rgba(var(--shade-rgb),.75)') + '" stroke-width="' + (on ? 3 : 1.4) + '"/>'
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
        state.city = g.dataset.city; state.touched = true; markVisited('visited', g.dataset.city); save();
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
    /* 계절 지연 미션의 조작 수단은 SVG 가로 드래그뿐이다. 표·지도로 두면 조작이 사라진다. */
    if (mode !== 'chart' && isLagMode()) mode = 'chart';
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
    var legend = '<div class="chart-legend"><span><i class="lg lg-past"></i> 과거 ' + PERIOD_PAST + '</span><span><i class="lg lg-now"></i> 현재 ' + PERIOD_NOW + '</span><span><i class="lg lg-term"></i> 절기(고정)</span><span><i class="lg lg-thr"></i> 내가 정한 ‘<b id="legendVerb">' + mc.verb + '</b>’</span></div>';
    var pickers = '';
    if (opts.cityChips) pickers += '<div class="picker-block"><span class="picker-label">지역 <small>(지역마다 대표 관측소 1곳)</small></span><div class="chips" id="cityChips" role="tablist" aria-label="관측 지역"></div></div>';
    if (opts.termStrip) pickers += '<div class="picker-block"><span class="picker-label">절기 <small>(태양 위치로 정한 24개 천문 날짜)</small></span><div class="terms" id="termStrip" aria-label="절기 선택"></div></div>';
    if (opts.metricTabs) pickers += '<div class="picker-block"><span class="picker-label">지표</span><div class="metric-tabs" id="metricTabs" role="tablist" aria-label="지표 선택"></div></div>';
    return (pickers ? '<div class="picker">' + pickers + '</div>' : '')
      + '<div class="chart-card">'
      /* R4-P2: 한 조작에 라이브 영역 4~5개가 동시에 갱신돼 같은 값을 여러 번 낭독했다.
         이 한 곳만 라이브로 두고(조작 결과의 요약), 나머지는 슬라이더의 aria-valuetext가 맡는다. */
      + '<p class="live-nums" id="liveNums" aria-live="polite" aria-atomic="true"></p>'
      + (opts.viewTools === false ? '' : '<div class="view-tools">'
      + '<div class="seg" role="group" aria-label="보기 방식">'
      + '<button type="button" class="seg-btn" id="viewChart" aria-pressed="true">그래프</button>'
      + (hasMap() && !opts.lagMode ? '<button type="button" class="seg-btn" id="viewMap" aria-pressed="false">지도 <small>16지점</small></button>' : '')
      + '<button type="button" class="seg-btn" id="viewTable" aria-pressed="false">표</button>'
      + '</div>'
      + '<label class="zoom-toggle"><input type="checkbox" id="zoomChk" /> 기준 구간 확대 <small>(조금씩 조절할 때)</small></label>'
      + '</div>')
      + '<div id="mapMount" hidden></div>'
      + '<div id="tableMount" hidden></div>'
      + '<svg id="heroSvg" viewBox="0 0 720 340" role="img" aria-label="관측 곡선"></svg>'
      + (opts.lagMode ? lagControls() : '')
      + '<div class="range-row"' + (opts.lagMode ? ' hidden' : '') + '><span id="thrLabel">‘' + mc.verb + '’ 기준<b class="basis">(' + mc.basis + ')</b></span>'
      + '<button class="step-btn" id="thrDown" type="button" aria-label="기준을 1 낮추기">−</button>'
      + '<input id="thrRange" type="range" aria-label="' + mc.verb + ' 기준(' + mc.basis + ')" />'
      + '<button class="step-btn" id="thrUp" type="button" aria-label="기준을 1 높이기">+</button>'
      + '<output id="thrOut"></output></div>'
      + '<div class="presets" id="presets" aria-label="자주 쓰는 기준"' + (opts.lagMode ? ' hidden' : '') + '></div>'
      + legend
      + '</div>'
      + (opts.includeReadouts === false ? '' : '<div class="readouts" id="readouts"></div>')
      + '<p class="heat-note" id="heatNote" role="note" hidden></p>'
      + '<p class="integrity' + (opts.compactIntegrity ? ' is-compact' : '') + '"><span aria-hidden="true">◈</span> 기상청 ASOS 실측 · 과거 <b>' + y.past.length + '년</b>(' + PERIOD_PAST + ') vs 현재 <b>' + y.present.length + '년</b>(' + PERIOD_NOW + ') — <b>관측 신호</b>이고 30년 <b>기후평년</b>이 아닙니다 · 절기는 태양 위치로 정한 <b>천문 날짜</b>라 해마다 거의 움직이지 않습니다</p>'
      + (opts.includeMethod === false ? '' : '<div id="methodMount"></div>');
  }

  /* 계절 지연 모드 전용 조작 패널 — 여름/겨울 전환 + 날짜 스테퍼 + 확인 버튼 */
  function lagControls() {
    return '<div class="lag-controls">'
      + '<div class="seg" role="group" aria-label="계절 선택">'
      + '<button type="button" class="seg-btn" id="lagSummer" aria-pressed="true">여름 · 하지 기준</button>'
      + '<button type="button" class="seg-btn" id="lagWinter" aria-pressed="false">겨울 · 동지 기준</button>'
      + '</div>'
      + '<div class="lag-pick"><button class="step-btn" id="markPrev" type="button" aria-label="날짜 하루 앞당기기">−</button>'
      + '<output id="markOut">그래프를 좌우로 끌어 날짜를 찍으세요</output>'
      + '<button class="step-btn" id="markNext" type="button" aria-label="날짜 하루 늦추기">+</button>'
      + '<button class="primary-btn small-btn" id="lagReveal">실제와 비교하기</button></div>'
      /* R4-P2: 임계값에는 슬라이더·스테퍼·프리셋 3종이 있는데 날짜에는 스테퍼뿐이었다.
         특히 겨울은 동지(356)에서 정답(1~2일)까지 스테퍼로만 가야 해 사실상 못 간다. */
      + '<div class="range-row"><span>날짜 고르기<b class="basis">(그래프를 끌어도 됩니다)</b></span>'
      + '<input id="markRange" type="range" min="1" max="365" step="1" aria-label="가장 극값일 것 같은 날짜" />'
      + '</div>'
      + '<div class="presets" id="markPresets" aria-label="빠른 이동"></div>'
      + '</div>';
  }
  function bindLagControls() {
    var svg = $('heroSvg'); if (!svg) return;
    function setMark(d, silent) {
      var v = ((Math.round(d) - 1) % 365 + 365) % 365 + 1;   /* 365 → 1 로 이어지게 (연말·연초) */
      if (v === state.markDoy) { if (!silent) onTouched(); return; }
      state.markDoy = v; state.touched = true; state.moved = true; state.lagRevealed = false;
      save(); drawHero();
      /* 봉인 중에는 renderLiveNums가 조기 반환해 #markOut이 갱신되지 않았다 —
         스테퍼·방향키로 날짜를 옮겨도 "그래프를 좌우로 끌어 날짜를 찍으세요"가 그대로 남았다. */
      var mo = $('markOut');
      if (mo && state.markDoy) mo.textContent = doyStr(state.markDoy);
      syncMarkPresets();
      if (!silent) onTouched();
    }
    setMarkFromPreset = setMark;
    var dragging = false;
    function doyAt(clientX) {
      var r = svg.getBoundingClientRect(); if (!r.width) return null;
      var vx = (clientX - r.left) / r.width * W;
      var i = (vx - L) / (W - L - R) * 364;
      return Math.round(i) + 1;
    }
    function endDrag() { dragging = false; svg.classList.remove('is-dragging'); }
    svg.addEventListener('pointerdown', function (e) {
      if (!isLagMode()) return;
      dragging = true; svg.classList.add('is-dragging');
      try { svg.setPointerCapture(e.pointerId); } catch (x) {}
      var d = doyAt(e.clientX); if (d != null) setMark(d);
    });
    svg.addEventListener('pointermove', function (e) {
      if (!dragging || !isLagMode()) return;
      if (e.cancelable) e.preventDefault();
      var d = doyAt(e.clientX); if (d != null) setMark(d);
    });
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('lostpointercapture', endDrag);
    /* R4-P2: 클램프에 랩어라운드가 없어, 겨울에는 동지(356)에서 ＋를 눌러도 365에서 멈추고
       정답 부근(1~2일)까지 가려면 −를 354번 눌러야 했다 — 키보드·스테퍼 사용자만 겪는 벽. */
    if ($('markPrev')) $('markPrev').addEventListener('click', function () { setMark((state.markDoy || lagInfo().solDoy) - 1); });
    if ($('markNext')) $('markNext').addEventListener('click', function () { setMark((state.markDoy || lagInfo().solDoy) + 1); });
    var mr = $('markRange');
    if (mr) {
      mr.value = state.markDoy || lagInfo().solDoy;
      mr.addEventListener('input', function () { setMark(Number(mr.value)); });
    }
    renderMarkPresets();
    if ($('lagReveal')) $('lagReveal').addEventListener('click', function () {
      if (!state.markDoy) { var o = $('markOut'); o.textContent = '먼저 그래프에서 날짜를 찍어 주세요.'; flash(o); return; }
      state.lagRevealed = true; save(); drawHero(); onTouched();
    });
    function season(kind) {
      /* 계절을 바꾸면 묻는 질문이 달라진다. 여름 예측을 봉인한 채 겨울로 넘어가면
         판정문은 겨울 값을 쓰면서 예측은 여름 것을 참조하게 되므로 봉인도 푼다. */
      state.lagSeason = kind; state.markDoy = null; state.lagRevealed = false;
      delete state.predicts['lag']; delete state.selfChecks['lag'];
      state.ti = kind === 'winter' ? 23 : 11;
      var mm = MISSIONS[state.mi];
      state.missionStep = 'predict'; save();
      /* 질문이 달라졌는데 기존 그래프를 그대로 보여 주면 다시 ‘자료 → 예측’이 된다.
         계절 전환 즉시 무자료 예측 화면으로 이동한다. */
      renderMissionFlow();
    }
    if ($('lagSummer')) $('lagSummer').addEventListener('click', function () { season('summer'); });
    if ($('lagWinter')) $('lagWinter').addEventListener('click', function () { season('winter'); });
    if ($('lagSummer')) $('lagSummer').classList.toggle('is-on', state.lagSeason !== 'winter');
    if ($('lagWinter')) $('lagWinter').classList.toggle('is-on', state.lagSeason === 'winter');
  }

  /* 날짜 프리셋 — 절기 이름으로 이동해 '절기 대비 며칠'을 감으로 잡게 한다 */
  function renderMarkPresets() {
    var el = $('markPresets'); if (!el) return;
    var isS = state.lagSeason !== 'winter';
    var names = isS ? ['하지', '소서', '대서', '입추'] : ['동지', '소한', '대한', '입춘'];
    el.innerHTML = names.map(function (n) {
      var i = -1;
      D.terms.forEach(function (t, k) { if (t.name === n) i = k; });
      if (i < 0) return '';
      var t = D.terms[i];
      return '<button class="preset" type="button" data-markdoy="' + t.doy + '"><b>' + t.name + '</b><small>' + t.date + '</small></button>';
    }).join('');
    el.querySelectorAll('[data-markdoy]').forEach(function (b) {
      b.addEventListener('click', function () { setMarkFromPreset(Number(b.dataset.markdoy)); });
    });
    syncMarkPresets();
  }
  function syncMarkPresets() {
    var el = $('markPresets'); if (!el) return;
    el.querySelectorAll('[data-markdoy]').forEach(function (b) {
      b.classList.toggle('is-on', Number(b.dataset.markdoy) === state.markDoy);
    });
    var mr = $('markRange');
    if (mr && state.markDoy && Number(mr.value) !== state.markDoy) mr.value = state.markDoy;
  }
  var setMarkFromPreset = function () {};

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
      btn.addEventListener('click', function () { state.city = btn.dataset.city; state.touched = true; markVisited('visited', btn.dataset.city); save(); refreshChipsOn(el, 'city', btn.dataset.city); drawHero(); onTouched(); });
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
        renderPresets(); syncMetricLabels(); drawHero(); onTouched();
      });
    });
  }
  /* heroShell이 라벨을 한 번 굽고 끝나므로, 지표를 바꾸면 여기서 다시 칠한다.
     aria-label까지 함께 고쳐야 스크린리더가 '덥다 기준'으로 계속 읽지 않는다. */
  function syncMetricLabels() {
    var mc = metricOf();
    var lab = $('thrLabel');
    if (lab) lab.innerHTML = '‘' + mc.verb + '’ 기준<b class="basis">(' + mc.basis + ')</b>';
    var lv = $('legendVerb'); if (lv) lv.textContent = mc.verb;
    var ri = $('thrRange'); if (ri) ri.setAttribute('aria-label', mc.verb + ' 기준(' + mc.basis + ')');
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
    markVisited('usedThr', nv);
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
    /* 히트테스트를 통과했을 때만 브라우저 제스처를 뺏는다 (R4-P2 · touch-action: pan-y) */
    function endDrag() { dragging = false; svg.classList.remove('is-dragging'); }
    svg.addEventListener('pointerdown', function (e) {
      if (Math.abs(e.clientY - yOfThr()) > 22) return;
      dragging = true; svg.classList.add('is-dragging');
      try { svg.setPointerCapture(e.pointerId); } catch (x) {}
      var v = valueAt(e.clientY); if (v != null) setThr(v);
    });
    svg.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      if (e.cancelable) e.preventDefault();
      var v = valueAt(e.clientY); if (v != null) setThr(v);
    });
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('lostpointercapture', endDrag);
    $('thrRange').addEventListener('input', function () { setThr(Number($('thrRange').value)); });
    $('thrDown').addEventListener('click', function () { setThr(state.thr - 1); });
    $('thrUp').addEventListener('click', function () { setThr(state.thr + 1); });
    renderPresets();
  }
  var onTouched = function () {};

  /* ---------- 페이즈 렌더 ---------- */
  var demoTimer = null;
  function stopTimers() {
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
    state.phase = 'intro'; state.introStep = 'landing'; save();
    setStage('<section class="card intro-card">'
      + '<p class="intro-badge">기상청 ASOS(전국 종관기상관측) 실측 · 1969–2026 · 16지역 × 24절기</p>'
      + '<h1 class="intro-h">24절기의 약속은<br>아직 유효할까?</h1>'
      + '<div class="intro-actions"><button class="primary-btn" id="introStart">시작하기 →</button>'
      + '<button class="ghost-btn" id="introTerms">🌍 24절기가 뭐예요?</button>'
      + '<button class="ghost-btn" id="introLab">🔬 열관성 실험실</button>'
      + '<button class="ghost-btn" id="introGuide"><span aria-hidden="true">✦</span> 가이드로 먼저 해볼게요</button></div>'
      + '<p class="intro-lead intro-lead-compact">절기의 약속을 <b>실제 관측 자료</b>로 직접 검증하고, 내 근거로 결론을 만드는 기후 학습 도구입니다.</p>'
      + '<p class="intro-teacher"><a href="./교사_학습지.html" target="_blank" rel="noopener">📄 교사용 학습지 — 수업 흐름·활동지·오개념 표·평가 루브릭 →</a></p>'
      + '</section>');
    $('introStart').addEventListener('click', renderIntroMethod);
    $('introTerms').addEventListener('click', renderTerms);
    $('introLab').addEventListener('click', renderLab);
    $('introGuide').addEventListener('click', renderTutorial);
  }

  function renderIntroMethod() {
    state.phase = 'intro'; state.introStep = 'method'; save();
    setStage('<section class="card intro-card intro-method-card">'
      + '<p class="intro-badge">시작 전 20초 · 학습 방법</p>'
      + '<h1 class="stage-h">정답을 읽지 않고, 내 생각을 검증합니다.</h1>'
      + '<div class="intro-preview intro-seal" role="img" aria-label="1단계 자료 없이 예측, 2단계 관측 자료 조작, 3단계 내 CERL 작성">'
      + '<div class="seal-step is-first"><small>1 · 먼저</small><b>내 생각 예측</b><span>그래프·표 없음</span></div>'
      + '<i aria-hidden="true">→</i><div class="seal-step"><small>2 · 다음</small><b>관측 자료 조작</b><span>기준·지역·기간</span></div>'
      + '<i aria-hidden="true">→</i><div class="seal-step"><small>3 · 마지막</small><b>내 CERL 작성</b><span>주장·근거·추론·한계</span></div></div>'
      + '<p class="intro-lead">“처서가 지나면 더위가 그친다” 같은 <b>절기의 약속</b>을, 내 지역의 <b>실제 기상 관측</b>으로 직접 검증하는 기후 학습 도구예요. 기준선을 손으로 정해 과거와 현재를 비교하며 <b>절기·날씨·기후</b>를 구분하는 힘을 기릅니다.</p>'
      /* 5차 F01(P0): ①이 '절기와 기후는 어떻게 다를까'였는데, 이 화면 바로 다음이
         '처서가 지났는데도 덥다'의 사전 문항이고 그 정답이 절기와 기후를 구분한 보기다.
         목표를 숨기지 않되 결론을 앞질러 말하지 않는 발문으로 바꾼다. */
      + '<details class="intro-goal-details"><summary>이번 학습에서 기를 힘 5가지</summary><div class="intro-goals"><span>① 절기는 무엇으로 정해지는 날짜일까</span><span>② 이 자료는 어디까지 말할 수 있을까</span><span>③ ‘덥다’는 몇 도부터일까</span><span>④ 근거만큼만 결론 쓰기</span><span>⑤ 물리 법칙으로 계절을 다시 만들어 보기</span></div></details>'
      /* 5차 F08: '핵심 2~3분 / 5미션 15~20분'은 측정한 값이 아니라 설계 목표였는데 완료 시간처럼
         읽혔다. 미션 하나가 8~10화면이고 필수 서술이 2~4칸이라 화면당 15초를 요구하는 수치다.
         설계 시간의 합(69~76분)은 그대로 밝히고, 실제 소요 시간은 재지 않았다고 적는다. */
      + '<p class="intro-foot">미션 하나는 <b>예측 → 조작 → 내 CERL</b> 세 단계예요 · ' + MISSIONS.length + '개 미션 + 심화·자유탐구까지 <b>설계 시간 69~76분</b>(두 차시) · 실제로 걸리는 시간은 <b>아직 측정하지 않았어요</b> — 학생 파일럿으로 재는 중입니다 · 설치·로그인 없이, 폰에서도 됩니다</p>'
      + '<div class="step-actions"><button class="ghost-btn" id="introBack">← 처음 화면</button><button class="primary-btn" id="introMission">첫 예측 시작 →</button></div>'
      + '</section>');
    $('introBack').addEventListener('click', renderIntro);
    $('introMission').addEventListener('click', function () { startMission(0); });
  }

  /* ---------- 24절기 입문: 공전 궤도 시각화 ----------
     학생 대부분은 24절기를 모른다. 텍스트 설명 대신 '지구가 어디에 있을 때가 그 절기인가'를
     궤도 위에서 직접 보게 한다. 계절의 원인이 거리가 아니라 자전축 기울기라는 것도 함께 교정한다. */
  var SEASON_COLOR = { spring: 'var(--green)', summer: 'var(--coral)', autumn: 'var(--sun)', winter: 'var(--sky)' };
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
      + '<div class="micro-progress" aria-label="24절기 입문 진행"><b id="termStepLabel"></b><span><i id="termStepBar"></i></span></div>'
      + '<section class="micro-panel" data-term-panel="0"><p class="sub">조상들은 태양의 위치를 기준으로 1년을 <b>24칸</b>으로 나눴어요. 궤도에서 절기를 하나 골라 보세요.</p>'
      + '<div class="orbit-wrap"><svg id="orbitSvg" viewBox="0 0 640 460" role="img" aria-label="지구 공전 궤도 위의 24절기 위치와 자전축 기울기"></svg></div></section>'
      + '<section class="micro-panel" data-term-panel="1"><p class="sub">방금 고른 절기의 날짜·이름·천문 기준을 읽어 보세요.</p>'
      + '<div id="termCard" class="term-card" aria-live="polite"></div></section>'
      + '<section class="micro-panel why-box" data-term-panel="2">'
      + '<h2 class="why-h">왜 조상들은 24절기를 만들었을까?</h2>'
      + '<p class="why-p">옛날 달력은 <b>달의 모양</b>을 기준으로 삼았어요(음력). 그런데 달 12번이 도는 데는 <b>354일</b>, 지구가 태양을 한 바퀴 도는 데는 <b>365.24일</b>이 걸립니다.</p>'
      + '<div id="driftViz"></div>'
      + '<p class="why-p">해마다 <b>약 11일</b>씩 어긋나서, <b>3년이면 한 달</b>이 밀립니다. 달력만 보고 씨를 뿌리면 해마다 시기가 달라져 농사를 망치죠.</p>'
      + '<p class="why-p">그래서 <b>태양의 위치</b>로 1년을 24칸으로 나눈 <b>24절기</b>를 함께 썼습니다. 절기는 <b>날씨 예보가 아니라 농사 일정표</b>였어요 — “곡우에 못자리”, “망종에 모내기”처럼요.</p></section>'
      + '<section class="micro-panel why-box" data-term-panel="3"><h2 class="why-h">여름은 태양에 가까워서 더울까?</h2>'
      + '<p class="why-p">실제로 지구는 <b>가장 추운 1월 초에 태양과 가장 가깝고(0.983 AU)</b>, 7월 초에 가장 멉니다(1.017 AU). 거리 차이는 약 <b>3.4%</b>입니다.</p>'
      + '<p class="why-p">계절을 만드는 핵심은 거리가 아니라 <b>자전축이 23.4° 기울어져 있다는 사실</b>입니다. 축은 늘 같은 방향을 가리켜 북반구가 태양 쪽으로 기울 때 여름, 반대일 때 겨울이 됩니다.</p></section>'
      + '<section class="micro-panel why-box" data-term-panel="4"><h2 class="why-h">그럼 절기와 기후는 무슨 관계일까?</h2>'
      + '<p class="why-p">절기 날짜는 <b>태양의 위치</b>로 정해져 해마다 거의 그대로입니다. 하지만 그 무렵의 <b>실제 날씨</b>는 해마다, 지역마다 다르고 <b>수십 년에 걸쳐 변합니다.</b></p>'
      + '<p class="why-p">이 앱은 <b>움직이지 않는 절기</b>와 <b>움직이는 기후</b>를 나란히 놓고 비교합니다.</p></section>'
      + '<div class="orbit-actions"><button class="ghost-btn" id="termPrev">← 이전</button>'
      + '<button class="primary-btn" id="termNext">다음 →</button><button class="primary-btn" id="orbitStart" hidden>이제 검증하러 가기 →</button>'
      + '<button class="ghost-btn" id="orbitBack">소개로</button></div>'
      + '</section>');
    drawOrbit();
    drawDrift();
    function syncTermStep() {
      var labels = ['1/5 · 궤도에서 고르기', '2/5 · 절기 읽기', '3/5 · 절기가 필요했던 이유', '4/5 · 계절 오개념 확인', '5/5 · 기후와 연결'];
      stage.querySelectorAll('[data-term-panel]').forEach(function (p) { p.hidden = Number(p.dataset.termPanel) !== state.termIntroStep; });
      $('termStepLabel').textContent = labels[state.termIntroStep];
      $('termStepBar').style.width = ((state.termIntroStep + 1) / labels.length * 100) + '%';
      $('termPrev').hidden = state.termIntroStep === 0;
      $('termNext').hidden = state.termIntroStep === labels.length - 1;
      $('orbitStart').hidden = state.termIntroStep !== labels.length - 1;
      save();
    }
    $('termPrev').addEventListener('click', function () { state.termIntroStep = Math.max(0, state.termIntroStep - 1); syncTermStep(); });
    $('termNext').addEventListener('click', function () { state.termIntroStep = Math.min(4, state.termIntroStep + 1); syncTermStep(); });
    $('orbitStart').addEventListener('click', function () { startMission(0); });
    $('orbitBack').addEventListener('click', renderIntro);
    syncTermStep();
  }

  function drawOrbit() {
    var svg = $('orbitSvg'); if (!svg) return;
    /* R4-P1-12: termLongitude()는 <b>태양의</b> 황경이다(하지 90°·동지 270°).
       예전에는 이 값을 그대로 <b>지구의</b> 궤도각으로 썼다 — 지구의 일심경도는
       태양 황경 +180°이므로 지구가 정확히 반대편에 그려졌고, 그 결과
       하지에 북극이 태양 반대쪽, 동지에 태양 쪽을 향했다. 같은 패널 본문이
       "여름에 북반구가 태양 쪽으로 기운다"고 쓰는데 그림이 정반대였다.
       +180°를 더하면 하지에 북극이 태양 쪽(왼쪽 태양 방향), 동지에 반대쪽이 된다.
       또 태양을 타원 '중심'에 놓았으므로 근일점·원일점이 시각적으로 무의미했다 —
       거리 차이가 3.4%뿐이라는 사실에 맞춰 거의 원으로 그리고 캡션으로 밝힌다. */
    var CX = 320, CY = 214, RX = 250, RY = 196, sunR = 26;
    function pos(i) {
      var a = (termLongitude(i) + 180 - 90) * Math.PI / 180;
      return { x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a) };
    }
    var g = '';
    /* 계절 구간 호 — 색으로 사계절을 먼저 알아보게 */
    for (var k = 0; k < 24; k++) {
      var a = pos(k), b = pos((k + 1) % 24), c = D.terms[k];
      g += '<line x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1)
        + '" stroke="' + (SEASON_COLOR[c.season] || 'var(--muted3)') + '" stroke-width="5" stroke-linecap="round" opacity="0.5"/>';
    }
    /* 태양 */
    g += '<circle cx="' + CX + '" cy="' + CY + '" r="' + sunR + '" fill="url(#sunG)"/>'
      + '<text x="' + CX + '" y="' + (CY + 5) + '" text-anchor="middle" font-size="13" font-weight="800" fill="var(--ink-on-accent)">태양</text>';
    /* 절기 점 + 이름 */
    for (var i = 0; i < 24; i++) {
      var pt = pos(i), t = D.terms[i], on = i === orbitSel;
      var lr = 1.13, lx = CX + (pt.x - CX) * lr, ly = CY + (pt.y - CY) * lr;
      /* R4-P1-12: 크기를 SVG 속성에 굳혀 두면 CSS가 닿지 않아 375px에서 라벨 5.96px,
         표적 지름 7.05px가 된다(WCAG 2.5.8 미달). 클래스로 빼서 좁은 화면에서 키운다.
         지도(verify.css)가 이미 같은 패턴을 쓰고 있는데 궤도만 빠져 있었다.
         투명 히트 원을 따로 깔아 시각 크기는 유지하고 표적만 넓힌다. */
      g += '<g class="orb-term' + (on ? ' is-on' : '') + '" data-term="' + i + '" tabindex="0" role="button" aria-label="' + t.name + ' ' + t.date + '">'
        + '<circle class="orb-hit" cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="16" fill="transparent"/>'
        + '<circle class="orb-dot" cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="' + (on ? 11 : 6.5) + '" fill="' + (SEASON_COLOR[t.season] || 'var(--muted3)') + '"'
        + (on ? ' stroke="var(--ink-max)" stroke-width="2.5"' : ' stroke="var(--ink-on-accent)" stroke-width="1"') + '/>'
        + '<text class="orb-name" x="' + lx.toFixed(1) + '" y="' + (ly + 4).toFixed(1) + '" text-anchor="middle" font-size="' + (on ? 13 : 11)
        + '" font-weight="' + (on ? 800 : 500) + '" fill="' + (on ? 'var(--ink-max)' : 'var(--muted2)') + '">' + t.name + '</text></g>';
    }
    /* 선택 절기의 지구 — 자전축은 언제나 같은 방향을 가리킨다(계절의 진짜 원인) */
    var e = pos(orbitSel), tilt = 23.44 * Math.PI / 180, ax = Math.sin(tilt) * 26, ay = Math.cos(tilt) * 26;
    g += '<line x1="' + CX + '" y1="' + CY + '" x2="' + e.x.toFixed(1) + '" y2="' + e.y.toFixed(1) + '" stroke="var(--sun)" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.6"/>'
      + '<circle cx="' + e.x.toFixed(1) + '" cy="' + e.y.toFixed(1) + '" r="17" fill="var(--sky)" stroke="var(--on-sky)" stroke-width="1.5"/>'
      + '<path d="M' + (e.x - 17).toFixed(1) + ' ' + e.y.toFixed(1) + ' a17 17 0 0 1 34 0" fill="var(--green)" opacity="0.55"/>'
      + '<line x1="' + (e.x - ax).toFixed(1) + '" y1="' + (e.y + ay).toFixed(1) + '" x2="' + (e.x + ax).toFixed(1) + '" y2="' + (e.y - ay).toFixed(1)
      + '" stroke="var(--ink-max)" stroke-width="2.4"/>'
      + '<circle cx="' + (e.x + ax).toFixed(1) + '" cy="' + (e.y - ay).toFixed(1) + '" r="3.4" fill="var(--ink-max)"/>'
      + '<text x="' + (e.x + ax + 8).toFixed(1) + '" y="' + (e.y - ay - 4).toFixed(1) + '" font-size="11.5" fill="var(--ink2)">북극</text>';
    /* 근일점·원일점 — 거리 오개념 교정의 근거 */
    var per = pos(0.13), aph = pos(12.13);
    g += '<text x="' + per.x.toFixed(1) + '" y="' + (per.y + 30).toFixed(1) + '" text-anchor="middle" font-size="11.5" fill="var(--sky)">1월 초 · 가장 가까움(0.983 AU)</text>'
      + '<text x="' + aph.x.toFixed(1) + '" y="' + (aph.y - 22).toFixed(1) + '" text-anchor="middle" font-size="11.5" fill="var(--on-coral)">7월 초 · 가장 멂(1.017 AU)</text>'
      + '<text x="' + CX + '" y="452" text-anchor="middle" font-size="11" fill="var(--muted2)">비스듬히 내려다본 모식도입니다 — 거리 차이가 3.4%뿐이라 궤도를 거의 원으로 그렸습니다(실제 비율 아님).</text>';
    svg.innerHTML = '<defs><radialGradient id="sunG"><stop offset="0%" stop-color="var(--on-sun)"/><stop offset="100%" stop-color="var(--sun)"/></radialGradient></defs>'
      + '<ellipse cx="' + CX + '" cy="' + CY + '" rx="' + RX + '" ry="' + RY + '" fill="none" stroke="rgba(var(--line-rgb),.18)" stroke-width="1.5"/>' + g;
    svg.querySelectorAll('[data-term]').forEach(function (el) {
      /* drawOrbit()이 innerHTML을 통째로 갈아 포커스가 body로 날아가던 문제 — 선택 후 재포커스 */
      function pick() {
        orbitSel = Number(el.dataset.term); drawOrbit();
        var next = svg.querySelector('[data-term="' + orbitSel + '"]');
        if (next && next.focus) try { next.focus({ preventScroll: true }); } catch (e) { next.focus(); }
      }
      el.addEventListener('click', pick);
      el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
    });
    drawTermCard();
  }

  function drawTermCard() {
    var el = $('termCard'); if (!el) return;
    var t = D.terms[orbitSel];
    var dist = sunDistance(t.doy);
    el.innerHTML = '<div class="tc-head"><span class="tc-season" style="background:' + (SEASON_COLOR[t.season] || 'var(--muted3)') + '">' + (SEASON_KR[t.season] || '') + '</span>'
      + '<b class="tc-name">' + t.name + '</b><span class="tc-hanja">' + t.hanja + '</span><span class="tc-date">양력 ' + t.date + ' 무렵</span></div>'
      + '<p class="tc-gloss">' + t.hanja_gloss + ' → <b>' + t.meaning + '</b></p>'
      + '<p class="tc-desc">' + t.desc + '</p>'
      + '<div class="tc-facts">'
      + '<div><small>태양 황경</small><b>' + termLongitude(orbitSel) + '°</b>'
      + '<em>15° 간격 · 날씨와 무관한 천문 기준</em></div>'
      + '<div><small>지구–태양 거리</small><b>' + dist.toFixed(3) + ' AU</b><em>1월 초 0.983 / 7월 초 1.017</em></div>'
      + '</div>';
  }

  /* 음력과 태양년의 어긋남 — 24절기가 필요했던 이유를 막대로 */
  function drawDrift() {
    var el = $('driftViz'); if (!el) return;
    var W = 640, H = 118, L = 92, R = 18, maxD = 400;
    function w(d) { return (W - L - R) * d / maxD; }
    var rows = [['태양년 (지구 한 바퀴)', 365.24, 'var(--sun)'], ['음력 12달', 354.37, 'var(--sky)']];
    var g = '';
    rows.forEach(function (r, k) {
      var y = 14 + k * 34;
      g += '<text x="0" y="' + (y + 14) + '" font-size="11.5" fill="var(--muted2)">' + r[0] + '</text>'
        + '<rect x="' + L + '" y="' + y + '" width="' + w(r[1]).toFixed(1) + '" height="20" rx="5" fill="' + r[2] + '" opacity="0.8"/>'
        + '<text x="' + (L + w(r[1]) + 7).toFixed(1) + '" y="' + (y + 15) + '" font-size="11.5" font-weight="700" fill="var(--ink2)">' + r[1] + '일</text>';
    });
    var gap = 365.24 - 354.37;
    g += '<rect x="' + (L + w(354.37)).toFixed(1) + '" y="10" width="' + w(gap).toFixed(1) + '" height="58" fill="var(--coral)" opacity="0.25"/>'
      + '<text x="' + (L + w(354.37) + w(gap) / 2).toFixed(1) + '" y="90" text-anchor="middle" font-size="11.5" font-weight="800" fill="var(--coral)">해마다 ' + gap.toFixed(1) + '일 어긋남</text>'
      + '<text x="' + (L + w(354.37) + w(gap) / 2).toFixed(1) + '" y="107" text-anchor="middle" font-size="11" fill="var(--on-coral)">3년이면 약 한 달</text>';
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

  /* R4-P1-3: 미션5는 계절 토글로 묻는 대상이 바뀐다. 예측 문항·판정문·판독 카드는
     이미 계절로 분기하는데 화면에서 가장 큰 글자(제목)와 지시문·배경설명만 여름
     문구로 굳어 있었다 — 겨울을 고른 학습자는 "가장 더운 날은 왜 하지가 아닐까"를
     읽으면서 동지 그래프를 조작하게 된다. 세 문구를 모두 계절로 분기한다. */
  function isWinterLag(m) { return !!(m && m.lagMode) && state.lagSeason === 'winter'; }
  function headlineOf(m) {
    if (isWinterLag(m)) return '가장 추운 날은 왜 동지가 아닐까?';
    return HEADLINES[m.id] || m.title;
  }
  function taskOf(m) {
    if (isWinterLag(m)) return '그래프를 좌우로 끌어 <b>가장 추울 것 같은 날</b>을 찍어 보세요. 실제 기록과 비교해 볼 수 있어요.';
    return m.task;
  }
  function briefOf(m) {
    if (isWinterLag(m)) return '밤이 가장 긴 날은 동지(12/22)입니다. 태양이 가장 낮게 뜨는 날이죠. 그런데 우리가 가장 추위를 느끼는 날도 그날일까요? 직접 찍어서 확인해 보세요.';
    return m.brief;
  }
  /* R4-P1-11: 5개 미션 전부 lockTerm이라 절기 스트립은 한 번도 렌더되지 않는데
     "지역·절기를 바꿔 보고, '표'와 '지도' 보기로"라는 고정 안내를 모든 미션에 붙였다.
     지시를 따르려는 학습자·심사위원에게 '미완성'으로 읽힌다. 실제로 있는 것만 가리킨다. */
  function deepHintOf(m) {
    var can = [];
    if (!m.lockCity || m.compare) can.push('지역을 바꿔 보고');
    if (!m.lockTerm) can.push('절기를 바꿔 보고');
    if (m.lagMode) can.push('계절(여름·겨울)을 바꿔 보고');
    can.push(m.lagMode ? '‘표’ 보기로 숫자를 확인해' : (hasMap() ? '‘표’와 ‘지도’ 보기로' : '‘표’ 보기로'));
    var tail = m.lagMode
      ? ' 같은 결론이 나오는지 확인해 보세요. <button class="inline-btn" type="button" id="deepLab">🔬 열관성 실험실에서 <b>왜</b> 늦는지 직접 계산해 보기 →</button>'
      : ' 같은 결론이 나오는지 확인해 보세요.';
    return '<p class="deep-hint"><span class="step-tag is-opt">선택 심화</span> 시간이 남으면 — '
      + can.join(', ') + tail + ' <b>핵심만 해도 미션은 완료됩니다.</b></p>';
  }
  var demoPlayed = false, overlayOpen = false;

  function startMission(i) {
    var m = MISSIONS[i];
    state.phase = 'mission'; state.mi = i; state.city = m.city; state.ti = m.ti; state.metric = m.metric;
    state.thr = m.thr; state.thr0 = m.thr; state.touched = false; state.moved = false; overlayOpen = false;
    /* R4-P0-5: 미션을 다시 열면 그 미션의 '정답'과 보기 상태를 전부 처음으로 되돌린다.
       예전에는 markDoy만 비워서, ✓ 칩으로 미션5를 재방문하면 "내 예상 아직 안 찍음"과
       "실제 가장 더운 날 7월 31일"이 동시에 떴다. 또 미션3 안내를 따라 '표'로 바꿔 둔
       학습자는 미션5를 그래프 없이 열어 유일한 조작(가로 드래그)을 잃었다.
       season()이 이미 같은 초기화를 하고 있으므로 그 규칙을 여기로 끌어온다. */
    state.view = 'chart';
    if (state.visited) delete state.visited[m.id];
    if (state.usedThr) delete state.usedThr[m.id];
    if (m.lagMode) {
      state.markDoy = null; state.lagRevealed = false; state.lagSeason = 'summer'; state.ti = 11;
      delete state.predicts['lag']; delete state.selfChecks['lag'];
    }
    state.missionStep = missionAsked(m) ? 'orient' : 'predict';
    save();
    renderMissionFlow();
  }

  function missionAsk(m) {
    return m.id === 'chuseo'
      ? { q: PRE_QUESTION.q, options: PRE_QUESTION.options, get: function () { return state.pre; }, set: function (v) { state.pre = v; } }
      : (function () { var pd = askOf(m); return { q: pd ? pd.q : '', options: pd ? pd.options : [], get: function () { return state.predicts[m.id]; }, set: function (v) { state.predicts[m.id] = v; } }; })();
  }
  function missionAsked(m) { var a = missionAsk(m); return !a.options.length || a.get() != null; }
  /* R4-P2(L-09): 예전 조건은 '임계값을 한 번이라도 옮겼는가'뿐이라, 미션 과제와 무관한
     조작 하나로 판정이 열렸다 — 미션 3은 지역 칩을 한 번도 안 눌러도, 미션 4는 프리셋
     하나만 눌러도 통과했다. 각 미션이 실제로 요구하는 비교를 했는지 본다. */
  function missionDone(m) {
    if (m.id === 'region') {
      var v = state.visited && state.visited[m.id];
      return !!(v && v['제주'] && v['강원']);          /* 두 지역을 모두 봤는가 */
    }
    if (m.id === 'rain') {
      var u = state.usedThr && state.usedThr[m.id];
      return !!(u && u['1'] && Object.keys(u).some(function (k) { return Number(k) >= 30; }));
    }
    return true;
  }
  function canJudge(m) {
    if (m.lagMode) return !!state.markDoy && !!state.lagRevealed && missionAsked(m);
    return state.moved && missionAsked(m) && missionDone(m);
  }
  /* 어떤 조작이 남았는지 학습자에게 정확히 알려 준다 */
  function missionTodo(m) {
    if (m.id === 'region') {
      var v = (state.visited && state.visited[m.id]) || {};
      var need = ['제주', '강원'].filter(function (c) { return !v[c]; });
      return need.length ? '<b>' + need.join('·') + '</b> 칩을 눌러 두 지역을 모두 비교해 보세요.' : '';
    }
    if (m.id === 'rain') {
      var u = (state.usedThr && state.usedThr[m.id]) || {};
      if (!u['1']) return '<b>1mm</b> 프리셋으로 ‘비 온 날’을 먼저 확인해 보세요.';
      if (!Object.keys(u).some(function (k) { return Number(k) >= 30; })) return '<b>30mm 또는 50mm</b> 프리셋으로 큰비도 확인해 보세요 — 방향이 뒤집히는지가 이 미션의 질문입니다.';
    }
    return '';
  }
  function markVisited(kind, key) {
    if (state.phase !== 'mission') return;
    var id = MISSIONS[state.mi] && MISSIONS[state.mi].id; if (!id) return;
    if (!state[kind] || typeof state[kind] !== 'object') state[kind] = {};
    if (!state[kind][id]) state[kind][id] = {};
    state[kind][id][String(key)] = 1;
    save();
  }
  function updateGate(m) {
    var btn = $('toVerdict'), hint = $('touchHint'); if (!btn) return;
    btn.classList.toggle('is-muted', !canJudge(m));
    hint.classList.remove('hint-urge');
    if (m.lagMode) {
      var w = isWinterLag(m) ? '추울' : '더울';
      hint.innerHTML = !state.markDoy ? '봉인한 예측을 검증해 봅시다. 그래프를 <b>좌우로</b> 끌어 가장 ' + w + ' 것 같은 날을 찍어 보세요. (＋− 버튼·방향키로도 됩니다)'
        : (!state.lagRevealed ? '<b>‘실제와 비교하기’</b>를 눌러 실제 기록과 맞춰 보세요.'
        : '좋아요 — 준비되면 판정하세요.');
    } else {
      var todo = missionTodo(m);
      hint.innerHTML = !state.moved
        ? '봉인한 예측을 검증해 봅시다. 보라색 기준선의 <b>⇅ 손잡이</b>를 잡아 위아래로 끌어 보세요. 슬라이더나 ＋− 버튼으로도 1' + metricOf().unit + '씩 맞출 수 있어요.'
        : (todo ? todo : '좋아요 — 준비되면 판정하세요.');
    }
  }
  function flash(el) { if (!el) return; el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash'); }

  var STEP_LABELS = {
    predict: '예측', lens: '개념 준비', orient: '탐구 방향', explore: '직접 조작', evidence: '증거 확보',
    write: '내 CERL', check: '자가진단', expert: '전문가 비교', transfer: '다른 절기에 적용', audit: '감사·완료'
  };
  function missionSequence(m) {
    var seq = ['predict'];
    if (m.id === 'chuseo') seq.push('lens');
    seq = seq.concat(['orient', 'explore', 'evidence', 'write', 'check', 'expert']);
    if (m.askPost) seq.push('transfer');
    seq.push('audit');
    return seq;
  }
  /* 5차 F01(P0): goal-chip은 그 미션의 결론을 한 줄로 압축한 문구다. 21:50 리팩터가
     단계 헤더를 하나로 통합하면서 이 칩이 '자료 없는 예측' 화면까지 올라왔고,
     미션 1·4·5에서 사전 문항의 정답을 그대로 인쇄했다(이전 버전의 예측 화면 칩은
     '자료를 보기 전 예측'이라는 내용 중립 라벨이었다).
     정답 어휘가 보이면 안 되는 문항 단계에서는 목표 '번호'만 남긴다 —
     학습목표를 숨기는 것이 아니라 결론 문구를 답하기 전에 보여 주지 않는 것이다. */
  var NO_GOAL_TEXT = ['predict', 'lens', 'check', 'transfer'];
  function goalChipText(m, step) {
    if (step === 'predict') return '자료를 보기 전 예측';
    if (NO_GOAL_TEXT.indexOf(step) !== -1) {
      var no = String(m.goal || '').match(/^목표\s*[①②③④⑤]+/);
      return no ? no[0] : '학습목표';
    }
    return m.goal;
  }
  function missionStepHeader(m, step) {
    var seq = missionSequence(m), at = Math.max(0, seq.indexOf(step));
    return '<div class="mission-step-head"><div class="mhead"><span class="mno">미션 ' + (state.mi + 1) + ' / ' + MISSIONS.length
      + '</span><span class="goal-chip">' + goalChipText(m, step) + '</span></div>'
      + '<div class="micro-progress" aria-label="미션 세부 단계"><b>' + (at + 1) + '/' + seq.length + ' · ' + STEP_LABELS[step]
      + '</b><span><i style="width:' + ((at + 1) / seq.length * 100) + '%"></i></span></div></div>';
  }
  function setMissionStep(step) {
    state.phase = 'mission'; state.missionStep = step; save(); renderMissionFlow();
  }
  function renderMissionFlow() {
    var m = MISSIONS[state.mi];
    if (!missionAsked(m)) { state.missionStep = 'predict'; renderPrediction(m); return; }
    if (m.id === 'chuseo' && !lensDone()) { state.missionStep = 'lens'; renderLensStep(m); return; }
    var step = state.missionStep || 'orient';
    if (step === 'predict' || step === 'lens') step = 'orient';
    if ((step === 'evidence' || ['write', 'check', 'expert', 'transfer', 'audit'].indexOf(step) !== -1) && !canJudge(m)) step = 'explore';
    if (['check', 'expert', 'transfer', 'audit'].indexOf(step) !== -1 && (!state.cerlSubmitted[m.id] || cerlErrors(m).length)) step = 'write';
    if (['expert', 'transfer', 'audit'].indexOf(step) !== -1 && !state.selfChecks[m.id]) step = 'check';
    if (step === 'transfer' && !m.askPost) step = 'audit';
    /* 5차 F14: 미션 5는 실험실을 한 번 열어 본 뒤에 감사·완료로 간다(목표 ⑤). */
    if (step === 'audit' && m.lagMode && !state.labSeen) step = 'expert';
    if (step === 'audit' && m.askPost && state.post == null) step = 'transfer';
    state.missionStep = step; state.phase = 'mission'; save();
    if (step === 'orient') renderMissionOrient(m);
    else if (step === 'explore') renderExplore();
    else if (step === 'evidence') renderEvidence();
    else renderVerdict();
  }

  /* P0 교육 계약: 예측 화면에는 그래프·표·숫자·정답 성격을 암시하는 보조문구를
     한 글자도 싣지 않는다. 딥링크나 저장 상태로 mission에 진입해도 renderExplore의
     가드가 이 화면으로 되돌리므로 ‘자료 → 예측’ 순서가 다시 생기지 않는다. */
  function renderPrediction(m) {
    var a = missionAsk(m);
    if (!a.options.length || a.get() != null) { state.missionStep = 'orient'; renderMissionFlow(); return; }
    state.phase = 'mission'; overlayOpen = false; document.body.classList.remove('lag-mode'); save();
    setStage('<section class="card predict-card" aria-labelledby="predictTitle">'
      + missionStepHeader(m, 'predict')
      + '<p class="po-eyebrow">🔒 아직 이 미션의 관측 자료를 열지 않았습니다</p>'
      + '<h1 class="stage-h" id="predictTitle">먼저 내 생각을 봉인하세요.</h1>'
      + '<p class="predict-contract">다음 화면에서 그래프를 조작해 이 생각을 검증합니다. 지금은 정답을 맞히려 하지 말고, <b>현재 생각</b>을 고르세요.</p>'
      + '<p class="po-q">' + a.q + '</p><div class="po-choices">'
      /* 선택지의 보조 필드는 정답 성격이나 예상 메커니즘을 암시할 수 있어 의도적으로 렌더하지 않는다. */
      + a.options.map(function (o) { return '<button class="po-choice" data-v="' + o.v + '"><b>' + o.t + '</b></button>'; }).join('')
      + '</div><p class="po-note">선택은 정답 채점이 아니라 생각의 출발점으로 기록됩니다. 검증이 끝난 뒤 처음 생각과 비교할 수 있어요.</p>'
      + '</section>');
    var first = stage.querySelector('.po-choice'); if (first) try { first.focus(); } catch (e) {}
    stage.querySelectorAll('[data-v]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        a.set(btn.dataset.v); save();
        state.missionStep = (m.id === 'chuseo' && !lensDone()) ? 'lens' : 'orient';
        renderMissionFlow();
      });
    });
  }

  function renderLensStep(m) {
    if (m.id !== 'chuseo' || lensDone() && state.lensCursor > 2) { setMissionStep('orient'); return; }
    if (!state.lens || typeof state.lens !== 'object') state.lens = {};
    var firstMissing = 0;
    while (firstMissing < LENS.items.length && state.lens[LENS.items[firstMissing].id]) firstMissing++;
    var idx = typeof state.lensCursor === 'number' ? state.lensCursor : Math.min(firstMissing, LENS.items.length - 1);
    idx = Math.min(LENS.items.length - 1, Math.max(0, idx));
    var it = LENS.items[idx], picked = state.lens[it.id];
    setStage('<section class="card lens-step-card">'
      + missionStepHeader(m, 'lens')
      + '<p class="po-eyebrow">' + LENS.title + '</p>'
      + '<h1 class="stage-h">한 문장씩 분류해 볼까요?</h1>'
      + '<p class="lens-counter">문장 ' + (idx + 1) + ' / ' + LENS.items.length + '</p>'
      + '<p class="po-q lens-one-q">' + it.t + '</p>'
      + '<div class="lens-btns">' + LENS.kinds.map(function (kd) {
          var on = picked === kd.k, right = kd.k === it.k;
          return '<button class="lens-btn' + (picked ? (on ? (right ? ' is-right' : ' is-wrong') : (right ? ' is-right' : '')) : '')
            + '" type="button" data-lens-one="' + kd.k + '"' + (picked ? ' disabled' : '') + '><b>' + kd.t + '</b><small>' + kd.s + '</small></button>';
        }).join('') + '</div>'
      + (picked ? '<p class="lens-why">' + (picked === it.k ? '<b class="ok">맞아요.</b> ' : '<b class="no">다시 볼까요.</b> ') + it.why + '</p>'
        + '<button class="primary-btn" id="lensOneNext">' + (idx === LENS.items.length - 1 ? '검증 준비 완료 →' : '다음 문장 →') + '</button>'
        : '<p class="po-note">지금은 이 한 문장만 판단하세요. 선택하면 바로 이유를 확인합니다.</p>')
      + '</section>');
    stage.querySelectorAll('[data-lens-one]').forEach(function (b) {
      b.addEventListener('click', function () { state.lens[it.id] = b.dataset.lensOne; state.lensCursor = idx; save(); renderLensStep(m); });
    });
    if ($('lensOneNext')) $('lensOneNext').addEventListener('click', function () {
      if (idx < LENS.items.length - 1) { state.lensCursor = idx + 1; save(); renderLensStep(m); }
      else { state.lensCursor = LENS.items.length; setMissionStep('orient'); }
    });
  }

  function renderMissionOrient(m) {
    document.body.classList.remove('lag-mode');
    var ask = missionAsk(m), picked = ask.get(), pickedText = '';
    ask.options.forEach(function (o) { if (o.v === picked) pickedText = o.t; });
    setStage('<section class="card mission-orient-card">'
      + missionStepHeader(m, 'orient')
      + '<p class="eyebrow">이번 미션의 질문</p>'
      + '<h1 class="hero-headline">' + headlineOf(m) + '</h1>'
      + (pickedText ? '<p class="sealed-answer"><span aria-hidden="true">🔒</span> 내 첫 생각: “' + pickedText + '”</p>' : '')
      + '<p class="orient-brief">' + briefOf(m) + '</p>'
      + '<div class="orient-action"><span class="step-tag">직접 할 일</span><p>' + taskOf(m) + '</p></div>'
      + '<p class="orient-contract">다음 화면에서는 <b>한 가지 조작</b>에 집중합니다. 자세한 출처·계산·심화 자료는 증거를 확보한 뒤 확인할 수 있습니다.</p>'
      + '<div class="step-actions"><button class="primary-btn" id="orientGo">직접 조작하기 →</button></div>'
      + '</section>');
    $('orientGo').addEventListener('click', function () { setMissionStep('explore'); });
  }

  /* R4-P2(L-16①): 개발계획서가 목표①의 증거로 지목한 '개념 렌즈 분류'가 없었다.
     goal-chip으로 목표를 <b>표시</b>하기는 했지만, 학습자가 절기·날씨·기후를
     <b>구분해 내는</b> 수행은 어디에도 없었다. 예측 봉인 직후 30초짜리 분류 관문을 둔다.
     세 문장은 각각 '천문 날짜 / 하루의 관측 / 여러 해의 경향'을 대표한다. */
  /* 한 해 평균값 — LENS의 기후 예시를 데이터에서 계산해 문서·데이터와 어긋나지 않게 한다. */
  function yearMean(city, metric, period) {
    var c = D.cities[city] || {}, a = c[metric || 'temp'];
    a = a && a[period];
    if (!a || !a.length) return '—';
    var s = 0; for (var i = 0; i < a.length; i++) s += a[i];
    /* 두 값을 나란히 읽는 문장이라 소수점 자리를 고정한다 — num1은 14.0을 '14'로 줄여
       '11.6°C에서 14°C로'처럼 표기가 어긋난다. */
    return (s / a.length).toFixed(1);
  }
  var LENS = {
    title: '30초 분류 — 같은 주제인데 층이 다릅니다',
    lead: '아래 세 문장을 <b>절기 · 날씨 · 기후</b> 중 하나로 나눠 보세요. 이 구분이 이 앱 전체의 뼈대예요.',
    kinds: [
      { k: 'term', t: '절기', s: '태양 위치로 정한 천문 날짜' },
      { k: 'weather', t: '날씨', s: '하루·한때의 관측' },
      { k: 'climate', t: '기후', s: '여러 해에 걸친 경향' }
    ],
    items: [
      { id: 'a', t: '처서는 양력 8월 23일 무렵이다.', k: 'term', why: '태양의 황경으로 정해진 <b>날짜</b>입니다. 더운지 아닌지와 무관하게 해마다 거의 같아요.' },
      { id: 'b', t: '어제 서울 낮 기온이 31°C였다.', k: 'weather', why: '<b>하루</b>의 관측입니다. 하루 값으로는 경향을 말할 수 없어요.' },
      /* 5차 F01(P0): 이전 문장은 '서울에서 25°C를 넘는 날이 68일 vs 31일'이었다 —
         미션 1의 기본 지역·기본 기준의 결론 수치를 조작 전에 인쇄해, 사전 예측과
         자가진단의 답을 함께 흘렸다. 어떤 미션도 결론으로 쓰지 않는 '한 해 평균기온'으로
         바꾸고, 값은 하드코딩하지 않고 데이터에서 계산해 재빌드 때 어긋나지 않게 한다. */
      { id: 'c', t: '서울의 한 해 평균기온이 ' + PERIOD_PAST + '년 ' + yearMean('서울', 'temp', 'past') + '°C에서 ' + PERIOD_NOW + '년 ' + yearMean('서울', 'temp', 'present') + '°C로 높아졌다.', k: 'climate', why: '<b>여러 해</b>를 모아 평균한 값이라 경향을 말하는 문장이에요. 다만 5년은 관측 신호일 뿐, 30년 기후평년은 아니에요.' }
    ]
  };
  function lensDone() { return !!(state.lens && Object.keys(state.lens).length >= LENS.items.length); }
  function showLensGate(m, after) {
    var el = $('predictOverlay');
    if (!el || m.id !== 'chuseo' || lensDone()) { if (after) after(); return; }
    if (!state.lens || typeof state.lens !== 'object') state.lens = {};
    overlayOpen = true; el.hidden = false;
    function paint() {
      el.innerHTML = '<div class="po-inner lens-inner" role="dialog" aria-label="개념 분류"><p class="po-eyebrow">' + LENS.title + '</p>'
        + '<p class="po-q lens-lead">' + LENS.lead + '</p>'
        + LENS.items.map(function (it) {
            var picked = state.lens[it.id];
            return '<div class="lens-row' + (picked ? ' is-done' : '') + '"><p class="lens-t">' + it.t + '</p>'
              + '<div class="lens-btns">' + LENS.kinds.map(function (kd) {
                  var on = picked === kd.k, right = kd.k === it.k;
                  return '<button class="lens-btn' + (picked ? (on ? (right ? ' is-right' : ' is-wrong') : (right ? ' is-right' : '')) : '')
                    + '" type="button" data-lens="' + it.id + '" data-kind="' + kd.k + '"' + (picked ? ' disabled' : '')
                    + '><b>' + kd.t + '</b><small>' + kd.s + '</small></button>';
                }).join('') + '</div>'
              + (picked ? '<p class="lens-why">' + (picked === it.k ? '<b class="ok">맞아요.</b> ' : '<b class="no">다시 볼까요.</b> ') + it.why + '</p>' : '')
              + '</div>';
          }).join('')
        + (lensDone() ? '<button class="primary-btn" id="lensGo">확인했어요 — 검증하러 가기 →</button>'
                      : '<p class="po-note">세 문장을 모두 나눠야 다음으로 넘어갑니다. 틀려도 괜찮아요 — 바로 이유를 알려 줍니다.</p>');
      el.querySelectorAll('[data-lens]').forEach(function (b) {
        b.addEventListener('click', function () {
          state.lens[b.dataset.lens] = b.dataset.kind; save(); paint();
        });
      });
      if ($('lensGo')) $('lensGo').addEventListener('click', function () {
        overlayOpen = false; el.hidden = true; el.innerHTML = '';
        if (after) after();
      });
    }
    paint();
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: REDUCE ? 'auto' : 'smooth' });
  }

  function autoDemo(m) {
    if (REDUCE) return;
    /* 학습자가 이미 기준을 옮겼다면 그 값이 판정의 근거다. 자동 시연이 그것을
       m.thr로 되돌리면 "내가 정한 기준"이라는 이 앱의 핵심 주장이 무너진다.
       (실측: 30°C 설정 → 봉인 → 27°C로 애니메이션 → 판정문 "'덥다 27°C' 기준으로") */
    if (state.moved || state.thr !== state.thr0) return;
    var hr = heatRange(), start = Math.min(hr.hi, m.thr + 4), end = m.thr, steps = 10, i = 0;
    state.thr = start; drawHero();
    demoTimer = setInterval(function () {
      /* 시연이 시작된 뒤라도 학습자가 손을 대는 순간 즉시 양보한다.
         그렇지 않으면 애니메이션의 다음 틱이 방금 고른 값을 다시 덮어쓴다. */
      if (state.moved || !$('heroSvg')) { stopTimers(); return; }
      i++; state.thr = Math.round(start + (end - start) * (i / steps)); drawHero();
      if (i >= steps) { state.thr = end; drawHero(); stopTimers(); }
    }, 80);
  }

  function renderExplore() {
    var m = MISSIONS[state.mi], useCompare = !!m.compare;
    /* 저장 상태·딥링크·계절 전환 어느 경로에서도 관측 자료가 예측보다 먼저 나오지 않는다. */
    if (!missionAsked(m)) { renderPrediction(m); return; }
    if (m.id === 'chuseo' && !lensDone()) { renderLensStep(m); return; }
    state.phase = 'mission'; state.missionStep = 'explore'; overlayOpen = false; save();
    setStage('<section class="card explore-card">'
      + missionStepHeader(m, 'explore')
      + '<h1 class="hero-headline" id="missionH1">' + headlineOf(m) + '</h1>'
      + '<div class="focus-task"><span class="step-tag">지금 한 가지만</span><p id="missionTask">' + taskOf(m) + '</p></div>'
      + heroShell({ cityChips: !m.lockCity || useCompare, termStrip: !m.lockTerm, lagMode: !!m.lagMode,
                    includeReadouts: false, includeMethod: false, compactIntegrity: true })
      + '<div class="explore-actions"><small id="touchHint"></small><div class="step-actions">'
      + '<button class="ghost-btn" id="backOrient">← 탐구 방향</button><button class="primary-btn is-muted" id="toVerdict">증거 정리하기 →</button></div></div>'
      + '</section>');
    if (useCompare) bindCityChips(m.compare); else if (!m.lockCity) bindCityChips();
    if (!m.lockTerm) bindTermStrip();
    if (m.lagMode) bindLagControls(); else bindThreshold();
    document.body.classList.toggle('lag-mode', !!m.lagMode);
    bindViewTools(); drawHero(); updateKmaRef();
    if ($('deepLab')) $('deepLab').addEventListener('click', renderLab);
    onTouched = function () { stopTimers(); updateGate(m); };
    updateGate(m);
    $('backOrient').addEventListener('click', function () { setMissionStep('orient'); });
    $('toVerdict').addEventListener('click', function () {
      if (m.lagMode ? (!state.markDoy || !state.lagRevealed) : !state.moved) {
        var h = $('touchHint');
        h.innerHTML = m.lagMode
          ? (!state.markDoy ? '먼저 그래프를 <b>좌우로 끌어</b> 날짜를 찍어 주세요 ↑' : '<b>‘실제와 비교하기’</b>를 눌러 주세요 ↑')
          : '아직 판정할 수 없어요 — 먼저 <b>‘' + metricOf().verb + '’ 기준선</b>을 옮겨 과거·현재를 비교해 보세요 ↑';
        h.classList.add('hint-urge'); flash($('heroSvg')); flash(h); return;
      }
      var todo2 = missionTodo(m);
      if (todo2) { var h3 = $('touchHint'); h3.innerHTML = todo2; h3.classList.add('hint-urge'); flash(h3); return; }
      setMissionStep('evidence');
    });
    if (!demoPlayed && state.mi === 0) { demoPlayed = true; setTimeout(function () { autoDemo(m); }, 250); }
  }

  function evidenceConfig(m) {
    return {
      city: state.city, ti: state.ti, metric: state.metric, thr: state.thr,
      lagSeason: m.lagMode ? state.lagSeason : null,
      markDoy: m.lagMode ? state.markDoy : null
    };
  }
  function evidenceConfigLabel(cfg) {
    var metric = METRICS[cfg.metric] || METRICS.temp;
    var selectedTerm = D.terms[cfg.ti] || D.terms[0];
    var text = cfg.city + ' · ' + selectedTerm.name + ' · ' + metric.label;
    if (cfg.markDoy) text += ' · 내가 찍은 날 ' + doyStr(cfg.markDoy);
    else text += ' · 기준 ' + cfg.thr + metric.unit;
    return text;
  }
  function sameEvidenceConfig(a, b) {
    return !!a && !!b && a.city === b.city && Number(a.ti) === Number(b.ti)
      && a.metric === b.metric && Number(a.thr) === Number(b.thr)
      && a.lagSeason === b.lagSeason && Number(a.markDoy || 0) === Number(b.markDoy || 0);
  }
  function hasMissionWriting(m) {
    var d = state.missionCerl && state.missionCerl[m.id];
    return !!(d && ['c', 'e', 'r', 'l'].some(function (k) { return String(d[k] || '').trim(); }));
  }
  function restoreEvidenceConfig(m, cfg) {
    state.city = cfg.city; state.ti = Number(cfg.ti); state.metric = cfg.metric;
    state.thr = Number(cfg.thr); state.thr0 = state.thr; state.moved = true; state.touched = true;
    if (m.lagMode) {
      state.lagSeason = cfg.lagSeason === 'winter' ? 'winter' : 'summer';
      state.markDoy = Number(cfg.markDoy) || null;
      state.lagRevealed = !!state.markDoy;
    }
  }
  function renderEvidenceChange(m, savedCfg, currentCfg) {
    state.phase = 'mission'; state.missionStep = 'evidence'; save();
    setStage('<section class="card evidence-step-card evidence-change-card">'
      + missionStepHeader(m, 'evidence')
      + '<p class="eyebrow">증거 조건 변경 감지</p>'
      + '<h1 class="stage-h">이전 글과 새 숫자를 조용히 섞지 않을게요.</h1>'
      + '<p class="sub">CERL을 쓴 뒤 조작 조건이 바뀌었습니다. 어느 증거를 사용할지 먼저 정하세요. 작성한 글은 어느 쪽을 골라도 지우지 않습니다.</p>'
      + '<div class="evidence-change-grid"><div><b>이 글을 쓸 때의 조건</b><p>' + escapeHTML(evidenceConfigLabel(savedCfg)) + '</p></div>'
      + '<div><b>방금 바꾼 조건</b><p>' + escapeHTML(evidenceConfigLabel(currentCfg)) + '</p></div></div>'
      + '<div class="step-actions"><button class="ghost-btn" id="restoreEvidence">이전 조건 복원</button>'
      + '<button class="primary-btn" id="refreshEvidence">새 조건으로 증거 갱신</button></div>'
      + '<p class="orient-contract">새 조건을 고르면 기존 CERL은 초안으로 보존되며, 숫자와 문장을 다시 맞춘 뒤 재제출해야 합니다.</p>'
      + '</section>');
    $('restoreEvidence').addEventListener('click', function () {
      restoreEvidenceConfig(m, savedCfg); save(); renderEvidence();
    });
    $('refreshEvidence').addEventListener('click', function () {
      state.evidenceById[m.id] = currentCfg;
      state.cerlSubmitted[m.id] = false;
      delete state.selfChecks[m.id];
      state.cerlStepById[m.id] = 0;
      save(); renderEvidence();
    });
  }

  function renderEvidence() {
    var m = MISSIONS[state.mi], n = stat();
    if (!canJudge(m)) { setMissionStep('explore'); return; }
    var currentCfg = evidenceConfig(m);
    var savedCfg = state.evidenceById[m.id];
    if (savedCfg && !sameEvidenceConfig(savedCfg, currentCfg) && (hasMissionWriting(m) || state.cerlSubmitted[m.id])) {
      renderEvidenceChange(m, savedCfg, currentCfg); return;
    }
    state.evidenceById[m.id] = currentCfg;
    state.phase = 'mission'; state.missionStep = 'evidence'; save();
    setStage('<section class="card evidence-step-card">'
      + missionStepHeader(m, 'evidence')
      + '<p class="eyebrow">내가 방금 확보한 관측 증거</p>'
      + '<h1 class="stage-h">숫자를 먼저 읽고, 그다음 설명하세요.</h1>'
      + studentEvidenceHTML(m, n)
      + '<details class="evidence-detail"><summary>추가 관측값 확인</summary><div class="readouts" id="readouts"></div></details>'
      + '<div class="evidence-depth"><p class="eyebrow">선택 심화 · 필요한 정보만 열기</p>'
      + deepHintOf(m)
      + '<div id="kmaRefMount"></div><div id="methodMount"></div>'
      + (m.id === 'chuseo' ? '<details class="brief-box"><summary>결론은 다른 5년에도 남을까? · 비교 기간 26창</summary><div id="winMount"></div></details>' : '')
      + '</div>'
      + '<div class="step-actions"><button class="ghost-btn" id="evidenceBack">← 다시 조작하기</button>'
      + '<button class="primary-btn" id="evidenceWrite">이 증거로 CERL 쓰기 →</button></div>'
      + '</section>');
    renderReadouts(); updateKmaRef(); updateMethod(); updateWindow();
    if ($('deepLab')) $('deepLab').addEventListener('click', renderLab);
    $('evidenceBack').addEventListener('click', function () { setMissionStep('explore'); });
    $('evidenceWrite').addEventListener('click', function () { setMissionStep('write'); });
  }

  /* ---------- 판정 ---------- */
  function cerlHTML(v) {
    return '<p class="cerl"><span class="t t-c">주장</span> ' + v.c + '</p>'
      + '<p class="cerl"><span class="t t-e">근거</span> ' + v.e + '</p>'
      + '<p class="cerl"><span class="t t-r">추론</span> ' + v.r + '</p>'
      + '<p class="cerl cerl-l"><span class="t t-l">한계</span> ' + v.l + '</p>';
  }
  var CERL_FIELDS = [
    { k: 'c', label: '주장', min: 5, prompt: '자료를 보고 내린 판단을 한 문장으로 쓰세요.', placeholder: '나는 이 절기의 약속이 …라고 판단한다.' },
    { k: 'e', label: '근거', min: 12, prompt: '지역·기간·기준과 화면에서 읽은 숫자를 넣으세요.', placeholder: '서울, 과거 …년과 현재 …년, …°C 기준에서 …' },
    { k: 'r', label: '추론', min: 8, prompt: '그 숫자가 왜 내 주장을 뒷받침하는지 연결하세요.', placeholder: '이 차이는 …을 뜻하므로 …' },
    { k: 'l', label: '한계', min: 8, prompt: '이 자료만으로 말할 수 없는 범위를 쓰세요.', placeholder: '다만 이 자료만으로 전국이나 원인을 …' }
  ];
  function missionCerl(m) {
    if (!state.missionCerl || typeof state.missionCerl !== 'object') state.missionCerl = {};
    if (!state.missionCerl[m.id] || typeof state.missionCerl[m.id] !== 'object') {
      state.missionCerl[m.id] = { c: '', e: '', r: '', l: '' };
    }
    return state.missionCerl[m.id];
  }
  function cerlText(m) {
    var d = missionCerl(m);
    return CERL_FIELDS.map(function (f) { return f.label + ': ' + (d[f.k] || '').trim(); }).join(' ');
  }
  /* 5차 F03/F08: 자유서술이 미션 5개 × 4필드 = 20칸이라 반복 부담이 컸고, 그 부담이
     '아무 글자나 채우는' 통과로 이어졌다. 미션 1은 네 요소를 모두 쓰게 유지하고(CERL을
     처음 배우는 자리다), 미션 2~5는 <b>근거·한계</b> 두 요소만 필수로 둔다.
     주장·추론 칸은 없애지 않고 선택으로 남긴다 — 쓰고 싶은 학습자의 자리를 빼앗지 않는다. */
  var CERL_REQUIRED_ALL = ['c', 'e', 'r', 'l'], CERL_REQUIRED_CORE = ['e', 'l'];
  function cerlRequired(m) { return m && m.id === 'chuseo' ? CERL_REQUIRED_ALL : CERL_REQUIRED_CORE; }
  function cerlIsRequired(m, k) { return cerlRequired(m).indexOf(k) !== -1; }

  /* 5차 F03: 통과 조건이 길이뿐이라 같은 문장을 네 칸에 복붙해도, 발문을 그대로 베껴도
     완료 배지가 나왔다. 오탐이 미탐보다 무거우므로 '누가 봐도 성립하지 않는 것'만 막는다.
       (a) 다른 칸과 완전히 같거나 한쪽이 다른 쪽을 그대로 품고 있다
       (b) 근거 칸에 숫자가 하나도 없다 — 발문이 '화면에서 읽은 숫자를 넣으세요'다
       (c) 화면의 미션 브리프·과제문을 25자 이상 그대로 옮겨 적었다 */
  function cerlNorm(s) { return String(s || '').replace(/\s+/g, '').replace(/[.,·’‘“”"'()\[\]…~—-]/g, ''); }
  function cerlContentError(m, f, val) {
    var v = cerlNorm(val);
    if (v.length < 8) return '';                     /* 짧은 칸은 길이 검사에 맡긴다 */
    var d = missionCerl(m), dup = null;
    CERL_FIELDS.forEach(function (g) {
      if (dup || g.k === f.k) return;
      var w = cerlNorm(d[g.k]);
      if (w.length < 8) return;
      if (v === w || (v.length >= 12 && w.length >= 12 && (v.indexOf(w) !== -1 || w.indexOf(v) !== -1))) dup = g.label;
    });
    if (dup) return '‘' + dup + '’ 칸과 같은 문장이에요. ' + f.label + eulReul(f.label) + ' 다른 내용으로 써 주세요.';
    if (f.k === 'e' && !/[0-9]/.test(String(val))) return '근거에는 화면에서 읽은 숫자를 넣어 주세요. (지역·기간·기준과 함께)';
    var srcs = [taskOf(m), briefOf(m)];
    for (var i = 0; i < srcs.length; i++) {
      var s = cerlNorm(String(srcs[i]).replace(/<[^>]*>/g, ''));
      for (var j = 0; j + 25 <= s.length; j += 5) {
        if (v.indexOf(s.substr(j, 25)) !== -1) return '화면의 안내 문장을 그대로 옮긴 것 같아요. 내 말로 다시 써 주세요.';
      }
    }
    return '';
  }
  function cerlErrors(m) {
    var d = missionCerl(m), missing = [];
    CERL_FIELDS.forEach(function (f) {
      if (!cerlIsRequired(m, f.k)) return;
      var raw = d[f.k] || '';
      if (raw.trim().replace(/\s/g, '').length < f.min) { missing.push(f.label + ' ' + f.min + '자 이상'); return; }
      if (cerlContentError(m, f, raw)) missing.push(f.label + ' 내용 확인');
    });
    return missing;
  }
  function cerlStepIndex(m) {
    var i = Number(state.cerlStepById[m.id]);
    return isFinite(i) ? Math.min(CERL_FIELDS.length - 1, Math.max(0, i)) : 0;
  }
  function studentEvidenceHTML(m, n) {
    var rows = [], mc = metricOf();
    if (m.id === 'region') {
      var jeju = n.regionOf('제주'), gangwon = n.regionOf('강원');
      rows = [
        ['제주 · ' + n.thr + '°C 기준', '과거 ' + jeju.pStr + ' → 현재 ' + jeju.cStr],
        ['강원(춘천) · ' + n.thr + '°C 기준', '과거 ' + gangwon.pStr + ' → 현재 ' + gangwon.cStr]
      ];
    } else if (m.id === 'rain') {
      /* 5차 F06: 지역을 '서울'로 하드코딩해서, 지역 칩을 눌러 부산을 본 학습자가
         증거 화면에서는 서울 숫자를, 두 화면 뒤 전문가 화면에서는 부산 숫자를 읽었다.
         하필 '자료의 범위를 밝혀라'를 가르치는 미션이고, 같은 화면의 심화 안내가
         지역 변경을 권한다. 그리고 학습자가 직접 정한 기준값이 증거에 한 번도
         나타나지 않아 '내가 정한 기준으로 내가 읽은 증거'라는 계약이 여기서 끊겼다. */
      var rc = n.city, rst = cityOf(rc).station;
      var rlab = rc + (rst && rst !== rc ? '(' + rst + ')' : '');
      rows = [
        [rlab + ' · 1mm 이상', '과거 ' + fmtDays(exceed('past', 1, rc, 'precip')) + ' → 현재 ' + fmtDays(exceed('present', 1, rc, 'precip'))],
        [rlab + ' · 50mm 이상', '과거 ' + fmtDays(exceed('past', 50, rc, 'precip')) + ' → 현재 ' + fmtDays(exceed('present', 50, rc, 'precip'))]
      ];
      if (n.thr !== 1 && n.thr !== 50) {
        rows.push([rlab + ' · 내가 정한 ' + n.thr + 'mm 이상',
          '과거 ' + fmtDays(exceed('past', n.thr, rc, 'precip')) + ' → 현재 ' + fmtDays(exceed('present', n.thr, rc, 'precip'))]);
      }
    } else if (m.lagMode) {
      var lg = lagInfo();
      rows = [
        ['내가 찍은 날', state.markDoy ? doyStr(state.markDoy) : '—'],
        ['실제 기록의 극값일', lg ? doyStr(lg.actDoy) + ' · ' + lg.solName + ' 뒤 ' + lg.lag + '일' : '—'],
        ['과거 같은 비교', lg ? lg.solName + ' 뒤 ' + lg.pastLag + '일' : '—']
      ];
    } else {
      rows = [
        [n.city + ' · ' + mc.verb + ' ' + n.thr + mc.unit, '기준 이상 ' + dayLabel() + ' 과거 ' + n.pdStr + ' → 현재 ' + n.cdStr]
      ];
      if (mc.showLast && n.pl > 0 && n.cl > 0) rows.push([mc.last, '과거 ' + n.plStr + ' → 현재 ' + n.clStr]);
    }
    return '<div class="student-evidence" aria-label="내가 조작한 화면에서 읽은 증거">'
      + '<p><b>내가 읽은 증거</b><span>' + n.sampleText + ' · 30년 기후평년 아님</span></p>'
      + '<dl>' + rows.map(function (r) { return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>'; }).join('') + '</dl></div>';
  }
  function studentCerlHTML(m, n) {
    var d = missionCerl(m), ci = cerlStepIndex(m), current = CERL_FIELDS[ci];
    return studentEvidenceHTML(m, n) + '<div class="student-cerl" id="studentCerl">'
      + '<p class="eyebrow">내 CERL 먼저 쓰기 · 필수</p>'
      + '<h2 class="cerl-title">한 번에 한 요소씩, 내 근거로 설명하세요.</h2>'
      + '<p class="cerl-intro">전문가 문장을 보기 전에 <b>주장 → 근거 → 추론 → 한계</b> 순서로 씁니다. '
      + (m.id === 'chuseo'
          ? '이 미션은 <b>네 요소 모두</b> 필수예요.'
          : '이 미션은 <b>근거·한계</b>가 필수이고, 주장·추론은 쓰고 싶으면 쓰는 칸이에요.')
      + ' 이전 단계의 내용은 그대로 저장됩니다.</p>'
      + '<div class="cerl-mini-progress"><b>' + (ci + 1) + ' / ' + CERL_FIELDS.length + ' · ' + current.label
      + (cerlIsRequired(m, current.k) ? '' : ' (선택)') + '</b><span><i style="width:' + ((ci + 1) / CERL_FIELDS.length * 100) + '%"></i></span></div>'
      /* 5차 F15: 이전 요소를 display:none으로 감춰서, '내 주장을 뒷받침하는지 연결하세요'라고
         지시하면서 그 주장을 화면에서 지웠다. 이미 쓴 요소는 읽기 전용 요약으로 위에 쌓는다. */
      + CERL_FIELDS.slice(0, ci).filter(function (f) { return (d[f.k] || '').trim(); })
          .map(function (f) { return '<p class="cerl-done"><b>' + f.label + '</b> ' + escapeHTML(d[f.k]) + '</p>'; }).join('')
      + '<div class="cerl-form">'
      + CERL_FIELDS.map(function (f) {
          var fi = CERL_FIELDS.indexOf(f), reqd = cerlIsRequired(m, f.k);
          return '<label class="cerl-field cerl-step-field"' + (fi === ci ? '' : ' hidden') + '><span><b>' + f.label + '</b>'
            + (reqd ? '' : ' <em class="cerl-opt">선택</em>')
            + '<small>' + f.prompt + '</small></span>'
            + '<textarea data-cerl="' + f.k + '" maxlength="220" rows="2" placeholder="' + f.placeholder + '">' + escapeHTML(d[f.k] || '') + '</textarea>'
            + '<span class="cerl-count" data-count-for="' + f.k + '" aria-live="off"></span></label>';
        }).join('')
      + '</div><p class="cerl-error" id="cerlError" role="alert"></p>'
      + '<div class="step-actions"><button class="ghost-btn" id="cerlPrev" type="button"' + (ci === 0 ? ' hidden' : '') + '>← 이전 요소</button>'
      + '<button class="primary-btn" id="cerlNext" type="button">' + (ci === CERL_FIELDS.length - 1 ? '내 CERL 봉인하고 자가진단 →' : '다음 요소 →') + '</button></div>'
      + '</div>';
  }
  function bindStudentCerl(m) {
    var box = $('studentCerl'), next = $('cerlNext'); if (!box || !next) return;
    /* 5차: maxlength 220만 있고 글자 수 표시가 없어서 학습자가 220자에서 조용히 막혔다.
       현재 글자 수와 필수 최소치를 함께 보여 준다. */
    function syncCount(ta) {
      var k = ta.dataset.cerl, out = box.querySelector('[data-count-for="' + k + '"]');
      if (!out) return;
      var f = null; CERL_FIELDS.forEach(function (g) { if (g.k === k) f = g; });
      var len = (ta.value || '').trim().replace(/\s/g, '').length;
      var need = f && cerlIsRequired(m, k) ? f.min : 0;
      out.textContent = len + ' / 220' + (need && len < need ? ' · ' + (need - len) + '자 더 필요해요' : '');
    }
    box.querySelectorAll('[data-cerl]').forEach(function (ta) {
      syncCount(ta);
      ta.addEventListener('input', function () {
        missionCerl(m)[ta.dataset.cerl] = ta.value.slice(0, 220);
        state.missionDraft[m.id] = cerlText(m);
        save(); syncCount(ta);
        var err = $('cerlError'); if (err) err.textContent = '';
      });
    });
    if ($('cerlPrev')) $('cerlPrev').addEventListener('click', function () {
      state.cerlStepById[m.id] = Math.max(0, cerlStepIndex(m) - 1); save(); renderVerdict();
    });
    next.addEventListener('click', function () {
      var ci = cerlStepIndex(m), f = CERL_FIELDS[ci], ta = box.querySelector('[data-cerl="' + f.k + '"]');
      var err = $('cerlError'), len = (ta.value || '').trim().replace(/\s/g, '').length;
      var reqd = cerlIsRequired(m, f.k);
      if (reqd && len < f.min) {
        /* 5차 COPY-AI-01(P0): '을'을 하드코딩해 '근거을'·'한계을'이 나왔다. 앱에 이미 있는
           eulReul()을 쓴다. 이 문구는 학습자가 가장 자주 보는 오류 메시지다. */
        err.textContent = f.label + eulReul(f.label) + ' ' + f.min + '자 이상 내 말로 써 주세요. (지금 ' + len + '자)';
        ta.focus(); return;
      }
      /* 5차 F03: 길이만 보면 같은 문장 복붙·발문 베끼기가 통과한다. 선택 칸이라도
         내용이 들어 있으면 같은 기준으로 본다 — 기록에 남는 글이기 때문이다. */
      var ce = cerlContentError(m, f, ta.value);
      if (ce) { err.textContent = ce; ta.focus(); return; }
      if (ci < CERL_FIELDS.length - 1) {
        state.cerlStepById[m.id] = ci + 1; save(); renderVerdict(); return;
      }
      var missing = cerlErrors(m);
      if (missing.length) { err.textContent = '아직 필요한 내용: ' + missing.join(' · ') + '.'; return; }
      state.missionDraft[m.id] = cerlText(m); state.cerlSubmitted[m.id] = true;
      state.missionStep = 'check'; save(); renderMissionFlow();
    });
    var active = box.querySelector('.cerl-step-field:not([hidden]) textarea');
    if (active) try { active.focus({ preventScroll: true }); } catch (e) {}
  }
  function renderVerdict() {
    document.body.classList.remove('lag-mode');
    var m = MISSIONS[state.mi], n = stat(), v = m.verdict(n);
    state.phase = 'mission'; save();
    var step = state.missionStep || 'write';
    if (step === 'write') {
      setStage('<section class="card verdict-card cerl-step-card">'
        + missionStepHeader(m, 'write')
        + '<h1 class="sr-only">미션 ' + (state.mi + 1) + ' 내 CERL 작성 — ' + m.title + '</h1>'
        + studentCerlHTML(m, n)
        + '<div class="step-actions step-actions-sub"><button class="ghost-btn" id="writeBackEvidence">← 증거 다시 보기</button></div>'
        + '</section>');
      bindStudentCerl(m);
      $('writeBackEvidence').addEventListener('click', function () { setMissionStep('evidence'); });
      return;
    }
    if (step === 'check') { renderSelfCheckStep(m); return; }
    if (step === 'expert') { renderExpertStep(m, v); return; }
    if (step === 'transfer') { renderTransferStep(m); return; }
    renderAuditStep(m);
  }

  function onSelfCheck(btn, sc, m) {
    var right = btn.dataset.v === sc.correct;
    state.selfChecks[m.id] = { picked: btn.dataset.v, correct: right }; save();
    renderSelfCheckStep(m);
  }

  function studentCerlReviewHTML(m) {
    var d = missionCerl(m);
    return '<div class="student-review"><p class="eyebrow">내가 먼저 쓴 CERL</p><div class="cerl-compare-grid">'
      + CERL_FIELDS.map(function (f) { return '<div><b class="t t-' + f.k + '">' + f.label + '</b><p>' + escapeHTML(d[f.k] || '') + '</p></div>'; }).join('')
      + '</div></div>';
  }

  function renderSelfCheckStep(m) {
    var sc = checkOf(m), ans = state.selfChecks[m.id];
    setStage('<section class="card verdict-card check-step-card">'
      + missionStepHeader(m, 'check')
      + '<p class="eyebrow">내 CERL을 봉인했습니다</p><h1 class="stage-h">설명하기 전에, 이해를 한 번 꺼내 보세요.</h1>'
      + '<p class="sc-q"><b>자가진단</b> — ' + sc.q + '</p><div class="choice-row" id="scChoices">'
      + sc.options.map(function (o) {
          var cls = ans ? (o.v === sc.correct ? ' is-right' : (o.v === ans.picked ? ' is-wrong' : '')) : '';
          return '<button class="choice' + cls + '" data-v="' + o.v + '"' + (ans ? ' disabled' : '') + '><b>' + o.t + '</b></button>';
        }).join('') + '</div>'
      + (ans ? '<p class="sc-explain">' + (ans.correct ? '<b class="ok">맞아요.</b> ' : '<b class="no">다시 볼까요.</b> ') + sc.explain + '</p>' : '')
      + '<div class="step-actions"><button class="ghost-btn" id="checkBack">← CERL 수정</button>'
      + (ans && !ans.correct ? '<button class="ghost-btn" id="checkRevisit">그래프에서 다시 확인</button>' : '')
      + (ans ? '<button class="primary-btn" id="checkNext">전문가 예시와 비교 →</button>' : '') + '</div></section>');
    $('scChoices').querySelectorAll('[data-v]').forEach(function (btn) { btn.addEventListener('click', function () { onSelfCheck(btn, sc, m); }); });
    /* 5차 F03: CERL 수정으로 돌아갈 때 cerlStepById를 되돌리지 않아, 마지막 칸(한계)만
       열린 채로 '수정' 화면이 열렸다 — 학생이 주장·근거를 고치려 해도 그 칸에 닿지 못한다.
       editCerl(감사 화면)은 이미 0으로 되돌리고 있어 두 경로의 동작이 갈렸다. */
    $('checkBack').addEventListener('click', function () { state.cerlSubmitted[m.id] = false; state.cerlStepById[m.id] = 0; state.missionStep = 'write'; save(); renderMissionFlow(); });
    if ($('checkRevisit')) $('checkRevisit').addEventListener('click', function () { setMissionStep('explore'); });
    if ($('checkNext')) $('checkNext').addEventListener('click', function () { setMissionStep('expert'); });
  }

  function renderExpertStep(m, v) {
    setStage('<section class="card verdict-card expert-step-card">'
      + missionStepHeader(m, 'expert')
      + '<h1 class="stage-h">내 설명과 전문가 예시를 요소별로 비교하세요.</h1>'
      + studentCerlReviewHTML(m)
      + '<details class="expert-example" open><summary>전문가 CERL 전체 보기</summary><div class="expert-cerl">'
      + cerlHTML(v) + '</div></details>'
      + '<details class="expert-long"><summary>이 5년은 긴 흐름에서 어디일까?</summary>' + sparkBlock(state.city, state.metric) + '</details>'
      /* 5차 F14: 학습목표 ⑤(관측과 모형)만 필수 동선 밖에 있었다 — 유일한 시뮬레이션 자산인
         열관성 실험실이 여섯 곳의 '선택' 링크로만 열렸고, 완료 배지에도 ⑤가 없었다.
         계절 지연을 배운 직후가 '왜 그런가'를 모형으로 확인할 자리이므로,
         미션 5에서는 실험실을 한 번 열어 본 뒤에 감사·완료로 넘어가게 한다. */
      + (m.lagMode && !state.labSeen
          ? '<p class="optional-next"><b>다음은 왜 그런지 직접 계산해 봅니다.</b> 관측이 아니라 물리 법칙으로 계절을 만들어 보고, 열용량과 온실효과 중 무엇이 지연을 만드는지 확인해요.</p>'
          : '')
      + '<div class="step-actions"><button class="ghost-btn" id="expertBack">← 자가진단</button>'
      + '<button class="primary-btn" id="expertNext">'
      + (m.lagMode && !state.labSeen ? '🔬 열관성 실험실로 확인하기 →' : (m.askPost ? '다른 절기에 적용 →' : '감사하고 완료하기 →'))
      + '</button></div></section>');
    $('expertBack').addEventListener('click', function () { setMissionStep('check'); });
    $('expertNext').addEventListener('click', function () {
      if (m.lagMode && !state.labSeen) { renderLab(); return; }
      setMissionStep(m.askPost ? 'transfer' : 'audit');
    });
  }

  function postGrowthHTML() {
    var preRight = state.pre === PRE_QUESTION.correct, postRight = state.post === POST_QUESTION.correct, preUnsure = state.pre === 'c';
    var xfer = ' <small>(처서로 배운 것을 <b>입동</b>이라는 처음 보는 절기에 적용했는지를 본 문항입니다.)</small>';
    if (preUnsure && postRight) return '<b class="ok">확인했어요.</b> 처음엔 “잘 모르겠다”였는데, 이제 <b>다른 절기</b>에서도 절기(천문 날짜)와 기후(관측)를 구분해 설명했습니다.' + xfer;
    if (!preRight && postRight) return '<b class="ok">생각이 자랐어요.</b> 처음엔 다른 답을 골랐는데, 이제 <b>처음 보는 절기</b>에도 같은 구분을 적용했습니다.' + xfer;
    if (postRight) return '<b class="ok">정확합니다.</b> 절기 날짜는 그대로, 달라진 것은 그 무렵 관측된 기온 — 절기가 바뀌어도 일관되게 구분했습니다.' + xfer;
    return '핵심은 이것이에요: <b>절기 날짜는 그대로인데</b>, 같은 절기 무렵 관측된 기온이 달라진 것입니다. 절기 자체가 변한 것도, 날짜를 옮겨야 하는 것도 아닙니다.' + xfer;
  }

  function renderTransferStep(m) {
    var answered = state.post != null;
    setStage('<section class="card verdict-card transfer-step-card">'
      + missionStepHeader(m, 'transfer')
      + '<p class="eyebrow">한 번 더 · 다른 절기로 확인</p><h1 class="stage-h">처서에서 배운 구분을 입동에도 적용해 보세요.</h1>'
      + '<p class="sc-q">' + POST_QUESTION.q + '</p><div class="choice-col" id="postChoices">'
      + POST_QUESTION.options.map(function (o) {
          var cls = answered ? (o.v === POST_QUESTION.correct ? ' is-right' : (o.v === state.post ? ' is-wrong' : '')) : '';
          return '<button class="choice-lg' + cls + '" data-v="' + o.v + '"' + (answered ? ' disabled' : '') + '><b>' + o.t + '</b></button>';
        }).join('') + '</div>'
      + (answered ? '<p class="post-growth">' + postGrowthHTML() + '</p>' : '')
      + '<div class="step-actions"><button class="ghost-btn" id="transferBack">← 전문가 비교</button>'
      + (answered ? '<button class="primary-btn" id="transferNext">감사하고 완료하기 →</button>' : '') + '</div></section>');
    $('postChoices').querySelectorAll('[data-v]').forEach(function (btn) {
      btn.addEventListener('click', function () { state.post = btn.dataset.v; save(); renderTransferStep(m); });
    });
    $('transferBack').addEventListener('click', function () { setMissionStep('expert'); });
    if ($('transferNext')) $('transferNext').addEventListener('click', function () { setMissionStep('audit'); });
  }

  function renderAuditStep(m) {
    if (state.done.indexOf(m.id) === -1) { state.done.push(m.id); save(); }
    var next = state.mi + 1;
    setStage('<section class="card verdict-card audit-step-card">'
      + missionStepHeader(m, 'audit')
      + '<h1 class="stage-h">미션을 완료했습니다.</h1>'
      + '<p class="sub">핵심 학습은 끝났습니다. 내 CERL을 점검하거나 바로 다음 미션으로 갈 수 있습니다.</p>'
      + '<div class="judge-box"><p class="eyebrow">✦ 증거 감사관 · 선택 심화</p>'
      + '<label class="draft-label" for="freeDraft">내가 먼저 쓴 CERL <small>감사 기능은 이 글을 고쳐 쓰지 않고 과장 · 범위 · 인과만 점검합니다.</small></label>'
      + '<textarea id="freeDraft" maxlength="900" readonly aria-readonly="true"></textarea>'
      + '<div class="ai-row"><button class="ghost-btn small-btn" id="localAudit" type="button">기기 안에서 빠른 점검</button>'
      + '<button class="ghost-btn small-btn" id="editCerl" type="button">내 CERL 수정하기</button></div>'
      + '<div class="ai-consent"><label><input type="checkbox" id="aiConsent"> <span><b>선택 동의:</b> AI 감사를 요청하면 위 CERL과 화면의 관측 근거가 OpenAI API로 전송됩니다. 이름·학교·연락처는 입력하지 마세요.</span></label>'
      + '<button class="ai-btn" id="askAudit" disabled><span aria-hidden="true">✦</span> 외부 AI 감사 요청</button></div>'
      + '<p class="audit-status" id="auditStatus">기본 점검은 외부 전송 없이 이 기기에서 작동합니다. 외부 AI 감사는 동의한 경우에만 요청됩니다.</p>'
      + '<div class="audit-result" id="auditResult" hidden></div></div>'
      + (m.lagMode ? '<div class="optional-next"><p class="eyebrow">선택 확장</p><button class="ghost-btn" id="auditWinter">겨울·동지에도 적용해 보기</button> <button class="ghost-btn" id="auditLab">🔬 열관성 실험실</button></div>' : '')
      + '<div class="step-actions"><button class="ghost-btn" id="retry">기준 다시 조작하기 <small>(판정문은 유지)</small></button>'
      + (next < MISSIONS.length ? '<button class="primary-btn" id="nextMission">다음 미션 →</button>' : '<button class="primary-btn" id="toFree">검증 마치고 결과 받기 →</button>')
      + '</div></section>');
    renderProgress();
    var ta = $('freeDraft'); ta.value = state.missionDraft[m.id] || cerlText(m);
    $('localAudit').addEventListener('click', function () { renderAudit(localAudit(ta.value), true); $('auditStatus').textContent = '기기 안 규칙 점검 완료 — 글과 자료는 외부로 전송되지 않았습니다.'; });
    $('editCerl').addEventListener('click', function () { state.cerlSubmitted[m.id] = false; state.cerlStepById[m.id] = 0; setMissionStep('write'); });
    var consent = $('aiConsent'), ask = $('askAudit');
    consent.addEventListener('change', function () { ask.disabled = !consent.checked; });
    ask.addEventListener('click', function () { doAudit(); });
    $('retry').addEventListener('click', function () { setMissionStep('explore'); });
    if ($('nextMission')) $('nextMission').addEventListener('click', function () { startMission(next); });
    if ($('toFree')) $('toFree').addEventListener('click', renderComplete);
    if ($('auditLab')) $('auditLab').addEventListener('click', renderLab);
    if ($('auditWinter')) $('auditWinter').addEventListener('click', function () {
      state.lagSeason = 'winter'; state.markDoy = null; state.lagRevealed = false; state.ti = 23;
      delete state.predicts.lag; delete state.selfChecks.lag; state.missionStep = 'predict'; save(); renderMissionFlow();
    });
  }

  /* ---------- 완료 · 고향 기후 카드 ---------- */
  function renderComplete() {
    var missingCerl = MISSIONS.filter(function (m) { return !state.cerlSubmitted[m.id] || cerlErrors(m).length; });
    if (missingCerl.length) {
      /* 오래된 딥링크·손상된 저장 상태도 빈 산출물로 ‘완료’를 주장하지 못한다. */
      state.phase = 'mission';
      state.mi = MISSIONS.indexOf(missingCerl[0]);
      state.missionStep = 'write';
      save();
      renderVerdict();
      var ce = $('cerlError');
      if (ce) ce.textContent = '완료 기록을 만들려면 이 미션의 주장·근거·추론·한계를 먼저 작성해 주세요.';
      return;
    }
    state.phase = 'complete'; save();
    /* R4-P1-13: 예측·사전/사후 응답은 state에 다 있는데 '내 기록'에는 한 줄도 안 남았다.
       학습 증거가 산출물에 남지 않으면 "학습 효과를 어떻게 측정했나"에 답할 수 없다. */
    function optText(list, v) {
      for (var i = 0; i < list.length; i++) if (list[i].v === v) return list[i].t;
      return null;
    }
    var growth = '';
    if (state.lens && Object.keys(state.lens).length) {
      var ok = LENS.items.filter(function (it) { return state.lens[it.id] === it.k; }).length;
      growth += '<li><b>개념 분류(절기·날씨·기후)</b><br>' + ok + ' / ' + LENS.items.length + '문항 정확</li>';
    }
    if (state.pre != null) {
      var pt = optText(PRE_QUESTION.options, state.pre);
      var qt = state.post != null ? optText(POST_QUESTION.options, state.post) : null;
      growth += '<li class="rec-growth"><b>개념 문항</b><br>처음 생각(처서) — ' + escapeHTML(pt || '—')
        + (qt ? '<br>검증 뒤(입동, 다른 절기) — ' + escapeHTML(qt)
             + '<br><b>' + (state.post === POST_QUESTION.correct ? '배운 것을 다른 절기에 적용했습니다.' : '아직 절기와 기후를 섞어 설명하고 있어요.') + '</b>'
           : '') + '</li>';
    }
    var sc = growth + MISSIONS.map(function (m) {
      var s = state.selfChecks[m.id], parts = [];
      var a = missionAsk(m), pv = a.get();
      if (pv != null && a.options.length) {
        var pl = optText(a.options, pv);
        if (pl) parts.push('내 예측 “' + escapeHTML(pl) + '”');
      }
      if (m.lagMode && state.markDoy) {
        var Lg = lagOf(state.city), isS = state.lagSeason !== 'winter';
        var act = Lg ? (isS ? Lg.present.hotDoy : Lg.present.coldDoy) : null;
        if (act) {
          var raw = Math.abs(state.markDoy - act), off = Math.min(raw, 365 - raw);
          parts.push('내가 찍은 날 ' + doyStr(state.markDoy) + ' → 실제 ' + doyStr(act) + '(' + off + '일 차이)');
        }
      }
      parts.push(s ? (s.correct ? '자가진단 정답' : '자가진단 다시 확인') : '자가진단 미응답');
      return '<li><b>' + m.title + '</b><br>' + parts.join(' · ') + '</li>';
    }).join('');
    /* 5차 F14: 목표 ⑤을 실제로 수행했다는 기록이 내 기록에 없었다. 학습자가 고른 물리량과
       그때의 계절 지연을 남겨, 교사가 회수하는 산출물에 모형 실험이 드러나게 한다. */
    if (state.labSeen) {
      var LB = labState(), lsim = runEBM(LB.depth, LB.ghg, cityOf(LB.city).lat);
      sc += '<li><b>열관성 실험실 (목표 ⑤)</b><br>내가 고른 값 — 열을 머금는 두께 <b>' + num1(LB.depth) + 'm</b>'
        + ' · 대기가 가두는 열 <b>' + num1(LB.ghg) + ' W/m²</b> → 모형의 계절 지연 <b>' + lsim.lag + '일</b>'
        + ' · 연평균 <b>' + num1(lsim.mean) + '°C</b> (관측이 아니라 계산 결과)</li>';
    }
    var drafts = MISSIONS.filter(function (m) { return (state.missionDraft[m.id] || '').trim(); })
      .map(function (m) { return '<li><b>' + m.title + '</b><br>' + escapeHTML(state.missionDraft[m.id]) + '</li>'; }).join('');
    var yrs = D.cities['서울'].timeline.years;
    var completeStep = Math.max(0, Math.min(3, Number(state.completeStep) || 0));
    setStage('<section class="card done-card"><div class="burst" aria-hidden="true">✦</div><p class="eyebrow">' + MISSIONS.length + '개 미션 · CERL ' + MISSIONS.length + '편 완료</p>'
      + '<h1 class="stage-h">검증을 마쳤어요.</h1>'
      + '<p class="sub">자료를 보기 전에 예측하고, 기준을 직접 조작해 확인한 뒤, 미션마다 주장·근거·추론·한계를 스스로 작성했습니다.</p>'
      + '<div class="skill-row"><span>① 절기≠기후</span><span>② 자료의 범위</span><span>③ 기준 정의</span><span>④ 근거만큼 결론</span>'
      + (state.labSeen ? '<span>⑤ 관측과 모형</span>' : '') + '</div>'
      + '<nav class="panel-tabs" aria-label="완료 활동"><button data-complete-step="0" aria-current="' + (completeStep === 0 ? 'step' : 'false') + '">1. 내 기록</button>'
      + '<button data-complete-step="1" aria-current="' + (completeStep === 1 ? 'step' : 'false') + '">2. 기후 카드</button>'
      + '<button data-complete-step="2" aria-current="' + (completeStep === 2 ? 'step' : 'false') + '">3. 지구 맥락</button>'
      + '<button data-complete-step="3" aria-current="' + (completeStep === 3 ? 'step' : 'false') + '">4. 더 탐구하기</button></nav>'
      + '<div class="learning-panel" data-complete-panel="0"' + (completeStep === 0 ? '' : ' hidden') + '>'
      + '<div class="record"><p class="eyebrow">내 기록 <small>(수업에 제출할 때 아래 기록을 복사하거나 인쇄하세요)</small></p><ul class="rec-list">' + sc + '</ul>'
      + (drafts ? '<p class="eyebrow">내가 쓴 판정문</p><ul class="rec-list">' + drafts + '</ul>' : '')
      + '<p class="eyebrow">한 문장 정리</p><label class="draft-label" for="canDo">나는 이제 <b>___</b> 할 수 있다 <small>(수업에 제출할 때 함께 내세요)</small></label>'
      + '<textarea id="canDo" maxlength="200" placeholder="예: 나는 이제 ‘덥다’를 몇 도로 정하느냐에 따라 결론이 달라진다는 것을 자료로 보일 수 있다."></textarea>'
      + '</div>'
      /* 복사·인쇄 버튼을 .record 밖으로 뺀다 — 안에 두면 innerText에 버튼 라벨이 섞여 복사된다 */
      + '<div class="rec-actions"><button class="ghost-btn" id="copyRec">기록 복사</button><button class="ghost-btn" id="printRec">인쇄 / PDF로 저장</button><button class="primary-btn panel-next" data-complete-step="1">기후 카드 만들기 →</button></div></div>'
      + '<div class="learning-panel" data-complete-panel="1"' + (completeStep === 1 ? '' : ' hidden') + '>'
      + '<div class="cardmaker"><p class="eyebrow">내 고향 기후 카드 · 공유용</p>'
      + '<p class="cardmaker-sub">내가 태어난 무렵과 지금, 우리 지역 기후가 어떻게 달라졌는지 실측 자료로 확인하는 카드를 만들어요. (태어난 해 <b>±2년 평균</b>과 <b>최근 5년 평균</b>을 비교합니다 — 한 해만 비교하면 그 해 날씨에 휘둘리기 때문입니다.)</p>'
      + '<div class="cardmaker-row"><label>지역<select id="cardCity"></select></label><label>태어난 해<input id="cardYear" type="number" min="' + yrs[0] + '" max="' + yrs[yrs.length - 1] + '" value="2008" inputmode="numeric" /></label><button class="primary-btn" id="makeCard">카드 만들기</button></div>'
      + '<p class="card-hint" id="cardHint"></p>'
      + '<div id="cardPreview" class="card-preview" hidden></div><a id="cardSave" class="ghost-btn card-save" download="weather24_기후카드.png" hidden>이미지 저장 ↓</a></div>'
      + '<div class="step-actions"><button class="ghost-btn" data-complete-step="0">← 내 기록</button><button class="primary-btn" data-complete-step="2">지구 맥락 보기 →</button></div></div>'
      + '<div class="learning-panel" data-complete-panel="2"' + (completeStep === 2 ? '' : ' hidden') + '>'
      + '<p class="panel-kicker">지역 관측에서 지구 규모로</p><h2>같은 질문도 자료의 범위가 달라지면 답의 크기가 달라져요.</h2>'
      + '<details class="global-box" id="globalBox"><summary>🌍 이산화탄소와 지구 평균기온 자료 펼치기</summary><div id="globalMount"></div></details>'
      + '<div class="step-actions"><button class="ghost-btn" data-complete-step="1">← 기후 카드</button><button class="primary-btn" data-complete-step="3">더 탐구하기 →</button></div></div>'
      + '<div class="learning-panel" data-complete-panel="3"' + (completeStep === 3 ? '' : ' hidden') + '>'
      + '<p class="panel-kicker">선택 확장</p><h2>배운 검증 방법을 새로운 질문에 적용해 보세요.</h2>'
      + '<div class="done-next"><button class="ghost-btn" id="startLab">🔬 열관성 실험실 — 왜 그런지 직접 계산해 보기</button>'
      + '<button class="ghost-btn" id="startFree">내 지역·지표로 자유탐구 →</button></div>'
      + '<p class="intro-teacher"><a href="./교사_학습지.html" target="_blank" rel="noopener">📄 교사용 학습지 (인쇄용) →</a></p>'
      + '<div class="step-actions"><button class="ghost-btn" data-complete-step="2">← 지구 맥락</button></div></div></section>');
    $('cardCity').innerHTML = CITIES.map(function (c) { return '<option value="' + c + '"' + (c === state.city ? ' selected' : '') + '>' + c + ' (' + D.cities[c].station + ')</option>'; }).join('');
    /* 출생연도 ±2년 창이 '최근 5년' 창과 겹치면 차이가 0이 되므로 상한을 그 앞까지로 둔다 (RC-F) */
    function syncYearBounds() {
      /* 출생연도 ±2년 창이 '최근 5년' 창과 겹치면 안 된다. 5년 창 기준이면 상한은 length-8이다
         (예전 length-6은 2018–2022로 2년 겹치는데 UI는 '겹치지 않는 해만'이라고 단언했다). */
      var ys = cityOf($('cardCity').value).timeline.years, hi = ys[ys.length - 8] || ys[0];
      var el = $('cardYear'); el.min = ys[0]; el.max = hi;
      if (Number(el.value) > hi) el.value = hi;
      if (Number(el.value) < ys[0]) el.value = ys[0];
      $('cardHint').textContent = $('cardCity').value + '(' + cityOf($('cardCity').value).station + ') 관측소 · 고를 수 있는 해: ' + ys[0] + '~' + hi + ' (최근 5년과 겹치지 않는 해만 비교할 수 있어요)';
    }
    $('cardCity').addEventListener('change', syncYearBounds); syncYearBounds();
    $('makeCard').addEventListener('click', function () {
      var city = $('cardCity').value, ys = cityOf(city).timeline.years, hi = ys[ys.length - 8] || ys[0];
      var y = Math.max(ys[0], Math.min(hi, Number($('cardYear').value) || 2008));
      $('cardYear').value = y;
      var cv = makeCard(city, y);
      var prev = $('cardPreview'); prev.hidden = false; prev.innerHTML = ''; cv.className = 'card-canvas'; prev.appendChild(cv);
      cv.toBlob(function (blob) { var a = $('cardSave'); if (a.href) URL.revokeObjectURL(a.href); a.href = URL.createObjectURL(blob); a.hidden = false; }, 'image/png');
    });
    var cd = $('canDo');
    if (cd) { cd.value = state.canDo || ''; cd.addEventListener('input', function () { state.canDo = cd.value.slice(0, 200); save(); }); }
    /* R4-P2: 예전에는 Promise 거부를 못 잡아 실패해도 "복사했어요 ✓"가 떴고 라벨이 원복되지 않았다.
       같은 파일의 copyLink()가 이미 올바른 패턴을 쓰고 있으므로 그것을 따른다. */
    $('copyRec').addEventListener('click', function () {
      var b = $('copyRec'), orig = b.textContent;
      var rec = stage.querySelector('.record');
      var txt = rec ? rec.innerText : '';
      if (cd && cd.value.trim()) txt += '\n나는 이제 ' + cd.value.trim();
      function done(msg) { b.textContent = msg; setTimeout(function () { b.textContent = orig; }, 1800); }
      try {
        navigator.clipboard.writeText(txt).then(function () { done('복사했어요 ✓'); },
          function () { done('복사가 안 돼요 — 직접 선택해 복사하세요'); });
      } catch (e) { done('복사가 안 돼요 — 직접 선택해 복사하세요'); }
    });
    $('printRec').addEventListener('click', function () { window.print(); });
    $('startFree').addEventListener('click', renderFree);
    if ($('startLab')) $('startLab').addEventListener('click', renderLab);
    bindPanelTabs('complete', 4);
    var gb = $('globalBox');
    if (gb) gb.addEventListener('toggle', function () { if (gb.open) renderGlobal(); });
  }

  function bindPanelTabs(kind, count) {
    var key = kind + 'Step';
    if (kind === 'free') key = 'freeTab';
    if (kind === 'lab') key = 'labTab';
    var buttons = stage.querySelectorAll('[data-' + kind + '-step]');
    var tabButtons = stage.querySelectorAll('.panel-tabs [data-' + kind + '-step]');
    var panels = stage.querySelectorAll('[data-' + kind + '-panel]');
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        var next = Math.max(0, Math.min(count - 1, Number(button.dataset[kind + 'Step']) || 0));
        state[key] = next; save();
        panels.forEach(function (panel) { panel.hidden = Number(panel.dataset[kind + 'Panel']) !== next; });
        tabButtons.forEach(function (item) {
          item.setAttribute('aria-current', Number(item.dataset[kind + 'Step']) === next ? 'step' : 'false');
        });
        var active = stage.querySelector('[data-' + kind + '-panel="' + next + '"]');
        if (active) {
          active.setAttribute('tabindex', '-1');
          active.focus({ preventScroll: true });
          var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          active.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        }
        if (kind === 'complete' && next === 2) {
          var globalBox = $('globalBox');
          if (globalBox && globalBox.open) renderGlobal();
        }
      });
    });
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
  /* R4-P1-2: 끝단에서는 중심평균을 쓸 수 없다. meanAround(vals, last, 2)는 상한이 잘려
     마지막 3년만 평균하는데 카드에는 '최근 5년(2021–2025)'이라고 인쇄했다.
     16지점 전부 온난화 방향으로 과대했고(+0.18~+0.37℃), 2008년생 서울 카드는
     ΔT를 +1.2℃가 아니라 +1.5℃로 출하했다 — 25% 부풀린 값이 '기상청 ASOS 실측'
     표기를 달고 PNG로 공유된다. 끝단은 후행 n년 평균으로 계산한다. */
  function meanTrailing(vals, endIdx, n) {
    var a = [];
    for (var i = Math.max(0, endIdx - n + 1); i <= endIdx; i++) if (vals[i] != null) a.push(vals[i]);
    return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null;
  }
  function makeCard(city, year) {
    var tl = cityOf(city).timeline, ys = tl.years, temps = tl.temp, last = ys.length - 1;
    var bi = ys.indexOf(year); if (bi < 0) bi = year <= ys[0] ? 0 : last;
    var tBirth = meanAround(temps, bi, 2), tNow = meanTrailing(temps, last, 5);
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
      g += '<line x1="' + L + '" y1="' + y(c).toFixed(1) + '" x2="' + (W - R) + '" y2="' + y(c).toFixed(1) + '" stroke="rgba(var(--line-rgb),.12)"/>'
        + '<text x="6" y="' + (y(c) + 4).toFixed(1) + '" font-size="11" fill="var(--muted2)">' + Math.round(c) + '</text>';
    });
    [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1].forEach(function (i) {
      g += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 7) + '" font-size="11" fill="var(--muted2)" text-anchor="middle">' + dates[i].slice(0, 4) + '</text>';
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="마우나로아 대기 중 이산화탄소 농도, ' + dates[0] + ' ' + v[0].toFixed(1) + 'ppm에서 ' + dates[n - 1] + ' ' + v[n - 1].toFixed(1) + 'ppm까지 증가. 해마다 오르내리는 톱니 모양이 함께 나타난다." class="gsvg">'
      + g + '<path d="' + d + '" fill="none" stroke="var(--green)" stroke-width="1.6"/>'
      + '<text x="' + (W - R) + '" y="' + (y(v[n - 1]) - 8).toFixed(1) + '" font-size="12.5" font-weight="800" fill="var(--green)" text-anchor="end">' + v[n - 1].toFixed(1) + ' ppm</text>'
      + '<text x="' + (L + 6) + '" y="' + (y(v[0]) + 16).toFixed(1) + '" font-size="12" fill="var(--muted2)">' + v[0].toFixed(1) + ' ppm</text></svg>';
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
      g += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 7) + '" font-size="11" fill="var(--muted2)" text-anchor="middle">' + rows[i].year + '</text>';
    });
    g += '<text x="6" y="' + (T + 10) + '" font-size="11" fill="var(--green)">ppm</text>'
      + '<text x="' + (W - 40) + '" y="' + (T + 10) + '" font-size="11" fill="var(--coral)">°C</text>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + rows[0].year + '년부터 ' + rows[n - 1].year + '년까지 이산화탄소 농도와 전지구 기온 이상이 함께 오르는 모습" class="gsvg">'
      + g + '<path d="' + dc + '" fill="none" stroke="var(--green)" stroke-width="2"/>'
      + '<path d="' + dt + '" fill="none" stroke="var(--coral)" stroke-width="2"/></svg>';
  }

  function globalSourceHTML(g) {
    var seen = {}, rows = [];
    [g.combined, g.keeling].forEach(function (o) {
      var ss = o && o.meta && o.meta.sources;
      if (!ss) return;
      ss.forEach(function (s) {
        var name = typeof s === 'string' ? s : s.name;
        if (!name || seen[name]) return;
        seen[name] = 1;
        rows.push('<li>' + escapeHTML(name)
          + (s.license ? ' — <b>' + escapeHTML(s.license) + '</b>' : '')
          + (s.url ? ' <a href="' + escapeHTML(s.url) + '" target="_blank" rel="noopener">원본 ↗</a>' : '') + '</li>');
      });
    });
    var comp = g.combined && g.combined.meta && g.combined.meta.completeness;
    if (!rows.length) return '';
    return '<div class="global-src"><p class="gs-h">이 화면의 자료 출처</p><ul>' + rows.join('') + '</ul>'
      + (comp ? '<p class="gs-note">' + escapeHTML(comp) + ' — 한국 자료에 적용한 <b>완결 연도 규칙</b>을 전지구 자료에도 똑같이 적용했습니다.</p>' : '')
      + '</div>';
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
        + '<p class="global-p">1958년부터 이어 온 NOAA의 장기 월별 기록입니다. 현장 관측을 기본으로 하되, 관측 공백에는 품질관리·보간값과 대체 관측소 자료가 포함될 수 있어요. <b>' + first.toFixed(1) + ' ppm → ' + last.toFixed(1) + ' ppm</b>으로 올랐습니다.</p>'
        + keelingSVG(k)
        + '<p class="global-note"><b>톱니 모양이 보이나요?</b> 해마다 오르내리는 이 주기는 <b>북반구 식물</b> 때문이에요. 봄·여름에 잎이 자라며 이산화탄소를 빨아들이고, 가을·겨울에 잎이 지며 내놓습니다. '
        + '<b>지구가 1년에 한 번 숨을 쉬는 리듬</b>이고, 조상들이 24절기로 나눈 바로 그 1년의 리듬입니다.</p>'
        + '<h3 class="global-h">② 이산화탄소와 전지구 기온</h3>'
        + '<p class="global-p">' + r0.year + '년부터 ' + r1.year + '년까지, 이산화탄소는 <b>' + Math.round(r0.co2_ppm) + ' → ' + Math.round(r1.co2_ppm) + ' ppm</b>, '
        + '전지구 평균기온 이상은 <b>' + r0.temp_anomaly_C.toFixed(2) + '°C → ' + r1.temp_anomaly_C.toFixed(2) + '°C</b>로 <b>함께</b> 올랐습니다.</p>'
        + dualSVG(c)
        + '<div class="global-legend"><span><i style="background:var(--green)"></i> CO₂ 농도(ppm)</span><span><i style="background:var(--coral)"></i> 전지구 기온 이상(°C)</span></div>'
        + '<p class="global-warn"><b>여기서 멈춰야 하는 지점</b> 두 선이 함께 움직인다는 것(설명력 r² = ' + (rel.r2 != null ? rel.r2 : '—') + ')은 <b>상관</b>입니다. '
        + '그래프 두 개가 닮았다는 사실만으로는 <b>어느 쪽이 원인인지 증명되지 않습니다.</b> 원인을 말하려면 기체가 열을 가두는 <b>물리 실험</b>과 <b>기후 모델</b> 같은 다른 종류의 증거가 필요해요 — '
        + '그 증거들까지 합쳐서 IPCC는 인간 활동이 온난화의 주된 원인이라고 결론지었습니다.</p>'
        + '<p class="global-link">앞에서 본 <b>' + state.city + '의 기록</b>은 이 큰 흐름 속의 <b>한 점</b>입니다. 한 지점의 5년으로 지구를 말할 수 없고, 지구의 평균으로 우리 동네의 처서를 말할 수도 없어요 — '
        + '<b>자료마다 말할 수 있는 범위가 다르다</b>는 것, 그게 이 수업의 마지막 배움입니다.</p>'
        /* R4-P1-15: 이 패널에만 출처가 한 글자도 없었다. OWID는 CC BY 4.0이라 저작자표시가
           의무이고, README §7 약속6("모든 화면에 출처")의 반례이기도 했다.
           데이터 파일의 meta.sources를 읽어 렌더한다 — 하드코딩하면 자료를 갈 때 또 어긋난다. */
        + globalSourceHTML(g);
    });
  }

  /* ================================================================
     열관성 실험실 — 에너지 균형 모형 (R4: '데이터 뷰어 아닌가'에 대한 답)

     이 화면만은 관측 자료를 그리지 않는다. 물리 법칙 하나로 기온을 '계산'한다.

         C · dT/dt  =  흡수 일사 Q(날짜, 위도)  −  나가는 열 (A + B·T)

     학습자가 조작하는 것은 필터가 아니라 물리량이다 —
       ① 열을 머금는 층의 두께 C  → 지연과 진폭이 함께 바뀐다
       ② 온실효과(A 감소)         → 곡선은 올라가는데 지연은 그대로다

     ②가 이 화면의 핵심이다. 미션 5는 "계절 지연은 기후변화가 아니다"를
     관측으로 보여 주지만, 왜 그런지는 말로만 설명했다. 여기서는 학습자가
     온실효과 슬라이더를 끝까지 올려도 극값일이 움직이지 않는 것을 직접 본다.
     주장을 모형이 증명하는 것과 문장이 주장하는 것은 다르다.
     ================================================================ */

  /* --- 천문: 태양 적위·거리 (Spencer 1971 푸리에 근사) — 관측이 아니라 계산이다 --- */
  function solarDecl(doy) {
    var g = 2 * Math.PI * (doy - 1) / 365;
    return 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
         - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
         - 0.002697 * Math.cos(3 * g) + 0.001480 * Math.sin(3 * g);
  }
  function orbitFactor(doy) {
    var g = 2 * Math.PI * (doy - 1) / 365;
    return 1.00011 + 0.034221 * Math.cos(g) + 0.001280 * Math.sin(g)
         + 0.000719 * Math.cos(2 * g) + 0.000077 * Math.sin(2 * g);
  }
  /* 위도 lat에서 하루 평균 대기 상단 일사량(W/m²) */
  function insolation(doy, lat) {
    var S0 = 1361, p = lat * Math.PI / 180, d = solarDecl(doy);
    var x = -Math.tan(p) * Math.tan(d);
    var h0 = x <= -1 ? Math.PI : (x >= 1 ? 0 : Math.acos(x));
    return S0 / Math.PI * orbitFactor(doy)
         * (h0 * Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.sin(h0));
  }

  /* 모형 상수. B는 복사 냉각과 대기의 열 수송을 하나로 묶은 감쇠 계수다.
     A는 서울(37.57°N)·두께 5m에서 연평균 12.5℃·지연 40일이 나오도록 맞췄고,
     그 조합이 실제 서울 평년(지연 40일, 최고 29.4℃)과 겹친다. */
  var EBM = { albedo: 0.30, B: 5.2, A: 172, rho_c: 4.18e6 };

  var labCache = {};
  function runEBM(depth, ghg, lat) {
    var key = depth.toFixed(2) + '|' + ghg + '|' + lat.toFixed(2);
    if (labCache[key]) return labCache[key];
    var Q = new Array(365), i;
    for (i = 0; i < 365; i++) Q[i] = insolation(i + 1, lat) * (1 - EBM.albedo);
    var C = EBM.rho_c * depth, A = EBM.A - ghg, T = 10, out = new Array(365);
    /* 40년 스핀업 — 초기값을 잊고 주기해로 수렴시킨다(두꺼운 층일수록 오래 걸린다) */
    for (var s = 0; s < 40; s++) {
      for (i = 0; i < 365; i++) {
        T += 86400 * (Q[i] - (A + EBM.B * T)) / C;
        if (s === 39) out[i] = T;
      }
    }
    var mx = -1e9, mn = 1e9, hi = 0, lo = 0, sum = 0;
    for (i = 0; i < 365; i++) {
      sum += out[i];
      if (out[i] > mx) { mx = out[i]; hi = i; }
      if (out[i] < mn) { mn = out[i]; lo = i; }
    }
    var r = { curve: out, hotDoy: hi + 1, coldDoy: lo + 1,
              lag: ((hi + 1) - 172 + 365) % 365,
              coldLag: ((lo + 1) - 356 + 365) % 365,
              max: mx, min: mn, mean: sum / 365, amp: (mx - mn) / 2 };
    labCache[key] = r;
    return r;
  }

  /* 실측 평년 곡선과의 평균절대오차 — '내 모형이 실제와 얼마나 맞는가' */
  function labFit(sim, city) {
    var obs = cityOf(city).temp.present, s = 0;
    for (var i = 0; i < 365; i++) s += Math.abs(sim[i] - obs[i]);
    return s / 365;
  }
  /* 실측과 가장 잘 맞는 두께 — 학습자가 찾은 값과 비교해 준다 */
  function labBestDepth(city) {
    var lat = cityOf(city).lat, best = null;
    for (var d = 5; d <= 300; d += 5) {          // 0.5m ~ 30m를 0.5m 간격으로
      var dep = d / 10, f = labFit(runEBM(dep, labState().ghg, lat).curve, city);
      if (!best || f < best.fit) best = { depth: dep, fit: f };
    }
    return best;
  }

  function labState() {
    if (!state.lab || typeof state.lab !== 'object') state.lab = {};
    var L = state.lab;
    if (!(L.depth >= 0.5 && L.depth <= 60)) L.depth = 2;
    if (!(L.ghg >= 0 && L.ghg <= 12)) L.ghg = 0;
    if (CITIES.indexOf(L.city) === -1) L.city = state.city;
    L.showObs = L.showObs !== false;
    return L;
  }

  var LAB_PRESETS = [
    { v: 0.5, t: '메마른 땅 0.5m', s: '사막·아스팔트' },
    { v: 2, t: '내륙 2m', s: '땅이 얕게 데워짐' },
    { v: 5, t: '한반도 5m', s: '땅 + 얕은 바다' },
    { v: 15, t: '연안 15m', s: '바다의 영향이 큼' },
    { v: 50, t: '대양 50m', s: '깊은 혼합층' }
  ];

  function renderLab() {
    /* 5차 F04: 복귀 버튼이 진입 위치와 무관하게 항상 미션 5를 새로 시작했다.
       완료 화면에서 실험실에 들어갔다 나오면 완료 화면이 사라지고(startMission이
       state.phase를 'mission'으로 되돌린다) 되돌아가려면 미션 5를 다시 통과해야 했다.
       인트로에서 들어가면 미션 1~4를 건너뛴 채 미션 5로 떨어졌다.
       실험실은 여섯 곳에서 열리므로, 들어온 자리를 기억해 그 자리로 되돌린다. */
    if (state.phase !== 'lab') {
      state.labFrom = { phase: state.phase, mi: state.mi, missionStep: state.missionStep, introStep: state.introStep };
    }
    /* 목표 ⑤을 실제로 밟았다는 기록. 미션 5의 감사·완료 관문이 이 값을 본다(5차 F14). */
    state.labSeen = true;
    state.phase = 'lab'; document.body.classList.remove('lag-mode'); save();
    var L = labState();
    var labTab = Math.max(0, Math.min(3, Number(state.labTab) || 0));
    setStage('<section class="card lab-card">'
      + '<h1 class="hero-headline">왜 가장 더운 날이 하지가 아닐까 — 직접 계산해 보기</h1>'
      + '<div class="mhead"><span class="mno">열관성 실험실</span>'
      + '<span class="goal-chip">목표 ① 계절 지연을 만들 수 있는 <b>메커니즘</b> 시험</span>'
      + '<span class="time-chip">핵심 <b>3분</b></span></div>'
      + '<nav class="panel-tabs" aria-label="열관성 실험 단계"><button data-lab-step="0" aria-current="' + (labTab === 0 ? 'step' : 'false') + '">1. 모형 이해</button>'
      + '<button data-lab-step="1" aria-current="' + (labTab === 1 ? 'step' : 'false') + '">2. 조건 조작</button>'
      + '<button data-lab-step="2" aria-current="' + (labTab === 2 ? 'step' : 'false') + '">3. 결과 해석</button>'
      + '<button data-lab-step="3" aria-current="' + (labTab === 3 ? 'step' : 'false') + '">4. 한계 확인</button></nav>'
      + '<div class="learning-panel" data-lab-panel="0"' + (labTab === 0 ? '' : ' hidden') + '>'
      + '<p class="lab-warn"><span aria-hidden="true">🔬</span> <b>이 화면의 파란 곡선만은 관측 자료가 아닙니다.</b> '
      + '햇빛이 들어오고 열이 빠져나가는 <b>물리 법칙 하나</b>로 계산한 결과예요. '
      + '앞의 미션들이 “실제로 이랬다”를 보여 줬다면, 여기서는 <b>“왜 그런지”</b>를 직접 만들어 봅니다.</p>'
      + '<div class="eqn-card"><p class="eqn-h">모형은 이 한 줄이 전부입니다</p>'
      + '<p class="eqn"><b class="eq-c">열을 머금는 양 C</b> × <b>기온 변화</b> = '
      + '<b class="eq-q">들어오는 햇빛 Q</b><small>(날짜·위도로 계산)</small> − <b class="eq-o">나가는 열</b><small>(A + B×기온)</small></p>'
      + '<p class="eqn-s">들어오는 열이 나가는 열보다 많으면 기온이 오르고, 반대면 내려갑니다. 그것뿐이에요.</p></div>'
      + '<div class="step-actions"><button class="primary-btn" data-lab-step="1">조건을 바꿔 보기 →</button></div></div>'
      + '<div class="learning-panel" data-lab-panel="1"' + (labTab === 1 ? '' : ' hidden') + '>'
      + '<div class="picker"><div class="picker-block"><span class="picker-label">비교할 실측 지역 <small>(위도가 바뀌면 햇빛의 양도 바뀝니다)</small></span>'
      + '<div class="chips" id="labChips" role="tablist" aria-label="비교 지역"></div></div></div>'
      + '<div class="chart-card">'
      + '<p class="live-nums" id="labNums" aria-live="polite"></p>'
      + '<svg id="labSvg" viewBox="0 0 720 320" role="img" aria-label="모형이 계산한 연간 기온 곡선"></svg>'
      + '<div class="range-row"><span id="labDepthLabel">유효 열용량 깊이<b class="basis">(실제 수심 아님 · 클수록 천천히 데워짐)</b></span>'
      + '<button class="step-btn" id="labDepthDown" type="button" aria-label="유효 깊이 줄이기">−</button>'
      + '<input id="labDepth" type="range" min="5" max="600" step="5" value="' + Math.round(L.depth * 10) + '" aria-label="유효 열용량 깊이(m)" />'
      + '<button class="step-btn" id="labDepthUp" type="button" aria-label="유효 깊이 늘리기">+</button>'
      + '<output id="labDepthOut"></output></div>'
      + '<div class="presets" id="labPresets" aria-label="자주 쓰는 유효 깊이"></div>'
      + '<div class="range-row lab-ghg"><span>온실효과<b class="basis">(대기가 가두는 열 · W/m²)</b></span>'
      + '<button class="step-btn" id="labGhgDown" type="button" aria-label="온실효과 줄이기">−</button>'
      + '<input id="labGhg" type="range" min="0" max="12" step="1" value="' + L.ghg + '" aria-label="온실효과 세기(W/m²)" />'
      + '<button class="step-btn" id="labGhgUp" type="button" aria-label="온실효과 늘리기">+</button>'
      + '<output id="labGhgOut"></output></div>'
      + '<div class="chart-legend"><span><i class="lg lg-sim"></i> 모형이 계산한 기온</span>'
      + '<span><i class="lg lg-now"></i> 실측 평년(' + PERIOD_NOW + ')</span>'
      + '<span><i class="lg lg-term"></i> 하지(고정)</span></div>'
      + '</div>'
      + '<div class="readouts" id="labReadouts"></div>'
      + '<div class="step-actions"><button class="ghost-btn" data-lab-step="0">← 모형 이해</button><button class="primary-btn" data-lab-step="2">결과 해석하기 →</button></div></div>'
      + '<div class="learning-panel" data-lab-panel="2"' + (labTab === 2 ? '' : ' hidden') + '>'
      + '<p class="panel-kicker">내 조작이 만든 결과</p><div class="lab-findings" id="labFindings"></div>'
      + '<div class="step-actions"><button class="ghost-btn" data-lab-step="1">← 조건 조작</button><button class="primary-btn" data-lab-step="3">모형의 한계 확인 →</button></div></div>'
      + '<div class="learning-panel" data-lab-panel="3"' + (labTab === 3 ? '' : ' hidden') + '>'
      + '<div class="lab-actions"><button class="primary-btn" id="labBack">← 미션으로 돌아가기</button>'
      + '<button class="ghost-btn" id="labFree">자유탐구로 →</button></div>'
      + '<details class="method" open><summary>이 모형은 무엇을 단순화했나 <small>(반드시 함께 읽어 주세요)</small></summary>'
      + '<div class="method-body">'
      + '<p><b>이건 모형이지 관측이 아닙니다.</b> 실제 기후는 바람·구름·해류·지형이 함께 만듭니다. 이 모형에는 그 어느 것도 없습니다.</p>'
      + '<ol>'
      + '<li><b>0차원</b>입니다 — 한 지점을 열을 머금는 <b>물통 하나</b>로 봅니다. 옆에서 바람이 실어 오는 열은 없습니다.</li>'
      + '<li><b>나가는 열을 직선으로 근사</b>했습니다(A + B×기온). 실제 복사는 T⁴에 비례하고, 대기의 열 수송도 함께 일어납니다. 두 가지를 <b>감쇠 계수 B 하나</b>로 묶었습니다(B = ' + EBM.B + ' W/m²/K).</li>'
      + '<li><b>구름·눈·알베도 변화가 없습니다.</b> 햇빛 반사율을 ' + EBM.albedo + '로 고정했습니다.</li>'
      + '<li>그래서 <b>맞히는 것은 계절의 리듬(지연과 진폭)</b>이고, 특정 해의 날씨나 정확한 기온값이 아닙니다.</li>'
      + '<li>그런데도 <b>서울에서 유효 깊이 5m를 넣으면 지연 40일 · 최고 28℃</b>가 나옵니다 — 실측(40일 · 29.4℃)과 거의 같습니다. 이것은 원인을 확정한 결과가 아니라, <b>단순한 모형이 큰 그림을 재현할 수 있는지 본 적합 사례</b>입니다.</li>'
      + '</ol>'
      + '<p><b>햇빛 Q의 출처</b> 관측이 아니라 천문 계산입니다 — 태양 적위와 지구–태양 거리(Spencer 1971 근사)로 위도별 하루 평균 일사량을 구했습니다. 태양상수 1361 W/m².</p>'
      + '</div></details>'
      + '<div class="step-actions"><button class="ghost-btn" data-lab-step="2">← 결과 해석</button></div></div></section>');
    bindLabChips();
    renderLabPresets();
    bindLabControls();
    drawLab();
    bindPanelTabs('lab', 4);
    $('labBack').addEventListener('click', function () {
      var f = state.labFrom;
      state.labFrom = null;
      /* 들어온 자리로 되돌린다. 미션 도중이었으면 그 미션의 그 단계로,
         완료·자유탐구·인트로였으면 그 화면으로. 기록이 없을 때만 미션 5를 연다. */
      if (f && f.phase === 'complete') { state.phase = 'complete'; save(); renderComplete(); return; }
      if (f && f.phase === 'free') { state.phase = 'free'; save(); renderFree(); return; }
      if (f && f.phase === 'intro') { state.phase = 'intro'; save(); f.introStep === 'method' ? renderIntroMethod() : renderIntro(); return; }
      if (f && f.phase === 'mission' && MISSIONS[f.mi]) {
        state.phase = 'mission'; state.mi = f.mi; state.missionStep = f.missionStep || 'orient'; save(); renderMissionFlow(); return;
      }
      var i = MISSIONS.map(function (m) { return m.id; }).indexOf('lag');
      startMission(i < 0 ? 0 : i);
    });
    $('labFree').addEventListener('click', renderFree);
  }

  function bindLabChips() {
    var el = $('labChips'); if (!el) return;
    var L = labState();
    el.innerHTML = CITIES.map(function (c) {
      var s = D.cities[c];
      return '<button class="chip' + (c === L.city ? ' is-on' : '') + '" role="tab" aria-selected="' + (c === L.city)
        + '" data-labcity="' + c + '"><b>' + c + '</b><small>' + s.lat.toFixed(1) + '°N</small></button>';
    }).join('');
    el.querySelectorAll('[data-labcity]').forEach(function (b) {
      b.addEventListener('click', function () {
        labState().city = b.dataset.labcity; save();
        refreshChipsOn(el, 'labcity', b.dataset.labcity);
        drawLab();
      });
    });
    var on = el.querySelector('.is-on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  function renderLabPresets() {
    var el = $('labPresets'); if (!el) return;
    el.innerHTML = LAB_PRESETS.map(function (p) {
      return '<button class="preset" type="button" data-labdepth="' + p.v + '"><b>' + p.t + '</b><small>' + p.s + '</small></button>';
    }).join('');
    el.querySelectorAll('[data-labdepth]').forEach(function (b) {
      b.addEventListener('click', function () { setLabDepth(Number(b.dataset.labdepth)); });
    });
  }
  function setLabDepth(v) {
    var L = labState();
    L.depth = Math.max(0.5, Math.min(60, v));
    L.touched = true; save();
    var r = $('labDepth'); if (r) r.value = Math.round(L.depth * 10);
    drawLab();
  }
  function setLabGhg(v) {
    var L = labState();
    L.ghg = Math.max(0, Math.min(12, Math.round(v)));
    L.touched = true; save();
    var r = $('labGhg'); if (r) r.value = L.ghg;
    drawLab();
  }
  function bindLabControls() {
    var d = $('labDepth'), g = $('labGhg');
    if (d) d.addEventListener('input', function () { setLabDepth(Number(d.value) / 10); });
    if (g) g.addEventListener('input', function () { setLabGhg(Number(g.value)); });
    if ($('labDepthDown')) $('labDepthDown').addEventListener('click', function () { setLabDepth(labState().depth - 0.5); });
    if ($('labDepthUp')) $('labDepthUp').addEventListener('click', function () { setLabDepth(labState().depth + 0.5); });
    if ($('labGhgDown')) $('labGhgDown').addEventListener('click', function () { setLabGhg(labState().ghg - 1); });
    if ($('labGhgUp')) $('labGhgUp').addEventListener('click', function () { setLabGhg(labState().ghg + 1); });
  }

  function drawLab() {
    var svg = $('labSvg'); if (!svg) return;
    var L = labState(), c = cityOf(L.city);
    var sim = runEBM(L.depth, L.ghg, c.lat);
    var obs = c.temp.present;
    var W2 = 720, H2 = 320, L2 = 46, R2 = 16, T2 = 22, B2 = 30;
    var all = sim.curve.concat(obs);
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var pad = (hi - lo) * 0.10 || 1; lo -= pad; hi += pad;
    function x(i) { return L2 + i / 364 * (W2 - L2 - R2); }
    function y(v) { return T2 + (hi - v) / (hi - lo) * (H2 - T2 - B2); }
    function path(a) { var s = ''; for (var i = 0; i < 365; i++) s += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(a[i]).toFixed(1); return s; }
    var g = '';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      var v = lo + (hi - lo) * f, yy = y(v);
      g += '<line x1="' + L2 + '" y1="' + yy.toFixed(1) + '" x2="' + (W2 - R2) + '" y2="' + yy.toFixed(1)
        + '" stroke="rgba(var(--line-rgb),' + (f === 0 || f === 1 ? '.2' : '.11') + ')"/>'
        + '<text x="6" y="' + (yy + 4).toFixed(1) + '" fill="var(--muted2)" font-size="11">' + (Math.round(v * 10) / 10) + (f === 1 ? '℃' : '') + '</text>';
    });
    var narrow = window.innerWidth && window.innerWidth < 620;
    (narrow ? [1, 3, 5, 7, 9, 11] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).forEach(function (m) {
      var i = CUM[m - 1];
      g += '<text x="' + x(i + 14).toFixed(1) + '" y="' + (H2 - 9) + '" fill="var(--muted2)" font-size="11" text-anchor="middle">' + m + '월</text>';
    });
    /* 하지선 — 라벨은 좌우 어디에 둘지 계산해 잘리지 않게 한다 */
    var sx = x(171);
    g += '<line x1="' + sx.toFixed(1) + '" y1="' + T2 + '" x2="' + sx.toFixed(1) + '" y2="' + (H2 - B2) + '" stroke="var(--sun)" stroke-width="1.7" stroke-dasharray="4 3"/>'
      + '<text x="' + (sx + 5).toFixed(1) + '" y="' + (T2 + 11) + '" fill="var(--sun)" font-size="11.5">하지 6/21 · 햇빛이 가장 강한 날</text>';
    if (L.showObs) {
      g += '<path d="' + path(obs) + '" fill="none" stroke="var(--coral)" stroke-width="2" stroke-dasharray="5 4"/>';
    }
    g += '<path d="' + path(sim.curve) + '" fill="none" stroke="var(--sky)" stroke-width="2.8"/>';
    /* 모형의 극값일 마커 + 지연 브래킷 */
    var hx = x(sim.hotDoy - 1), hy = y(sim.curve[sim.hotDoy - 1]);
    g += '<circle cx="' + hx.toFixed(1) + '" cy="' + hy.toFixed(1) + '" r="8" fill="var(--sky)" stroke="var(--ink-on-accent)" stroke-width="1.8"/>';
    var lx = hx > W2 - 120 ? hx - 8 : hx + 8, anch = hx > W2 - 120 ? 'end' : 'start';
    g += '<text x="' + lx.toFixed(1) + '" y="' + (hy - 12).toFixed(1) + '" fill="var(--on-sky)" font-size="12.5" font-weight="800" text-anchor="' + anch + '">모형의 가장 더운 날 ' + doyStr(sim.hotDoy) + '</text>';
    var x1 = Math.min(sx, hx), x2 = Math.max(sx, hx), my = T2 + 34;
    if (x2 - x1 > 14) {
      g += '<line x1="' + x1.toFixed(1) + '" y1="' + my + '" x2="' + x2.toFixed(1) + '" y2="' + my + '" stroke="var(--green)" stroke-width="1.6"/>'
        + '<line x1="' + x1.toFixed(1) + '" y1="' + (my - 5) + '" x2="' + x1.toFixed(1) + '" y2="' + (my + 5) + '" stroke="var(--green)" stroke-width="1.6"/>'
        + '<line x1="' + x2.toFixed(1) + '" y1="' + (my - 5) + '" x2="' + x2.toFixed(1) + '" y2="' + (my + 5) + '" stroke="var(--green)" stroke-width="1.6"/>'
        + '<text x="' + ((x1 + x2) / 2).toFixed(1) + '" y="' + (my - 8) + '" fill="var(--green)" font-size="12.5" font-weight="800" text-anchor="middle">' + sim.lag + '일 늦다</text>';
    }
    svg.innerHTML = g;
    svg.setAttribute('aria-label', '유효 열용량 깊이 ' + num1(L.depth) + '미터, 온실효과 ' + L.ghg + '와트 모형. 가장 더운 날 '
      + doyStr(sim.hotDoy) + ', 하지보다 ' + sim.lag + '일 늦음. 연평균 ' + num1(sim.mean) + '도, 진폭 플러스마이너스 '
      + num1(sim.amp) + '도. ' + L.city + ' 실측과의 평균 오차 ' + num1(labFit(sim.curve, L.city)) + '도.');

    if ($('labDepthOut')) $('labDepthOut').textContent = num1(L.depth) + ' m';
    if ($('labGhgOut')) $('labGhgOut').textContent = '+' + L.ghg + ' W/m²';
    $('labPresets').querySelectorAll('[data-labdepth]').forEach(function (b) {
      b.classList.toggle('is-on', Number(b.dataset.labdepth) === Math.round(L.depth * 2) / 2);
    });
    var obsLag = c.seasonalLag ? c.seasonalLag.present.hotLag : null;
    $('labNums').innerHTML = '<b>모형의 지연</b> <span class="v-now">' + sim.lag + '일</span>'
      + (obsLag != null ? ' <span class="ln-sep">·</span> <b>' + L.city + ' 실측 지연</b> <span class="v-past">' + obsLag + '일</span>' : '')
      + ' <span class="ln-sep">·</span> <b>연평균</b> <span class="v-now">' + num1(sim.mean) + '℃</span>'
      + ' <span class="ln-sep">·</span> <b>진폭</b> <span class="v-now">±' + num1(sim.amp) + '℃</span>';

    var fit = labFit(sim.curve, L.city);
    var lagGap = obsLag == null ? null : Math.abs(sim.lag - obsLag);
    $('labReadouts').innerHTML =
      '<div class="readout"><div class="ro-k">모형 vs ' + L.city + ' 실측 <small>(365일 평균 차이)</small></div>'
      + '<div class="ro-v"><span class="' + (fit < 2.5 ? 'v-now' : 'v-none') + '">' + num1(fit) + '℃</span></div>'
      + '<div class="ro-s">' + (fit < 2.0 ? '아주 잘 맞습니다 — 이 모형에서는 이 유효 두께가 지역의 계절 곡선을 가장 가깝게 흉내 냅니다.'
          : fit < 3.5 ? '제법 맞습니다. 유효 두께를 조금씩 바꿔 오차를 더 줄여 보세요.'
          : '아직 많이 다릅니다. 두께와 온실효과를 함께 조절해 보세요.') + '</div></div>'
      + '<div class="readout"><div class="ro-k">지연 맞추기</div>'
      + '<div class="ro-v">' + (lagGap == null ? '<span class="v-none">비교 불가</span>'
          : '<span class="' + (lagGap <= 2 ? 'v-now' : 'v-none') + '">' + (lagGap === 0 ? '정확히 일치' : lagGap + '일 차이') + '</span>') + '</div>'
      + '<div class="ro-s">' + (lagGap != null && lagGap <= 2
          ? '실측 지연을 모형이 재현했습니다 — 적어도 이 단순 모형 안에서는 <b>열을 머금는 능력</b>이 지연을 만들 수 있습니다.'
          : '두께를 키우면 지연이 길어지고, 줄이면 짧아집니다.') + '</div></div>';

    renderLabFindings(sim);
  }

  /* 학습자가 '직접 확인'해야 열리는 발견 카드 — 읽는 것이 아니라 하는 것 */
  function renderLabFindings(sim) {
    var el = $('labFindings'); if (!el) return;
    var L = labState(), c = cityOf(L.city);
    var thin = runEBM(0.5, L.ghg, c.lat), thick = runEBM(50, L.ghg, c.lat);
    var g0 = runEBM(L.depth, 0, c.lat), g12 = runEBM(L.depth, 12, c.lat);
    var best = labBestDepth(L.city);
    el.innerHTML = '<p class="lf-head"><span aria-hidden="true">✦</span> 직접 확인해 보세요 <small>(값을 바꾸면 아래 숫자가 즉시 다시 계산됩니다)</small></p>'
      + '<div class="lf-grid">'
      + '<div class="lf-item"><b>① 열을 머금을수록 늦다</b>'
      + '<p>같은 햇빛인데 <b>0.5m</b>면 지연 <b class="hot">' + thin.lag + '일</b>, <b>50m</b>면 <b class="hot">' + thick.lag + '일</b>입니다. '
      + '이 모형의 “깊이”는 실제 수심이 아니라 땅·바다·대기·혼합 같은 효과를 한 값에 모은 <b>유효 열용량 매개변수</b>입니다. 값이 클수록 지연이 길어진다는 가설은 보여 주지만, 이것만으로 “바닷가라서 늦다”고 단정할 수는 없습니다.</p>'
      + '<button class="inline-btn" type="button" data-labset="0.5">0.5m로 보기</button> '
      + '<button class="inline-btn" type="button" data-labset="50">50m로 보기</button></div>'
      + '<div class="lf-item is-key"><b>② 온실효과는 지연을 바꾸지 않는다</b>'
      + '<p>온실효과를 <b>0 → +12 W/m²</b>로 올리면 연평균은 <b>' + num1(g0.mean) + '℃ → <span class="hot">' + num1(g12.mean) + '℃</span></b>로 오르는데, '
      + '가장 더운 날은 <b>' + g0.lag + '일 → ' + g12.lag + '일</b>로 <b class="hot">' + (g12.lag === g0.lag ? '전혀 움직이지 않습니다' : Math.abs(g12.lag - g0.lag) + '일밖에 안 움직입니다') + '</b>.<br>'
      + '<b>그래서 “절기가 안 맞는다”를 전부 기후변화로 설명하면 틀립니다</b> — 지연은 늘 있던 물리이고, 온난화는 곡선 전체를 밀어 올립니다. 미션 5에서 관측으로 본 것을 모형이 다시 확인해 줍니다.</p>'
      + '<button class="inline-btn" type="button" data-labghg="0">온실효과 0</button> '
      + '<button class="inline-btn" type="button" data-labghg="12">온실효과 +12</button></div>'
      + '<div class="lf-item"><b>③ ' + L.city + '에 가장 잘 맞는 유효 두께는?</b>'
      + '<p>지금 고른 값은 <b>' + num1(L.depth) + 'm</b>(평균 오차 ' + num1(labFit(sim.curve, L.city)) + '℃). '
      + '이 단순 모형에서 실측과 가장 잘 맞는 값은 <b class="hot">' + num1(best.depth) + 'm</b>(오차 ' + num1(best.fit) + '℃)입니다. '
      + '지역을 바꿔 값이 달라지는지 확인하되, 차이를 해안 거리 하나의 원인으로 해석하지 마세요. 고도·바람·도시화 등 빠진 과정도 이 값에 함께 흡수됩니다.</p>'
      + '<button class="inline-btn" type="button" data-labset="' + best.depth + '">가장 잘 맞는 값으로</button></div>'
      + '</div>'
      + '<p class="lf-foot"><b>여기서 배우는 것</b> 기후를 이해한다는 것은 자료를 보는 일만이 아니라, <b>가장 단순한 법칙 하나로 자연을 다시 만들어 보고 어디까지 맞는지 확인하는 일</b>입니다. 이 모형은 열을 머금으면 계절 반응이 늦어질 수 있다는 메커니즘을 시험하지만, 실제 지역 차이의 원인을 식별하지는 못하고 특정 해의 날씨도 맞히지 못합니다 — 그 경계를 아는 것이 모형을 쓰는 능력이에요.</p>';
    el.querySelectorAll('[data-labset]').forEach(function (b) {
      b.addEventListener('click', function () { setLabDepth(Number(b.dataset.labset)); });
    });
    el.querySelectorAll('[data-labghg]').forEach(function (b) {
      b.addEventListener('click', function () { setLabGhg(Number(b.dataset.labghg)); });
    });
  }

  /* ---------- 자유탐구 ---------- */
  function renderFree() {
    state.phase = 'free'; document.body.classList.remove('lag-mode'); save();
    var freeTab = Math.max(0, Math.min(2, Number(state.freeTab) || 0));
    setStage('<section class="card explore-card"><h1 class="sr-only">자유탐구 — 내 지역·절기·지표로 검증</h1>'
      + '<div class="mhead"><span class="mno">자유탐구</span><span class="goal-chip">내 지역 · 절기 · 지표를 자유롭게</span></div>'
      + '<nav class="panel-tabs panel-tabs-3" aria-label="자유탐구 단계"><button data-free-step="0" aria-current="' + (freeTab === 0 ? 'step' : 'false') + '">1. 질문 만들기</button>'
      + '<button data-free-step="1" aria-current="' + (freeTab === 1 ? 'step' : 'false') + '">2. 증거 읽기</button>'
      + '<button data-free-step="2" aria-current="' + (freeTab === 2 ? 'step' : 'false') + '">3. 판정·감사</button></nav>'
      + '<div class="learning-panel" data-free-panel="0"' + (freeTab === 0 ? '' : ' hidden') + '>'
      + '<p class="task"><b>지금 할 일 하나:</b> 지역·절기·지표를 바꾸고 기준선을 옮겨, 내가 검증할 질문을 만드세요.</p>'
      + heroShell({ cityChips: true, termStrip: true, metricTabs: true, includeReadouts: false, includeMethod: false, compactIntegrity: true })
      + '<p class="share-row"><button class="ghost-btn small-btn" id="copyLink" type="button">🔗 이 화면 링크 복사</button>'
      + '<button class="ghost-btn small-btn" id="freeLab" type="button">🔬 열관성 실험실</button>'
      + '<small>지역·절기·지표·기준이 그대로 열리는 주소예요. 모둠끼리 비교하거나 선생님이 배부할 때 쓰세요.</small></p>'
      + '<div class="step-actions"><button class="primary-btn" data-free-step="1">이 조건의 증거 읽기 →</button></div></div>'
      + '<div class="learning-panel" data-free-panel="1"' + (freeTab === 1 ? '' : ' hidden') + '>'
      + '<p class="panel-kicker">선택한 조건의 자동 집계</p><p class="cerl" id="freeCerl"></p>'
      + '<div class="readouts" id="readouts"></div>'
      + '<div id="kmaRefMount"></div>'
      + '<div id="inqMount"></div>'
      + '<div id="winMount"></div>'
      + '<div id="sparkMount"></div>'
      + '<div id="methodMount"></div>'
      + '<div class="step-actions"><button class="ghost-btn" data-free-step="0">← 조건 다시 조작</button><button class="primary-btn" data-free-step="2">내 판정 쓰기 →</button></div></div>'
      + '<div class="learning-panel" data-free-panel="2"' + (freeTab === 2 ? '' : ' hidden') + '>'
      + '<div class="judge-box"><label class="draft-label" for="freeDraft">내 판정문 <small>지역 · 기간 · 기준 · 한계를 넣어 한 문장으로</small></label>'
      + '<textarea id="freeDraft" maxlength="400" placeholder="예: 서울에서 ‘덥다’를 25°C로 정하면, 처서 무렵 더위가 그치는 날이 과거보다 13일 늦어졌다. 다만 이는 5년 관측 신호로, 전국이나 원인으로 넓혀 말하기는 어렵다."></textarea>'
      + '<div class="ai-row"><button class="ghost-btn small-btn" id="localAudit" type="button">기기 안에서 빠른 점검</button>'
      + '<button class="ai-btn" id="askAudit" disabled><span aria-hidden="true">✦</span> AI 감사 요청</button></div>'
      + '<div class="ai-consent"><label><input type="checkbox" id="aiConsent"> <span><b>선택 동의:</b> AI 감사를 요청하면 위 판정문과 화면의 관측 근거가 OpenAI API로 전송됩니다. 이름·학교·연락처는 입력하지 마세요.</span></label>'
      + '<small>동의하지 않아도 기기 안 빠른 점검으로 같은 핵심 항목을 확인할 수 있습니다.</small></div>'
      + '<p class="audit-status" id="auditStatus">판정문을 쓰면 과장 · 범위 · 인과를 점검합니다. AI가 응답하지 않아도 같은 항목을 규칙 점검이 확인합니다.</p>'
      + '<div class="audit-result" id="auditResult" hidden></div></div>'
      + '<div class="step-actions"><button class="ghost-btn" data-free-step="1">← 증거 다시 읽기</button></div></div></section>');
    bindCityChips(); bindTermStrip(); bindMetricTabs(); bindThreshold(); bindViewTools();
    onTouched = function () {}; drawHero(); updateKmaRef(); updateInquiry(); updateWindow();
    $('freeDraft').value = state.freeDraft || '';
    $('freeDraft').addEventListener('input', function () { state.freeDraft = $('freeDraft').value.slice(0, 400); save(); });
    $('localAudit').addEventListener('click', function () {
      var draft = ($('freeDraft').value || '').trim();
      if (draft.replace(/\s/g, '').length < 12) {
        $('auditStatus').textContent = '판정문을 12자 이상 써 주세요 (지역 · 기간 · 기준을 넣어 한 문장으로).';
        $('freeDraft').focus(); return;
      }
      renderAudit(localAudit(draft), true);
      $('auditStatus').textContent = '기기 안 규칙 점검 완료 — 글과 자료는 외부로 전송되지 않았습니다.';
    });
    $('aiConsent').addEventListener('change', function () { $('askAudit').disabled = !$('aiConsent').checked; });
    $('askAudit').addEventListener('click', function () { doAudit(); });
    if ($('copyLink')) $('copyLink').addEventListener('click', function () { copyLink($('copyLink')); });
    if ($('freeLab')) $('freeLab').addEventListener('click', renderLab);
    bindPanelTabs('free', 3);
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
    /* R4-P1-6: 예전 어휘에는 '아니'·'아님'이 통째로 들어 있었다. 한국어는 수사의문문을
       "…아니냐", "…아님?"으로 만들기 때문에, 같은 주장이 어미 하나로 한계 진술이 되어
       버렸다 — hasLimitation·climateLimit이 scope·causal·one_year 경고를 전부 게이트하므로
       경고가 0건이 되고 '근거 충분'이 떴다.
         실측: "…전국이 다 더워졌다는 뜻 아니냐" → ready / "…뜻이다" → revise(scope)
       고치는 방법은 어미 목록을 늘리는 것이 아니라 '부정 서술이 분명한 형태만' 남기는
       것이다. "아니냐/아님/아닌가"는 어느 항목과도 일치하지 않고, "단정하긴 무리",
       "말하기 어렵다" 같은 진짜 유보는 그대로 잡힌다. 수사의문문을 따로 탐지해
       억제하는 방식도 시험했으나, 되묻기와 유보가 한 문장에 같이 오는 답
       ("5년이면 표본이 너무 적은 거 아닌가.. 단정하긴 무리인 것 같다")에서
       오탐을 만들어 폐기했다 — 이 앱에서 오탐은 미탐보다 무겁다. */
    var neg = '(어렵|어려우|없다|없음|없고|없어|없으|없지|아니다|아니라|아니며|아니고|아니지만|아니어서|아니었|아닙니|못\\s|못한|못함|못하|않|안\\s|안한|안함|모르|몰라|모름|유보|보류|무리|부족|섣부르|힘들|힘듦|우연|곤란|비약|조심|신중|아직|섣불|성급)';
    var hasLimitation = new RegExp('(전국|전체|모든|전\\s*지역|원인|인과|일반화|넓|단정|추세|장기|판단)[^.!?]{0,30}' + neg).test(t);
    var climateLimit = new RegExp('(기후|기후변화|추세|장기|표본|기간)[^.!?]{0,30}' + neg).test(t);
    var overWord = /전국|모든\s*(지역|도시|곳|데)|우리나라\s*(전체|다|기후|모든)|한국\s*(전체|기후|모든|다)|한반도|대한민국|전\s*지역|전세계|전 세계|어디(나|든)|지구\s*(전체|가)/.test(t);
    var causalWord = /기후변화가?\s*(원인|때문)|온난화\s*(때문|탓|가 원인)|온실가스\s*(때문|탓)|이산화탄소|co2|화석연료|탄소\s*배출|인간\s*활동|원인이(다|라|야)|이(것| 것)?이?\s*원인|때문(이다|에 이렇|에 더)|탓(이다|으로|에)|초래|야기|증거다/i.test(t);
    /* '처서 온도가 올라갔다'처럼 절기 자체에 기온을 귀속하는 형태도 오개념이다.
       '처서 무렵 온도가 올라갔다'는 아래 제외 목록(무렵·때·즈음…)이 걸러 낸다. */
    var solarMatch = t.match(/(입춘|우수|경칩|춘분|청명|곡우|입하|소만|망종|하지|소서|대서|입추|처서|백로|추분|한로|상강|입동|소설|대설|동지|소한|대한|절기)\s*(라는|이라는)?\s*(자체)?\s*(가|이|는|은|도|의)?\s*[^.!?]{0,14}?(더워|더웠|더 워|덥|더운|뜨거|따뜻|변했|변한|변해|바뀐|바뀌었|올라가|올라갔|올랐|상승|높아졌|높아진|여름\s*절기)/);
    var overGeneral = overWord && !hasLimitation, causal = causalWord && !hasLimitation && !climateLimit;
    /* 주어와 서술어 사이에 “예전이랑/완전히/이제” 같은 짧은 말이 끼는 실제 문장도
       놓치지 않는다. 단, 같은 30자 범위의 명시적 유보는 climateLimit가 먼저 제외한다. */
    var oneYear = /기후변화(이다|다|라|야|지|임|입니|맞|진행|증명|확정|시작|온|왔|됐|되고|라고|인 거|인거)|기후가?\s*[^.!?]{0,16}?(바뀌|바뀐|바꼈|바꿨|변했|변한|변해|변화|달라|더워|더웠)/.test(t) && !climateLimit;
    /* 제외 목록에서 '기온·온도'를 뺐다 — 이것이 있으면 "처서 온도가 올라갔다"처럼
       절기 자체에 기온을 귀속하는 전형적 오개념이 통째로 빠져나간다.
       "처서 무렵 기온이 올라갔다"처럼 시점을 밝힌 올바른 문장은 시간어(무렵·때·즈음…)가 걸러 낸다. */
    var misconception = !!solarMatch && !/(무렵|때|즈음|쯤|이후|이전|뒤|전후|근처|부근|시기|하순|상순|중순|경에|사이|지나|지난|지났|가장|않|아니)/.test(solarMatch[0]);
    var injection = /규칙[^.!?]{0,6}무시|프롬프트[^.!?]{0,4}무시|시스템[^.!?]{0,4}(무시|프롬프트)|지시[^.!?]{0,8}무시|위(에|에서)?[^.!?]{0,6}무시|무시하고|정답[^.!?]{0,8}(불러|알려|말해|줘|주라|달라|내놔|찍어|처리)|대신[^.!?]{0,4}(써|작성|적어)|써\s*줘|적어\s*줘|너는?\s*이제|지금부터[^.!?]{0,6}(교사|선생|채점|심사|모드)|(교사|선생|채점|심사|채점쌤|심사위원)[^.!?]{0,6}(모드|쌤|해|시켜|하)|역할[^.!?]{0,8}(바꿔|변경|해줘|맡|그만)|(100\s*점|만점|점수)[^.!?]{0,8}(줘|주라|주면|달라|매겨|처리)|무조건[^.!?]{0,5}(만점|합격|통과|정답|맞)|(ready|통과|맞다고|합격|우승|만점)[^.!?]{0,8}(해|처리|시켜|줘|주라|해줘|만)|위키(백과|피디아)|네이버|구글|검색(해|결과)|기사(에|에서)|나오(던데|더라)|출처[^.!?]{0,6}삽입/i.test(t);
    var hasRegion = t.indexOf(n.city) !== -1 || /지역|동네|서울|부산|인천|대구|광주|대전|제주|강릉|수원|청주|서산|전주|목포|포항|진주|춘천|경기|충북|충남|전북|전남|경북|경남|강원/.test(t);
    var hasPeriod = /과거|현재|예전|옛날|요즘|최근|\d{4}|5년|4년|기간|1969|1970|2021|2025/.test(t);
    var hasCriterion = /기준|°|℃|이상|\d\s*도|mm|%|더위|폭염|열대야|여름|밤|습|비|강수|기온|온도|최고기온|평균기온|최저기온/.test(t);
    var cautious = hasLimitation || climateLimit || /판단(을)?\s*(보류|유보|어렵|힘들|못|안)|단정(하기|짓기)?[^.!?]{0,5}(어렵|무리|힘들|못|안)|무리(인|다|라|고)|부족|섣부르|성급|충분(하지|치)\s*(않|못)|우연인지|진짜\s*(추세|변화)인지|근거가\s*부족|애매|모호|짧아|적어(서|어)|한\s*곳|한\s*지점/.test(t);
    var fb = { evidence_status: 'ready', flags: [] }, warns = [], missing = [];
    if (injection) { warns.push('프롬프트 지시·정답 요구·외부 자료 삽입은 따르지 않아요. 화면의 관측 자료 범위 안에서 스스로 결론을 써 주세요.'); fb.evidence_status = 'revise'; fb.flags.push('injection'); }
    if (overGeneral) { warns.push('한 지역·5년 자료로 ‘전국/전체’까지 넓혀 말하고 있어요. 선택한 지역의 범위로 결론을 좁혀 보세요.'); fb.evidence_status = 'revise'; fb.flags.push('scope'); }
    if (causal) { warns.push('관측된 변화의 ‘원인’을 단정하고 있어요. 이 자료는 무엇이 함께 변했는지는 보여 줘도 원인을 증명하지는 않습니다.'); fb.evidence_status = 'revise'; fb.flags.push('causal'); }
    if (oneYear) { warns.push('짧은 관측(5년)만으로 ‘기후가 변했다/기후변화다’로 단정하고 있어요. 이 자료는 관측 신호일 뿐, 장기 기후(보통 30년)를 확정하지 않습니다.'); fb.evidence_status = 'revise'; fb.flags.push('one_year'); }
    if (misconception) { warns.push('절기(예: 처서) 자체가 더워진 것이 아니에요. 절기는 태양 위치로 정한 날짜이고, 달라진 것은 그 무렵 관측된 기온·더위입니다.'); fb.evidence_status = 'revise'; fb.flags.push('misconception'); }
    if (!hasRegion) missing.push('지역');
    if (!hasPeriod) missing.push('비교 기간(과거·현재)');
    if (!hasCriterion) missing.push('기준(‘덥다/여름’의 정의)');
    if (missing.length && !cautious) { warns.push('결론에 ' + missing.join('·') + iGa(missing.join('·')) + ' 빠졌어요. 자료로 뒷받침되려면 이 요소가 문장에 있어야 합니다.'); if (fb.evidence_status === 'ready') fb.evidence_status = 'revise'; fb.flags.push('missing'); }
    /* 실제로 확인된 요소만 칭찬한다 (F-2) */
    var have = [];
    if (hasRegion) have.push('지역');
    if (hasPeriod) have.push('기간');
    if (hasCriterion) have.push('기준');
    fb.overclaim_warning = warns.join(' ');
    if (fb.evidence_status === 'ready') {
      fb.feedback = '좋아요. ' + (have.length ? have.join('·') + iGa(have.join('·')) + ' 문장에 들어 있어, ' : '') + '이 자료가 말할 수 있는 범위 안에서 판정했습니다.'
        + (hasLimitation || climateLimit ? ' 한계(전국·원인·장기 기후로 넓히지 않음)까지 밝힌 점이 특히 좋습니다.' : ' 한계를 한 문장 더 붙이면 더 단단해집니다.');
    } else {
      fb.feedback = (have.length ? have.join('·') + eunNeun(have.join('·')) + ' 들어 있어요. ' : '') + '아래 내용을 보완하면 자료가 말할 수 있는 범위에 정확히 맞습니다.'
        + (missing.length && cautious ? ' (신중하게 쓴 문장이라 문제로 보진 않았지만, ' + missing.join('·') + eulReul(missing.join('·')) + ' 넣으면 더 분명해집니다.)' : '');
    }
    fb.socratic_question = injection ? '이 자료(선택한 지역·기간·기준) 안에서 말할 수 있는 것은 무엇인가요?'
      : oneYear ? '5년 관측과 30년 기후평년은 무엇이 다를까요?'
      : misconception ? '절기 날짜가 움직인 걸까요, 아니면 그 무렵의 기온이 달라진 걸까요?'
      : overGeneral ? '이 결론을 다른 지역에서도 확인하려면 무엇을 비교해야 할까요?'
      : causal ? '함께 변했다는 것과 원인이라는 것은 어떻게 다를까요?'
      : (hasLimitation || climateLimit) ? '기준(‘덥다’ 온도)을 바꾸면 이 결론은 그대로 유지될까요?'
      : '이 결론이 다른 지역·다른 기준에서도 유지되는지 어떻게 확인할까요?';
    return fb;
  }

  function auditSessionId() {
    try {
      var key = 'weather24_audit_session', saved = sessionStorage.getItem(key);
      if (saved && /^[a-zA-Z0-9-]{12,80}$/.test(saved)) return saved;
      var id = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : 'lesson-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      sessionStorage.setItem(key, id);
      return id;
    } catch (e) {
      return 'lesson-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    }
  }

  async function doAudit() {
    var ta = $('freeDraft'), draft = (ta.value || '').trim(), btn = $('askAudit'), status = $('auditStatus');
    var consent = $('aiConsent');
    if (!consent || !consent.checked) { status.textContent = '외부 전송 동의를 확인한 뒤 AI 감사를 요청해 주세요. 기기 안 빠른 점검은 동의 없이 사용할 수 있습니다.'; if (consent) consent.focus(); return; }
    if (draft.replace(/\s/g, '').length < 12) { status.textContent = '판정문을 12자 이상 써 주세요 (지역 · 기간 · 기준을 넣어 한 문장으로).'; ta.focus(); return; }
    btn.disabled = true; status.textContent = '증거 감사관에게 확인 중…';
    var payload = { case: { id: 'FREE', title: '판정문 감사', question: '선택한 지역·기간·기준으로 어디까지 말할 수 있는가?' }, verdict: 'free', draft: draft, evidence: buildEvidence() };
    var res = null;
    try {
      res = await fetch('/api/ai-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Learning-Session': auditSessionId() },
        body: JSON.stringify(payload)
      });
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
    } finally { btn.disabled = !(consent && consent.checked); }
  }

  /* ---------- 부팅 ---------- */
  /* ---------- 테마 전환 ----------
     자동(시스템 따름) / 밝게 / 어둡게 3단. 첫 페인트 전 확정은 index.html의
     인라인 스크립트가 이미 했고, 여기서는 버튼 상태와 이후 변경만 다룬다.
     '자동'일 때는 시스템 설정이 도중에 바뀌어도 따라간다. */
  var THEME_KEY = 'weather24_theme';
  var mqLight = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function themePref() {
    try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; }
  }
  var themeSwapTimer = null;
  function applyTheme(pref) {
    var light = pref === 'light' || (pref === 'auto' && !!(mqLight && mqLight.matches));
    var root = document.documentElement;
    /* 전환 중에는 모든 트랜지션을 끈다. 끄지 않으면 칩·카드·글자 수백 개가
       각자 0.12초씩 크로스페이드해 화면이 한 번 '지저분하게' 녹는다. */
    root.classList.add('theme-swapping');
    if (themeSwapTimer) clearTimeout(themeSwapTimer);
    themeSwapTimer = setTimeout(function () { root.classList.remove('theme-swapping'); }, 60);
    root.setAttribute('data-theme', light ? 'light' : 'dark');
    root.setAttribute('data-theme-pref', pref);
    document.querySelectorAll('[data-theme-set]').forEach(function (b) {
      var on = b.dataset.themeSet === pref;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });
    /* 브라우저 UI(주소창) 색도 맞춘다 — 모바일에서 화면 위쪽이 어긋나 보인다 */
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.remove(); });
    var meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = light ? '#eef2f5' : '#081c2d';
    document.head.appendChild(meta);
  }
  function bindTheme() {
    applyTheme(themePref());
    document.querySelectorAll('[data-theme-set]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.dataset.themeSet;
        try { localStorage.setItem(THEME_KEY, v); } catch (e) {}
        applyTheme(v);
      });
    });
    /* 좌우 방향키로 이동 — role="radiogroup"의 기대 동작 (WCAG 2.1.1) */
    var seg = document.querySelector('.theme-seg');
    if (seg) seg.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var btns = [].slice.call(seg.querySelectorAll('[data-theme-set]'));
      var i = btns.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault();
      var next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
      next.focus(); next.click();
    });
    if (mqLight && mqLight.addEventListener) {
      mqLight.addEventListener('change', function () { if (themePref() === 'auto') applyTheme('auto'); });
    }
  }
  bindTheme();

  $('openGuide').addEventListener('click', function () { var d = $('guideDialog'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); });
  $('homeLink').addEventListener('click', function (e) {
    e.preventDefault();
    if (confirm('처음(소개)으로 돌아갈까요? 진행 기록은 유지됩니다.')) renderIntro();
  });
  var rb = $('resetBtn');
  if (rb) rb.addEventListener('click', function () {
    if (confirm('기록을 지우고 처음부터 시작할까요?\n(공용 컴퓨터에서 다음 사람을 위해 초기화합니다)')) {
      try { localStorage.removeItem('weather24_verify_v4'); localStorage.removeItem('weather24_verify_v3'); localStorage.removeItem('weather24_verify_v2'); } catch (e) {}
      /* R4-P2: reload()는 해시를 남긴다. 앱이 배부하는 링크에는 항상 &v=free가 붙어 있어
         applyHash가 다음 학생을 자유탐구(사실상 종료 화면)에서 시작시켰다. */
      location.replace(location.pathname + location.search);
    }
  });
  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if ($('heroSvg')) drawHero(); }, 150);
  });

  /* 딥링크는 교사가 '이 화면'을 배부하는 수단이다. 그런데 예전에는 부팅 때 한 번만 읽어서,
     같은 탭에 새 링크를 붙여넣거나 뒤로/앞으로 가면 주소만 바뀌고 화면은 그대로였다.
     주소가 바뀌면 그 화면으로 실제로 이동한다. */
  function routeFromState() {
    if (state.phase === 'free') renderFree();
    else if (state.phase === 'lab') renderLab();
    else if (state.phase === 'complete') renderComplete();
    else if (state.phase === 'terms') renderTerms();
    else if (state.phase === 'intro') state.introStep === 'method' ? renderIntroMethod() : renderIntro();
    else if (state.phase === 'tutorial') renderTutorial();
    else { state.phase = 'mission'; renderMissionFlow(); }
  }
  window.addEventListener('hashchange', function () {
    if (applyHash()) routeFromState();
  });

  /* R4-P2(SHARE-01): 20분 넘게 방치된 기록이 남아 있으면 '이어서 / 새로 시작'을 묻는다.
     교실 공용 PC에서 앞 사람 진행을 그대로 물려받는 것이 가장 흔한 사고다.
     ↺ 처음부터 버튼은 그대로 두고, 묻지 않고 지우지도 않는다. */
  (function askResume() {
    var idle = state.savedAt && (Date.now() - state.savedAt) > 20 * 60 * 1000;
    /* 5차 F11: '미션 1개 완료'를 진행으로 셌더니 가장 흔한 사고를 놓쳤다 —
       앞사람이 미션 1 도중에 떠난 경우다. 그때 다음 학생은 봉인된 예측과 CERL 초안을
       그대로 물려받는다. 예측·작성·단계 진행 중 무엇이든 남아 있으면 묻는다. */
    var wrote = state.missionCerl && Object.keys(state.missionCerl).some(function (k) {
      var d = state.missionCerl[k] || {};
      return ['c', 'e', 'r', 'l'].some(function (f) { return (d[f] || '').trim(); });
    });
    var answered = (state.predicts && Object.keys(state.predicts).length) || state.pre != null;
    var midMission = state.phase === 'mission' && state.missionStep && state.missionStep !== 'predict';
    var progressed = (state.done && state.done.length) || state.phase === 'complete' || state.phase === 'free'
      || state.phase === 'lab' || wrote || answered || midMission;
    if (!idle || !progressed) return;
    /* 파괴적인 쪽을 [확인]에 둔다. 예전에는 [취소]와 Esc가 기록 영구 삭제여서,
       2차시 수업에서 무심코 Esc를 누른 학생이 쓴 글을 전부 잃었다. */
    if (confirm('이 컴퓨터에 20분 넘게 멈춰 있던 학습 기록이 있어요.\n\n'
      + '[확인] 기록을 지우고 새로 시작하기 — 지금까지 쓴 글이 모두 사라져요\n'
      + '[취소] 이어서 하기')) {
      try { localStorage.removeItem('weather24_verify_v4'); localStorage.removeItem('weather24_verify_v3'); } catch (e) {}
      location.replace(location.pathname + location.search);
    }
  })();

  applyHash();
  if (state.phase === 'free') renderFree();
  else if (state.phase === 'lab') renderLab();
  else if (state.phase === 'complete') renderComplete();
  else if (state.phase === 'verdict') { state.phase = 'mission'; state.missionStep = 'write'; renderMissionFlow(); }
  else if (state.phase === 'terms') renderTerms();
  else if (state.phase === 'intro') state.introStep === 'method' ? renderIntroMethod() : renderIntro();
  else if (state.phase === 'tutorial') renderTutorial();
  else { state.phase = 'mission'; renderMissionFlow(); }
})();
