$htmlPath = "c:\Users\MedSys0246\Desktop\inventrack\inventrack\index.html"
$cssPath = "c:\Users\MedSys0246\Desktop\inventrack\inventrack\styles.css"

$content = [System.IO.File]::ReadAllText($htmlPath)
$cssStart = $content.IndexOf("<style>")
$cssEnd = $content.IndexOf("</style>", $cssStart) + 8

if ($cssStart -ge 0 -and $cssEnd -ge 8) {
    $css = $content.Substring($cssStart + 7, $cssEnd - $cssStart - 15)
    [System.IO.File]::WriteAllText($cssPath, $css.Trim())
    
    $linkTag = '<link rel="stylesheet" href="styles.css">'
    $newContent = $content.Substring(0, $cssStart) + $linkTag + "`n" + $content.Substring($cssEnd)
    
    [System.IO.File]::WriteAllText($htmlPath, $newContent)
    Write-Host "Successfully extracted CSS"
} else {
    Write-Host "Could not find <style> tags"
}
