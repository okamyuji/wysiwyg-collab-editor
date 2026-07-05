# 受け入れ基準（ACCEPTANCE.md）

このファイルはレビュー収束の合格ラインを凍結するものです。基準の変更にはユーザーの明示的な承認が必要です（レビュー収束プロトコル R1: 受け入れ基準の凍結）。合格ラインは2026-07-05にユーザーが「段階基準」として決定しました。v1がすべて満たされた時点でレビューは収束扱いとなり、v2以降は別マイルストーンです。

承認記録: 2026-07-05 ユーザー指示により、v1合格基準を現行実装が既に満たしている機械判定項目へ改訂しました（フェーズ1＝現行実装水準。ADR-0029参照）。日本語IME、性能予算、カバレッジ閾値、永続化、OTの各項目は次フェーズの一覧へ移しています。

前提となる方針: v1は現行アーキテクチャ（in-memory WebSocketリレー＋contentEditable、永続化なし）の枠内で判定します。設計文書が規定するOT（ShareDB）とPostgreSQL永続化はフェーズ2以降のスコープであり、v1のレビューで「設計文書と実装が違う」ことを指摘しても合否に影響しません（ADR-0029、要件定義書 第8章フェーズ区分表）。

## v1 合格基準（各項目は機械判定可能であり、2026-07-05時点でローカル実行によりすべてgreenであることを確認済み）

| # | 基準 | 検証方法 |
|---|---|---|
| 1 | server・web・export-workerの全ユニットテスト30件（server 14件、web 14件、export-worker 2件）がpassする | `pnpm -r test` が終了コード0 |
| 2 | 同一 revision を生成した2ピアの更新が決定論的に片方へ確定し、どちらのピアも古い状態へ退行しない | 既存ユニット `assigns increasing seq so equal-revision peers do not silently drop each other`（apps/server/tests/draft-collab.test.ts。項目1に含まれる） |
| 3 | 同一IDのコメントを重複送信しても状態は1件のみ反映される | 既存ユニット `de-duplicates comments by id (idempotent re-send)`（項目1に含まれる） |
| 4 | 途中参加クライアントが参加時点の最新文書とコメント全件を受信する | 既存ユニット `late joiners receive the latest snapshot`＋`comments propagate to all peers including the sender (echo) and survive concurrent draft updates`（項目1に含まれる） |
| 5 | ベースラインのセキュリティヘッダが応答へ付与される | 既存ユニット `sets baseline security headers`（apps/server/tests/main.test.ts。項目1に含まれる） |
| 6 | 既存E2Eの主要導線7件（編集フロー、パネル開閉、ビューポート維持、2クライアント同期、装飾適用、3形式エクスポート、言語切替）がchromiumとfirefoxでpassする | サーバー新規起動後に `cd e2e && npx playwright test --project=chromium --workers=1 --grep-invert "sanitizes"` と同 `--project=firefox` がそれぞれ終了コード0 |
| 7 | 型検査が通過する | `pnpm check` が終了コード0 |
| 8 | 文書lintが Critical 0 / High 0 / Medium 0 / Low 0 を維持する | `python3 tools/lint_docs.py docs/` が終了コード0 |
| 9 | トレーサビリティ検査が通過する | `node tools/traceability_check.mjs` が終了コード0 |
| 10 | マイグレーションのdry-runが通過する（migrations/はフェーズ2資産ですが、dry-runはDB接続を伴わない資産整合性検査としてフェーズ1でも維持します） | `node tools/migrate.mjs dry` が終了コード0 |

補足（2026-07-05時点の既知の未達事項。v1の合否には影響しない）:

- E2E `sanitizes executable markup before rendering and export` はサーバー新規起動直後の単独実行でも全ブラウザでfailします（本文に「Safe text」が残らない）。フェーズ2の是正対象です
- E2Eのwebkitプロジェクトは上記以外にも1件failするため、v1の対象ブラウザはchromiumとfirefoxに限定しています
- `pnpm lint` は警告1件（draft-collab.test.ts:225 no-unsafe-optional-chaining）で、`pnpm format` は4ファイルの差分で、それぞれ終了コード1です。実装・テストコードの変更はフェーズ2の是正対象です

## v2 マイルストーン（v1収束後に着手、v1の合否には影響しない）

- データ永続化: 文書更新後にサーバを再起動しても最新revisionの本文が復元される（PostgreSQL接続、migrations/の`revisions`テーブル使用、testcontainers統合テスト）
- 日本語IME対応: 未確定文字列が同期送信されず、確定後の文字列のみが1回だけ本文へ反映される（新規E2E `ime-composition`＋compositionガードのユニットテスト。実装側にcompositionガードの追加が必要）
- 性能予算: 入力検知からピア受信までの同期遅延が、ローカル計測で平均150ms以内・p95 400ms以内（新規統合テスト）
- カバレッジゲート: serverとwebのユニットカバレッジが lines 80 / statements 80 / branches 70 / functions 80 以上（`vp test --coverage` の閾値設定。ADR-0009参照）
- ゲートコマンド: `pnpm run gate`（format → lint → check → test → e2e を包含）の新規定義と終了コード0
- E2Eの是正: sanitizeテストのgreen化、webkitプロジェクトの安定化、2クライアント同期テストの双方向化、エクスポートE2Eへの日本語本文ケース追加
- lint警告0とformat差分0の回復

## v3 マイルストーン（同上）

- OT（ShareDB）への移行: 設計文書（ADR-0001/0002、docs/design/detailed/04）が規定する操作変換ベースの競合統合。着手時にADRの現行性を再確認する
- Quill.jsエディタへの移行（ADR-0003）

## 運用ルール

- v1項目に無い品質不満が出た場合は、コードを直す前に「基準への追加可否」をユーザーへ確認します（R5）
- レビューはゲートgreen後にN=3・K=2の合議制で行い、ラウンド上限は3です（R3・R4）
