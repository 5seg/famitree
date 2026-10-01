# FamiTree (ファミツリー) 🌳

> 1日1回の水やりでつながる、アンビエントな家族ウェルネスPWA

監視GPSや義務感のあるチャット通知ではなく、1日1回「木に水をあげる」だけで家族の気配と安心を分かち合えるロープレッシャー・ウェルネスアプリです。

---

## ✨ 主な特徴

- **🌱 1日1回の水やり**: 負担なく「今日も元気だよ」と伝えられるアンビエント設計
- **🌳 育つ家族の木**: 水やり継続日数や経験値に応じて木の表情（満開・成長・休息など）が変化
- **📸 共有キャンバス**: 写真をポラロイド風に吊るしたり、木製プレートに一言を刻む機能
- **💬 現実の対話を促す仕掛け**: メッセージアプリで完結させず「夕ご飯のときに話してみよう」とオフラインの会話を誘発
- **📱 PWA対応**: スマートフォンのホーム画面に追加してネイティブアプリ感覚で利用可能（オフラインキャッシュ対応）
- **♿ アクセシビリティ**: ESCキー・バックドロップ操作・WAI-ARIA ダイアログ対応

---

## 🛠 技術スタック

- **フレームワーク**: Vue 3 (Composition API / `<script setup>`) + TypeScript
- **ビルドツール**: Vite + `vite-plugin-pwa` (Workbox)
- **スタイリング**: Tailwind CSS v4
- **アイコン**: Lucide Vue Next
- **エフェクト**: Canvas Confetti
- **ホスティング**: Cloudflare Pages

---

## 🚀 開発・実行方法

### パッケージのインストール
```bash
bun install
```

### 開発サーバーの起動
```bash
bun run dev
```

### 本番ビルド
```bash
bun run build
```

### Cloudflare Pages へのデプロイ
```bash
bun run deploy:pages
```

## オープンソースライセンス表示 (Third-Party Licenses)

本プロジェクトでは、以下のオープンソースライブラリを使用しています。各ソフトウェアの著作権およびライセンス条項に基づき表記します。

### Production Dependencies
- **[vue](https://github.com/vuejs/core)** (v3.5.41) - [MIT License](https://github.com/vuejs/core/blob/main/LICENSE)
  Copyright (c) 2018-present, Yuxi (Evan) You
- **[lucide-vue-next](https://github.com/lucide-icons/lucide)** (v1.0.0) - [ISC License](https://github.com/lucide-icons/lucide/blob/main/LICENSE)
  Copyright (c) Lucide Contributors
- **[canvas-confetti](https://github.com/catdad/canvas-confetti)** (v1.9.4) - [ISC License](https://github.com/catdad/canvas-confetti/blob/master/LICENSE)
  Copyright (c) Kiril Vatev

### Development Dependencies
- **[vite](https://github.com/vitejs/vite)** (v8.2.2) - [MIT License](https://github.com/vitejs/vite/blob/main/LICENSE)
  Copyright (c) 2019-present, Yuxi (Evan) You and Vite contributors
- **[@vitejs/plugin-vue](https://github.com/vitejs/vite-plugin-vue)** (v6.0.8) - [MIT License](https://github.com/vitejs/vite-plugin-vue/blob/main/LICENSE)
  Copyright (c) 2021-present, Vite contributors
- **[tailwindcss](https://github.com/tailwindlabs/tailwindcss)** & **[@tailwindcss/vite](https://github.com/tailwindlabs/tailwindcss)** (v4.3.3) - [MIT License](https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE)
  Copyright (c) Tailwind Labs, Inc.
- **[vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa)** (v1.3.0) - [MIT License](https://github.com/vite-pwa/vite-plugin-pwa/blob/main/LICENSE)
  Copyright (c) 2021-present, Anthony Fu
- **[typescript](https://github.com/microsoft/TypeScript)** (~v6.0.2) - [Apache License 2.0](https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt)
  Copyright (c) Microsoft Corporation
- **[vue-tsc](https://github.com/vuejs/language-tools)** (v3.3.11) - [MIT License](https://github.com/vuejs/language-tools/blob/master/LICENSE)
  Copyright (c) 2021-present, Johnson Chu
- **[@vue/tsconfig](https://github.com/vuejs/tsconfig)** (v0.9.1) - [MIT License](https://github.com/vuejs/tsconfig/blob/main/LICENSE)
  Copyright (c) 2022-present, vuejs
