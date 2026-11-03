$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NovaDesktopInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
}
"@
  $action = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:NOVA_CONTROL_PAYLOAD)) | ConvertFrom-Json
  $result = @{ success = $true }
  switch ([string]$action.type) {
    "system-info" {
      $osInfo = Get-CimInstance Win32_OperatingSystem
      $processors = @(Get-CimInstance Win32_Processor)
      $battery = Get-CimInstance Win32_Battery | Select-Object -First 1
      $cpuLoad = ($processors | Measure-Object -Property LoadPercentage -Average).Average
      $totalKb = [double]$osInfo.TotalVisibleMemorySize
      $freeKb = [double]$osInfo.FreePhysicalMemory
      $usedPercent = if ($totalKb -gt 0) { [Math]::Round((($totalKb - $freeKb) / $totalKb) * 100, 1) } else { $null }
      $result.computer = $env:COMPUTERNAME
      $result.localTime = (Get-Date).ToString("o")
      $result.cpuUsagePercent = if ($null -ne $cpuLoad) { [Math]::Round([double]$cpuLoad, 1) } else { $null }
      $result.ramTotalGb = [Math]::Round(($totalKb / 1MB), 2)
      $result.ramUsedGb = [Math]::Round((($totalKb - $freeKb) / 1MB), 2)
      $result.ramUsagePercent = $usedPercent
      $result.battery = if ($battery) {
        @{ available = $true; chargePercent = [int]$battery.EstimatedChargeRemaining; status = [string]$battery.BatteryStatus }
      } else { @{ available = $false; message = "Pil bulunamadı; masaüstü bilgisayar olabilir." } }
      $result.message = "Sistem kaynakları ve yerel saat okundu."
    }
    "list-windows" {
      $windows = @(Get-Process -ErrorAction SilentlyContinue |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_.MainWindowTitle) } |
        Sort-Object MainWindowTitle |
        Select-Object -First 40 @{Name="title";Expression={[string]$_.MainWindowTitle}},
          @{Name="process";Expression={[string]$_.ProcessName}},
          @{Name="id";Expression={[int]$_.Id}})
      $result.windows = $windows
      $result.count = $windows.Count
      $result.message = "Açık uygulama pencereleri listelendi."
    }
    "inspect-screen" {
      $handle = [NovaDesktopInput]::GetForegroundWindow()
      $windowTitle = New-Object System.Text.StringBuilder 512
      [NovaDesktopInput]::GetWindowText($handle, $windowTitle, $windowTitle.Capacity) | Out-Null
      $root = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
      $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      # Put editable message composers first: Discord can expose many buttons
      # before its textbox, and a flat first-100 slice used to hide the composer.
      $inputControls = @()
      $controls = @()
      $texts = @()
      $limit = [Math]::Min($all.Count, 2500)
      for ($i = 0; $i -lt $limit; $i++) {
        $element = $all.Item($i)
        try {
          $current = $element.Current
          if (-not $current.IsOffscreen -and $current.IsEnabled) {
            $name = [string]$current.Name
            $control = $current.ControlType.ProgrammaticName.Replace("ControlType.", "")
            if ($name.Trim() -or $control -match "Edit|Document|Button|ListItem|Hyperlink|TabItem|ComboBox|MenuItem|Text") {
              $item = @{
                name = $name.Substring(0, [Math]::Min(160, $name.Length))
                controlType = $control
                automationId = [string]$current.AutomationId
                className = [string]$current.ClassName
                focusable = [bool]$current.IsKeyboardFocusable
                bounds = @{ x = [int]$current.BoundingRectangle.Left; y = [int]$current.BoundingRectangle.Top; width = [int]$current.BoundingRectangle.Width; height = [int]$current.BoundingRectangle.Height }
              }
              if ($control -match "Edit|Document") { $inputControls += $item }
              elseif ($control -match "Button|ListItem|Hyperlink|TabItem|ComboBox|MenuItem") { $controls += $item }
              elseif ($name.Trim()) { $texts += $item }
            }
          }
        } catch {}
      }
      $items = @($inputControls + $controls + $texts | Select-Object -First 100)
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
        if ($matches.Count -gt 1) { throw "'$needle' metni birden fazla yerde bulundu; yanlış yere tıklamamak için işlem durduruldu." }
        throw "Ekranda '$needle' adlı tıklanabilir öğe bulunamadı."
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
      $result.message = "'$needle' öğesine tıklandı."
    }
    "focus-control" {
      $controlType = [string]$action.controlType
      if ($controlType -notin @("Edit", "Button", "List", "ComboBox", "Document")) { throw "Bu denetim türüne odaklanmaya izin verilmiyor." }
      $root = [System.Windows.Automation.AutomationElement]::FromHandle([NovaDesktopInput]::GetForegroundWindow())
      $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      $matches = @()
      $limit = [Math]::Min($all.Count, 3000)
      for ($i = 0; $i -lt $limit; $i++) {
        $element = $all.Item($i)
        try {
          $current = $element.Current
          $type = $current.ControlType.ProgrammaticName.Replace("ControlType.", "")
          if (-not $current.IsOffscreen -and $current.IsEnabled -and $type -eq $controlType -and $current.IsKeyboardFocusable) {
            $nameMatches = (-not $action.name) -or ([string]$current.Name -eq [string]$action.name)
            $idMatches = (-not $action.automationId) -or ([string]$current.AutomationId -eq [string]$action.automationId)
            if ($nameMatches -and $idMatches) { $matches += $element }
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
      $targetProcessId = [uint32]0
      if ($action.processName) {
        $processName = ([string]$action.processName).ToLowerInvariant()
        if ($processName -notin @("notepad")) { throw "Metin yazılacak pencere için izin verilmeyen uygulama." }
        $shell = New-Object -ComObject WScript.Shell
        $activated = $false
        $deadline = (Get-Date).AddSeconds(8)
        do {
          $targetProcesses = @(Get-Process -Name $processName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
          foreach ($targetProcess in $targetProcesses) {
            if (-not $shell.AppActivate([int]$targetProcess.Id)) { continue }
            Start-Sleep -Milliseconds 120
            $foregroundProcessId = [uint32]0
            $foregroundHandle = [NovaDesktopInput]::GetForegroundWindow()
            [NovaDesktopInput]::GetWindowThreadProcessId($foregroundHandle, [ref]$foregroundProcessId) | Out-Null
            if ($foregroundProcessId -eq [uint32]$targetProcess.Id) {
              $targetProcessId = [uint32]$targetProcess.Id
              $activated = $true
              break
            }
          }
          if (-not $activated) { Start-Sleep -Milliseconds 200 }
        } while (-not $activated -and (Get-Date) -lt $deadline)
        if (-not $activated) { throw "Not Defteri penceresi öne getirilemedi; başka bir pencereye metin gönderilmedi." }
      }
      $oldClipboard = $null
      try { $oldClipboard = [Windows.Forms.Clipboard]::GetDataObject() } catch {}
      try {
        [Windows.Forms.Clipboard]::SetText($value)
        [Windows.Forms.SendKeys]::SendWait("^v")
        Start-Sleep -Milliseconds 350
        if ($targetProcessId -ne 0) {
          $foregroundProcessId = [uint32]0
          $foregroundHandle = [NovaDesktopInput]::GetForegroundWindow()
          [NovaDesktopInput]::GetWindowThreadProcessId($foregroundHandle, [ref]$foregroundProcessId) | Out-Null
          if ($foregroundProcessId -ne $targetProcessId) { throw "Metin yapıştırılırken Not Defteri odağı kayboldu; yazma doğrulanamadı." }
          [Windows.Forms.SendKeys]::SendWait("^a")
          [Windows.Forms.SendKeys]::SendWait("^c")
          Start-Sleep -Milliseconds 180
          $actualText = [Windows.Forms.Clipboard]::GetText()
          if ($actualText -cne $value) { throw "Not Defteri içeriği doğrulanamadı; metin başarıyla yazılmış sayılmadı." }
          [Windows.Forms.SendKeys]::SendWait("^{END}")
        }
      } finally {
        if ($null -ne $oldClipboard) { [Windows.Forms.Clipboard]::SetDataObject($oldClipboard, $true) }
        else { [Windows.Forms.Clipboard]::Clear() }
      }
      $result.message = if ($targetProcessId -ne 0) { "Metin Not Defteri'ne yazıldı ve içerik doğrulandı." } else { "Metin giriş işlemi gönderildi." }
    }
    "press-key" {
      $keys = @{
        ENTER = "{ENTER}"; TAB = "{TAB}"; ESC = "{ESC}"; SPACE = " "
        BACKSPACE = "{BACKSPACE}"; DELETE = "{DELETE}"; UP = "{UP}"; DOWN = "{DOWN}"
        LEFT = "{LEFT}"; RIGHT = "{RIGHT}"; HOME = "{HOME}"; END = "{END}"
        "CTRL+A" = "^a"; "CTRL+L" = "^l"; "CTRL+T" = "^t"; "CTRL+W" = "^w"
        "CTRL+V" = "^v"; "CTRL+C" = "^c"; "CTRL+X" = "^x"; "CTRL+F" = "^f"
        "ALT+F4" = "%{F4}"; "SHIFT+TAB" = "+{TAB}"
        "CTRL+SHIFT+T" = "^+t"; "CTRL+SHIFT+TAB" = "^+{TAB}"
        "CTRL+PAGEUP" = "^{PGUP}"; "CTRL+PAGEDOWN" = "^{PGDN}"
        "CTRL+S" = "^s"; "CTRL+P" = "^p"; "CTRL+R" = "^r"; "CTRL+N" = "^n"; "CTRL+H" = "^h"; "CTRL+J" = "^j"; "CTRL+U" = "^u"; "CTRL+0" = "^0"; "CTRL+PLUS" = "^+{ADD}"; "CTRL+MINUS" = "^-"; "ALT+TAB" = "%{TAB}"; "ALT+HOME" = "%{HOME}"; "CTRL+SHIFT+N" = "^+n"; "CTRL+SHIFT+O" = "^+o"
        "CTRL+Z" = "^z"; "CTRL+Y" = "^y"; "ALT+LEFT" = "%{LEFT}"
        "ALT+RIGHT" = "%{RIGHT}"; F5 = "{F5}"; F11 = "{F11}"
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
      if ($action.corner) {
        $bounds = [Windows.Forms.Screen]::PrimaryScreen.Bounds
        switch ([string]$action.corner) {
          "top-left" { $x = $bounds.Left + 5; $y = $bounds.Top + 5 }
          "top-right" { $x = $bounds.Right - 6; $y = $bounds.Top + 5 }
          "bottom-left" { $x = $bounds.Left + 5; $y = $bounds.Bottom - 6 }
          "bottom-right" { $x = $bounds.Right - 6; $y = $bounds.Bottom - 6 }
          "center" { $x = [int]($bounds.Left + ($bounds.Width / 2)); $y = [int]($bounds.Top + ($bounds.Height / 2)) }
          default { throw "Fare hedef köşesi geçersiz." }
        }
      } elseif ($null -ne $action.dx -or $null -ne $action.dy) {
        $point = New-Object NovaDesktopInput+POINT
        [NovaDesktopInput]::GetCursorPos([ref]$point) | Out-Null
        $x = $point.X + [int]$action.dx
        $y = $point.Y + [int]$action.dy
      } else {
        $x = [int]$action.x; $y = [int]$action.y
      }
      $bounds = [Windows.Forms.Screen]::PrimaryScreen.Bounds
      if ($x -lt 0 -or $y -lt 0 -or $x -ge $bounds.Width -or $y -ge $bounds.Height) { throw "Mouse koordinatı ekran sınırlarının dışında." }
      $start = New-Object NovaDesktopInput+POINT
      [NovaDesktopInput]::GetCursorPos([ref]$start) | Out-Null
      $duration = if ($null -ne $action.durationMs) { [int]$action.durationMs } else { 650 }
      $steps = if ($null -ne $action.steps) { [int]$action.steps } else { 32 }
      if ($duration -lt 100 -or $duration -gt 5000 -or $steps -lt 4 -or $steps -gt 120) { throw "Fare animasyon parametreleri geçersiz." }
      for ($step = 1; $step -le $steps; $step++) {
        $t = [double]$step / [double]$steps
        $eased = (1 - [Math]::Cos([Math]::PI * $t)) / 2
        $nextX = [int][Math]::Round($start.X + (($x - $start.X) * $eased))
        $nextY = [int][Math]::Round($start.Y + (($y - $start.Y) * $eased))
        if (-not [NovaDesktopInput]::SetCursorPos($nextX, $nextY)) { throw "Windows fare konumunu değiştiremedi." }
        Start-Sleep -Milliseconds ([Math]::Max(1, [int]($duration / $steps)))
      }
      $actualPoint = New-Object NovaDesktopInput+POINT
      [NovaDesktopInput]::GetCursorPos([ref]$actualPoint) | Out-Null
      if ($actualPoint.X -ne $x -or $actualPoint.Y -ne $y) { throw "Fare konumu doğrulanamadı; hareket tamamlanmadı." }
      $result.message = "Fare yumuşak animasyonla hareket ettirildi ve hedef konum doğrulandı."
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
  $json = ConvertTo-Json -InputObject $result -Depth 8 -Compress
[Console]::Out.WriteLine($json)
# A successful UI Automation action must end with an explicit zero exit code.
exit 0
} catch {
  Write-Output ("NOVA_RESULT:" + (@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress))
  exit 1
}
