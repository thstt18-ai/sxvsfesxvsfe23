
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = path.join(__dirname, 'agent.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  try {
    fs.appendFileSync(LOG_FILE, logMessage);
    console.log(message);
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

async function deployDependencies() {
  log('🔍 Checking auto-sign dependencies...');
  
  try {
    const packageJsonPath = path.join(__dirname, 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      log('📦 package.json found');
      
      // Check if node_modules exists
      const nodeModulesPath = path.join(__dirname, 'node_modules');
      
      if (!fs.existsSync(nodeModulesPath)) {
        log('⚠️  node_modules not found, but will use workspace dependencies');
      } else {
        log('✅ Dependencies ready');
      }
    }
    
    log('✅ Auto-sign deployment check complete');
    return { success: true, message: 'Dependencies ready' };
  } catch (error) {
    log(`❌ Error: ${error.message}`);
    return { success: false, message: error.message };
  }
}

deployDependencies().catch(console.error);
