$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
$rootPrefix = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://127.0.0.1:8765/')

try {
    $listener.Start()
} catch {
    Write-Host "Could not start the dashboard server: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Close any other AJB Tools server and try again.'
    Read-Host 'Press Enter to close'
    exit 1
}

$address = 'http://127.0.0.1:8765/'
Write-Host "AJB Tools is running at $address" -ForegroundColor Green
Start-Process $address

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $response = $context.Response
        try {
            $requestPath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath)
            if ($requestPath -eq '/tools.json' -or $requestPath -eq '/api/tools') {
                $tools = @(
                    Get-ChildItem -LiteralPath $root -Directory |
                        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'index.html') -PathType Leaf } |
                        Sort-Object -Property Name |
                        ForEach-Object {
                            $metadataPath = Join-Path $_.FullName 'tool.json'
                            $description = 'A useful tool in my personal collection.'
                            if (Test-Path -LiteralPath $metadataPath -PathType Leaf) {
                                $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
                                if ($metadata.description -is [string] -and -not [string]::IsNullOrWhiteSpace($metadata.description)) {
                                    $description = $metadata.description.Trim()
                                }
                            }
                            @{
                                name = $_.Name
                                description = $description
                                url = '/' + [System.Uri]::EscapeDataString($_.Name) + '/index.html'
                            }
                        }
                )
                $body = [System.Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $tools -Compress -Depth 3))
                $response.ContentType = 'application/json; charset=utf-8'
                $response.Headers['Cache-Control'] = 'no-store'
                $response.StatusCode = 200
            } else {
                $relativePath = $requestPath.TrimStart('/')
                if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = 'index.html' }
                $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
                if (-not $filePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                    $response.StatusCode = 403
                    $body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
                    $response.ContentType = 'text/plain; charset=utf-8'
                } elseif (Test-Path -LiteralPath $filePath -PathType Leaf) {
                    $body = [System.IO.File]::ReadAllBytes($filePath)
                    $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
                    $contentType = switch ($extension) {
                        '.html' { 'text/html; charset=utf-8' }
                        '.css' { 'text/css; charset=utf-8' }
                        '.js' { 'application/javascript; charset=utf-8' }
                        '.json' { 'application/json; charset=utf-8' }
                        '.svg' { 'image/svg+xml' }
                        '.png' { 'image/png' }
                        '.jpg' { 'image/jpeg' }
                        '.jpeg' { 'image/jpeg' }
                        '.webp' { 'image/webp' }
                        default { 'application/octet-stream' }
                    }
                    $response.ContentType = $contentType
                    $response.StatusCode = 200
                } else {
                    $response.StatusCode = 404
                    $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                    $response.ContentType = 'text/plain; charset=utf-8'
                }
            }
            $response.ContentLength64 = $body.Length
            $response.OutputStream.Write($body, 0, $body.Length)
        } catch {
            $response.StatusCode = 500
            $body = [System.Text.Encoding]::UTF8.GetBytes('Server error')
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.ContentLength64 = $body.Length
            $response.OutputStream.Write($body, 0, $body.Length)
        } finally {
            $response.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}