# Windows PowerShell 5.1 compatible. Run with 문제등록.bat from repository root.
$ErrorActionPreference = 'Stop'
try {
    $root = Split-Path -Parent $PSScriptRoot
    $imageDir = Join-Path $root 'datasets\default\images'
    $outputFile = Join-Path $root 'datasets\default\questions.json'
    if (-not (Test-Path -LiteralPath $imageDir -PathType Container)) {
        throw "이미지 폴더를 찾지 못했습니다: $imageDir"
    }
    $allowedExt = @('.png', '.jpg', '.jpeg', '.webp', '.gif')
    $files = @(Get-ChildItem -LiteralPath $imageDir -File -Recurse | Where-Object { $allowedExt -contains $_.Extension.ToLowerInvariant() })
    $lookup = @{}
    foreach ($f in $files) { $lookup[$f.FullName.ToLowerInvariant()] = $f }
    $questions = New-Object System.Collections.ArrayList
    $skipped = 0
    $missingExplanation = 0
    foreach ($f in ($files | Sort-Object FullName)) {
        if ($f.BaseName -match '(?i)h$') { continue }
        if ($f.BaseName -notmatch '([0-9])$') {
            Write-Host ('건너뜀 (끝에 정답 번호 없음): ' + $f.Name)
            $skipped++
            continue
        }
        $answer = $Matches[1]
        $relative = $f.FullName.Substring($imageDir.Length).TrimStart('\','/').Replace('\', '/')
        $explanationFull = Join-Path $f.DirectoryName ($f.BaseName + 'h' + $f.Extension)
        $explanation = ''
        $explanationKey = $explanationFull.ToLowerInvariant()
        if ($lookup.ContainsKey($explanationKey)) {
            $explanationRel = $lookup[$explanationKey].FullName.Substring($imageDir.Length).TrimStart('\','/').Replace('\', '/')
            $explanation = 'images/' + $explanationRel
        } else {
            $missingExplanation++
            Write-Host ('해설 없음: ' + $f.Name)
        }
        # Stable ID based on relative path, so renumbering other questions is harmless.
        $item = [ordered]@{
            id = 'img:' + $relative
            type = 'image'
            subject = if ($f.DirectoryName -eq $imageDir) { '내 암기자료' } else { (Split-Path $f.DirectoryName -Leaf) }
            questionImage = 'images/' + $relative
            answer = $answer
            explanationImage = $explanation
        }
        [void]$questions.Add($item)
    }
    if ($questions.Count -eq 0) {
        Write-Host '등록할 문제를 찾지 못했습니다. 파일명을 세법3.png / 세법3h.png 형태로 정해 주세요.'
        exit 2
    }
    if (Test-Path -LiteralPath $outputFile) {
        Copy-Item -LiteralPath $outputFile -Destination ($outputFile + '.bak') -Force
    }
    $version = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()
    $data = [ordered]@{ version = $version; questions = @($questions.ToArray()) }
    $json = ConvertTo-Json -InputObject $data -Depth 8
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($outputFile, $json, $utf8NoBom)
    Write-Host ''
    Write-Host ('등록 성공: ' + $questions.Count + '문제')
    Write-Host ('해설 없는 문제: ' + $missingExplanation + '개 / 건너뛴 파일: ' + $skipped + '개')
    Write-Host ('문제 목록: ' + $outputFile)
    Write-Host '웹사이트에서는 새 학습을 시작하여 새 자료를 확인하세요.'
    exit 0
} catch {
    Write-Host ('오류: ' + $_.Exception.Message)
    exit 1
}
