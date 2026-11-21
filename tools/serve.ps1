# Windows PowerShell 5.1 compatible. Run with 실행.bat from repository root.
# 프로젝트 폴더를 http://localhost:<포트>/ 로 제공하는 간단한 로컬 웹 서버입니다.
param([string]$Page = '')
$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))

$mime = @{
    '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'
    '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'
    '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.gif' = 'image/gif'
    '.webp' = 'image/webp'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
    '.woff' = 'font/woff'; '.woff2' = 'font/woff2'
}

# 8000번부터 비어 있는 포트를 찾습니다.
$listener = $null
foreach ($port in 8000..8020) {
    $candidate = New-Object System.Net.HttpListener
    $candidate.Prefixes.Add("http://localhost:$port/")
    try { $candidate.Start(); $listener = $candidate; break } catch { $candidate.Close() }
}
if (-not $listener) {
    Write-Host '오류: 8000~8020 포트를 모두 사용할 수 없습니다.'
    exit 1
}

$base = "http://localhost:$port/"
Write-Host ''
Write-Host "로컬 서버 실행 중: $base"
Write-Host "영역 편집기:      ${base}region-editor.html"
Write-Host ''
Write-Host '이 창을 닫으면 서버가 종료됩니다.'
Start-Process ($base + $Page)

while ($listener.IsListening) {
    try { $context = $listener.GetContext() } catch { break }
    $response = $context.Response
    try {
        $request = $context.Request
        $path = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
        $response.Headers.Add('Cache-Control', 'no-store')

        # 영역 편집기의 저장 요청: datasets/default/regions.json 에 바로 씁니다.
        # 다른 웹사이트가 몰래 보내는 요청을 막기 위해 전용 헤더와 같은 출처(Origin)를 확인합니다.
        if ($path -eq '/api/save-regions') {
            $origin = $request.Headers['Origin']
            if ($request.HttpMethod -ne 'POST' -or $request.Headers['X-Memory-Master'] -ne '1' -or ($origin -and $origin.TrimEnd('/') -ne $base.TrimEnd('/'))) {
                $response.StatusCode = 403
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"error":"forbidden"}')
            } elseif ($request.ContentLength64 -gt 5MB) {
                $response.StatusCode = 413
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"error":"too large"}')
            } else {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $text = $reader.ReadToEnd()
                $reader.Close()
                try {
                    $parsed = $text | ConvertFrom-Json
                    if ($null -eq $parsed -or $parsed -is [array]) { throw 'invalid' }
                    $target = Join-Path $root 'datasets\default\regions.json'
                    if (Test-Path -LiteralPath $target) { Copy-Item -LiteralPath $target -Destination ($target + '.bak') -Force }
                    [System.IO.File]::WriteAllText($target, $text, (New-Object System.Text.UTF8Encoding($false)))
                    Write-Host ('[' + (Get-Date -Format 'HH:mm:ss') + '] regions.json 저장 완료')
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":true,"path":"datasets/default/regions.json"}')
                } catch {
                    $response.StatusCode = 400
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes('{"ok":false,"error":"invalid json"}')
                }
            }
            $response.ContentType = 'application/json; charset=utf-8'
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            continue
        }

        # 영역 편집기용: datasets/default/images 폴더(하위 폴더 포함)의 이미지 목록을 돌려줍니다.
        if ($path -eq '/api/list-images') {
            $imageDir = Join-Path $root 'datasets\default\images'
            $exts = @('.png', '.jpg', '.jpeg', '.webp', '.gif')
            $list = @()
            if (Test-Path -LiteralPath $imageDir -PathType Container) {
                $list = @(Get-ChildItem -LiteralPath $imageDir -File -Recurse |
                    Where-Object { $exts -contains $_.Extension.ToLowerInvariant() } |
                    Sort-Object FullName |
                    ForEach-Object { 'images/' + $_.FullName.Substring($imageDir.Length).TrimStart('\', '/').Replace('\', '/') })
            }
            $json = if ($list.Count) { ConvertTo-Json -InputObject $list -Compress } else { '[]' }
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentType = 'application/json; charset=utf-8'
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            continue
        }

        if ($path.EndsWith('/')) { $path += 'index.html' }
        $file = [System.IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
        if (-not $file.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
            $response.StatusCode = 404
            $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
        } else {
            $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
            $response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
            $bytes = [System.IO.File]::ReadAllBytes($file)
        }
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
        # 브라우저가 요청을 중간에 취소한 경우 등은 무시합니다.
    } finally {
        try { $response.Close() } catch {}
    }
}
