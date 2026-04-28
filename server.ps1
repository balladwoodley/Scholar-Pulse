$ErrorActionPreference = "Stop"

param(
  [int]$Port = 4173
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)

try {
  $listener.Start()
}
catch [System.Net.Sockets.SocketException] {
  throw "Port $Port is already in use. Scholar Pulse is probably already running at http://localhost:$Port/ . Reuse that tab, stop the existing process, or launch a new instance with -Port 4174."
}

Write-Host "Scholar Pulse server running at http://localhost:$Port/"

$contentTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
}

$script:LastSemanticScholarCall = [datetime]::MinValue

function Send-Response {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [byte[]]$Body,
    [string]$ContentType
  )

  $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Length: $($Body.Length)`r`nContent-Type: $ContentType`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
}

function Send-Json {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [object]$Payload
  )

  $json = $Payload | ConvertTo-Json -Depth 10
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  Send-Response -Stream $Stream -StatusCode $StatusCode -StatusText "OK" -Body $bytes -ContentType "application/json; charset=utf-8"
}

function Read-QueryParams {
  param([string]$Path)
  $params = @{}
  $queryString = ($Path -split "\?", 2)[1]
  if (-not $queryString) {
    return $params
  }

  foreach ($part in $queryString -split "&") {
    if ([string]::IsNullOrWhiteSpace($part)) {
      continue
    }
    $name, $value = $part -split "=", 2
    $safeName = if ($null -ne $name) { $name } else { "" }
    $safeValue = if ($null -ne $value) { $value } else { "" }
    $decodedName = [System.Uri]::UnescapeDataString($safeName.Replace("+", " "))
    $decodedValue = [System.Uri]::UnescapeDataString($safeValue.Replace("+", " "))
    $params[$decodedName] = $decodedValue
  }
  return $params
}

function Invoke-JsonRequest {
  param(
    [string]$Uri,
    [hashtable]$Headers = @{},
    [int]$MinimumDelayMs = 0
  )

  if ($MinimumDelayMs -gt 0 -and $script:LastSemanticScholarCall -ne [datetime]::MinValue) {
    $elapsed = ([datetime]::UtcNow - $script:LastSemanticScholarCall.ToUniversalTime()).TotalMilliseconds
    if ($elapsed -lt $MinimumDelayMs) {
      Start-Sleep -Milliseconds ([int]($MinimumDelayMs - $elapsed))
    }
  }

  $response = Invoke-WebRequest -Uri $Uri -Headers $Headers -UseBasicParsing
  if ($MinimumDelayMs -gt 0) {
    $script:LastSemanticScholarCall = [datetime]::UtcNow
  }
  return $response.Content | ConvertFrom-Json
}

function Normalize-Whitespace {
  param([string]$Value)
  if (-not $Value) {
    return ""
  }
  return ([regex]::Replace($Value, "\s+", " ")).Trim()
}

function Get-ArxivEntries {
  param(
    [string]$Query,
    [int]$Limit
  )

  $warnings = New-Object System.Collections.Generic.List[string]
  $isOrcid = $Query -match '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$'
  $xmlText = $null
  $mode = if ($isOrcid) { "orcid" } else { "author" }
  $displayName = $Query

  if ($isOrcid) {
    $uri = "https://arxiv.org/a/$Query.atom"
    $xmlText = (Invoke-WebRequest -Uri $uri -UseBasicParsing).Content
  } else {
    $encoded = [System.Uri]::EscapeDataString('"' + $Query + '"')
    $uri = "http://export.arxiv.org/api/query?search_query=au:$encoded&start=0&max_results=$([Math]::Max($Limit * 3, 20))&sortBy=submittedDate&sortOrder=descending"
    $xmlText = (Invoke-WebRequest -Uri $uri -UseBasicParsing).Content
  }

  $doc = [xml]$xmlText
  $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
  $ns.AddNamespace("a", "http://www.w3.org/2005/Atom")
  $ns.AddNamespace("arxiv", "http://arxiv.org/schemas/atom")
  $entries = @($doc.SelectNodes("//a:entry", $ns))

  if ($isOrcid) {
    $title = $doc.SelectSingleNode("//a:feed/a:title", $ns)
    if ($title) {
      $displayName = ($title.InnerText -replace "'s articles on arXiv$", "").Trim()
    }
  }

  if (-not $isOrcid) {
    $tokens = $Query.ToLowerInvariant().Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)
    $entries = @(
      $entries | Where-Object {
        $authorNames = @($_.SelectNodes("./a:author/a:name", $ns) | ForEach-Object { $_.InnerText.ToLowerInvariant() })
        $authorNames | Where-Object {
          $name = $_
          ($tokens | Where-Object { $name -like "*$_*" }).Count -eq $tokens.Count
        }
      }
    )

    if (-not $entries.Count) {
      $warnings.Add("No exact author-name filter hit cleanly, so the raw arXiv author query may need a more specific name or ORCID.")
      $entries = @($doc.SelectNodes("//a:entry", $ns))
    }
  }

  $publications = foreach ($entry in $entries | Select-Object -First $Limit) {
    $idText = Normalize-Whitespace $entry.SelectSingleNode("./a:id", $ns).InnerText
    $versionedId = ($idText -split "/")[-1]
    $baseId = $versionedId -replace 'v\d+$', ''
    $title = Normalize-Whitespace $entry.SelectSingleNode("./a:title", $ns).InnerText
    $summary = Normalize-Whitespace $entry.SelectSingleNode("./a:summary", $ns).InnerText
    $commentNode = $entry.SelectSingleNode("./arxiv:comment", $ns)
    $doiNode = $entry.SelectSingleNode("./arxiv:doi", $ns)
    $journalNode = $entry.SelectSingleNode("./arxiv:journal_ref", $ns)
    $primaryCategoryNode = $entry.SelectSingleNode("./arxiv:primary_category", $ns)
    $absLink = $entry.SelectNodes("./a:link", $ns) | Where-Object { $_.rel -eq "alternate" } | Select-Object -First 1
    $pdfLink = $entry.SelectNodes("./a:link", $ns) | Where-Object { $_.title -eq "pdf" } | Select-Object -First 1
    $authors = @($entry.SelectNodes("./a:author/a:name", $ns) | ForEach-Object { Normalize-Whitespace $_.InnerText })
    $comment = if ($commentNode) { Normalize-Whitespace $commentNode.InnerText } else { "" }
    $doi = if ($doiNode) { Normalize-Whitespace $doiNode.InnerText } else { "" }
    $journalRef = if ($journalNode) { Normalize-Whitespace $journalNode.InnerText } else { "" }
    $primaryCategory = if ($primaryCategoryNode) { $primaryCategoryNode.term } else { "" }
    $absUrl = if ($absLink) { $absLink.href } else { "https://arxiv.org/abs/$versionedId" }
    $pdfUrl = if ($pdfLink) { $pdfLink.href } else { "https://arxiv.org/pdf/$versionedId" }
    $absUrl = $absUrl -replace '^http://', 'https://'
    $pdfUrl = $pdfUrl -replace '^http://', 'https://'
    [object[]]$githubUrls = Get-ExternalLinks -Text @($title, $summary, $comment)

    [ordered]@{
      arxivId = $baseId
      versionedArxivId = $versionedId
      title = $title
      summary = $summary
      comment = $comment
      doi = $doi
      journalRef = $journalRef
      primaryCategory = $primaryCategory
      published = Normalize-Whitespace $entry.SelectSingleNode("./a:published", $ns).InnerText
      updated = Normalize-Whitespace $entry.SelectSingleNode("./a:updated", $ns).InnerText
      authors = $authors
      absUrl = $absUrl
      pdfUrl = $pdfUrl
      githubUrls = $githubUrls
      sectionStats = $null
      citationCount = $null
      influentialCitationCount = $null
      openAccessPdf = $null
      semanticScholarUrl = $null
    }
  }

  return [ordered]@{
    scholar = [ordered]@{
      query = $Query
      displayName = $displayName
      mode = $mode
    }
    warnings = $warnings
    publications = $publications
  }
}

function Get-ExternalLinks {
  param([string[]]$Text)
  $all = ($Text | Where-Object { $_ } | ForEach-Object { $_ }) -join " "
  $matches = [regex]::Matches($all, '(https?://[^\s\]\)>,;"]+)')
  $urls = @()
  foreach ($match in $matches) {
    $url = $match.Groups[1].Value.TrimEnd(".")
    if ($url -match 'github\.com') {
      $urls += $url
    }
  }
  return @($urls | Select-Object -Unique)
}

function Get-SectionStats {
  param([string]$ArxivId)

  $tempPath = Join-Path ([System.IO.Path]::GetTempPath()) ("scholar-pulse-" + [System.Guid]::NewGuid().ToString() + ".tar")
  try {
    Invoke-WebRequest -Uri "https://arxiv.org/e-print/$ArxivId" -OutFile $tempPath -UseBasicParsing
    $tarList = & tar -tf $tempPath 2>$null
    if (-not $tarList) {
      return $null
    }

    $texFiles = @($tarList | Where-Object { $_ -match '\.tex$' }) | Select-Object -First 12
    if (-not $texFiles.Count) {
      return $null
    }

    $candidates = foreach ($file in $texFiles) {
      $content = & tar -xOf $tempPath $file 2>$null
      if (-not $content) {
        continue
      }
      $text = [string]::Join("`n", $content)
      if ($text -match '\\begin\{document\}') {
        [ordered]@{
          file = $file
          text = $text
          length = $text.Length
        }
      }
    }

    if (-not $candidates) {
      return $null
    }

    $mainTex = $candidates | Sort-Object length -Descending | Select-Object -First 1
    return Measure-TexSections -Tex $mainTex.text
  }
  catch {
    return $null
  }
  finally {
    if (Test-Path -LiteralPath $tempPath) {
      Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    }
  }
}

