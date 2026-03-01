@echo off
setlocal
:: Chuyen ve o dia va thu muc chua file .bat nay
%~d0
cd "%~dp0"

echo =======================================================
echo          MOI TRUONG CDE - DENG DANG NHAP FIREBASE
echo =======================================================
set PATH=%~dp0\node-v20.12.2-win-x64;%PATH%
echo Vui long xac nhan hoac dang nhap bang trinh duyet...

call firebase login
echo -- Da dang nhap thanh cong! Dang chuan bi Deploy Backend...

:: Chuyen vao thu muc functions de cai dat va deploy
cd "%~dp0functions"
call npm install
call firebase deploy --only functions

echo -- HOAN TAT
pause
