#!/bin/bash

echo "📦 Пошаговая установка зависимостей для contracts..."
echo "=============================================="

cd "$(dirname "$0")/.."

# Критичные пакеты для деплоя
CRITICAL_DEPS=(
  "hardhat@^2.19.4"
  "ethers@^6.9.0"
  "@openzeppelin/hardhat-upgrades@^3.5.0"
  "@openzeppelin/contracts@^5.4.0"
  "@openzeppelin/contracts-upgradeable@^5.4.0"
  "@nomicfoundation/hardhat-toolbox@^4.0.0"
  "@nomicfoundation/hardhat-ethers@^3.0.0"
  "@aave/core-v3@^1.19.3"
  "dotenv@^16.3.1"
  "typescript@^5.3.3"
  "ts-node@^10.9.2"
)

echo ""
echo "Шаг 1: Удаление старых lock файлов..."
rm -f package-lock.json
echo "✅ Готово"

echo ""
echo "Шаг 2: Установка критичных пакетов..."

TOTAL=${#CRITICAL_DEPS[@]}
CURRENT=0

for pkg in "${CRITICAL_DEPS[@]}"; do
  CURRENT=$((CURRENT + 1))
  echo ""
  echo "[$CURRENT/$TOTAL] Установка $pkg..."
  
  npm install --legacy-peer-deps --no-audit --prefer-offline "$pkg" 2>&1 | grep -v "npm WARN" || true
  
  if [ $? -eq 0 ]; then
    echo "  ✅ $pkg установлен"
  else
    echo "  ⚠️  Ошибка установки $pkg (продолжаем...)"
  fi
done

echo ""
echo "=============================================="
echo "✅ Пошаговая установка завершена!"
echo ""
echo "Проверка установленных пакетов..."
npx tsx scripts/verify-deps.ts || echo "⚠️  Некоторые пакеты могут отсутствовать"
