# 三个账号渠道的移除历史与原因

> 本文档记录上游项目中 **WorkBuddy 国内版**、**WorkBuddy 国际版**、**华为云** 三个账号渠道被移除的经过与官方原因。
> 信息来源：本仓库 git 历史（`git log` / `git show`）与源码注释，非推测。
> 这三个渠道属于模型工作台（magpie 引擎 / EAC router 页面）里的**账号渠道**，
> 与本项目自己维护的 EAC 免费渠道（GitHub 登录 + Star 解锁）是两回事。
>
> **文末「本 fork 已恢复」章节记录了本 fork 重新加回国内版与华为云的过程。**

---

## 涉及的渠道与全部别名

| 渠道 | 主 id | 全部被拦截的写法 |
| --- | --- | --- |
| WorkBuddy 国内版 | `workbuddy` | `workbuddy`、`codebuddy`、`codebuddy-cn`（国内版常以 CodeBuddy 之名出现） |
| WorkBuddy 国际版 | `workbuddy-ai` | `workbuddy-ai` |
| 华为云 | `huaweicloud` | `huaweicloud`、`Huawei Cloud MaaS`、`Token Plan`、`codearts`、`ModelArts`、`华为云`、`码道`、`@magpie-community/opencode-codearts-auth` |

---

## 移除时间线

### 2026-10-21：集中移除（作者 zixin947）

| commit | 内容 |
| --- | --- |
| `d187bf1` | 移除两端 WorkBuddy 国内版与国际版：渠道注册、认证、积分、探测与调用入口全部删除；**保留历史账号和凭据** |
| `207f58c` | 合并 PR #577，彻底清理插件与桌面端 WorkBuddy 残留 |
| `58d87c7` | 彻底移除旧实现并提取共享工具（删除 `buddy.ts`、`buddy-adapter.ts` 等约 250KB 源码，抽出 `credential-expiry.ts`、`credit-expiry-window.ts` 等公共模块） |
| `6fba52d` | 彻底移除华为云实现并迁出公共工具（删除 `codearts-credits.ts`、`direct-fetch.ts` 及对应测试） |
| `aeeae90` | 清理华为云文案、依赖与发布说明 |
| `1f92730` | 合并 PR #585，彻底移除华为云 CodeArts 渠道及插件、桌面端残留 |

### 2026-10-25：正式发布与补漏（作者 Ebony-Vinyl）

| commit | 内容 |
| --- | --- |
| `da48714` | **v2.6.0 发布**：插件端与桌面端一致移除 WorkBuddy 与华为云，新增免责声明（`src/disclaimer.js`） |
| `219e6c0` | 补漏修复：此前只拦截 `workbuddy` / `workbuddy-ai` / `huaweicloud` 三个 id，存在两个真实漏洞——① 国内版常以 **CodeBuddy** 名义出现（`codebuddy` / `codebuddy-cn` 未被拦截）；② 华为云 **CodeArts**（`@magpie-community/opencode-codearts-auth`，华为云自己的 coding plan）完全未在名单内，插件市场仍能搜到并安装。改为按 id + 文本双维度覆盖全部别名，免责声明升级到 v2 |

### 2026-11-22：保留为唯一自定义策略（作者 Ebony-Vinyl）

| commit | 内容 |
| --- | --- |
| `2f305c8` | 把内嵌引擎换成上游纯净版 magpie `3bf298e`，去掉自有改名换标层（issue #1146）。**唯一保留的自定义逻辑就是渠道剔除策略**（`src/magpie-policy.js` 未改动），说明这是刻意维持的底线 |

---

## 官方给出的原因

### 来自 `src/magpie-policy.js` 顶部注释（权威说明）

> WorkBuddy 的国内版（以 CodeBuddy 名义销售）和国际版都不提供：
> **服务它们的社区插件会以 WorkBuddy 自己的桌面客户端身份签名请求**，
> 这是本产品不愿承担的风险。
>
> 华为云 MaaS（`huaweicloud`，及其 Token Plan preset）同样不提供：
> **本构建不携带任何华为渠道**，而引擎的固定 preset 列表是唯一会把它重新引回来的入口，
> 所以在此拦掉。
>
> 由于引擎是固定二进制、插件市场在运行时拉取，排除必须在宿主自己掌控的管理边界强制执行，
> 而不是在引擎里。渠道可通过订阅 id、命名它的 preset、提供它的包，以及任何含上述别名的名字来识别——
> 因为第三方插件可以用任意包名登录同一提供商。

