$ErrorActionPreference = 'Stop'

$repository = 'moazessam376-dev/sparring'
$releaseApi = "https://api.github.com/repos/$repository/releases/latest"
$checksumName = 'SHA256SUMS.txt'

function Stop-Installer([string]$Message) {
    Write-Error "Sparring installer: $Message"
    exit 1
}

$architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
switch ($architecture) {
    'X64' { $artifactName = 'Sparring-windows-x86_64.exe' }
    default { Stop-Installer "no Windows release is available for architecture $architecture" }
}

$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "sparring-install-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
try {
    Write-Host 'Sparring installer'
    Write-Host 'Platform: Windows'
    Write-Host "Architecture: $architecture"
    Write-Host 'Reading the latest GitHub release.'

    $headers = @{
        Accept = 'application/vnd.github+json'
        'User-Agent' = 'sparring-installer'
    }
    $release = Invoke-RestMethod -Headers $headers -Uri $releaseApi
    $artifact = @($release.assets | Where-Object { $_.name -eq $artifactName }) | Select-Object -First 1
    $checksum = @($release.assets | Where-Object { $_.name -eq $checksumName }) | Select-Object -First 1
    if ($null -eq $artifact) { Stop-Installer "release $($release.tag_name) does not contain $artifactName" }
    if ($null -eq $checksum) { Stop-Installer "release $($release.tag_name) does not contain $checksumName" }

    if ($artifact.browser_download_url -notlike "https://github.com/$repository/releases/download/*") {
        Stop-Installer 'the release returned an unexpected download URL'
    }
    if ($checksum.browser_download_url -notlike "https://github.com/$repository/releases/download/*") {
        Stop-Installer 'the checksum returned an unexpected download URL'
    }

    $artifactPath = Join-Path $temporaryDirectory $artifactName
    $checksumPath = Join-Path $temporaryDirectory $checksumName
    Write-Host "Release: $($release.tag_name)"
    Write-Host "Downloading: $artifactName"
    Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri $artifact.browser_download_url -OutFile $artifactPath
    Write-Host "Downloading: $checksumName"
    Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri $checksum.browser_download_url -OutFile $checksumPath

    $checksumLine = Get-Content -LiteralPath $checksumPath | Where-Object {
        $_ -match ("^\s*[0-9a-fA-F]{64}\s+" + [regex]::Escape($artifactName) + "\s*$")
    } | Select-Object -First 1
    if ($null -eq $checksumLine) { Stop-Installer "the checksum file did not contain $artifactName" }
    $expected = ($checksumLine -split '\s+')[0].ToLowerInvariant()
    if ($expected -notmatch '^[0-9a-f]{64}$') { Stop-Installer "the checksum for $artifactName was malformed" }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $artifactPath).Hash.ToLowerInvariant()
    if ($expected -ne $actual) {
        Stop-Installer "checksum verification failed for $artifactName; nothing was installed"
    }
    Write-Host "Checksum verified: $artifactName"

    Write-Host 'Starting the verified Windows installer.'
    $process = Start-Process -FilePath $artifactPath -Wait -PassThru
    if ($process.ExitCode -ne 0) { Stop-Installer "the Windows installer exited with code $($process.ExitCode)" }
    Write-Host 'Installed Sparring.'
    Write-Host 'Windows may show SmartScreen because this release is unsigned. Choose More info, then Run anyway, if prompted.'
}
catch {
    Stop-Installer $_.Exception.Message
}
finally {
    if (Test-Path -LiteralPath $temporaryDirectory) {
        Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
    }
}
