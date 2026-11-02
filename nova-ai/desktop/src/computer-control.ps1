param(
  [Parameter(Mandatory=$true)][string]$Payload
)
$ErrorActionPreference = "Stop"
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NovaDesktopInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
}
"@
  $action = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
  $result = @{ success = $true }
  switch ([string]$action.type) {
    "inspect-screen" {
      $handle = [NovaDesktopInput]::GetForegroundWindow()
      $windowTitle = New-Object System.Text.StringBuilder 512
      [NovaDesktopInput]::GetWindowText($handle, $windowTitle, $windowTitle.Capacity) | Out-Null
      $root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
      $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      $items = @()
      $limit = [Math]::Min($all.Count, 2500)
      for ($i = 0; $i -lt $limit -and $items.Count -lt 100; $i++) {
        $element = $all.Item($i)
        try {
          $current = $element.Current
          if (-not $current.IsOffscreen -and $current.IsEnabled) {
            $name = [string]$current.Name
            $control = [string]$current.ControlType.ProgrammaticName
            if ($name.Trim() -or $control -match "Edit|Button|ListItem|Hyperlink|TabItem|Text") {
              $items += @{
                name = $name.Substring(0, [Math]::Min(160, $name.Length))
                controlType = $control.Replace("ControlType.", "")
                automationId = [string]$current.AutomationId
                className = [string]$current.ClassName
                focusable = [bool]$current.IsKeyboardFocusable
              }
            }
          }
        } catch {}
      }
      $result.activeWindow = $windowTitle.ToString()
      $result.items = $items
      $result.message = "Etkin penceredeki erişilebilir denetimler listelendi."
    }
    "click-text" {
      $needle = [string]$action.text
      if (-not $needle -or $needle.Length -gt 180) { throw "Tıklanacak metin geçersiz." }
      $root = [System.Windows.Automation.AutomationElement]::FromHandle([NovaDesktopInput]::GetForegroundWindow())
      $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      $matches = @()
      $limit = [Math]::Min($all.Count, 3000)
      for ($i = 0; $i -lt $limit; $i++) {
        $element = $all.Item($i)
        try {
          $current = $element.Current
          if ($current.IsOffscreen -or -not $current.IsEnabled) { continue }
          if ([string]$current.Name -eq $needle) { $matches += $element }
        } catch {}
      }
      if ($matches.Count -ne 1) {
        if ($matches.Count -gt 1) { throw "“$needle” metni birden fazla yerde bulundu; yanlış yere tıklamamak için işlem durduruldu." }
        throw "Ekranda “$needle” adlı tıklanabilir öğe bulunamadı."
      }
      $element = $matches[0]
      $invoked = $false
      try {
        $pattern = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
          $pattern.Invoke()
          $invoked = $true
        }
      } catch {}
      if (-not $invoked) {
        $rect = $element.Current.BoundingRectangle
        if ($rect.IsEmpty -or $rect.Width -le 0 -or $rect.Height -le 0) { throw "Öğenin tıklanabilir ekran konumu bulunamadı." }
        $x = [int]($rect.Left + ($rect.Width / 2))
        $y = [int]($rect.Top + ($rect.Height / 2))
        [NovaDesktopInput]::SetCursorPos($x, $y) | Out-Null
        Start-Sleep -Milliseconds 80
        [NovaDesktopInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
        [NovaDesktopInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
      }
      $result.message = "“$needle” öğesine tıklandı."
    }
    "focus-control" {
      $controlType = [string]$action.controlType
      if ($controlType -notin @("Edit", "Button", "List", "ComboBox", "Document")) { throw "Bu denetim türüne odaklanmaya izin verilmiyor." }
      $root = [System.Windows.Automation.AutomationElement]::RootElement
      $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      $matches = @()
      $limit = [Math]::Min($all.Count, 3000)
      for ($i = 0; $i -lt $limit; $i++) {
        $element = $all.Item($i)
        try {
          $current = $element.Current
          $type = $current.ControlType.ProgrammaticName.Replace("ControlType.", "")
          if (-not $current.IsOffscreen -and $current.IsEnabled -and $type -eq $controlType -and $current.IsKeyboardFocusable) {
            if (-not $action.name -or [string]$current.Name -eq [string]$action.name) { $matches += $element }
          }
        } catch {}
      }
      if ($matches.Count -ne 1) { throw "Odaklanılacak $controlType denetimi tekil olarak belirlenemedi ($($matches.Count) eşleşme)." }
      $matches[0].SetFocus()
      $result.message = "$controlType denetimine odaklanıldı."
    }
    "type-text" {
      $value = [string]$action.text
      if ($value.Length -gt 4000) { throw "Yazılacak metin çok uzun." }
      $oldClipboard = $null
      try { $oldClipboard = [Windows.Forms.Clipboard]::GetText() } catch {}
      [Windows.Forms.Clipboard]::SetText($value)
      [Windows.Forms.SendKeys]::SendWait("^v")
      Start-Sleep -Milliseconds 250
      if ($null -ne $oldClipboard -and $oldClipboard.Length -le 4000) {
        [Windows.Forms.Clipboard]::SetText($oldClipboard)
      }
      $result.message = "Metin yazıldı."
    }
    "press-key" {
      $keys = @{
        ENTER = "{ENTER}"; TAB = "{TAB}"; ESC = "{ESC}"; SPACE = " "
        BACKSPACE = "{BACKSPACE}"; DELETE = "{DELETE}"; UP = "{UP}"; DOWN = "{DOWN}"
        LEFT = "{LEFT}"; RIGHT = "{RIGHT}"; HOME = "{HOME}"; END = "{END}"
        CTRL+A = "^a"; CTRL+L = "^l"; CTRL+T = "^t"; CTRL+W = "^w"
        CTRL+V = "^v"; CTRL+C = "^c"; CTRL+X = "^x"; CTRL+F = "^f"
        ALT+F4 = "%{F4}"; SHIFT+TAB = "+{TAB}"
      }
      $key = ([string]$action.key).ToUpperInvariant()
      if (-not $keys.ContainsKey($key)) { throw "Bu klavye kısayoluna izin verilmiyor." }
      [Windows.Forms.SendKeys]::SendWait($keys[$key])
      $result.message = "$key tuşu gönderildi."
    }
    "click" {
      $x = [int]$action.x; $y = [int]$action.y
      $bounds = [Windows.Forms.Screen]::PrimaryScreen.Bounds
      if ($x -lt 0 -or $y -lt 0 -or $x -ge $bounds.Width -or $y -ge $bounds.Height) { throw "Tıklama koordinatı ekran sınırlarının dışında." }
      [NovaDesktopInput]::SetCursorPos($x, $y) | Out-Null
      Start-Sleep -Milliseconds 80
      [NovaDesktopInput]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
      [NovaDesktopInput]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
      $result.message = "Ekrana tıklandı."
    }
    "move-mouse" {
      $x = [int]$action.x; $y = [int]$action.y
      $bounds = [Windows.Forms.Screen]::PrimaryScreen.Bounds
      if ($x -lt 0 -or $y -lt 0 -or $x -ge $bounds.Width -or $y -ge $bounds.Height) { throw "Mouse koordinatı ekran sınırlarının dışında." }
      [NovaDesktopInput]::SetCursorPos($x, $y) | Out-Null
      $result.message = "Mouse hareket ettirildi."
    }
    "scroll" {
      $amount = [int]$action.amount
      if ($amount -lt -1200 -or $amount -gt 1200) { throw "Kaydırma miktarı sınır dışında." }
      [NovaDesktopInput]::mouse_event(0x0800, 0, 0, $amount, [UIntPtr]::Zero)
      $result.message = "Ekran kaydırıldı."
    }
    "wait" {
      $ms = [int]$action.ms
      if ($ms -lt 0 -or $ms -gt 10000) { throw "Bekleme süresi sınır dışında." }
      Start-Sleep -Milliseconds $ms
      $result.message = "Bekleme tamamlandı."
    }
    default { throw "Desteklenmeyen masaüstü kontrol işlemi." }
  }
  $result | ConvertTo-Json -Depth 8 -Compress
} catch {
  @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
}
