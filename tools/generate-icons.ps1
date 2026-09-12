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
  $g.Clear([System.Drawing.Color]::Transparent)

  # Dégradé vert -> bleu (diagonal)
  $rect = [System.Drawing.Rectangle]::new(0, 0, $Size, $Size)
  $grad = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 0, 255, 135),   # #00ff87
    [System.Drawing.Color]::FromArgb(255, 96, 165, 250),  # #60a5fa
    45.0
  )
  $g.FillRectangle($grad, $rect)

  # Haltère centrale (symbole)
  $strokeH = [math]::Max(2, [int]($Size * 0.09))
  $plateW = [int]($Size * 0.18)
  $plateH = [int]($Size * 0.30)
  $barW = [int]($Size * 0.62)
  $barH = [int]($Size * 0.085)

  $cx = $Size / 2
  $cy = $Size / 2

  $white = [System.Drawing.Brushes]::White

  if ($Maskable) {
    # zone de sécurité maskable : contenu dans les 80% centraux
    $scale = 0.80
  } else {
    $scale = 1.0
  }
  $sw = [int]($strokeH * $scale)
  $pw = [int]($plateW * $scale)
  $ph = [int]($plateH * $scale)
  $bw = [int]($barW * $scale)
  $bh = [int]($barH * $scale)

  $barX = $cx - $bw / 2
  $barY = $cy - $bh / 2
  $g.FillRectangle($white, $barX, $barY, $bw, $bh)

  $plateY = $cy - $ph / 2
  $plateRadius = [int]($pw * 0.28)
  # plateau gauche
  $g.FillRectangle($white, $barX, $plateY, $pw, $ph)
  # plateau droit
  $g.FillRectangle($white, $barX + $bw - $pw, $plateY, $pw, $ph)

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