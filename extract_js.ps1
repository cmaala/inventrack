$htmlPath = "c:\Users\MedSys0246\Desktop\inventrack\inventrack\index.html"
$jsPath = "c:\Users\MedSys0246\Desktop\inventrack\inventrack\app.js"

$content = [System.IO.File]::ReadAllText($htmlPath)
$jsEnd = $content.LastIndexOf("</script>")
$jsStart = $content.LastIndexOf("<script>", $jsEnd)

if ($jsStart -ge 0 -and $jsEnd -ge 0) {
    # +8 to skip <script> and -9 to account for </script>
    $jsLength = $jsEnd - ($jsStart + 8)
    $js = $content.Substring($jsStart + 8, $jsLength)
    [System.IO.File]::WriteAllText($jsPath, $js.Trim())
    
    $linkTag = '<script src="app.js"></script>'
    $newContent = $content.Substring(0, $jsStart) + $linkTag + "`n" + $content.Substring($jsEnd + 9)
    
    [System.IO.File]::WriteAllText($htmlPath, $newContent)
    Write-Host "Successfully extracted JS"
} else {
    Write-Host "Could not find <script> tags"
}
