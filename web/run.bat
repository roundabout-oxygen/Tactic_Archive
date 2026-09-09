@echo off
echo ===================================================
echo Tactical Archive (対戦履歴管理ツール)
echo ローカルサーバーを起動しています...
echo ===================================================
echo.
echo ブラウザで http://localhost:8000 を開きます。
echo サーバーを終了するには、このウィンドウで Ctrl+C を押してください。
echo.

start http://localhost:8000
python -m http.server 8000
