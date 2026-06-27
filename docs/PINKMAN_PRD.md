# PocketBridge Pinkman Scope PRD

**Version:** v0.1  
**Owner:** Pinkman  
**Date:** 2026-06-27  
**Status:** Draft for implementation  

## 1. Conclusion

Pinkman 的交付目标是打通 PocketBridge 的“手机端采集 - 本地服务 - Mac Inbox - 知识库沉淀”主链路，并为 Ding 的 Mac 端体验、Snapzy、BLEUnlock 演示提供稳定 API。

两天黑客松内，优先级不是完整产品化，而是稳定演示闭环：

1. 手机扫码连接 Mac。
2. 手机上传文本、图片、文件到 Mac。
3. Mac 通过 PocketInbox 实时看到内容。
4. Mac 标记文件共享给手机。
5. 手机查看并下载 Mac 共享文件。
6. 至少一个内容写入 Markdown/Obsidian 知识库。
7. API 支持 Ding 接入 Snapzy 文件夹导入和 BLE 状态演示。

置信度：高。

## 2. Background

PocketBridge 的产品定位是：手机是灵感收集器和随身钥匙，Mac 是个人知识母体。Pinkman 负责把跨设备数据流和知识沉淀能力做成可运行基础设施。

当前仓库已有：

- Node.js 本地 server。
- REST API。
- WebSocket 事件。
- Mac Web PocketInbox。
- Mobile browser fallback。
- Snapzy watch folder。
- BLE status API。
- Markdown knowledge export。

待补齐重点：

- Flutter mobile app。
- Flutter QR pairing。
- Flutter 上传/下载体验。
- 更稳定的 knowledge pipeline。
- Obsidian vault 配置。
- 可选 MCP API。

## 3. Goals

### G1. Flutter 手机端 MVP

用户可以用 Flutter App 扫 Mac 页面二维码，完成配对，并上传文本、图片、文件到 Mac。

### G2. 本地 Server 成为唯一数据通道

Flutter、Mac UI、Snapzy、BLEUnlock 都只通过本地 server 的 REST/WebSocket contract 协作。

### G3. 文件传输双向可演示

手机可以传内容到 Mac；Mac 可以把文件标记为 shared，手机可以看到并下载。

### G4. 内容进入知识库

用户可以把任意 inbox item 写入 Markdown，输出到 Obsidian 兼容目录。

### G5. 保持 Ding 可并行

API、事件、数据结构稳定，Ding 可以独立接 Mac 端 UI、Snapzy 导出和 BLE 状态演示。

## 4. Non-Goals

以下不属于 Pinkman v0.1 必交范围：

- 真正 BLE 文件传输。
- 云端同步或账号系统。
- 端到端加密。
- 完整原生 iOS/Android 分别开发。
- Windows 支持。
- 生产级权限管理。
- 长期稳定数据库。
- 完整 MCP Server 规范实现。

## 5. Users

### Primary User

黑客松 demo 用户：手里有手机和 Mac，希望快速把手机内容收进 Mac 的知识库。

### Internal User

Ding：需要稳定接口来做 Mac PocketInbox、Snapzy、BLEUnlock 和路演演示。

## 6. Core User Stories

### US1. Pairing

作为用户，我打开 Mac PocketBridge 页面后，可以用手机扫码连接这台 Mac。

Acceptance:

- Flutter 能解析 QR JSON。
- Flutter 持久化 `serverBaseUrl`、`wsUrl`、`pairCode`。
- Flutter 能用 `GET /health` 检查 server 是否在线。
- Flutter 能用 pair code 调用 `GET /api/items`。

### US2. Upload Text

作为用户，我可以在手机输入一段灵感文本并上传到 Mac。

Acceptance:

- Flutter 调用 `POST /api/items/text`。
- Server 返回 `PocketItem`。
- Mac PocketInbox 通过 WebSocket 或刷新看到新 item。
- 断网/错误 pair code 时 Flutter 显示明确错误。

