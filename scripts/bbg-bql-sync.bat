@echo off
REM Bloomberg BQL Quarterly KPI Sync
REM Runs at 07:00 HKT daily via Windows Task Scheduler (ConsensusMarket-BQL-Sync)
REM Fetches quarterly KPI consensus via BQL + Excel COM, pushes to D1
REM Requires Bloomberg Terminal + Excel with BQL Add-in loaded
REM Exit code 2 = Excel/Terminal not available (non-critical)

cd /d C:\Users\bloomberg\claude\consensusmarket

set PATH=C:\Users\bloomberg\AppData\Local\Programs\Python\Python312;C:\Users\bloomberg\AppData\Local\Programs\Python\Python312\Scripts;%PATH%
set PYTHONIOENCODING=utf-8

echo [%date% %time%] === BQL Sync Starting === >> data\consensus-db\bql-sync.log
python scripts\bbg-bql-sync.py >> data\consensus-db\bql-sync.log 2>&1
set EXIT_CODE=%ERRORLEVEL%
echo [%date% %time%] === BQL Sync Complete (exit=%EXIT_CODE%) === >> data\consensus-db\bql-sync.log

exit /b %EXIT_CODE%
