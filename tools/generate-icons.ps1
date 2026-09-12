param(
  [string]$OutDir = (Join-Path $PSScriptRoot "../assets/icons")
)

Add-Type -AssemblyName System.Drawing

function New-Icon {
  param(
    [int]$Size,
    [string]$Path,
    [bool]$Maskable = $false
  )

  New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent) | Out-Null

  $bmp = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  # Dégradé teal -> bleu (diagonal), assorti au thème
  $rect = [System.Drawing.Rectangle]::new(0, 0, $Size, $Size)
  $grad = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 52, 211, 153),   # #34d399
    [System.Drawing.Color]::FromArgb(255, 43, 182, 234),   # #2bb6ea
    45.0
  )
  $g.FillRectangle($grad, $rect)

  # Monogramme "FT" centré
  $fontSize = if ($Maskable) { $Size * 0.28 } else { $Size * 0.34 }
  $font = [System.Drawing.Font]::new(
    "Segoe UI",
    $fontSize,
    [System.Drawing.FontStyle]::Bold,
    [System.Drawing.GraphicsUnit]::Pixel
  )
  $fmt = [System.Drawing.StringFormat]::new()
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(235, 255, 255, 255))
  $textRect = [System.Drawing.RectangleF]::new(0, 0, $Size, $Size)
  $g.DrawString("FT", $font, $white, $textRect, $fmt)

  $fmt.Dispose()
  $font.Dispose()
  $white.Dispose()
  $grad.Dispose()
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")

New-Icon -Size 512 -Path (Join-Path $OutDir "icon-512.png")
New-Icon -Size 192 -Path (Join-Path $OutDir "icon-192.png")
New-Icon -Size 180 -Path (Join-Path $OutDir "apple-touch-icon.png")
New-Icon -Size 512 -Path (Join-Path $OutDir "icon-maskable-512.png") -Maskable $true

Write-Host "Icônes générées dans $OutDir"
Get-ChildItem $OutDir | Select-Object Name, Length