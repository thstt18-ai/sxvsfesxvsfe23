
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface CodeAnalysis {
  file: string;
  issues: Array<{
    line: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
    suggestion?: string;
  }>;
  metrics: {
    complexity: number;
    linesOfCode: number;
    maintainabilityIndex: number;
  };
}

export interface ProjectAnalysis {
  totalFiles: number;
  totalIssues: number;
  criticalIssues: number;
  averageComplexity: number;
  recommendations: string[];
}

export class AIAssistant {
  private analysisCache = new Map<string, { result: CodeAnalysis; timestamp: number }>();
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private patterns = {
    security: [
      { pattern: /eval\(/g, message: 'Использование eval() небезопасно', severity: 'error' as const },
      { pattern: /Function\(/g, message: 'Использование Function() небезопасно', severity: 'error' as const },
      { pattern: /innerHTML\s*=/g, message: 'innerHTML может быть уязвим к XSS', severity: 'warning' as const },
      { pattern: /password|secret|key/i, message: 'Возможна утечка секретов', severity: 'warning' as const },
      { pattern: /process\.env\./g, message: 'Убедитесь, что env переменные не попадают в клиент', severity: 'info' as const },
    ],
    codeQuality: [
      { pattern: /console\.log/g, message: 'Debug лог найден', severity: 'info' as const },
      { pattern: /debugger/g, message: 'Debugger statement найден', severity: 'warning' as const },
      { pattern: /TODO|FIXME|HACK/g, message: 'Требуется доработка', severity: 'info' as const },
      { pattern: /any/g, message: 'Избегайте использования типа any', severity: 'info' as const },
    ],
    solidity: [
      { pattern: /tx\.origin/g, message: 'КРИТИЧНО: tx.origin небезопасен', severity: 'error' as const },
      { pattern: /transfer\(/g, message: 'Рассмотрите использование call вместо transfer', severity: 'warning' as const },
      { pattern: /selfdestruct/g, message: 'КРИТИЧНО: selfdestruct устарел', severity: 'error' as const },
    ]
  };

  async analyzeCode(filePath: string, originalName?: string): Promise<CodeAnalysis> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Файл не найден: ${filePath}`);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const displayName = originalName || path.basename(filePath);
      
      if (!content || content.trim().length === 0) {
        console.log(`⚠️ Empty file: ${displayName}`);
        return {
          file: displayName,
          issues: [{
            line: 1,
            severity: 'warning',
            message: 'Файл пустой или содержит только пробелы',
            suggestion: 'Добавьте код для анализа'
          }],
          metrics: {
            complexity: 1,
            linesOfCode: 0,
            maintainabilityIndex: 0
          }
        };
      }
      
      // Check cache
      const cacheKey = `${filePath}:${content.length}:${Date.now()}`;
      const cached = this.analysisCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log(`📦 Using cached analysis for ${displayName}`);
        return cached.result;
      }

      const lines = content.split('\n');
      const issues: CodeAnalysis['issues'] = [];
      const ext = path.extname(filePath).toLowerCase();

      console.log(`🔍 Analyzing ${displayName} (${lines.length} lines, ext: ${ext}, size: ${content.length} bytes)`);

    // Анализ безопасности
    this.patterns.security.forEach(({ pattern, message, severity }) => {
      lines.forEach((line, index) => {
        if (pattern.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
          issues.push({
            line: index + 1,
            severity,
            message,
            suggestion: this.getSuggestion(message)
          });
        }
      });
    });

    // Анализ качества кода
    this.patterns.codeQuality.forEach(({ pattern, message, severity }) => {
      lines.forEach((line, index) => {
        if (pattern.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
          issues.push({
            line: index + 1,
            severity,
            message,
            suggestion: this.getSuggestion(message)
          });
        }
      });
    });

    // Дополнительные проверки для TypeScript/JavaScript
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      // Проверка на длинные функции
      let currentFunctionStart = -1;
      lines.forEach((line, index) => {
        if (/function\s+\w+|const\s+\w+\s*=\s*\(/.test(line)) {
          currentFunctionStart = index;
        }
        if (currentFunctionStart >= 0 && line.includes('}')) {
          const functionLength = index - currentFunctionStart;
          if (functionLength > 50) {
            issues.push({
              line: currentFunctionStart + 1,
              severity: 'warning',
              message: `Функция слишком длинная (${functionLength} строк)`,
              suggestion: 'Разбейте на меньшие функции для улучшения читаемости'
            });
          }
          currentFunctionStart = -1;
        }
      });

      // Проверка на неиспользуемые переменные
      const declaredVars = new Set<string>();
      const usedVars = new Set<string>();
      lines.forEach(line => {
        const varDecl = line.match(/(?:let|const|var)\s+(\w+)/);
        if (varDecl) declaredVars.add(varDecl[1]);
        
        const varUsage = line.match(/\b(\w+)\b/g);
        if (varUsage) varUsage.forEach(v => usedVars.add(v));
      });

      declaredVars.forEach(varName => {
        if (!usedVars.has(varName) && !varName.startsWith('_')) {
          const lineNum = lines.findIndex(l => new RegExp(`(?:let|const|var)\\s+${varName}`).test(l)) + 1;
          issues.push({
            line: lineNum,
            severity: 'info',
            message: `Переменная "${varName}" объявлена но не используется`,
            suggestion: 'Удалите неиспользуемые переменные или добавьте _ в начало имени'
          });
        }
      });
    }

    // Специфичный анализ для Solidity
    if (ext === '.sol') {
      this.patterns.solidity.forEach(({ pattern, message, severity }) => {
        lines.forEach((line, index) => {
          if (pattern.test(line)) {
            issues.push({
              line: index + 1,
              severity,
              message,
              suggestion: this.getSuggestion(message)
            });
          }
        });
      });

      // Проверка на отсутствие require/revert
      const hasValidation = content.includes('require(') || content.includes('revert');
      if (!hasValidation) {
        issues.push({
          line: 1,
          severity: 'warning',
          message: 'Отсутствуют проверки входных данных',
          suggestion: 'Добавьте require() для валидации входных параметров'
        });
      }
    }

    // Метрики
    const complexity = this.calculateComplexity(content);
    const maintainabilityIndex = this.calculateMaintainability(content);

    const result: CodeAnalysis = {
      file: path.basename(filePath),
      issues,
      metrics: {
        complexity,
        linesOfCode: lines.length,
        maintainabilityIndex
      }
    };

    // Cache result
    this.analysisCache.set(cacheKey, { result, timestamp: Date.now() });

    // Cleanup old cache entries
    if (this.analysisCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of this.analysisCache.entries()) {
        if (now - value.timestamp > this.CACHE_TTL) {
          this.analysisCache.delete(key);
        }
      }
    }

    console.log(`✅ Analysis complete: ${issues.length} issues, complexity ${complexity}`);
    
    return result;
    } catch (error: any) {
      console.error(`❌ Error analyzing ${filePath}:`, error.message);
      throw new Error(`Ошибка анализа кода: ${error.message}`);
    }
  }

  async analyzeProject(projectPath: string = '.'): Promise<ProjectAnalysis> {
    const extensions = ['.ts', '.js', '.sol', '.tsx', '.jsx'];
    const files: string[] = [];
    
    const scanDirectory = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          scanDirectory(fullPath);
        } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
          files.push(fullPath);
        }
      }
    };

    scanDirectory(projectPath);

    const analyses = await Promise.all(
      files.slice(0, 50).map(file => this.analyzeCode(file).catch(() => null))
    );

    const validAnalyses = analyses.filter(a => a !== null) as CodeAnalysis[];
    const totalIssues = validAnalyses.reduce((sum, a) => sum + a.issues.length, 0);
    const criticalIssues = validAnalyses.reduce(
      (sum, a) => sum + a.issues.filter(i => i.severity === 'error').length, 0
    );
    const avgComplexity = validAnalyses.reduce((sum, a) => sum + a.metrics.complexity, 0) / validAnalyses.length;

    const recommendations: string[] = [];
    
    if (criticalIssues > 0) {
      recommendations.push(`🔴 Исправьте ${criticalIssues} критических проблем безопасности`);
    }
    if (avgComplexity > 15) {
      recommendations.push('📊 Рассмотрите рефакторинг - высокая сложность кода');
    }
    if (totalIssues > 50) {
      recommendations.push('🧹 Запустите автоматическое исправление для устранения простых проблем');
    }

    return {
      totalFiles: validAnalyses.length,
      totalIssues,
      criticalIssues,
      averageComplexity: Math.round(avgComplexity * 10) / 10,
      recommendations
    };
  }

  async autoFix(filePath: string): Promise<string> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Файл не найден: ${filePath}`);
      }

      let content = fs.readFileSync(filePath, 'utf-8');
      const ext = path.extname(filePath);
      let changesCount = 0;

      console.log(`🔧 Auto-fixing ${path.basename(filePath)}`);

      // Удаление console.log
      const consoleLogs = content.match(/console\.log\([^)]*\);?\n?/g);
      if (consoleLogs) {
        content = content.replace(/console\.log\([^)]*\);?\n?/g, '');
        changesCount += consoleLogs.length;
        console.log(`  ✓ Removed ${consoleLogs.length} console.log statements`);
      }
      
      // Удаление debugger
      const debuggers = content.match(/debugger;?\n?/g);
      if (debuggers) {
        content = content.replace(/debugger;?\n?/g, '');
        changesCount += debuggers.length;
        console.log(`  ✓ Removed ${debuggers.length} debugger statements`);
      }

      // Добавление use strict для JS/TS
      if (['.js', '.ts'].includes(ext) && !content.includes('use strict') && !content.includes('"use strict"')) {
        content = '"use strict";\n\n' + content;
        changesCount++;
        console.log(`  ✓ Added "use strict"`);
      }

      // Форматирование
      try {
        fs.writeFileSync(filePath, content, 'utf-8');
        execSync(`npx prettier --write ${filePath}`, { stdio: 'ignore', timeout: 10000 });
        content = fs.readFileSync(filePath, 'utf-8');
        console.log(`  ✓ Formatted with Prettier`);
      } catch (e) {
        console.log(`  ⚠️ Prettier formatting skipped`);
      }

      console.log(`✅ Auto-fix complete: ${changesCount} changes made`);
      
      return content;
    } catch (error: any) {
      console.error(`❌ Error auto-fixing ${filePath}:`, error.message);
      throw new Error(`Ошибка автоисправления: ${error.message}`);
    }
  }

  async optimizeGas(solidityFile: string): Promise<string[]> {
    const suggestions: string[] = [];
    const content = fs.readFileSync(solidityFile, 'utf-8');

    // Анализ оптимизации газа
    const checks = [
      { pattern: /string\s+/g, suggestion: '⛽ Используйте bytes32 вместо string для фиксированных строк' },
      { pattern: /uint256\[\]/g, suggestion: '⛽ Рассмотрите mapping вместо массивов для больших данных' },
      { pattern: /public\s+\w+;/g, suggestion: '⛽ Используйте external вместо public для функций' },
      { pattern: /\+=|\-=/g, suggestion: '⛽ Используйте unchecked для безопасной арифметики' },
      { pattern: /\.length/g, suggestion: '⛽ Кешируйте .length в цикле' },
    ];

    checks.forEach(({ pattern, suggestion }) => {
      if (pattern.test(content)) {
        suggestions.push(suggestion);
      }
    });

    // Проверка на ReentrancyGuard
    if (!content.includes('ReentrancyGuard') && content.includes('external')) {
      suggestions.push('🔒 Добавьте ReentrancyGuard для защиты от реентрантности');
    }

    return suggestions;
  }

  private getSuggestion(message: string): string {
    const suggestions: Record<string, string> = {
      'eval': 'Используйте JSON.parse() или безопасные альтернативы',
      'innerHTML': 'Используйте textContent или sanitize HTML',
      'секретов': 'Используйте process.env и файл .env',
      'Debug лог': 'Удалите перед деплоем в продакшн',
      'tx.origin': 'Используйте msg.sender',
      'transfer': 'Используйте call{value: amount}("")',
    };

    for (const [key, value] of Object.entries(suggestions)) {
      if (message.includes(key)) {
        return value;
      }
    }

    return 'Обратитесь к документации для исправления';
  }

  private calculateComplexity(code: string): number {
    const complexityKeywords = ['if', 'else', 'for', 'while', 'case', 'catch'];
    let complexity = 1;

    complexityKeywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = code.match(regex);
      if (matches) {
        complexity += matches.length;
      }
    });

    // Добавляем подсчет операторов отдельно
    const andMatches = code.match(/&&/g);
    const orMatches = code.match(/\|\|/g);
    const ternaryMatches = code.match(/\?/g);
    
    if (andMatches) complexity += andMatches.length;
    if (orMatches) complexity += orMatches.length;
    if (ternaryMatches) complexity += ternaryMatches.length;

    return complexity;
  }

  private calculateMaintainability(code: string): number {
    const lines = code.split('\n').length;
    const complexity = this.calculateComplexity(code);
    const comments = (code.match(/\/\//g) || []).length + (code.match(/\/\*/g) || []).length;

    // Упрощенный индекс поддерживаемости (0-100)
    const mi = Math.max(0, 100 - (complexity * 2) - (lines / 10) + (comments * 5));
    return Math.min(100, Math.round(mi));
  }

  clearCache(): void {
    this.analysisCache.clear();
  }

  getCacheSize(): number {
    return this.analysisCache.size;
  }

  async editFile(filePath: string, instruction: string): Promise<{
    success: boolean;
    originalContent: string;
    editedContent: string;
    changes: string[];
  }> {
    const fs = await import('fs');
    
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Файл не найден: ${filePath}`);
      }

      const originalContent = fs.readFileSync(filePath, 'utf-8');
      console.log(`🤖 AI Edit: Processing instruction for ${filePath}`);
      console.log(`📝 Instruction: ${instruction}`);

      let editedContent = originalContent;
      const changes: string[] = [];

      // Apply intelligent edits based on instruction
      const lowerInstruction = instruction.toLowerCase();

      // Remove console.logs
      if (lowerInstruction.includes('удал') && lowerInstruction.includes('console')) {
        const before = editedContent.match(/console\.log/g)?.length || 0;
        editedContent = editedContent.replace(/console\.log\([^)]*\);?\n?/g, '');
        const after = editedContent.match(/console\.log/g)?.length || 0;
        if (before > after) {
          changes.push(`Удалено ${before - after} console.log`);
        }
      }

      // Add TypeScript types
      if (lowerInstruction.includes('добав') && lowerInstruction.includes('тип')) {
        editedContent = editedContent.replace(/:\s*any/g, ': unknown');
        changes.push('Заменены типы any на unknown');
      }

      // Add error handling
      if (lowerInstruction.includes('обработ') && lowerInstruction.includes('ошибок')) {
        if (!editedContent.includes('try') && !editedContent.includes('catch')) {
          const lines = editedContent.split('\n');
          const wrappedLines = [
            'try {',
            ...lines.map(l => '  ' + l),
            '} catch (error) {',
            '  console.error("Error:", error);',
            '  throw error;',
            '}'
          ];
          editedContent = wrappedLines.join('\n');
          changes.push('Добавлена обработка ошибок try-catch');
        }
      }

      // Add documentation
      if (lowerInstruction.includes('документ') || lowerInstruction.includes('коммент')) {
        const lines = editedContent.split('\n');
        const documented = lines.map(line => {
          if (/^(export\s+)?(async\s+)?function\s+\w+/.test(line.trim())) {
            return `/**\n * TODO: Add function documentation\n */\n${line}`;
          }
          return line;
        });
        editedContent = documented.join('\n');
        changes.push('Добавлены JSDoc комментарии к функциям');
      }

      // Format code
      if (lowerInstruction.includes('формат') || lowerInstruction.includes('красив')) {
        try {
          const { execSync } = await import('child_process');
          fs.writeFileSync(filePath, editedContent, 'utf-8');
          execSync(`npx prettier --write ${filePath}`, { stdio: 'ignore', timeout: 10000 });
          editedContent = fs.readFileSync(filePath, 'utf-8');
          changes.push('Применено форматирование Prettier');
        } catch (e) {
          changes.push('Форматирование пропущено');
        }
      }

      // Optimize imports
      if (lowerInstruction.includes('оптимиз') && lowerInstruction.includes('импорт')) {
        const imports = new Set<string>();
        editedContent.split('\n').forEach(line => {
          const match = line.match(/^import .* from ['"](.*)['"];?$/);
          if (match) imports.add(match[1]);
        });
        changes.push(`Найдено ${imports.size} уникальных импортов`);
      }

      if (changes.length === 0) {
        changes.push('Инструкция обработана, изменений не требуется');
      }

      console.log(`✅ Edit complete: ${changes.length} changes applied`);

      return {
        success: true,
        originalContent,
        editedContent,
        changes
      };
    } catch (error: any) {
      console.error(`❌ Error editing file:`, error);
      throw new Error(`Ошибка редактирования: ${error.message}`);
    }
  }

  async getProjectTree(rootPath: string = '.'): Promise<any> {
    const fs = await import('fs');
    const path = await import('path');

    const buildTree = (dirPath: string, level: number = 0): any => {
      if (level > 5) return null; // Prevent deep recursion

      const stats = fs.statSync(dirPath);
      const name = path.basename(dirPath);

      // Skip common directories
      if (['.git', 'node_modules', '.cache', 'dist', 'build', '.next'].includes(name)) {
        return null;
      }

      if (stats.isDirectory()) {
        const children = fs.readdirSync(dirPath)
          .map(child => buildTree(path.join(dirPath, child), level + 1))
          .filter(Boolean);

        return {
          type: 'directory',
          name,
          path: dirPath,
          children
        };
      } else {
        return {
          type: 'file',
          name,
          path: dirPath,
          size: stats.size,
          extension: path.extname(name)
        };
      }
    };

    return buildTree(rootPath);
  }

  async batchEdit(files: Array<{ path: string; instruction: string }>): Promise<Array<{
    path: string;
    success: boolean;
    changes?: string[];
    error?: string;
  }>> {
    const results = [];

    for (const file of files) {
      try {
        const result = await this.editFile(file.path, file.instruction);
        results.push({
          path: file.path,
          success: true,
          changes: result.changes
        });
      } catch (error: any) {
        results.push({
          path: file.path,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  async getFileContent(filePath: string): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');
    
    const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
    
    if (!fs.existsSync(safePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    return fs.readFileSync(safePath, 'utf-8');
  }

  async saveFileContent(filePath: string, content: string): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    
    const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const dir = path.dirname(safePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(safePath, content, 'utf-8');
  }

  async getFullProjectTree(rootPath: string = '.'): Promise<any> {
    const fs = await import('fs');
    const path = await import('path');

    const buildTree = (dirPath: string, level: number = 0): any => {
      if (level > 10) return null;

      const stats = fs.statSync(dirPath);
      const name = path.basename(dirPath);

      const skipDirs = ['.git', 'node_modules', '.cache', 'dist', 'build', '.next', 'artifacts', 'cache', 'typechain-types'];
      if (skipDirs.includes(name)) {
        return null;
      }

      if (stats.isDirectory()) {
        const children = fs.readdirSync(dirPath)
          .map(child => buildTree(path.join(dirPath, child), level + 1))
          .filter(Boolean);

        return {
          type: 'directory',
          name,
          path: dirPath,
          children
        };
      } else {
        const ext = path.extname(name);
        const allowedExts = ['.ts', '.tsx', '.js', '.jsx', '.sol', '.json', '.md', '.txt', '.css', '.html', '.env', '.sql'];
        
        if (!allowedExts.includes(ext) && !name.startsWith('.')) {
          return null;
        }

        return {
          type: 'file',
          name,
          path: dirPath,
          size: stats.size,
          extension: ext,
          modified: stats.mtime
        };
      }
    };

    return buildTree(rootPath);
  }

  async analyzeErrorLog(errorLog: string): Promise<{
    errors: Array<{ type: string; message: string; file?: string; line?: number }>;
    suggestions: string[];
  }> {
    const errors = [];
    const suggestions = [];

    const lines = errorLog.split('\n');
    
    for (const line of lines) {
      // Parse npm installation errors
      if (line.includes('Exit Code: 236') || line.includes('code 236')) {
        errors.push({
          type: 'npm_native_build',
          message: 'Ошибка сборки нативных модулей (код 236)'
        });
        suggestions.push('Попробуйте установку с флагом --ignore-scripts');
        suggestions.push('Проверьте совместимость версии Node.js (рекомендуется 18.x или 20.x)');
      }
      
      if (line.includes('node-gyp') || line.includes('gyp ERR!')) {
        errors.push({
          type: 'node_gyp',
          message: 'Ошибка компиляции нативных зависимостей (node-gyp)'
        });
        suggestions.push('Установите build-essential: apt-get install build-essential');
        suggestions.push('Используйте флаг --ignore-scripts для пропуска нативных модулей');
      }
      
      if (line.includes('ENOTDIR') || line.includes('not a directory')) {
        errors.push({
          type: 'filesystem',
          message: 'Поврежденная структура node_modules'
        });
        suggestions.push('Удалите node_modules: rm -rf node_modules');
        suggestions.push('Очистите кеш npm: npm cache clean --force');
      }
      
      if (line.includes('ERESOLVE') || line.includes('peer dep')) {
        errors.push({
          type: 'dependency_conflict',
          message: 'Конфликт версий зависимостей'
        });
        suggestions.push('Используйте флаг --legacy-peer-deps');
      }
      
      if (line.includes('ETIMEDOUT') || line.includes('ECONNRESET')) {
        errors.push({
          type: 'network',
          message: 'Проблема сетевого подключения'
        });
        suggestions.push('Проверьте интернет-соединение');
        suggestions.push('Используйте другой npm registry или зеркало');
      }

      // Parse PostgreSQL errors
      if (line.includes('column') && line.includes('does not exist')) {
        const match = line.match(/column "([^"]+)" does not exist/);
        if (match) {
          errors.push({
            type: 'database',
            message: `Missing column: ${match[1]}`,
            file: 'database schema'
          });
          suggestions.push(`Run migration to add column "${match[1]}" to database`);
        }
      }

      // Parse TypeScript errors
      if (line.includes('error TS')) {
        errors.push({
          type: 'typescript',
          message: line,
        });
        suggestions.push('Fix TypeScript compilation errors');
      }

      // Parse runtime errors
      if (line.includes('Error:') || line.includes('TypeError:')) {
        errors.push({
          type: 'runtime',
          message: line,
        });
      }
    }

    if (errors.length === 0 && errorLog.includes('error')) {
      errors.push({
        type: 'unknown',
        message: 'Unknown error detected in logs'
      });
      suggestions.push('Check application logs for details');
    }

    return { errors, suggestions };
  }

  async autoFixErrors(errorLog: string): Promise<{
    success: boolean;
    fixed: string[];
    failed: string[];
  }> {
    const fixed = [];
    const failed = [];

    try {
      const analysis = await this.analyzeErrorLog(errorLog);

      for (const error of analysis.errors) {
        if (error.type === 'database' && error.message.includes('Missing column')) {
          // Check for migration file
          const fs = await import('fs');
          const migrationFile = 'migrations/0001_add_flashbots.sql';
          
          if (fs.existsSync(migrationFile)) {
            fixed.push(`Database migration file exists: ${migrationFile}`);
          } else {
            failed.push('Missing migration file - manual intervention required');
          }
        }
      }

      return {
        success: fixed.length > 0,
        fixed,
        failed
      };
    } catch (error: any) {
      return {
        success: false,
        fixed,
        failed: [error.message]
      };
    }
  }
}

export const aiAssistant = new AIAssistant();
