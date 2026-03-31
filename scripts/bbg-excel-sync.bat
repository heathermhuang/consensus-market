@echo off
REM Bloomberg Excel Bridge KPI Sync
REM Runs at 06:30 HKT daily via Windows Task Scheduler (ConsensusMarket-Excel-Sync)
REM Pulls operating KPI data via Excel Add-in (COM automation)
REM Requires Bloomberg Terminal + Excel to be running with Add-in loaded
REM Exit code 2 = Excel/Terminal not available (non-critical)

cd /d C:\Users\bloomberg\claude\consensusmarket

set PATH=C:\Users\bloomberg\AppData\Local\Programs\Python\Python312;C:\Users\bloomberg\AppData\Local\Programs\Python\Python312\Scripts;%PATH%
set PYTHONIOENCODING=utf-8

echo [%date% %time%] === Excel Sync Starting === >> data\consensus-db\excel-sync.log
python scripts\bbg-excel-bridge.py --resume >> data\consensus-db\excel-sync.log 2>&1
set EXIT_CODE=%ERRORLEVEL%
echo [%date% %time%] === Excel Sync Complete (exit=%EXIT_CODE%) === >> data\consensus-db\excel-sync.log

exit /b %EXIT_CODE%