### US3. Upload Image/File

作为用户，我可以从手机相册或文件选择器上传图片/文件到 Mac。

Acceptance:

- Flutter 调用 `POST /api/items/upload`。
- 支持至少图片和普通文件。
- Server 保存到 `data/inbox/<date>/<item-id>/original`。
- `metadata.json` 记录 item。
- Mac PocketInbox 能下载原文件。

### US4. Mac to Phone Share

作为用户，我可以在手机看到 Mac 标记共享的文件，并下载到手机。

Acceptance:

- Flutter 调用 `GET /api/items?sharedToMobile=true`。
- Flutter 展示标题、类型、来源和创建时间。
- Flutter 调用 `GET /api/items/:id/download` 下载。
- 下载失败时有错误提示。

### US5. Knowledge Export

作为用户，我可以把 inbox item 写入本地 Markdown/Obsidian。

Acceptance:

- Server 调用 `POST /api/knowledge/:id`。
- Markdown 文件写入 `data/obsidian/PocketBridge/`。
- 文件名包含 `item.id`，不会覆盖同名内容。
- Item 状态变为 `saved_to_knowledge`。
- WebSocket 广播 `knowledge.saved`。

### US6. Realtime Feedback

作为用户，我可以看到新内容实时出现在 Mac PocketInbox。

Acceptance:

- Server 支持 `/ws?pairCode=<code>&client=<mobile|mac>`。
- 新 item 创建后广播 `item.created`。
- 共享状态变化后广播 `item.shared`。
- 知识库保存后广播 `knowledge.saved`。

## 7. Functional Requirements

## 7.1 Flutter App

### P0

- QR scanner screen.
- Pairing result storage.
- Connection status indicator.
- Text upload form.
- Image/file upload picker.
- Shared files list.
- File download action.
- WebSocket event listener.
- Basic error and loading states.

### P1

- Recent upload history.
- Retry failed upload.
- Upload progress bar.
- Local preview for images.
- Manual server URL input fallback.

### P2

- Background upload.
- Share extension.
- Recording import.
- Offline queue.

## 7.2 Local Server

### P0

- Pairing payload.
- Pair-code auth.
- Text item creation.
- Multipart file upload.
- Item listing/filtering.
- File download.
- Share-to-mobile flag.
- Knowledge Markdown export.
- WebSocket broadcast.
- Snapzy folder import.
- BLE status endpoint.

### P1

- Atomic metadata writes.
- Metadata backup on write.
- Better MIME detection.
- Search endpoint.
- Item delete/archive endpoint.

### P2

- SQLite storage.
- Full MCP server.
- AI summary/tag pipeline.

## 7.3 Knowledge Pipeline

### P0

- Generate Markdown with frontmatter.
- Preserve source metadata.
- Include source file path for file/image items.
- Write into Obsidian-compatible directory.

### P1

- Configurable Obsidian vault path.
- Auto tags from file type/origin.
- Simple summary placeholder.
- Link copied file attachment into note.

### P2

- Real AI summary.
- Embeddings/search.
- MCP resources/tools.

## 8. API Contract

Source of truth:

```text
docs/SHARED_CONTRACT.md
```

Flutter must not invent alternate field names. Required fields:

- `serverBaseUrl`
- `wsUrl`
- `pairCode`
- `PocketItem.id`
- `PocketItem.kind`
- `PocketItem.title`
- `PocketItem.origin`
- `PocketItem.sourceDevice`
- `PocketItem.sharedToMobile`
- `PocketItem.status`
- `PocketItem.createdAt`
- `PocketItem.downloadUrl`

Required header:

```http
X-PocketBridge-Pair-Code: <pairCode>
```

## 9. Data Model

Canonical item:

