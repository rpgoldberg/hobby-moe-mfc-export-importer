# MFC export -> mfc-items.js  (PowerShell 5+)
# Usage: .\prep.ps1 [path\to\export.csv]   (default: newest *@MFC*.csv in Downloads)
# Reads ID, Title, Barcode, Status by header name; writes window.MFC_ITEMS next to the CSV and copies it to the clipboard.
param([string]$Csv)
if (-not $Csv) { $Csv = (Get-ChildItem -LiteralPath "$HOME\Downloads" -Filter '*@MFC*.csv' | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }
if (-not $Csv) { throw "no MFC export found; pass the CSV path" }
$rows = Import-Csv -LiteralPath $Csv -Delimiter ','
$items = foreach ($r in $rows) {
  [ordered]@{ id = "$($r.ID)"; title = "$($r.Title)"; jan = ("$($r.Barcode)" -replace '[^0-9]', ''); status = "$($r.Status)" }
}
$js = "window.MFC_ITEMS = " + (ConvertTo-Json -InputObject @($items) -Compress -Depth 3) + ";"
$out = Join-Path (Split-Path -LiteralPath $Csv) "mfc-items.js"
[IO.File]::WriteAllText($out, $js, (New-Object Text.UTF8Encoding $false))
Set-Clipboard -Value $js
"rows=$($items.Count) noBarcode=$(@($items | Where-Object { $_.jan -eq '' }).Count) -> $out (also on the clipboard)"
