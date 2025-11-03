import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const REQUIRED_PACKAGES = [
  '@openzeppelin/hardhat-upgrades',
  '@openzeppelin/contracts',
  '@openzeppelin/contracts-upgradeable',
  '@nomicfoundation/hardhat-toolbox',
  '@nomicfoundation/hardhat-ethers',
  'hardhat',
  'ethers',
  '@aave/core-v3',
  'dotenv'
];

function checkPackage(packageName: string): boolean {
  try {
    // Пробуем резолвить пакет (работает и с симлинками)
    require.resolve(packageName, { paths: [process.cwd()] });
    return true;
  } catch {
    // Fallback: проверяем наличие файла (для симлинков)
    const packagePath = path.join(process.cwd(), 'node_modules', packageName, 'package.json');
    try {
      // Используем realpath для разрешения симлинков
      const realPath = fs.realpathSync(packagePath);
      return fs.existsSync(realPath);
    } catch {
      return false;
    }
  }
}

function main() {
  console.log('🔍 Проверка необходимых зависимостей...\n');
  
  const missing: string[] = [];
  const installed: string[] = [];
  
  for (const pkg of REQUIRED_PACKAGES) {
    if (checkPackage(pkg)) {
      installed.push(pkg);
      console.log(`✅ ${pkg}`);
    } else {
      missing.push(pkg);
      console.log(`❌ ${pkg} - НЕ УСТАНОВЛЕН`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`Установлено: ${installed.length}/${REQUIRED_PACKAGES.length}`);
  console.log(`Отсутствует: ${missing.length}`);
  console.log('='.repeat(60) + '\n');
  
  if (missing.length > 0) {
    console.log('❌ Некоторые зависимости не установлены!');
    console.log('Отсутствующие пакеты:');
    missing.forEach(pkg => console.log(`  - ${pkg}`));
    console.log('\nЗапустите: npm install --legacy-peer-deps');
    process.exit(1);
  } else {
    console.log('✅ Все необходимые зависимости установлены!');
    process.exit(0);
  }
}

main();
