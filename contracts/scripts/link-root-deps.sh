#!/bin/bash

echo "🔗 Создание симлинков на зависимости из корневой директории..."
echo "=============================================="

cd "$(dirname "$0")/.."

# Создаем node_modules если его нет
mkdir -p node_modules

# Список критичных пакетов которые нужно линковать из корня
PACKAGES=(
  "hardhat"
  "ethers"
  "@openzeppelin/hardhat-upgrades"
  "@openzeppelin/contracts"
  "@openzeppelin/contracts-upgradeable"
  "@nomicfoundation/hardhat-toolbox"
  "@nomicfoundation/hardhat-ethers"
  "@nomicfoundation/hardhat-chai-matchers"
  "@nomicfoundation/hardhat-network-helpers"
  "@nomicfoundation/hardhat-verify"
  "@aave/core-v3"
  "dotenv"
  "typescript"
  "ts-node"
  "@typechain/hardhat"
  "@typechain/ethers-v6"
  "typechain"
)

echo "Создание симлинков..."

for pkg in "${PACKAGES[@]}"; do
  # Определяем путь к пакету в корневом node_modules
  if [[ "$pkg" == @* ]]; then
    # Scoped package (например @openzeppelin/contracts)
    SCOPE=$(echo "$pkg" | cut -d'/' -f1)
    NAME=$(echo "$pkg" | cut -d'/' -f2)
    
    ROOT_PATH="../node_modules/$SCOPE/$NAME"
    LOCAL_PATH="node_modules/$SCOPE"
    
    # Создаем директорию scope если нужно
    mkdir -p "$LOCAL_PATH"
    
    if [ -d "../node_modules/$SCOPE/$NAME" ]; then
      # Удаляем существующий симлинк/директорию
      rm -rf "node_modules/$SCOPE/$NAME"
      # Создаем симлинк
      ln -sf "../../node_modules/$SCOPE/$NAME" "node_modules/$SCOPE/$NAME"
      echo "✅ $pkg"
    else
      echo "⚠️  $pkg не найден в корневом node_modules"
    fi
  else
    # Обычный пакет
    ROOT_PATH="../node_modules/$pkg"
    
    if [ -d "$ROOT_PATH" ]; then
      # Удаляем существующий симлинк/директорию
      rm -rf "node_modules/$pkg"
      # Создаем симлинк
      ln -sf "../node_modules/$pkg" "node_modules/$pkg"
      echo "✅ $pkg"
    else
      echo "⚠️  $pkg не найден в корневом node_modules"
    fi
  fi
done

echo ""
echo "=============================================="
echo "✅ Симлинки созданы!"
echo ""
echo "Проверка доступности пакетов..."
npx tsx scripts/verify-deps.ts || echo "⚠️  Некоторые пакеты могут отсутствовать"
