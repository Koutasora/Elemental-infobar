# Ubija proces pluginu; Stream Deck uruchamia go sam z nowym bundlem.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
	Where-Object { $_.CommandLine -match 'com\.elemental\.infobar\.sdPlugin' } |
	ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
