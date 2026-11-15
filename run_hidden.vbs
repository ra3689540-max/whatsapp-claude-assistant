' Starts run_bot.cmd with no window and waits for it, so Windows Task Scheduler knows the bot is running.
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & here & "\run_bot.cmd""", 0, True
