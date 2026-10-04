/**
 * 应用身份常量。改显示名时只动 APP_NAME；DATA_DIR_NAME 是稳定身份，冻结不动。
 * 同步点：src/renderer/index.html 的 <title>（窗口标题，静态 HTML 无法 import）。
 */
export const APP_NAME = '物理工坊'

/**
 * userData 目录名（Windows: %APPDATA%\<这个名字>）。
 * 冻结为最初发布名，永不随显示名变化：Electron 的 safeStorage 在 Windows 上用 DPAPI 加密，
 * 密文绑定 userData 路径 —— 换目录 = settings.json 里已存的 API Key 永久无法解密。
 * 详见 src/main/app-identity.ts。
 */
export const DATA_DIR_NAME = 'physics-lab'
