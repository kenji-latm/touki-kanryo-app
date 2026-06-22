@echo off
chcp 65001 >nul
cd /d "%~dp0"
set NODE_USE_SYSTEM_CA=1
echo ============================================
echo  登記完了予定日アプリ  データ更新
echo ============================================
echo.
echo [1/3] 東京法務局から最新データを取得中...
node scraper\scrape.mjs
if errorlevel 1 goto err
echo.
echo [2/3] 単一HTMLを生成中...
node scraper\build-single.mjs
if errorlevel 1 goto err
echo.
echo [3/3] 配布用Zipを生成中...
node scraper\build-zip.mjs
if errorlevel 1 goto err
echo.
echo ============================================
echo  完了しました。
echo  配布用: dist\登記完了予定日アプリ.zip
echo ============================================
echo.
pause
exit /b 0

:err
echo.
echo ------------------------------------------------
echo  エラーが発生しました。
echo  Node.js がインストールされているか、
echo  インターネットに接続できているか確認してください。
echo ------------------------------------------------
echo.
pause
exit /b 1
