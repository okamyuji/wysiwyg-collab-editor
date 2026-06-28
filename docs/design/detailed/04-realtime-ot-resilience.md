# 04 OT変換規則と再接続プロトコル

## スコープ

OT変換規則の中核、同位置insertのtie-break、ack_seq二段永続化、切断と再接続のレジリエンスプロトコル、`force_reload` の発令条件を集約する。

## 契約

### `ack_seq_snapshots` DDL(所有テーブル)

```sql
CREATE TABLE ack_seq_snapshots (
  id                   UUID PRIMARY KEY,
  document_id          UUID NOT NULL REFERENCES documents(id),
  user_id              UUID REFERENCES users(id),
  guest_session_id     UUID REFERENCES guest_sessions(id),
  client_session_id    UUID NOT NULL,
  last_ack_client_seq  BIGINT NOT NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  retained_until       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  CONSTRAINT actor_xor
    CHECK ((user_id IS NOT NULL AND guest_session_id IS NULL) OR
           (user_id IS NULL AND guest_session_id IS NOT NULL))
);
CREATE UNIQUE INDEX uq_ack_seq
  ON ack_seq_snapshots(document_id,
                       COALESCE(user_id::text, guest_session_id::text),
                       client_session_id);
```

### ack_seq二段永続化

| 段              | 保存先                                                  | TTL  | 用途               |
| --------------- | ------------------------------------------------------- | ---- | ------------------ |
| 第1段(ホット)   | Redis `ack_seq:<doc_id>:<actor_id>:<client_session_id>` | 7日  | 再接続時の高速参照 |
| 第2段(コールド) | PostgreSQL `ack_seq_snapshots`                          | 30日 | Redis喪失時の復元  |

ACK確定時にサーバーは同一トランザクション内でRedis書込みと `ack_seq_snapshots` のUPSERTを同期実行する。非同期書込みは禁止する(適用済みopの重複再送が永続的に判定不能となるため)。

### OT tie-break規則

同位置insertの順序確定は `(user_id, client_seq)` の辞書順比較で行う。詳細仕様は基本設計§5.4を参照する(本MVPは外部仕様を流用するため詳細設計に再記述しない)。

### 再接続プロトコル

クライアント側

| 段階         | 内容                                                               |
| ------------ | ------------------------------------------------------------------ |
| 切断検知     | WebSocketの `close` または `error` イベント                        |
| バッファ保持 | 送信済み未ACK操作をメモリ内バッファに保持(IndexedDB永続化はしない) |
| UI挙動       | エディタ入力を即座に無効化、「再接続中、編集無効」表示             |
| 再試行戦略   | 指数バックオフ(初回1秒、上限30秒、最大10回)                        |
| 上限到達     | 「再接続失敗」通知、利用者が手動再試行                             |
| 再接続成功   | 最終受信版番号を `since` パラメータで `subscribe` し直す           |

サーバー側

| 段階               | 内容                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------- |
| ops取得            | クライアントの `since` 以降のopsを `sharedb.ops` から版番号昇順で取得                     |
| ウィンドウ送信     | 100件単位フレーム、各フレームACK受領後に次フレーム(window size=1)                         |
| バックプレッシャ   | クライアント適用バッファ上限1000opsで一時停止                                             |
| ローカル不整合検出 | 版番号不連続を検出した場合、自プロセスのShareDBスナップショットを破棄し永続化層から再構築 |

### `force_reload` 発令条件

| トリガ                  | 説明                                                          |
| ----------------------- | ------------------------------------------------------------- |
| ack_seq復元不能         | Redis/PostgreSQL双方で当該クライアントセッションのack_seq不在 |
| ops圧縮対象区間に購読中 | 圧縮実行前に当該クライアントを最新版へ強制再ロード            |
| 文書論理削除            | 当該文書を購読中の全クライアントへ送出                        |

クライアント挙動: 未ACKバッファをクリップボードへ退避し、最新スナップショットを再取得する。

### Closeコード(WebSocket)

| コード | 意味                                                                      |
| ------ | ------------------------------------------------------------------------- |
| 4408   | サーバー側アイドル判定(95秒、クライアント自発切断90秒に5秒の優先順位猶予) |
| 4500   | サーバー内部エラー(指数バックオフで再接続)                                |
| 4503   | サーバー一時不可(メンテナンスまたは過負荷)                                |

その他のCloseコード(4401、4403、4404、4410、4429)は各ドメイン章に分散する。

### エラーコード

| コード   | HTTP/Close | 意味                                |
| -------- | ---------- | ----------------------------------- |
| `OT-001` | 4408       | サーバー側アイドルタイムアウト      |
| `OT-002` | 500        | ack_seq復元不能(force_reload発令)   |
| `OT-003` | 503        | ops圧縮対象購読中(force_reload発令) |

詳細は[19エラーコード登録簿](./19-error-code-registry.md)参照。

## テストID紐付け

| 契約ID         | 内容                                                   | テストID | テスト種別 | CIゲート   |
| -------------- | ------------------------------------------------------ | -------- | ---------- | ---------- |
| OT-CONTRACT-01 | 同位置insertのtie-break辞書順                          | T-OT-001 | unit       | Vitest     |
| OT-CONTRACT-02 | ack_seq Redis書込みと `ack_seq_snapshots` UPSERTの同期 | T-OT-002 | integ      | Vitest     |
| OT-CONTRACT-03 | 再接続でwindow size=1のバックプレッシャ                | T-OT-003 | integ      | Vitest     |
| OT-CONTRACT-04 | ack_seq復元不能で `force_reload` 発令                  | T-OT-004 | integ      | Vitest     |
| OT-CONTRACT-05 | 切断〜編集無効〜再接続E2E                              | T-OT-005 | e2e        | Playwright |

## トレーサビリティ

| 対応要件                                                   | 対応基本設計節     | 対応ADR                      |
| ---------------------------------------------------------- | ------------------ | ---------------------------- |
| FR-01(リアルタイム編集)、FR-09(オフライン閲覧境界)、NFR-03 | §5.3、§5.3.1、§5.4 | ADR-0001、ADR-0002、ADR-0005 |
