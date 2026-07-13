$ErrorActionPreference = "Stop"

$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$PackageJson = Get-Content -LiteralPath (Join-Path $Root "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$Version = [string]$PackageJson.version
if ($Version.StartsWith("v")) {
    $Version = $Version.Substring(1)
}

$AppInfo = Get-Content -LiteralPath (Join-Path $Root "appinfo.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$AppId = [string]$AppInfo.id
$LocalReleaseDirPath = Join-Path $Root "..\..\releases"
if (Test-Path -LiteralPath (Join-Path $Root "..\..\scripts\github-upload-project.ps1")) {
    $ReleaseDirPath = $LocalReleaseDirPath
} else {
    $ReleaseDirPath = Join-Path $Root "releases"
}
New-Item -ItemType Directory -Force -Path $ReleaseDirPath | Out-Null
$ReleaseDir = (Resolve-Path -LiteralPath $ReleaseDirPath).Path
$PackageDir = Join-Path $Root "package\ddys-webos"
$Zip = Join-Path $ReleaseDir ("ddys-webos-v{0}.zip" -f $Version)
$Ipk = Join-Path $ReleaseDir ("ddys-webos-v{0}.ipk" -f $Version)
$ZipShaFile = "$Zip.sha256"
$IpkShaFile = "$Ipk.sha256"

function Assert-InRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Base
    )

    $separator = [System.IO.Path]::DirectorySeparatorChar
    $full = [System.IO.Path]::GetFullPath($Path)
    $baseFull = [System.IO.Path]::GetFullPath($Base).TrimEnd([char[]]@("\", "/")) + $separator
    if (-not $full.StartsWith($baseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to operate outside project root: $full"
    }
}

function Get-RelativePathCompat {
    param(
        [Parameter(Mandatory = $true)][string]$Base,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $separator = [System.IO.Path]::DirectorySeparatorChar
    $basePath = [System.IO.Path]::GetFullPath($Base).TrimEnd([char[]]@("\", "/")) + $separator
    $baseUri = New-Object System.Uri($basePath)
    $fileUri = New-Object System.Uri([System.IO.Path]::GetFullPath($Path))
    return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($fileUri).ToString()).Replace("/", $separator)
}

function New-ZipFromDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Output
    )

    if (Test-Path -LiteralPath $Output) {
        Remove-Item -LiteralPath $Output -Force
    }
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::Open($Output, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $packageFiles = Get-ChildItem -LiteralPath $Source -Recurse -Force -File
        foreach ($file in $packageFiles) {
            $relative = (Get-RelativePathCompat -Base $Source -Path $file.FullName).Replace("\", "/")
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $archive,
                $file.FullName,
                $relative,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    } finally {
        $archive.Dispose()
    }
}

function Invoke-TarGz {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Output
    )

    if (Test-Path -LiteralPath $Output) {
        Remove-Item -LiteralPath $Output -Force
    }
    $tar = Get-Command tar -ErrorAction SilentlyContinue
    if ($null -eq $tar) {
        throw "tar command is required to build a webOS ipk."
    }
    & $tar.Source -czf $Output -C $Source .
    if ($LASTEXITCODE -ne 0) {
        throw "tar failed while creating $Output"
    }
}

function New-ArArchive {
    param(
        [Parameter(Mandatory = $true)][string]$Output,
        [Parameter(Mandatory = $true)][array]$Entries
    )

    if (Test-Path -LiteralPath $Output) {
        Remove-Item -LiteralPath $Output -Force
    }
    $ascii = [System.Text.Encoding]::ASCII
    $stream = [System.IO.File]::Open($Output, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
    try {
        $globalHeader = $ascii.GetBytes("!<arch>`n")
        $stream.Write($globalHeader, 0, $globalHeader.Length)
        foreach ($entry in $Entries) {
            $name = [string]$entry.Name
            if (-not $name.EndsWith("/")) {
                $name = "$name/"
            }
            if ($name.Length -gt 16) {
                throw "ar entry name is too long: $name"
            }
            $bytes = [System.IO.File]::ReadAllBytes([string]$entry.Path)
            $header = $name.PadRight(16) +
                "0".PadRight(12) +
                "0".PadRight(6) +
                "0".PadRight(6) +
                "100644".PadRight(8) +
                ([string]$bytes.Length).PadRight(10) +
                "``" + "`n"
            $headerBytes = $ascii.GetBytes($header)
            if ($headerBytes.Length -ne 60) {
                throw "Invalid ar header length for $name"
            }
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($bytes, 0, $bytes.Length)
            if (($bytes.Length % 2) -eq 1) {
                $stream.WriteByte(10)
            }
        }
    } finally {
        $stream.Dispose()
    }
}

Assert-InRoot -Path $PackageDir -Base $Root
if (Test-Path -LiteralPath $PackageDir) {
    Remove-Item -LiteralPath $PackageDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $PackageDir | Out-Null

$excludeSegments = @(".git", "node_modules", "dist", "build", "coverage", "package", "releases")
$files = Get-ChildItem -LiteralPath $Root -Recurse -Force -File | Where-Object {
    $relative = (Get-RelativePathCompat -Base $Root -Path $_.FullName).Replace("\", "/")
    $segments = $relative -split "/"
    foreach ($segment in $segments) {
        if ($segment -in $excludeSegments) {
            return $false
        }
    }

    if ($_.Name -match "\.(log|tmp|cache|zip|ipk|tgz|tar|gz)$") {
        return $false
    }
    return $true
}

foreach ($file in $files) {
    $relative = Get-RelativePathCompat -Base $Root -Path $file.FullName
    $target = Join-Path $PackageDir $relative
    New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($target)) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target -Force
}

foreach ($path in @($Zip, $Ipk, $ZipShaFile, $IpkShaFile)) {
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Force
    }
}

New-ZipFromDirectory -Source $PackageDir -Output $Zip

$IpkWork = Join-Path $Root "package\ipk"
$ControlDir = Join-Path $IpkWork "control"
$DataRoot = Join-Path $IpkWork "data"
$AppRoot = Join-Path $DataRoot ("usr\palm\applications\{0}" -f $AppId)
Assert-InRoot -Path $IpkWork -Base $Root
if (Test-Path -LiteralPath $IpkWork) {
    Remove-Item -LiteralPath $IpkWork -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $ControlDir,$AppRoot | Out-Null

$control = @"
Package: $AppId
Version: $Version
Architecture: all
Maintainer: DDYS <dev@ddys.io>
Section: webos
Priority: optional
Description: DDYS LG webOS TV application
"@
Set-Content -LiteralPath (Join-Path $ControlDir "control") -Value $control -Encoding ASCII

foreach ($relative in @("appinfo.json", "index.html")) {
    Copy-Item -LiteralPath (Join-Path $Root $relative) -Destination (Join-Path $AppRoot $relative) -Force
}
foreach ($relative in @("assets", "src")) {
    Copy-Item -LiteralPath (Join-Path $Root $relative) -Destination (Join-Path $AppRoot $relative) -Recurse -Force
}

$DebianBinary = Join-Path $IpkWork "debian-binary"
$ControlTar = Join-Path $IpkWork "control.tar.gz"
$DataTar = Join-Path $IpkWork "data.tar.gz"
[System.IO.File]::WriteAllBytes($DebianBinary, [System.Text.Encoding]::ASCII.GetBytes("2.0`n"))
Invoke-TarGz -Source $ControlDir -Output $ControlTar
Invoke-TarGz -Source $DataRoot -Output $DataTar
New-ArArchive -Output $Ipk -Entries @(
    @{ Name = "debian-binary"; Path = $DebianBinary },
    @{ Name = "control.tar.gz"; Path = $ControlTar },
    @{ Name = "data.tar.gz"; Path = $DataTar }
)

$ZipHash = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash
$IpkHash = (Get-FileHash -LiteralPath $Ipk -Algorithm SHA256).Hash
Set-Content -LiteralPath $ZipShaFile -Value "$ZipHash  $(Split-Path -Leaf $Zip)" -Encoding ASCII
Set-Content -LiteralPath $IpkShaFile -Value "$IpkHash  $(Split-Path -Leaf $Ipk)" -Encoding ASCII

[pscustomobject]@{
    ok = $true
    zip = $Zip
    ipk = $Ipk
    zipSha256 = $ZipHash
    ipkSha256 = $IpkHash
    files = @($files).Count
} | ConvertTo-Json -Depth 3