```ts
type PocketItem = {
  id: string;
  kind: "text" | "image" | "file" | "screenshot";
  title: string;
  origin: "mobile" | "mac" | "snapzy";
  sourceDevice: string;
  mimeType?: string;
  sizeBytes?: number;
  originalFilename?: string;
  storageRelPath?: string;
  text?: string;
  tags: string[];
  sharedToMobile: boolean;
  status: "inbox" | "saved_to_knowledge";
  createdAt: string;
  updatedAt: string;
  downloadUrl?: string;
  knowledgePath?: string;
};
```

## 10. Flutter UX Requirements

### Screen 1. Pairing

Elements:

- Camera scan button.
- Manual URL fallback.
- Last paired Mac.
- Connection status.

States:

- Unpaired.
- Scanning.
- Connected.
- Failed.

### Screen 2. Capture

Elements:

- Text input.
- Upload text button.
- Pick image button.
- Pick file button.
- Upload status.

States:

- Idle.
- Uploading.
- Uploaded.
- Failed.

### Screen 3. Shared From Mac

Elements:

- Item list.
- Refresh button.
- Download button per file.
- Empty state.

States:

- Loading.
- Empty.
- Loaded.
- Downloading.
- Failed.

## 11. Implementation Milestones

### M1. Environment Ready

Definition:

- `flutter --version` works.
- `dart --version` works.
- `flutter doctor` has no blocker for at least one target: iOS simulator, Android, or web.

### M2. Flutter Project Bootstrapped

Definition:

- `apps/mobile_flutter/` exists.
- App can run on one target.
- App has pairing screen shell.

### M3. Pairing Works

Definition:

- QR payload parsed.
- Pairing data persisted.
- App can call `GET /api/items`.

### M4. Upload Works

Definition:

- Text upload works.
- Image/file upload works.
- Mac PocketInbox receives WebSocket update.

### M5. Download Works

Definition:

- Flutter lists shared items.
- Flutter downloads shared files.

### M6. Knowledge Pipeline Validated

Definition:

- At least one mobile-uploaded item is written to Markdown.
- Markdown path appears in item metadata.

## 12. Test Plan

### Server

- `npm test`
- `npm run build`
- API smoke test:
  - `GET /api/pairing`
  - `POST /api/items/text`
  - `POST /api/items/upload`
  - `GET /api/items`
  - `POST /api/knowledge/:id`

### Flutter

- `flutter analyze`
- `flutter test`
- Manual:
  - Scan QR.
  - Upload text.
  - Upload image.
  - Download shared item.

### Demo

- Start server.
- Open Mac UI.
- Pair Flutter app.
- Upload from phone.
- Save to knowledge.
- Share Mac item back to phone.

## 13. Risks

### R1. Flutter install or platform toolchain blocks device run

Mitigation:

- Use Flutter Web or mobile browser fallback for demo.
- Continue implementing Flutter API layer independently.

### R2. Local network mismatch

Mitigation:

- Use `PB_PUBLIC_HOST=<phone-reachable-ip>`.
- Mac hotspot fallback.

### R3. iOS signing or simulator setup slows progress

Mitigation:

- Use Android/Web target first.
- Keep Flutter app platform-neutral.

### R4. Android SDK licensing blocks build

Mitigation:

- Run `flutter doctor --android-licenses`.
- Use web fallback if Android build is not ready.

### R5. Knowledge pipeline scope creep

Mitigation:

- P0 is Markdown output only.
- AI summary/MCP remain P1/P2 unless core demo is stable.

## 14. Open Questions

1. Flutter first target: iOS simulator, Android device, or web?
2. Obsidian vault path: use `data/obsidian/PocketBridge/` or real vault path?
3. Mobile app name: `PocketBridge` or `PocketBridge Mobile`?
4. For hackathon judging, should MCP be shown as real API or roadmap?

## 15. Development Rule

Before adding a feature, check whether it improves the demo path:

```text
Pair -> Upload -> Inbox -> Knowledge -> Share back
```

If not, defer it.

