# clasp + MCP (Google Sheets) セットアップ手順

この手順は `gas/` を TypeScript ベースの GAS 開発ワークスペースとして使う前提です。

## 1) GAS 側（clasp）初期化

`gas/.clasp.json` の `scriptId` を対象スクリプト ID に更新します。

```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "."
}
```

次に `gas/` で依存をインストールし、ビルドします（`bun` 推奨）。

```bash
cd gas
bun install
bun run build
```

`npm` を使う場合:

```bash
cd gas
npm install
npm run build
```

`clasp` の基本操作（`bun`）:

- 初回ログイン: `bun run login`
- 取得: `bun run pull`
- 反映: `bun run push`
- デプロイ: `bun run deploy`

## 2) Cursor に Google Sheets MCP を登録

代表例として `mcp-gsheets` を使う設定例です。Cursor の MCP 設定に以下を追加します。

```json
{
  "mcpServers": {
    "google-sheets": {
      "command": "npx",
      "args": ["-y", "mcp-gsheets"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/service-account.json"
      }
    }
  }
}
```

補足:
- サービスアカウントのメールアドレスを対象スプレッドシートに共有してください。
- `GOOGLE_APPLICATION_CREDENTIALS` はローカル環境の絶対パスを指定します。

## 3) Cursor での登録確認

1. Cursor の MCP サーバー一覧に `google-sheets` が表示されることを確認。
2. サーバー起動後、任意のシート読み取り（例: タブ `user_master` の先頭行）を実行。
3. エラーが出ないことを確認。

## 4) 日常ワークフロー

1. MCP で対象レンジを読む（現状把握）。
2. `gas/src/main.ts` を修正。
3. `cd gas && bun run build && bun run push` で反映。
4. 必要時のみ `bun run deploy` を実行。
