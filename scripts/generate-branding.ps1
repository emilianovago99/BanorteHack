# Generate PNG icons from the existing SVG mark using Windows System.Drawing.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
[xml]$svg = Get-Content -Raw (Join-Path $repoRoot 'apps/web/public/lazybank.svg')
$outputs = @(
    @('apps/web/public/favicon-32.png', 32, $false, $false),
    @('apps/web/public/apple-touch-icon.png', 180, $false, $true),
    @('apps/web/public/icon-192.png', 192, $false, $false),
    @('apps/web/public/icon-512.png', 512, $false, $false),
    @('apps/mobile/assets/icon.png', 1024, $false, $true),
    @('apps/mobile/assets/adaptive-icon.png', 1024, $true, $false)
)
foreach ($output in $outputs) {
    $target = Join-Path $repoRoot $output[0]
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
    $bitmap = [Drawing.Bitmap]::new($output[1], $output[1])
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.Clear([Drawing.Color]::Transparent)
        if ($output[3]) { $graphics.Clear([Drawing.ColorTranslator]::FromHtml('#dc0030')) }
        $graphics.ScaleTransform($output[1] / 64.0, $output[1] / 64.0)
        foreach ($shape in $svg.svg.path) {
            if ($output[2] -and $shape.fill -ne '#fff') { continue }
            $path = [Drawing.Drawing2D.GraphicsPath]::new()
            $brush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($shape.fill))
            try {
                $tokens = [regex]::Matches($shape.d, '[MLHVQZ]|-?\d+(?:\.\d+)?')
                $i = 0; $x = 0.0; $y = 0.0
                while ($i -lt $tokens.Count) {
                    $command = $tokens[$i++].Value
                    switch ($command) {
                        'M' { $x = [double]$tokens[$i++].Value; $y = [double]$tokens[$i++].Value; $path.StartFigure() }
                        'L' { $nx = [double]$tokens[$i++].Value; $ny = [double]$tokens[$i++].Value; $path.AddLine($x, $y, $nx, $ny); $x = $nx; $y = $ny }
                        'H' { $nx = [double]$tokens[$i++].Value; $path.AddLine($x, $y, $nx, $y); $x = $nx }
                        'V' { $ny = [double]$tokens[$i++].Value; $path.AddLine($x, $y, $x, $ny); $y = $ny }
                        'Q' {
                            $cx = [double]$tokens[$i++].Value; $cy = [double]$tokens[$i++].Value
                            $nx = [double]$tokens[$i++].Value; $ny = [double]$tokens[$i++].Value
                            $path.AddBezier($x, $y, ($x + 2 * ($cx - $x) / 3), ($y + 2 * ($cy - $y) / 3), ($nx + 2 * ($cx - $nx) / 3), ($ny + 2 * ($cy - $ny) / 3), $nx, $ny)
                            $x = $nx; $y = $ny
                        }
                        'Z' { $path.CloseFigure() }
                        default { throw "Unsupported SVG command: $command" }
                    }
                }
                $graphics.FillPath($brush, $path)
            } finally { $brush.Dispose(); $path.Dispose() }
        }
        $bitmap.Save($target, [Drawing.Imaging.ImageFormat]::Png)
        Write-Output $output[0]
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
