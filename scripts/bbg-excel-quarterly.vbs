' Bloomberg Excel BDP Bridge — Quarterly KPI Data
' Run via: cscript //nologo scripts\bbg-excel-quarterly.vbs
' Output: data\consensus-db\quarterly-data.csv
'
' This runs as 32-bit via WScript/CScript and controls 32-bit Excel
' which can load the Bloomberg Add-in and execute BDP formulas.

Option Explicit

Dim xl, wb, ws, fso, outFile
Dim row, col, i, j, attempt
Dim ticker, bbg, field, period, formula, val
Dim ready, total, maxWait, pollInterval

' Config
maxWait = 300      ' seconds max wait for Bloomberg data
pollInterval = 10  ' seconds between polls

' Output CSV
Dim csvPath
csvPath = "C:\Users\bloomberg\claude\consensusmarket\data\consensus-db\quarterly-data.csv"

' Tickers and their KPI fields
Dim tickers(8), bbgs(8), fields(8), labels(8)
tickers(0) = "TSLA" : bbgs(0) = "TSLA US Equity" : fields(0) = "NUMBER_OF_VEHICLES_SOLD" : labels(0) = "Vehicle Deliveries"
tickers(1) = "SPOT" : bbgs(1) = "SPOT US Equity" : fields(1) = "MONTHLY_ACTIVE_USERS" : labels(1) = "MAU"
tickers(2) = "META" : bbgs(2) = "META US Equity" : fields(2) = "DAILY_ACTIVE_USERS" : labels(2) = "Family DAP"
tickers(3) = "PINS" : bbgs(3) = "PINS US Equity" : fields(3) = "MONTHLY_ACTIVE_USERS" : labels(3) = "MAU"
tickers(4) = "UBER" : bbgs(4) = "UBER US Equity" : fields(4) = "MONTHLY_ACTIVE_USERS" : labels(4) = "MAPC"
tickers(5) = "DIS"  : bbgs(5) = "DIS US Equity"  : fields(5) = "ROOM_NIGHTS" : labels(5) = "Room Nights"
tickers(6) = "COIN" : bbgs(6) = "COIN US Equity" : fields(6) = "MONTHLY_ACTIVE_USERS" : labels(6) = "MTU"
tickers(7) = "1810.HK" : bbgs(7) = "1810 HK Equity" : fields(7) = "FS265" : labels(7) = "Phone Shipments"
tickers(8) = "0700.HK" : bbgs(8) = "700 HK Equity" : fields(8) = "MONTHLY_ACTIVE_USERS" : labels(8) = "WeChat MAU"

' Also pull BEST_SALES for all tickers
Dim salesTickers(5), salesBbgs(5)
salesTickers(0) = "TSLA" : salesBbgs(0) = "TSLA US Equity"
salesTickers(1) = "UBER" : salesBbgs(1) = "UBER US Equity"
salesTickers(2) = "META" : salesBbgs(2) = "META US Equity"
salesTickers(3) = "NFLX" : salesBbgs(3) = "NFLX US Equity"
salesTickers(4) = "AAPL" : salesBbgs(4) = "AAPL US Equity"
salesTickers(5) = "AMZN" : salesBbgs(5) = "AMZN US Equity"

Dim periods(7)
periods(0) = "1Q2025" : periods(1) = "2Q2025" : periods(2) = "3Q2025" : periods(3) = "4Q2025"
periods(4) = "1Q2026" : periods(5) = "2Q2026" : periods(6) = "3Q2026" : periods(7) = "4Q2026"

WScript.Echo "Bloomberg Excel BDP Bridge - Quarterly Data"
WScript.Echo "============================================"

' Start Excel
Set xl = CreateObject("Excel.Application")
xl.Visible = True
xl.DisplayAlerts = False

' Try loading Bloomberg XLL
On Error Resume Next
xl.RegisterXLL "C:\blp\API\Office Tools\brtdwrap.xll"
If Err.Number <> 0 Then
    WScript.Echo "Warning: Could not load brtdwrap.xll: " & Err.Description
    Err.Clear
End If
On Error GoTo 0

WScript.Sleep 3000

Set wb = xl.Workbooks.Add()
Set ws = wb.ActiveSheet

