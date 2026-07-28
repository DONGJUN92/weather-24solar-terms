/* 첫 페인트 전에 테마를 확정한다. head의 동기 스크립트로 실행되어
   라이트 사용자가 다크 화면을 한 프레임 보는 현상(FOUC)을 막는다. */
(function () {
  'use strict';
  try {
    var pref = localStorage.getItem('weather24_theme') || 'auto';
    var dark = pref === 'dark' || (pref === 'auto' &&
      !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches));
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme-pref', pref);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
