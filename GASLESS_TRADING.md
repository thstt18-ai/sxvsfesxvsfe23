
# 🚀 Gasless Trading Guide

## Краткая инструкция (1 команда)

```bash
# 1. Переходим в правильную папку
cd ~/replit-desktop

# 2. Запускаем Gemini-агент (без GUI)
npm run ai

# 3. Запускаем встроенный скрипт (без GUI)
npx hardhat run packages/ai-master/call.js --network amoy

# 4. Смотрим результат
tail -f packages/ai-master/agent.log
```

## Что получите после выполнения

✅ **Встроенное окно "Этапы реальной торговли"**
- Monaco + WebPreview, без GUI-ошибок
- Работает в Cloud Shell / Replit

✅ **Весь депозит → на указанный адрес**
- 100% баланса при нажатии "Подтвердить"
- Автоматическая проверка getAmountsOut, price impact, gas

✅ **Возврат на баланс → 100%**
- При нажатии "Отказаться"
- Полный возврат средств пользователю

✅ **Без Ledger, без approve, без MATIC**
- Encrypted keystore + Meta-TX (EIP-2771 + EIP-2612)
- Релейер оплачивает gas
- Пользователь подписывает permit (без транзакции approve)

## Архитектура Meta-TX

```
User Wallet (0 MATIC) 
    ↓ signs permit (EIP-2612)
    ↓
Trusted Forwarder (EIP-2771)
    ↓ relayer pays gas
    ↓
ArbitrageExecutor.executeArbitrageWithPermit()
    ↓
Flash Loan → Arbitrage → Profit → 100% Deposit
```

## Как это работает

### 1. Пользователь подписывает permit (без gas)
```typescript
const permitSig = await metaTxManager.generatePermit(
  tokenAddress,
  contractAddress,
  amount,
  deadline,
  nonce
);
```

### 2. Релейер отправляет мета-транзакцию (платит gas)
```typescript
const tx = await metaTxManager.executeGaslessArbitrage(
  contractAddress,
  tokenAddress,
  amount,
  arbitrageParams
);
```

### 3. Контракт проверяет permit и выполняет арбитраж
```solidity
function executeArbitrageWithPermit(
    address asset,
    uint256 amount,
    ArbitrageParams calldata params,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
) external onlyExecutor whenNotPaused {
    // Use permit to approve (no separate tx needed)
    IERC20Permit(asset).permit(
        _msgSender(),
        address(this),
        amount,
        deadline,
        v,
        r,
        s
    );
    
    // Execute arbitrage
    bytes memory encodedParams = abi.encode(params);
    POOL.flashLoanSimple(address(this), asset, amount, encodedParams, 0);
}
```

## CI/CD Pipeline

### Foundry + Slither автоматически проверяет:
- ✅ Все тесты проходят (`forge test`)
- ✅ Нет критических уязвимостей (`slither --fail-high`)
- ✅ Storage layout не изменился
- ✅ Bytecode < 24KB

### Mainnet deploy требует ручного approve:
```yaml
environment: mainnet  # GitHub Environment protection
```

## Безопасность

### 1. Encrypted Keystore
```bash
# Создать keystore
node -e "require('./server/walletManager').walletManager.createKeystore('password')"
```

### 2. Meta-TX без approve
- Пользователь подписывает permit (EIP-2612)
- Релейер оплачивает gas
- Никаких approve транзакций

### 3. 100% депозит на указанный адрес
- После успешного арбитража
- Проверка getAmountsOut, price impact, gas
- Полный контроль пользователя

## Мониторинг

```bash
# Логи в реальном времени
tail -f packages/ai-master/agent.log

# Проверить статус
curl http://localhost:5000/api/health

# Посмотреть метрики
curl http://localhost:5000/api/metrics
```

## FAQ

**Q: Нужен ли MATIC на балансе?**  
A: Нет! Релейер оплачивает gas через Meta-TX.

**Q: Безопасно ли это?**  
A: Да! Пользователь подписывает только permit (не private key). Контракт проверяет подпись.

**Q: Где деньги после арбитража?**  
A: 100% депозита автоматически переводится на указанный адрес после проверок.

**Q: Как отменить перевод?**  
A: Нажмите "Отказаться" - средства вернутся на баланс пользователя.

## Production Ready

✅ Foundry + Slither CI  
✅ Storage layout monitoring  
✅ Bytecode size guard  
✅ Manual mainnet approval  
✅ Gasless Meta-TX  
✅ 100% deposit transfer  
✅ Monaco + WebPreview (no GUI errors)  

🎉 **Готово к production!**
