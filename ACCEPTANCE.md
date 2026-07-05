# 受け入れ基準（ACCEPTANCE.md）

このファイルはレビュー収束の合格ラインを凍結するものです。基準の変更にはユーザーの明示的な承認が必要です（`~/.claude/rules/common/code-review-convergence.md` R1）。合格ラインは2026-07-05にユーザーが「段階基準」として決定しました。v1がすべて満たされた時点でレビューは収束扱いとなり、v2以降は別マイルストーンです。

前提となる方針: v1は現行アーキテクチャ（in-memory WebSocketリレー＋contentEditable）の枠内で判定します。設計文書が規定するOT（ShareDB）とPostgreSQL永続化はv2・v3のスコープであり、v1のレビューで「設計文書と実装が違う」ことを指摘しても合否に影響しません。

## v1 合格基準（各項目は機械判定可能であること）

| # | 基準 | 検証方法 |
|---|---|---|
| 1 | 2クライアントが交互に3往復編集した後、両者の本文と revision が一致して収束する | E2E `syncs online edits between two active collaborators` を双方向化して拡張し、両クライアントの `document-body` innerHTML 一致をassert |
| 2 | 同一 revision を生成した2ピアの更新が決定論的に片方へ確定し、どちらのピアも古い状態へ退行しない | 既存ユニット `assigns increasing seq so equal-revision peers do not silently drop each other`（apps/server/tests/draft-collab.test.ts） |
| 3 | 同一IDの操作・コメントを重複送信しても状態は1件のみ反映される | 既存ユニット `de-duplicates comments by id (idempotent re-send)`＋draft側の冪等性ユニットテスト（新規） |
| 4 | 日本語IME入力で、未確定文字列が同期送信されず、確定後の文字列のみが1回だけ本文へ反映される | 新規E2E `ime-composition`（composition イベント駆動で「日本語」を入力し、本文がちょうど「日本語」を含むことをassert）。実装側にcompositionガードの追加が必要 |
| 5 | IME変換未確定中はWebSocketへdraftメッセージが送出されない（送出回数＝変換確定回数） | 新規ユニット（compositionフラグでonEditorInputをガードし、isComposing中の送信0件を検証） |
| 6 | 途中参加クライアントが参加時点の最新文書とコメント全件を受信する | 既存ユニット `late joiners receive the latest snapshot`＋`comments propagate to all peers` |
| 7 | 装飾付き日本語文書のPDF・DOCX・Markdown出力で本文テキストが欠落しない | 既存E2E `exports a decorated document as PDF, DOCX, and Markdown without text loss` に日本語本文ケースを追加 |
| 8 | 入力検知からピア受信までの同期遅延が、ローカル計測で平均150ms以内・p95 400ms以内 | 新規統合テスト（draft-collab.test.tsのopenClientで100回計測し平均とp95をassert） |
| 9 | serverとwebのユニットカバレッジが lines 80 / statements 80 / branches 70 / functions 80 以上 | `vp test --coverage` の閾値設定（docs/design/detailed/18-ci-quality-gates.md の規定値） |
| 10 | 上記すべてを一括実行するゲートコマンドが終了コード0 | `pnpm run gate`（format → lint → check → test → e2e を包含。新規定義） |

## v2 マイルストーン（v1収束後に着手、v1の合否には影響しない）

- データ永続化: 文書更新後にサーバを再起動しても最新revisionの本文が復元される（PostgreSQL接続、migrations/の`revisions`テーブル使用、testcontainers統合テスト）

## v3 マイルストーン（同上）

- OT（ShareDB）への移行: 設計文書（ADR-0001/0002、docs/design/detailed/04）が規定する操作変換ベースの競合統合。着手時にADRの現行性を再確認する

## 運用ルール

- v1項目に無い品質不満が出た場合は、コードを直す前に「基準への追加可否」をユーザーへ確認します（R5）
- レビューはゲートgreen後にN=3・K=2の合議制で行い、ラウンド上限は3です（R3・R4）