### 来自 `src/disclaimer.js`（面向用户的定性）

- 本项目是**个人学习与技术研究项目**，用于学习模型网关、协议适配与本地路由的实现方式，按「现状」提供，不构成任何商业服务或产品承诺。
- 这三个渠道「在插件端与桌面端均被移除……渠道列表、预设、登录入口、插件市场与模型目录里都不会出现，也无法通过导入配置或安装第三方插件启用」。
- 「目录中看不到它们不是故障，是本项目的明确取舍，后续更新不会重新引入」。
- 用户在别处使用这些渠道是个人行为，与本项目作者及团队无关；不参与、不背书、不提供支持。
- 请勿用于违反服务商条款、规避授权限制、批量滥用额度或其他违法用途。

---

## 一句话总结

**WorkBuddy 渠道的社区插件存在冒充官方桌面客户端签名请求的风险，华为云 MaaS 属于本项目不打算携带的渠道；维护者从 v2.6.0（2026-10-25，实际动手 2026-10-21）起在宿主管理层把它们彻底挡掉，并在免责声明里明确这是永久产品取舍。**

---

## 附：本 fork 已恢复（已完成）

> 本 fork 在 2026-11-25 把 **WorkBuddy 国内版（CodeBuddy，provider `buddy`）** 与
> **华为云（CodeArts，provider `codearts`）** 两个账号渠道重新加了回来。
> **WorkBuddy 国际版（`workbuddy-ai`）继续屏蔽。**

### 上游可用性探测

先直连 pinned magpie 引擎（不带本插件过滤）探查这两个渠道的运行时市场状态：市场列表/搜索/npm 元数据里两个 `@magpie-community/*-auth` 包均为空或 404，只剩 `api/providers.movable` 里一个 `workbuddy` 历史弃用标记。确认「旧实现代码被删、且上游市场不再可靠提供」后，按用户要求走 git 历史恢复路线。

### 做法

- 以删除前最后一个同时含两渠道的提交 `f6080541a02a3d2282c58f56ce6e4e2fd4abc72d` 为基底，取回 `vendor/channel-pack/src/` 下的 buddy 系与 codearts 系共 16 个源码文件。
- 适配当前架构的 API 漂移：补回 `types.ts` 的 CodeArts 凭据类型、`credits.ts` 的 `fetchCreditBalance` / `fetchCheckinStatus` / `claimDailyCheckin`、`jose` 依赖；`index.ts` 与 `channel-pack-rpc.ts` 按当前账号池/刷新调度重新装配，新 provider 以可选尾参追加避免位置传参错位。
- 只恢复 `CODEBUDDY`（国内版）与 `codearts`，**不恢复国际版 `WORKBUDDY` product**。
- `src/magpie-policy.js` 的拦截收窄为只匹配国际版（`DENIED_IDS = {'workbuddy-ai'}`、`DENIED_TEXT = /workbuddy[\s_-]*ai/i`、`POLICY_REFUSED` 文案同步），放行国内版与华为云的全部别名。
- `src/disclaimer.js` 升到 v3：只声明不提供国际版，并说明两渠道已恢复。
- `client.js` 的渠道卡增加 CodeBuddy 与华为云 CodeArts 两张卡。
- 重建 `vendor/channel-pack/pack.js` 与 `packages/standalone/channels/business.mjs`。

### 验证

- 以 git 历史恢复引入的 TypeScript 错误清零（剩余 39 个错误为恢复前即存在的基线问题：gemini/loop-recovery/qoder-wasm/openai-gateway/minimax）。
- `magpie-policy`（15 项）、`channel-pack`、`standalone-channels`、`magpie-plugin`、`workbench-management`、`turn-accounting` 等测试全部通过。
- 全量 `test-all --mode contributor`：122/123 通过；唯一失败 `lane-exit` 是本机缺 `openssl` 可执行文件的环境问题，与本次改动无关。

### 注意

- 渠道能否登录、能否正常计价取决于上游服务当前状态；本 fork 只恢复了代码路径与拦截策略。
- 发布用的 `catalog/integrity.json` / `feed/manifest.json` 需要仓库维护私钥重签；本地 `link:` 安装方式不走应用内升级校验，不影响本次试用。
