// 事務所共有モードの設定。
// Supabaseプロジェクト作成後、URLとanon keyを入れると「事務所共有」ログインが使えます。
// anon keyは公開前提のキーですが、必ずSupabase側でRLSを有効にしてください。
window.TOUKI_SHARED_CONFIG = {
  enabled: true,
  supabaseUrl: "https://gbcunxxvlcmzksttmvlh.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiY3VueHh2bGNtemtzdHRtdmxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMzAyMDksImV4cCI6MjA5NzkwNjIwOX0.heYDc1aubwixy7m78NClJ4ROEwD3tUUK24buvCMe-5w",
  // 通常URLでは共有UIを出さず、?team=office で開いた端末だけ表示します。
  activationParam: "team",
  activationValue: "office",
  alwaysShow: false,
};