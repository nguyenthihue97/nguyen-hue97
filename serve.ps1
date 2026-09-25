# Static file server for the LAN (no Node/Python needed).
# Usage:  powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080]
param([int]$Port = 8080)

$root = $PSScriptRoot
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.ico' = 'image/x-icon'; '.md' = 'text/plain; charset=utf-8'
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
try { $listener.Start() } catch { Write-Host "Port $Port is in use. Try: serve.ps1 -Port 8090" -ForegroundColor Red; exit 1 }

$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' } | ForEach-Object IPAddress
Write-Host ""
Write-Host "  ParuParu Park AI is running" -ForegroundColor Cyan
Write-Host "  This PC : http://localhost:$Port/"
foreach ($ip in $ips) { Write-Host "  LAN     : http://${ip}:$Port/" -ForegroundColor Green }
Write-Host "  Press Ctrl+C to stop."
Write-Host ""

function Send($stream, [int]$code, [string]$status, [string]$type, [byte[]]$body) {
  $head = "HTTP/1.1 $code $status`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
  $h = [System.Text.Encoding]::ASCII.GetBytes($head)
  $stream.Write($h, 0, $h.Length)
  if ($body.Length) { $stream.Write($body, 0, $body.Length) }
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $stream.ReadTimeout = 5000
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 8192, $true)
      $line = $reader.ReadLine()
      if (-not $line) { continue }
      while (($h = $reader.ReadLine()) -ne $null -and $h -ne '') { }   # drain headers
      $parts = $line.Split(' ')
      $path = [System.Uri]::UnescapeDataString(($parts[1] -split '\?')[0])
      if ($path.EndsWith('/')) { $path += 'index.html' }
      $file = [System.IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
      $remote = $client.Client.RemoteEndPoint
      if (-not $file.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
        Send $stream 404 'Not Found' 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('404 Not Found'))
        Write-Host "404 $path  ($remote)" -ForegroundColor DarkYellow
      } else {
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        Send $stream 200 'OK' $type ([System.IO.File]::ReadAllBytes($file))
        Write-Host "200 $path  ($remote)" -ForegroundColor DarkGray
      }
    } catch { } finally { $client.Close() }
  }
} finally { $listener.Stop() }