' Write headers
ws.Cells(1, 1).Value = "Ticker"
ws.Cells(1, 2).Value = "BBG"
ws.Cells(1, 3).Value = "Field"
ws.Cells(1, 4).Value = "Label"
ws.Cells(1, 5).Value = "Period"
ws.Cells(1, 6).Value = "Formula"
ws.Cells(1, 7).Value = "Value"

row = 2
total = 0

' KPI fields by quarter
WScript.Echo "Setting KPI BDP formulas..."
For i = 0 To UBound(tickers)
    For j = 0 To UBound(periods)
        ws.Cells(row, 1).Value = tickers(i)
        ws.Cells(row, 2).Value = bbgs(i)
        ws.Cells(row, 3).Value = fields(i)
        ws.Cells(row, 4).Value = labels(i)
        ws.Cells(row, 5).Value = periods(j)
        formula = "=BDP(""" & bbgs(i) & """,""" & fields(i) & """,""BEST_FPERIOD_OVERRIDE"",""" & periods(j) & """)"
        ws.Cells(row, 6).Value = formula
        ws.Cells(row, 7).Formula = formula
        row = row + 1
        total = total + 1
    Next
Next

' BEST_SALES by quarter for selected tickers
WScript.Echo "Setting BEST_SALES formulas..."
For i = 0 To UBound(salesTickers)
    For j = 0 To UBound(periods)
        ws.Cells(row, 1).Value = salesTickers(i)
        ws.Cells(row, 2).Value = salesBbgs(i)
        ws.Cells(row, 3).Value = "BEST_SALES"
        ws.Cells(row, 4).Value = "Revenue"
        ws.Cells(row, 5).Value = periods(j)
        formula = "=BDP(""" & salesBbgs(i) & """,""BEST_SALES"",""BEST_FPERIOD_OVERRIDE"",""" & periods(j) & """)"
        ws.Cells(row, 6).Value = formula
        ws.Cells(row, 7).Formula = formula
        row = row + 1
        total = total + 1
    Next
Next

WScript.Echo "Total formulas: " & total & ". Waiting for Bloomberg data..."

' Poll until data arrives or timeout
Dim elapsed, anyData
elapsed = 0
Do While elapsed < maxWait
    WScript.Sleep pollInterval * 1000
    elapsed = elapsed + pollInterval
    xl.Calculate

    ready = 0
    For i = 2 To row - 1
        val = ws.Cells(i, 7).Value
        If Not IsEmpty(val) Then
            If InStr(CStr(val), "#N/A") = 0 And InStr(CStr(val), "Request") = 0 Then
                ready = ready + 1
            End If
        End If
    Next

    WScript.Echo "  " & elapsed & "s: " & ready & "/" & total & " cells populated"

    If ready > 0 And ready >= total * 0.8 Then
        WScript.Echo "Enough data arrived!"
        Exit Do
    End If
Loop

' Read all values into column 7 (text) and write CSV
WScript.Echo ""
WScript.Echo "Writing CSV..."

Set fso = CreateObject("Scripting.FileSystemObject")
Set outFile = fso.CreateTextFile(csvPath, True, False)
outFile.WriteLine "ticker,bbg_ticker,field,label,period,value"

Dim valStr, numReady
numReady = 0
For i = 2 To row - 1
    ticker = ws.Cells(i, 1).Value
    Dim bbgVal, fieldVal, labelVal, periodVal
    bbgVal = ws.Cells(i, 2).Value
    fieldVal = ws.Cells(i, 3).Value
    labelVal = ws.Cells(i, 4).Value
    periodVal = ws.Cells(i, 5).Value
    val = ws.Cells(i, 7).Value

    If Not IsEmpty(val) And InStr(CStr(val), "#N/A") = 0 And InStr(CStr(val), "Request") = 0 Then
        valStr = CStr(val)
        outFile.WriteLine ticker & "," & bbgVal & "," & fieldVal & "," & labelVal & "," & periodVal & "," & valStr
        numReady = numReady + 1
        WScript.Echo "  " & ticker & " " & fieldVal & " " & periodVal & " = " & valStr
    Else
        WScript.Echo "  " & ticker & " " & fieldVal & " " & periodVal & " = (no data: " & CStr(val) & ")"
    End If
Next

outFile.Close

WScript.Echo ""
WScript.Echo "Done! " & numReady & "/" & total & " values written to:"
WScript.Echo "  " & csvPath

' Don't close Excel so user can inspect
' xl.Quit
