$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$project = Split-Path -Parent $env:LQ_BOOTSTRAP
Set-Location -LiteralPath $project
$env:LQ_LOG = Join-Path $project 'REGISTRO-PUBLICACION.txt'
Set-Content -LiteralPath $env:LQ_LOG -Encoding UTF8 -Value ('Inicio: ' + (Get-Date).ToString('s'))
function Stage([string]$message) {
    Write-Host $message
    Add-Content -LiteralPath $env:LQ_LOG -Encoding UTF8 -Value $message
}
try {
    Stage 'Paso 1/4: preparando Node.js. La primera vez puede demorar unos minutos.'
    $runtimeDir = Join-Path $project '.runtime'
    $runtimeNode = Get-ChildItem -Path (Join-Path $runtimeDir 'node-v*-win-*\node.exe') -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $runtimeNode) {
        New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
        $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
        $baseUrl = 'https://nodejs.org/dist/latest-v22.x/'
        Stage 'Descargando Node.js portatil desde nodejs.org. Espera hasta que termine...' 
        $sums = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 90 -Uri ($baseUrl + 'SHASUMS256.txt')).Content
        $pattern = '(?m)^([a-f0-9]{64})\s+(node-v[0-9.]+-win-' + $arch + '\.zip)\s*$'
        $match = [regex]::Match($sums, $pattern)
        if (-not $match.Success) { throw 'No se encontro el paquete oficial de Node.js para esta computadora.' }
        $zipName = $match.Groups[2].Value
        $zipPath = Join-Path $runtimeDir $zipName
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 180 -Uri ($baseUrl + $zipName) -OutFile $zipPath
        $actual = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne $match.Groups[1].Value) { throw 'La comprobacion de integridad de Node.js fallo. No se ejecuto el archivo.' }
        Expand-Archive -LiteralPath $zipPath -DestinationPath $runtimeDir -Force
        $runtimeNode = Get-Item -LiteralPath (Join-Path (Join-Path $runtimeDir ($zipName -replace '\.zip$', '')) 'node.exe')
    }
    $nodeDir = Split-Path -Parent $runtimeNode.FullName
    $env:Path = $nodeDir + ';' + $env:Path
    $env:WRANGLER_SEND_METRICS = 'false'
    if (-not (Test-Path -LiteralPath (Join-Path $project 'node_modules\wrangler\bin\wrangler.js'))) {
        Stage 'Paso 2/4: descargando la herramienta oficial de Cloudflare...' 
        & (Join-Path $nodeDir 'npm.cmd') install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo descargar la herramienta de Cloudflare.' }
    }
    Stage 'Paso 3/4: conectando con Cloudflare desde esta computadora...'
    & $runtimeNode.FullName (Join-Path $project 'publicar.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'La publicacion no finalizo. Revisa REGISTRO-PUBLICACION.txt y el mensaje de esta ventana.' }
    Stage 'Proceso terminado. Revisa DIRECCION-DE-LA-WEB.txt para conocer el resultado de la verificacion.'
} catch {
    $message = 'ERROR: ' + $_.Exception.Message
    Write-Host $message -ForegroundColor Red
    Add-Content -LiteralPath $env:LQ_LOG -Encoding UTF8 -Value $message
    Add-Content -LiteralPath $env:LQ_LOG -Encoding UTF8 -Value ('Linea del iniciador: ' + $_.InvocationInfo.ScriptLineNumber)
    Start-Process notepad.exe -ArgumentList ('"' + $env:LQ_LOG + '"')
    exit 1
}
