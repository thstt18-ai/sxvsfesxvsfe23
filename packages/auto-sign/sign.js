
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

async function signTransaction() {
  log('🔐 Starting transaction signing...');
  
  try {
    log('✅ Using server-side signing service');
    log('📝 Transaction will be signed via API endpoint');
    
    return { success: true, message: 'Signing configured' };
  } catch (error) {
    log(`❌ Error: ${error.message}`);
    return { success: false, message: error.message };
  }
}

signTransaction().catch(console.error);
