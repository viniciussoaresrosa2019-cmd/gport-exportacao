param(
  [string]$BaseUrl = 'https://gport-exportacao-hml.onrender.com'
)

$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')
$targets = @(
  @{ Name = 'home'; Url = "$base/" },
  @{ Name = 'health'; Url = "$base/api/health" },
  @{ Name = 'experience_js'; Url = "$base/assets/experience.js" },
  @{ Name = 'experience_css'; Url = "$base/assets/experience.css" }
)

Write-Host "Medição passiva: $base" -ForegroundColor Cyan
Write-Host 'Não faz login, não envia cookies e não altera dados.' -ForegroundColor DarkGray

$results = foreach ($target in $targets) {
  try {
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-WebRequest -Uri $target.Url -UseBasicParsing -MaximumRedirection 0
    $watch.Stop()
    [PSCustomObject]@{
      recurso = $target.Name
      status = $response.StatusCode
      bytes = $response.RawContentLength
      milissegundos = [math]::Round($watch.Elapsed.TotalMilliseconds)
      cache_control = ($response.Headers['Cache-Control'] -join '; ')
      hsts = [bool]$response.Headers['Strict-Transport-Security']
      csp = [bool]$response.Headers['Content-Security-Policy']
    }
  } catch {
    [PSCustomObject]@{
      recurso = $target.Name; status = 'erro'; bytes = 0; milissegundos = 0
      cache_control = ''; hsts = $false; csp = $false
    }
  }
}

$results | Format-Table -AutoSize
$results | ConvertTo-Json -Depth 3
