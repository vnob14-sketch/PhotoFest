@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PhotoFest - Buat Installer
echo ============================================
echo   PhotoFest - membuat file installer (.exe)
echo   Cukup dilakukan SEKALI, di 1 komputer.
echo ============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js belum terpasang di komputer ini.
  echo     Pasang dulu dari https://nodejs.org ^(pilih LTS^), lalu jalankan file ini lagi.
  echo     Komputer photobooth TIDAK perlu Node.js - hanya komputer yang membuat installer.
  pause
  exit /b 1
)
call npm install
if errorlevel 1 goto gagal
call npm run dist
if errorlevel 1 goto gagal
echo.
echo ============================================
echo  SELESAI! File installer ada di folder dist:
echo     dist\PhotoFest-Setup.exe
echo  Salin file itu ke komputer photobooth, klik dua kali,
echo  shortcut PhotoFest otomatis muncul di Desktop.
echo ============================================
explorer dist
pause
exit /b 0
:gagal
echo.
echo [!] Gagal. Pastikan internet aktif lalu coba lagi.
pause
exit /b 1
