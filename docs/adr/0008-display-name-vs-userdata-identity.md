# 应用显示名与数据目录名分离（改名不迁移 userData）

应用对外的显示名（窗口标题、标题栏品牌字、打包产物名）可随产品命名变化，但 userData 目录名冻结为首次发布名 `physics-lab`（`%APPDATA%\physics-lab`），在启动早期由 `app.setPath('userData', …)` 显式固定，不随显示名走。

理由（实测，非推测）：Windows 上 Electron `safeStorage` 的 DPAPI 密文**绑定 userData 路径**——同一密文、同一路径、换 app 名仍可解；同一 app 名、换路径则必报 `Error while decrypting`。目录名若跟着显示名走，一次改名就报废 `settings.json` 里已存的 API Key，且 `SettingsStore` 把解密失败当作"未配置"，老师只会看到"未配置 Key"而无从判断原因。

**Status**: accepted

**Considered Options**:
- **目录名随显示名 + 一次性搬迁配置** —— 关掉旧 Key：密文与旧路径绑定，搬到新目录必解密失败；只能靠日志/UI 提示老师重填，是可见的功能回退
- **桥接进程迁移密钥** —— 需另一个以旧目录启动的实例先解密、再交由新实例重加密，明文 Key 要经临时文件/管道传递，引入泄露面，收益只有一次
- **运行时改 app 名以固定密文（app.setName 旧名）** —— 无效：改名的真正变量是路径；且改名实现依赖 oscrypt 初始化时序，脆弱
- **选定方案：显示名与目录名解耦，目录名冻结** —— 代价是 `%APPDATA%` 下目录名与产品名不一致（与 Chrome / VS Code 保持稳定 profile 目录同一约定）

**Consequences**:
- 改显示名只需动 `APP_NAME`（`src/shared/app-meta.ts`）与 `src/renderer/index.html` 的 `<title>`，外加打包 `productName`；不需要任何数据迁移
- `DATA_DIR_NAME`（`src/shared/app-meta.ts`）是永久身份：任何情况下不得改（含打包后），否则等同清空老师已存的模型 Key
- `applyAppIdentity()` 必须在任何 `safeStorage` 使用之前执行（`src/main/index.ts` 顶层），否则同上
- 将来若确需更换目录，只能由老师重新填写 Key；程序无法迁移（明文不可得）
