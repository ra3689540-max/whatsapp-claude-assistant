# Keeps the WhatsApp voice-note assistant running in the background while you are logged in (no window,
# no Claude app needed). It starts at log-on; a 5-minute check restarts it only if it ever stopped.
#   powershell -ExecutionPolicy Bypass -File install_task.ps1            install / update
#   powershell -ExecutionPolicy Bypass -File install_task.ps1 -Remove    remove
# Log: bot.log in this folder.  Stop it now: Task Scheduler > "WhatsApp Claude Assistant (<folder>)" > End (or -Remove).
param([switch]$Remove)
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
# one task per folder, so several copies (e.g. one per WhatsApp number) never touch each other
$name = "WhatsApp Claude Assistant (" + (Split-Path -Leaf $here) + ")"
$botPath = [regex]::Escape((Join-Path $here "bot.ts"))
if ($Remove) {
    Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match $botPath } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    "removed '$name' and stopped the bot"
    return
}
if (-not (Test-Path "C:\Program Files\nodejs\node.exe")) { throw "Node.js not found in C:\Program Files\nodejs" }
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$here\run_hidden.vbs`"" -WorkingDirectory $here
$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$watch = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(15) `
    -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
Register-ScheduledTask -TaskName $name -Action $action -Trigger @($logon, $watch) -Settings $settings -Principal $principal -Force | Out-Null
"installed '$name': runs hidden while you are logged in; log in bot.log"
