// LLM 配置：OpenAI 兼容 endpoint（base URL + API key + 模型名），Electron safeStorage 加密（见 ADR 0008）。
// 与工作目录解耦：全局存储于 userData，不进工作目录、不落 agentDir。
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const FILE = () => path.join(app.getPath('userData'), 'llm-config.json');

function readRaw() {
  try { return JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch { return {}; }
}
function writeRaw(obj) {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(obj));
}

function isAvailable() {
  return !!(safeStorage && safeStorage.isEncryptionAvailable());
}

// 返回 { baseUrl, apiKey, model } 或 null
function getLlmConfig() {
  const raw = readRaw();
  if (!raw.enc) return null;
  if (!isAvailable()) return null; // 加密了但本机不可解密
  try {
    const json = safeStorage.decryptString(Buffer.from(raw.enc, 'base64'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function setLlmConfig(cfg) {
  if (!isAvailable()) throw new Error('safeStorage 不可用（平台不支持加密存储）');
  const json = JSON.stringify({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model });
  const enc = safeStorage.encryptString(json).toString('base64');
  writeRaw({ enc });
}

module.exports = { getLlmConfig, setLlmConfig, isAvailable };
