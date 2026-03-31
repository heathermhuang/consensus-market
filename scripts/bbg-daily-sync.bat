@echo off
REM Bloomberg Daily API Consensus Sync
REM Runs at 06:00 HKT daily via Windows Task Scheduler (ConsensusMarket-API-Sync)
REM Pulls consensus snapshots + analyst recs + earnings calendar via Bloomberg socket API
REM Pushes to D1 via HTTP

cd /d C:\Users\bloomberg\claude\consensusmarket

set PATH=C:\Users\bloomberg\AppData\Local\Programs\Python\Python312;C:\Users\bloomberg\AppData\Local\Programs\Python\Python312\Scripts;%PATH%
set BLPAPI_ROOT=C:\blp\DAPI
set PYTHONIOENCODING=utf-8

echo [%date% %time%] === API Sync Starting === >> data\consensus-db\sync.log
python scripts\bbg-global-sync.py --resume >> data\consensus-db\sync.log 2>&1
set EXIT_CODE=%ERRORLEVEL%
echo [%date% %time%] === API Sync Complete (exit=%EXIT_CODE%) === >> data\consensus-db\sync.log

exit /b %EXIT_CODE%