function Measure-TexSections {
  param([string]$Tex)

  if (-not $Tex) {
    return $null
  }

  $clean = [regex]::Replace($Tex, '(?m)(?<!\\)%.*$', '')
  $sectionPattern = '\\section\*?\{([^}]+)\}'
  $matches = [regex]::Matches($clean, $sectionPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($matches.Count -lt 2) {
    return $null
  }

  $sections = @()
  for ($i = 0; $i -lt $matches.Count; $i++) {
    $start = $matches[$i].Index + $matches[$i].Length
    $end = if ($i -lt $matches.Count - 1) { $matches[$i + 1].Index } else { $clean.Length }
    $name = Normalize-Whitespace $matches[$i].Groups[1].Value
    $body = $clean.Substring($start, $end - $start)
    $sections += [ordered]@{
      name = $name
      words = Measure-ApproxWords -Text $body
    }
  }

  $intro = $sections | Where-Object { $_.name -match '^(introduction|background|overview)$' } | Select-Object -First 1
  $method = $sections | Where-Object { $_.name -match '(method|methodology|approach|implementation|experimental setup)' } | Select-Object -First 1

  if (-not $intro -and -not $method) {
    return $null
  }

  $introWords = if ($intro) { $intro.words } else { $null }
  $methodWords = if ($method) { $method.words } else { $null }

  return [ordered]@{
    introductionWords = $introWords
    methodologyWords = $methodWords
  }
}

function Measure-ApproxWords {
  param([string]$Text)

  if (-not $Text) {
    return 0
  }

  $plain = $Text
  $plain = [regex]::Replace($plain, '\\[a-zA-Z@]+(\[[^\]]*\])?(\{[^{}]*\})?', ' ')
  $plain = [regex]::Replace($plain, '\$[^$]*\$', ' ')
  $plain = [regex]::Replace($plain, '[{}\\_~^]', ' ')
  $plain = Normalize-Whitespace $plain
  if (-not $plain) {
    return 0
  }
  return ($plain -split ' ' | Where-Object { $_ }).Count
}

function Add-SemanticScholarData {
  param(
    [object[]]$Publications,
    [System.Collections.Generic.List[string]]$Warnings
  )

  $apiKey = [Environment]::GetEnvironmentVariable("SEMANTIC_SCHOLAR_API_KEY")
  if (-not $apiKey) {
    $Warnings.Add("Semantic Scholar enrichment is disabled because SEMANTIC_SCHOLAR_API_KEY is not set, so citation velocity is conservative.")
    return
  }

  $headers = @{ "x-api-key" = $apiKey }
  foreach ($paper in $Publications) {
    try {
      $encodedTitle = [System.Uri]::EscapeDataString($paper.title)
      $url = "https://api.semanticscholar.org/graph/v1/paper/search?query=$encodedTitle&limit=1&fields=title,citationCount,influentialCitationCount,openAccessPdf,url,externalIds"
      $payload = Invoke-JsonRequest -Uri $url -Headers $headers -MinimumDelayMs 1200
      $match = $payload.data | Select-Object -First 1
      if ($match) {
        $paper.citationCount = $match.citationCount
        $paper.influentialCitationCount = $match.influentialCitationCount
        $paper.semanticScholarUrl = $match.url
        if ($match.openAccessPdf) {
          $paper.openAccessPdf = $match.openAccessPdf.url
        }
      }
    }
    catch {
      $Warnings.Add("Semantic Scholar enrichment hit a rate or availability limit during this run.")
      break
    }
  }
}

function Build-PublicationPayload {
  param(
    [string]$Query,
    [int]$Limit
  )

  $arxiv = Get-ArxivEntries -Query $Query -Limit $Limit
  foreach ($paper in $arxiv.publications) {
    $paper.hasCodeLink = @($paper.githubUrls).Count -gt 0
    $paper.hasZenodoDoi = $paper.doi -match '^10\.5281/zenodo\.'
    $paper.sectionStats = Get-SectionStats -ArxivId $paper.arxivId
  }

  Add-SemanticScholarData -Publications $arxiv.publications -Warnings $arxiv.warnings
  return $arxiv
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $null
    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()

      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        Send-Response -Stream $stream -StatusCode 400 -StatusText "Bad Request" -Body @() -ContentType "text/plain; charset=utf-8"
        continue
      }

      while ($true) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) {
          break
        }
      }

      $parts = $requestLine.Split(" ")
      $method = $parts[0]
      $path = if ($parts.Length -gt 1) { $parts[1] } else { "/" }

      if ($method -ne "GET") {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Method not allowed")
        Send-Response -Stream $stream -StatusCode 405 -StatusText "Method Not Allowed" -Body $body -ContentType "text/plain; charset=utf-8"
        continue
      }

      if ($path.StartsWith("/api/publications")) {
        $params = Read-QueryParams -Path $path
        $queryParam = if ($params.ContainsKey("query")) { $params["query"] } else { "" }
        $query = $queryParam.Trim()
        $limit = 10
        if ($params["limit"] -match '^\d+$') {
          $limit = [Math]::Min([int]$params["limit"], 20)
        }

        if (-not $query) {
          Send-Json -Stream $stream -StatusCode 400 -Payload @{ error = "Missing required query parameter." }
          continue
        }

        try {
          $payload = Build-PublicationPayload -Query $query -Limit $limit
          Send-Json -Stream $stream -StatusCode 200 -Payload $payload
        }
        catch {
          Send-Json -Stream $stream -StatusCode 500 -Payload @{ error = $_.Exception.Message }
        }
        continue
      }

      $relative = $path.Split("?")[0].TrimStart("/")
      if ([string]::IsNullOrWhiteSpace($relative)) {
        $relative = "index.html"
      }

      $relative = $relative.Replace("/", "\")
      $fullPath = Join-Path $root $relative
      $resolvedRoot = [System.IO.Path]::GetFullPath($root)
      $resolvedPath = [System.IO.Path]::GetFullPath($fullPath)

      if (-not $resolvedPath.StartsWith($resolvedRoot)) {
        Send-Response -Stream $stream -StatusCode 403 -StatusText "Forbidden" -Body @() -ContentType "text/plain; charset=utf-8"
        continue
      }

      if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Not found")
        Send-Response -Stream $stream -StatusCode 404 -StatusText "Not Found" -Body $body -ContentType "text/plain; charset=utf-8"
        continue
      }

      $extension = [System.IO.Path]::GetExtension($resolvedPath).ToLowerInvariant()
      $contentType = $contentTypes[$extension]
      if (-not $contentType) {
        $contentType = "application/octet-stream"
      }

      $bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
      Send-Response -Stream $stream -StatusCode 200 -StatusText "OK" -Body $bytes -ContentType $contentType
    }
    finally {
      if ($stream) {
        $stream.Dispose()
      }
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
