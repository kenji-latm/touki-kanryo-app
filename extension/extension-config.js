// Chrome拡張版の専用設定。
// 案件保存はChrome拡張内のlocalStorageだけを使い、事務所共有機能は出さない。
window.TOUKI_APP_CONFIG = {
  dataJsonUrl: "https://tools.ishimoto-legal.com/data/kanryo.json",
  forceLocalOnly: true,
};

window.TOUKI_SHARED_CONFIG = {
  enabled: false,
  supabaseUrl: "",
  supabaseAnonKey: "",
  activationParam: "team",
  activationValue: "office",
  alwaysShow: false,
};
