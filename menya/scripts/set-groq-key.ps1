# Asks for your Groq API key (hidden while you paste) and saves it to menya/.env,
# which git ignores. Used by `npm run eval`.
$secure = Read-Host "Paste your Groq API key (starts with gsk_), then press Enter" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }

if (-not $key.StartsWith("gsk_")) {
  Write-Host "That doesn't look like a Groq key (it should start with gsk_). Nothing was saved." -ForegroundColor Red
  exit 1
}

$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
[IO.File]::WriteAllText($envFile, "GROQ_API_KEY=$key`n")
Write-Host "Saved. You can close this tab and go back to the chat." -ForegroundColor Green
