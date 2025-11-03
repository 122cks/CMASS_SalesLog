try {
  Write-Output 'Requesting https://cmass-sales.web.app/input1 without following redirects'
  $req = [System.Net.WebRequest]::Create('https://cmass-sales.web.app/input1')
  $req.AllowAutoRedirect = $false
  $resp = $req.GetResponse()
  Write-Output ('Status: ' + $resp.StatusCode)
} catch [System.Net.WebException] {
  $resp = $_.Exception.Response
  if ($resp) {
    $status = $resp.StatusCode
    Write-Output ('Status (from exception): ' + $status)
    $loc = $resp.Headers['Location']
    if ($loc) { Write-Output ('Location: ' + $loc) }
  } else {
    Write-Output ('Request failed: ' + $_.Exception.Message)
  }
} catch {
  Write-Output ('Request failed: ' + $_.Exception.Message)
}
