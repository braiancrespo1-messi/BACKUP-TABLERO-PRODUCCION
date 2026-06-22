@echo off
title System Manager - Vision IA TMC 2.0
echo ==========================================================
echo   INICIANDO SYSTEM MANAGER - VISION IA TMC 2.0
echo ==========================================================
echo Servidor de Control: http://localhost:8080/
echo ==========================================================
echo.
echo Iniciando Manager de Puestos...

:: Lanzar el navegador por defecto
start http://localhost:8080/

:: Ejecutar el manager en primer plano para ver los logs
python manager.py

echo.
echo ==========================================================
echo   SYSTEM MANAGER FINALIZADO
echo ==========================================================
pause
