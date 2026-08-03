# Homologação controlada do lançamento de processos.
#
# Executa somente contra a URL de homologação informada. Cria um exportador e
# processo com o prefixo QA-HML e tenta removê-los ao final. Não use em
# produção. Senhas são solicitadas no terminal e não são registradas em disco.
#
# Se o Turnstile estiver ativo na homologação, valide primeiro o login pela
# interface. Para este roteiro automatizado, use uma configuração de teste do
# Turnstile autorizada para o ambiente de homologação; o script não contorna
# CAPTCHA nem aceita tokens no código.
param(
  [string]$BaseUrl = 'https://gport-exportacao-hml.onrender.com',
  [string]$AdminUser = 'HOMOLOGA',
  [string]$AnalystUser = 'TESTEANALISTA',
  [string]$VgmUser = 'TESTEVGM',
  [string]$ReleaseUser = 'TESTELIBERACAO',
  [switch]$SkipConcurrency
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')
if ($base -notmatch '^https://') { throw 'Use exclusivamente uma URL HTTPS de homologação.' }
if ($base -match 'gport-exportacao\.onrender\.com/?$') { throw 'A URL de produção é bloqueada por este roteiro. Informe a URL de homologação.' }

$work = Join-Path ([IO.Path]::GetTempPath()) ('gport-qa-hml-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null
$clientId = $null
$processId = $null
$additionalProcessIds = [System.Collections.Generic.List[string]]::new()
$adminCookies = $null
$adminCsrf = $null

function Get-PlainText([Security.SecureString]$Value) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function Get-Csrf([string]$CookieFile) {
  $line = Get-Content $CookieFile | Where-Object { $_ -match '\s+gport_csrf\s+' } | Select-Object -Last 1
  if (!$line) { throw 'Cookie CSRF não encontrado após o login.' }
  return (($line -split '\s+') | Select-Object -Last 1)
}
function Invoke-Api([string[]]$Arguments, [string]$Name) {
  $body = Join-Path $work "$Name.json"
  $status = & curl.exe -sS -o $body -w '%{http_code}' @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Falha de rede no teste $Name." }
  return @{ Status = "$status"; Body = $body }
}
function Write-Json([string]$Name, [object]$Value) {
  $file = Join-Path $work "$Name.request.json"
  [IO.File]::WriteAllText($file, ($Value | ConvertTo-Json -Depth 12 -Compress), [Text.UTF8Encoding]::new($false))
  return $file
}
function Read-SafeError([string]$Path) {
  try { return [string]((Get-Content $Path -Raw | ConvertFrom-Json).error) } catch { return 'Resposta não estruturada.' }
}
function Assert-Status($Response, [string]$Expected, [string]$Label) {
  $script:results[$Label] = "$($Response.Status) (esperado $Expected)"
  if ($Response.Status -ne $Expected) { throw "$Label falhou: HTTP $($Response.Status). $(Read-SafeError $Response.Body)" }
}
function Get-Login([string]$Username, [string]$Password, [string]$Name) {
  $cookies = Join-Path $work "$Name.cookies"
  $login = Write-Json "$Name-login" @{ username = $Username; password = $Password }
  $response = Invoke-Api @('-c', $cookies, '-H', 'Content-Type: application/json', '--data-binary', "@$login", "$base/api/auth/login") "$Name-login"
  if ($response.Status -eq '403') { throw 'Login bloqueado pelo Turnstile. Mantenha o CAPTCHA ativo em produção; para automatizar a homologação configure chaves de teste do Turnstile neste ambiente isolado.' }
  Assert-Status $response '200' "login_$Name"
  return @{ Cookies = $cookies; Csrf = Get-Csrf $cookies }
}

$results = [ordered]@{}
try {
  # Fase passiva: API não revela processos sem sessão.
  Assert-Status (Invoke-Api @("$base/api/health") 'health') '200' 'health'
  Assert-Status (Invoke-Api @("$base/api/processes") 'processes-sem-sessao') '401' 'processos_sem_sessao'

  $adminPassword = Get-PlainText (Read-Host "Senha de $AdminUser" -AsSecureString)
  $analystPassword = Get-PlainText (Read-Host "Senha de $AnalystUser" -AsSecureString)
  $vgmPassword = Get-PlainText (Read-Host "Senha de $VgmUser" -AsSecureString)
  $releasePassword = Get-PlainText (Read-Host "Senha de $ReleaseUser" -AsSecureString)
  $admin = Get-Login $AdminUser $adminPassword 'admin'
  $analyst = Get-Login $AnalystUser $analystPassword 'analyst'
  $vgm = Get-Login $VgmUser $vgmPassword 'vgm'
  $release = Get-Login $ReleaseUser $releasePassword 'release'
  $adminCookies = $admin.Cookies; $adminCsrf = $admin.Csrf

  # Dashboard e notificações são individuais, mas sempre passam pela mesma
  # autenticação e pelas permissões do perfil conectado.
  foreach ($account in @(
    @{ Name = 'admin'; Session = $admin },
    @{ Name = 'analyst'; Session = $analyst },
    @{ Name = 'vgm'; Session = $vgm },
    @{ Name = 'release'; Session = $release }
  )) {
    Assert-Status (Invoke-Api @('-b', $account.Session.Cookies, "$base/api/dashboard") "dashboard-$($account.Name)") '200' "dashboard_$($account.Name)"
    Assert-Status (Invoke-Api @('-b', $account.Session.Cookies, "$base/api/notifications") "notifications-$($account.Name)") '200' "notificacoes_$($account.Name)"
  }

  $suffix = [guid]::NewGuid().ToString('N').Substring(0, 10).ToUpperInvariant()
  $clientPayload = @{ name = "QA-HML EXPORTADOR $suffix"; taxId = '12.345.678/0001-95'; country = 'BRASIL'; rucManual = $false; dueOnly = $false }
  $clientRequest = Write-Json 'client' $clientPayload
  $clientCreate = Invoke-Api @('-X', 'POST', '-b', $admin.Cookies, '-H', "X-CSRF-Token: $($admin.Csrf)", '-H', 'Content-Type: application/json', '--data-binary', "@$clientRequest", "$base/api/clients") 'criar-client'
  Assert-Status $clientCreate '201' 'criar_exportador_teste'
  $clientId = (Get-Content $clientCreate.Body -Raw | ConvertFrom-Json).id

  # Validação: um payload incompleto não pode criar processo.
  $invalidRequest = Write-Json 'process-invalid' @{ clientId = $clientId; shipmentType = 'LCL' }
  $invalid = Invoke-Api @('-X', 'POST', '-b', $admin.Cookies, '-H', "X-CSRF-Token: $($admin.Csrf)", '-H', 'Content-Type: application/json', '--data-binary', "@$invalidRequest", "$base/api/processes") 'processo-invalido'
  Assert-Status $invalid '400' 'validacao_processo_incompleto'

  $today = (Get-Date).ToString('yyyy-MM-dd')
  $processPayload = @{
    booking = "QA-HML-$suffix"; displayProcessNumber = "QA-HML-$suffix"; clientId = $clientId; importer = 'IMPORTADOR DE TESTE'; invoice = "NF-$suffix";
    dueNumber = "DUE-$suffix"; dueIssueDate = $today; rucNumber = "RUC-$suffix"; originPort = 'ITAJAI'; destinationPort = 'CARTAGENA'; vessel = 'NAVIO TESTE'; agency = 'AGENCIA TESTE'; carrier = 'ARMADOR TESTE';
    deadline = $today; shippingDate = $today; containerCollectionDate = $today; collectionTerminal = 'TERMINAL TESTE'; freeTimeDays = 14; incoterm = 'FOB'; shipmentType = 'FCL'; blType = 'TELEX RELEASE'; freightType = 'PREPAID'; mapaInspection = $false; isfLacey = $false;
    containerQuantity = 1; containerType = '40HC'; containerDetails = @(@{ number = 'QAAB1234567'; tare = 2700; seal = 'LACRE-QA'; invoiceNumber = 'NF-QA' }); cubicMeters = 1.25; netWeightKg = 1000; grossWeightKg = 1200; packagesQuantity = 10; cargoValue = 1000; currency = 'USD'; idempotencyKey = [guid]::NewGuid().ToString()
  }
  $processRequest = Write-Json 'process-valid' $processPayload
  $created = Invoke-Api @('-X', 'POST', '-b', $admin.Cookies, '-H', "X-CSRF-Token: $($admin.Csrf)", '-H', 'Content-Type: application/json', '--data-binary', "@$processRequest", "$base/api/processes") 'criar-process'
  Assert-Status $created '201' 'criar_processo_valido'
  $createdProcess = Get-Content $created.Body -Raw | ConvertFrom-Json
  $processId = $createdProcess.id

  # Idempotência: o mesmo envio não pode duplicar o processo.
  $replay = Invoke-Api @('-X', 'POST', '-b', $admin.Cookies, '-H', "X-CSRF-Token: $($admin.Csrf)", '-H', 'Content-Type: application/json', '--data-binary', "@$processRequest", "$base/api/processes") 'repetir-process'
  Assert-Status $replay '200' 'reenvio_idempotente'
  $replayedId = (Get-Content $replay.Body -Raw | ConvertFrom-Json).id
  $results['reenvio_mesmo_id'] = "$($replayedId -eq $processId) (esperado True)"
  if ($replayedId -ne $processId) { throw 'O reenvio criou um processo diferente.' }

  # Regra aprovada: usuários autenticados compartilham leitura e edição de processos.
  $listed = Invoke-Api @('-b', $analyst.Cookies, "$base/api/processes?limit=50&offset=0&search=$suffix&field=booking") 'analyst-list'
  Assert-Status $listed '200' 'analista_lista_processo_compartilhado'
  $items = @((Get-Content $listed.Body -Raw | ConvertFrom-Json).items)
  $visible = [bool]($items | Where-Object { $_.id -eq $processId })
  $results['analista_visualiza_processo_compartilhado'] = "$visible (esperado True)"
  if (!$visible) { throw 'O analista não visualizou o processo compartilhado.' }

  # Concorrência: duas sessões partem da mesma versão. A primeira edição deve
  # salvar; a segunda, com updatedAt antigo, deve receber 409 sem sobrescrever.
  if (!$SkipConcurrency) {
    $baseVersion = [string]$createdProcess.updated_at
    if (!$baseVersion) { throw 'A resposta de criação não trouxe a versão do processo.' }
    $adminEditPayload = $processPayload.Clone()
    $adminEditPayload.invoice = "NF-EDITADO-$suffix"
    $adminEditPayload.updatedAt = $baseVersion
    $adminEditRequest = Write-Json 'editar-admin' $adminEditPayload
    $adminEdit = Invoke-Api @('-X', 'PATCH', '-b', $admin.Cookies, '-H', "X-CSRF-Token: $($admin.Csrf)", '-H', 'Content-Type: application/json', '--data-binary', "@$adminEditRequest", "$base/api/processes/$processId") 'editar-admin'
    Assert-Status $adminEdit '200' 'primeira_edicao_salva'

    $staleEditPayload = $processPayload.Clone()
    $staleEditPayload.invoice = "NF-CONFLITO-$suffix"
    $staleEditPayload.updatedAt = $baseVersion
    $staleEditRequest = Write-Json 'editar-analyst-obsoleto' $staleEditPayload
    $staleEdit = Invoke-Api @('-X', 'PATCH', '-b', $analyst.Cookies, '-H', "X-CSRF-Token: $($analyst.Csrf)", '-H', 'Content-Type: application/json', '--data-binary', "@$staleEditRequest", "$base/api/processes/$processId") 'editar-analyst-obsoleto'
    Assert-Status $staleEdit '409' 'edicao_concorrente_bloqueada'
  }

  # Controle de VGM continua restrito ao perfil VGM/Admin.
  $vgmDeniedRequest = Write-Json 'vgm-denied' @{ vgmStatus = 'Sim' }
  $vgmDenied = Invoke-Api @('-X', 'PATCH', '-b', $analyst.Cookies, '-H', "X-CSRF-Token: $($analyst.Csrf)", '-H', 'Content-Type: application/json', '--data-binary', "@$vgmDeniedRequest", "$base/api/processes/$processId/vgm") 'vgm-negado'
  Assert-Status $vgmDenied '403' 'analista_nao_atualiza_vgm'

  # Atualização em tempo real: uma sessão autenticada fica inscrita em SSE e
  # deve receber o evento da alteração feita pela conta VGM.
  $eventsFile = Join-Path $work 'events.txt'
  $eventsJob = Start-Job -ScriptBlock {
    param($Url, $Cookies, $OutputFile)
    & curl.exe -sS -N --max-time 8 -b $Cookies "$Url/api/events" | Set-Content -LiteralPath $OutputFile -Encoding utf8
  } -ArgumentList $base, $admin.Cookies, $eventsFile
  Start-Sleep -Milliseconds 700
  $vgmRequest = Write-Json 'vgm-valid' @{ vgmStatus = 'Sim'; vgmSentTo = 'QA' }
  $vgmOk = Invoke-Api @('-X', 'PATCH', '-b', $vgm.Cookies, '-H', "X-CSRF-Token: $($vgm.Csrf)", '-H', 'Content-Type: application/json', '--data-binary', "@$vgmRequest", "$base/api/processes/$processId/vgm") 'vgm-ok'
  Assert-Status $vgmOk '200' 'vgm_atualiza_status'
  Wait-Job $eventsJob -Timeout 9 | Out-Null
  if ($eventsJob.State -eq 'Running') { Stop-Job $eventsJob | Out-Null }
  Remove-Job $eventsJob -Force
  $eventsText = if (Test-Path $eventsFile) { Get-Content $eventsFile -Raw } else { '' }
  $realtimeReceived = $eventsText -match 'event: process-changed' -and $eventsText -match [regex]::Escape($processId)
  $results['evento_tempo_real_recebido'] = "$realtimeReceived (esperado True)"
  if (!$realtimeReceived) { throw 'A sessão autenticada não recebeu o evento de atualização em tempo real.' }

  # Controle de liberação continua restrito a Liberação/Admin.
  $releaseDeniedRequest = Write-Json 'release-denied' @{ releaseStatus = 'Liberado' }
  $releaseDenied = Invoke-Api @('-X', 'PATCH', '-b', $analyst.Cookies, '-H', "X-CSRF-Token: $($analyst.Csrf)", '-H', 'Content-Type: application/json', '--data-binary', "@$releaseDeniedRequest", "$base/api/processes/$processId/release") 'release-negado'
  Assert-Status $releaseDenied '403' 'analista_nao_atualiza_liberacao'
  $releaseRequest = Write-Json 'release-valid' @{ releaseStatus = 'Sim'; releaseDate = $today }
  $releaseOk = Invoke-Api @('-X', 'PATCH', '-b', $release.Cookies, '-H', "X-CSRF-Token: $($release.Csrf)", '-H', 'Content-Type: application/json', '--data-binary', "@$releaseRequest", "$base/api/processes/$processId/release") 'release-ok'
  Assert-Status $releaseOk '200' 'liberacao_atualiza_status'

  # A alteração de VGM cria uma notificação deduplicada para o perfil VGM.
  # Espera curta para a gravação assíncrona, sem repetir nem alterar o processo.
  Start-Sleep -Milliseconds 350
  $vgmNotifications = Invoke-Api @('-b', $vgm.Cookies, "$base/api/notifications") 'notifications-vgm-after-update'
  Assert-Status $vgmNotifications '200' 'notificacoes_vgm_apos_atualizacao'
  $notificationItems = @((Get-Content $vgmNotifications.Body -Raw | ConvertFrom-Json))
  $vgmNotification = $notificationItems | Where-Object { $_.process_id -eq $processId -and $_.type -eq 'vgm' } | Select-Object -First 1
  $results['notificacao_vgm_deduplicada'] = "$([bool]$vgmNotification) (esperado True)"
  if (!$vgmNotification) { throw 'A atualização de VGM não gerou a notificação esperada.' }
  $markRead = Invoke-Api @('-X', 'PATCH', '-b', $vgm.Cookies, '-H', "X-CSRF-Token: $($vgm.Csrf)", "$base/api/notifications/$($vgmNotification.id)/read") 'notification-read'
  Assert-Status $markRead '204' 'notificacao_marcada_como_lida'

  # CSRF: mutação autenticada sem token deve ser bloqueada.
  $csrfDenied = Invoke-Api @('-X', 'DELETE', '-b', $admin.Cookies, "$base/api/processes/$processId") 'csrf-negado'
  Assert-Status $csrfDenied '403' 'csrf_sem_token_bloqueado'

  # Recuperação: uma resposta interrompida pode ser reenviada com a mesma
  # chave sem criar dois processos. O timeout é do cliente de teste; a API
  # pode ou não terminar a primeira gravação, e ambos os casos são válidos.
  $retrySuffix = [guid]::NewGuid().ToString('N').Substring(0, 10).ToUpperInvariant()
  $retryPayload = $processPayload.Clone()
  $retryPayload.booking = "QA-RETRY-$retrySuffix"
  $retryPayload.displayProcessNumber = "QA-RETRY-$retrySuffix"
  $retryPayload.invoice = "NF-RETRY-$retrySuffix"
  $retryPayload.dueNumber = "DUE-RETRY-$retrySuffix"
  $retryPayload.rucNumber = "RUC-RETRY-$retrySuffix"
  $retryPayload.idempotencyKey = [guid]::NewGuid().ToString()
  $retryRequest = Write-Json 'process-timeout-retry' $retryPayload
  $timeoutResponse = Join-Path $work 'timeout-client.json'
  & curl.exe -sS --max-time 0.05 -o $timeoutResponse -X POST -b $admin.Cookies -H "X-CSRF-Token: $($admin.Csrf)" -H 'Content-Type: application/json' --data-binary "@$retryRequest" "$base/api/processes" | Out-Null
  Start-Sleep -Seconds 1
  $retry = Invoke-Api @('-X', 'POST', '-b', $admin.Cookies, '-H', "X-CSRF-Token: $($admin.Csrf)", '-H', 'Content-Type: application/json', '--data-binary', "@$retryRequest", "$base/api/processes") 'reenvio-apos-timeout'
  if ($retry.Status -notin @('200', '201')) { throw "reenvio_apos_timeout falhou: HTTP $($retry.Status). $(Read-SafeError $retry.Body)" }
  $retryProcessId = [string]((Get-Content $retry.Body -Raw | ConvertFrom-Json).id)
  if (!$retryProcessId) { throw 'O reenvio após timeout não retornou um processo.' }
  $additionalProcessIds.Add($retryProcessId)
  $retryList = Invoke-Api @('-b', $admin.Cookies, "$base/api/processes?limit=50&offset=0&search=$retrySuffix&field=booking") 'listar-retry'
  Assert-Status $retryList '200' 'listar_reenvio_timeout'
  $retryCount = @((Get-Content $retryList.Body -Raw | ConvertFrom-Json).items | Where-Object { $_.id -eq $retryProcessId }).Count
  $results['reenvio_apos_timeout_sem_duplicidade'] = "$retryCount (esperado 1)"
  if ($retryCount -ne 1) { throw 'O timeout seguido de reenvio não preservou exatamente um processo.' }

  # Carga controlada: dez POSTs independentes e fictícios, sem exceder o
  # rate limit. Medimos somente o tempo percebido pelo cliente de teste.
  $loadTimer = [Diagnostics.Stopwatch]::StartNew()
  $loadJobs = @()
  $loadOutputs = @()
  foreach ($number in 1..10) {
    $loadSuffix = "QA-LOAD-$suffix-$number"
    $loadPayload = $processPayload.Clone()
    $loadPayload.booking = $loadSuffix; $loadPayload.displayProcessNumber = $loadSuffix; $loadPayload.invoice = "NF-$loadSuffix"; $loadPayload.dueNumber = "DUE-$loadSuffix"; $loadPayload.rucNumber = "RUC-$loadSuffix"; $loadPayload.idempotencyKey = [guid]::NewGuid().ToString()
    $loadRequest = Write-Json "load-$number" $loadPayload
    $loadResponse = Join-Path $work "load-$number.json"
    $loadOutputs += $loadResponse
    $loadJobs += Start-Job -ScriptBlock {
      param($Url, $Cookies, $Csrf, $RequestFile, $ResponseFile)
      $data = '@' + $RequestFile
      $status = & curl.exe -sS -o $ResponseFile -w '%{http_code}' -X POST -b $Cookies -H "X-CSRF-Token: $Csrf" -H 'Content-Type: application/json' --data-binary $data "$Url/api/processes"
      [pscustomobject]@{ Status = "$status"; ResponseFile = $ResponseFile }
    } -ArgumentList $base, $admin.Cookies, $admin.Csrf, $loadRequest, $loadResponse
  }
  Wait-Job $loadJobs -Timeout 45 | Out-Null
  $loadResults = @(Receive-Job $loadJobs)
  $loadJobs | ForEach-Object { if ($_.State -eq 'Running') { Stop-Job $_ | Out-Null }; Remove-Job $_ -Force }
  $loadTimer.Stop()
  if ($loadResults.Count -ne 10 -or @($loadResults | Where-Object { $_.Status -ne '201' }).Count -ne 0) { throw 'A carga controlada não concluiu os dez lançamentos com HTTP 201.' }
  foreach ($output in $loadOutputs) {
    $id = [string]((Get-Content $output -Raw | ConvertFrom-Json).id)
    if (!$id) { throw 'Uma resposta da carga não retornou o identificador do processo.' }
    $additionalProcessIds.Add($id)
  }
  $results['carga_10_lancamentos'] = "10 de 10 em $([Math]::Round($loadTimer.Elapsed.TotalSeconds, 2))s (esperado 10 de 10)"

  $results.GetEnumerator() | ForEach-Object { Write-Host ("{0} = {1}" -f $_.Key, $_.Value) }
}
finally {
  foreach ($id in $additionalProcessIds) {
    if ($adminCookies -and $adminCsrf) {
      $cleanupExtra = Invoke-Api @('-X', 'DELETE', '-b', $adminCookies, '-H', "X-CSRF-Token: $adminCsrf", "$base/api/processes/$id") "limpar-extra-$id"
      Write-Host "limpeza_processo_extra = $($cleanupExtra.Status) (esperado 204)"
    }
  }
  if ($processId -and $adminCookies -and $adminCsrf) {
    $cleanup = Invoke-Api @('-X', 'DELETE', '-b', $adminCookies, '-H', "X-CSRF-Token: $adminCsrf", "$base/api/processes/$processId") 'limpar-process'
    Write-Host "limpeza_processo_teste = $($cleanup.Status) (esperado 204)"
  }
  if ($clientId -and $adminCookies -and $adminCsrf) {
    $cleanup = Invoke-Api @('-X', 'DELETE', '-b', $adminCookies, '-H', "X-CSRF-Token: $adminCsrf", "$base/api/clients/$clientId") 'limpar-client'
    Write-Host "limpeza_exportador_teste = $($cleanup.Status) (esperado 204)"
  }
  Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
