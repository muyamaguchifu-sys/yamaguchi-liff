// LIFF画面の設定
//   開いたURLの ?v=〇〇 で、どの集落のGASに記録するかを切り替える。
//   ?v がないときはテスト用（今までと同じ）。
//   LINE Developers の LIFF の「エンドポイントURL」に ?v=〇〇 を付けておく。
//     例）https://muyamaguchifu-sys.github.io/yamaguchi-liff/?v=nozuki
(function () {
  var VILLAGES = {
    // テスト用（中山間LIFF（テスト））
    test: {
      LIFF_ID: '2012538387-mdMArCF0',
      GAS_URL: 'https://script.google.com/macros/s/AKfycby1SuA6ulWAT7T_NeQ4iJMpOxwgmKl49Fbkb92EhDwIXJlpYP07DncVggnN_nIgG7Zu/exec'
    },
    // 野月集落
    nozuki: {
      LIFF_ID: '2012636221-HGEdhQKq',  // LINEログインチャネル「中山間記録」の LIFF「活動記録（野月集落）」
      GAS_URL: 'https://script.google.com/macros/s/AKfycbwBFX66ZOpQ3VyPXAzBdcMVUYOVC2xKkbr97jXPcpNVmna4WFBe3OFdyAgFT47dj19_/exec'
    },
    // 一ノ渡集落
    ichinowatari: {
      LIFF_ID: '2012636221-EfHVSLFZ',  // LINEログインチャネル「中山間記録」の LIFF「活動記録（一ノ渡集落）」
      GAS_URL: 'https://script.google.com/macros/s/AKfycbw3SQeLu90yu9x6aprFrRwXNG5cl5VfwRWCSfmO_Qq2niFvKPbhXLdgpNaRRAp23a_Y/exec'
    }
  };
  var v = new URLSearchParams(location.search).get('v') || 'test';
  window.APP_CONFIG = VILLAGES[v] || {};
  window.APP_CONFIG.VILLAGE = v;
})();
