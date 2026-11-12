// ?mock=1 のときだけ使う「LINEなしで画面を確認する」ための仮データ
(() => {
  if (new URLSearchParams(location.search).get('mock') !== '1') return;

  window.liff = {
    init: async () => {},
    isLoggedIn: () => true,
    isInClient: () => false,
    getIDToken: () => 'mock-token',
    login: () => {},
    sendMessages: async () => {},
    closeWindow: () => {}
  };

  const wait = ms => new Promise(r => setTimeout(r, ms));
  let no = 42;

  window.MOCK_API = async (action, body) => {
    await wait(action === 'uploadPhoto' ? 900 : 400);
    if (action === 'init') {
      return {
        ok: true,
        data: {
          nextNo: no,
          members: [
            { row: 2, name: 'Aさん', kana: 'えーさん', attended: false, items: '' },
            { row: 3, name: 'Bさん', kana: 'びーさん', attended: true, items: '草刈機' },
            { row: 4, name: 'Cさん', kana: 'しーさん', attended: false, items: '' },
            { row: 5, name: 'Dさん', kana: 'でぃーさん', attended: false, items: '' },
            { row: 6, name: 'Eさん', kana: 'いーさん', attended: false, items: '' },
            { row: 7, name: 'Fさん', kana: 'えふさん', attended: false, items: '' },
            { row: 8, name: '団体', kana: '', attended: false, items: '' },
            { row: 9, name: '非農業者', kana: '', attended: false, items: '' }
          ],
          items: ['草刈機', 'スコップ', '軽トラ', 'チェーンソー'],
          groups: ['婦人会', '子ども会', '消防団'],
          others: ['役場', 'JA'],
          locations: ['集落内農用地', '水路', '農道', '集会所'],
          weathers: ['晴れ', '曇り', '雨', '雪'],
          purchaseOptions: ['機械購入', '機械維持管理', '補助金交付', '事務'],
          activityOptions: [
            { cat: '道・水路管理活動', items: ['水路の泥上げ', '農道の草刈り', 'その他'] },
            { cat: '農地管理費活動', items: ['畦畔の草刈り', '耕作放棄地の管理'] },
            { cat: '鳥獣被害防止活動', items: ['電気柵の点検', 'わなの見回り'] }
          ]
        }
      };
    }
    if (action === 'uploadPhoto') return { ok: true, url: 'https://drive.google.com/file/d/mock/view' };
    if (action === 'submit') { console.log('submit', body); return { ok: true, no: no++ }; }
    return { ok: false, error: 'unknown' };
  };
})();
