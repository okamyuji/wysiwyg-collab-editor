# WYSIWYG Collab Editor

WYSIWYG Collab Editor は、ブラウザ上で複数ユーザーが同じ文書を編集し、装飾付きの文書を PDF / DOCX / Markdown にエクスポートできる共同編集エディターです。

現行実装はフェーズ1（MVP、in-memory WebSocket リレー＋contentEditable、永続化なし）です。設計文書が規定する OT（ShareDB）、Quill.js、PostgreSQL 永続化、Redis Pub/Sub、S3 互換ストレージ、日本語 IME 対応はフェーズ2以降の適用です（`docs/design/adr/ADR-0029-フェーズ分割によるMVP再定義.md` と `ACCEPTANCE.md` を参照）。

## 主な機能

- 文書タイトルと本文の編集
- 太字、斜体、下線、ハイライト
- 複数タブ間のオンライン共同編集同期
- コメント、共有、エクスポート用パネル
- PDF / DOCX / Markdown の実ファイル出力
- 日本語 / 英語のブラウザ言語自動切替
- OWASP Top 10 観点のセキュリティ検証ゲート

## セットアップ

```bash
pnpm install
pnpm dev
```

Web アプリは `http://localhost:5173`、サーバーは `http://localhost:3000` で起動します。

## 品質ゲート

```bash
pnpm format
pnpm lint
pnpm check
pnpm test
pnpm build
pnpm e2e
pnpm security:owasp
```

formatter / linter は Vite+ の ox ツールチェーンを使います。

## ディレクトリ

- `apps/web`: React / Vite+ のフロントエンド
- `apps/server`: Express ベースのアプリケーションサーバー
- `apps/export-worker`: エクスポート worker のスキャフォールド
- `packages/shared`: API schema、定数、エラーコードなどの共有パッケージ
- `packages/doc-canonical`: 監査ログ向け正規化ユーティリティ
- `e2e`: Playwright E2E
- `docs`: 要件、基本設計、詳細設計、ADR
