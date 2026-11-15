@echo off
rem Runs the bot with its output in bot.log (started hidden by run_hidden.vbs / the Windows task).
cd /d "%~dp0"
rem keep the log small: move it aside once it passes ~2 MB
for %%A in (bot.log) do if %%~zA GTR 2000000 move /y bot.log bot.old.log >nul
echo ==== %date% %time% starting >> bot.log
rem full path, so each copy's process can be told apart (install_task.ps1 -Remove stops only this folder's bot)
"C:\Program Files\nodejs\node.exe" "%~dp0bot.ts" >> bot.log 2>&1
echo ==== %date% %time% stopped (exit %errorlevel%) >> bot.log
