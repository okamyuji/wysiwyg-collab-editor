# 07エクスポートパイプライン

## スコープ

エクスポートジョブのDDL、デプロイ単位、ジョブ取得SQL、状態遷移、reaper、タイムアウト、形式別生成方針を集約する。

## 契約

### デプロイ単位

| コンテナ        | ベースイメージ                    | 役割                        |
| --------------- | --------------------------------- | --------------------------- |
| `app-server`    | Distrolessベース                  | REST/WebSocket/業務ロジック |
| `export-worker` | debian-slimベース、Playwright同梱 | エクスポートジョブ実行      |

両者は同一HostかつKubernetesの異なるDeploymentとしてデプロイし、PostgreSQLの `export_jobs` テーブルでジョブ受け渡しを行う。BullMQやRedisキューは導入しない。MVPは両Deployment 2レプリカの最小構成で運用する。

### export_jobs DDL(所有テーブル)

```sql
CREATE TABLE export_jobs (
  id                  UUID PRIMARY KEY,
  document_id         UUID NOT NULL REFERENCES documents(id),
  requested_by        UUID NOT NULL REFERENCES users(id),
  format              TEXT NOT NULL CHECK (format IN ('pdf','docx','markdown')),
  status              TEXT NOT NULL
                      CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  output_storage_key  TEXT,
  failure_reason      TEXT,
  worker_id           TEXT,
  heartbeat_at        TIMESTAMPTZ,
  attempt_count       SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 3),
  next_attempt_at     TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expire_at           TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  CONSTRAINT worker_id_only_running
    CHECK ((status='running' AND worker_id IS NOT NULL AND heartbeat_at IS NOT NULL)
        OR (status<>'running' AND worker_id IS NULL AND heartbeat_at IS NULL))
);
CREATE INDEX idx_export_jobs_active
  ON export_jobs(status, created_at) WHERE status IN ('queued','running');
CREATE INDEX idx_export_jobs_doc
  ON export_jobs(document_id, status, created_at DESC);
CREATE INDEX idx_export_jobs_user
  ON export_jobs(requested_by, status, created_at DESC);
```

### ジョブ取得SQL(starvation回避)

```sql
WITH candidates AS (
  SELECT id, requested_by, created_at,
         ROW_NUMBER() OVER (PARTITION BY requested_by ORDER BY created_at) AS user_rank
  FROM export_jobs
  WHERE status = 'queued'
    AND (next_attempt_at IS NULL OR next_attempt_at <= now())
  ORDER BY user_rank, created_at
  LIMIT 16
)
SELECT id FROM export_jobs
WHERE id IN (SELECT id FROM candidates)
ORDER BY (SELECT user_rank FROM candidates c WHERE c.id = export_jobs.id), created_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

CTE上限16は「ワーカープール同時実行2 × プロセス8並列」の余裕値。`next_attempt_at` 条件でreaperにより `queued` 復帰した毒ジョブを指数バックオフ時刻まで再取得しない。

### 状態遷移

許可される遷移のみが正、それ以外はトリガで拒否する。

| 遷移                      | 条件                                |
| ------------------------- | ----------------------------------- |
| `queued -> running`       | ワーカー取得時                      |
| `running -> succeeded`    | 生成完了、`output_storage_key` 設定 |
| `running -> failed`       | 生成失敗、`failure_reason` 設定     |
| `queued -> cancelled`     | 利用者DELETE                        |
| `running -> cancelled`    | 利用者DELETEまたはタイムアウト      |
| `running -> queued`(例外) | reaperのみ。後述のreaper条件        |

### reaper(孤児ジョブ復旧バッチ)

実行間隔: 30秒。条件と挙動は以下のとおりである。

```sql
-- attempt_count < 3 の孤児: queued復帰
UPDATE export_jobs
   SET status='queued',
       worker_id=NULL,
       heartbeat_at=NULL,
       attempt_count = attempt_count + 1,
       next_attempt_at = now() + LEAST(INTERVAL '60 seconds' * (2 ^ attempt_count), INTERVAL '600 seconds')
 WHERE status='running'
   AND heartbeat_at < now() - INTERVAL '60 seconds'
   AND attempt_count < 3;

-- attempt_count >= 3 の孤児: failed遷移
UPDATE export_jobs
   SET status='failed',
       worker_id=NULL,
       heartbeat_at=NULL,
       failure_reason='worker_timeout',
       finished_at=now()
 WHERE status='running'
   AND heartbeat_at < now() - INTERVAL '60 seconds'
   AND attempt_count >= 3;
```

`running -> queued` はこの経路のみ許可される唯一の例外遷移である。

### タイムアウトと並列度

| 項目                      | 値                              |
| ------------------------- | ------------------------------- |
| 1ジョブ実行タイムアウト   | 60秒                            |
| ワーカー1プロセス同時実行 | 2件                             |
| 利用者単位同時実行上限    | 2件(超過HTTP 429 `EXP-001`)     |
| 文書単位同時実行上限      | 1件(超過時は既存ジョブIDを返却) |
| ハートビート間隔          | 20秒                            |
| ハートビート停滞判定      | 60秒                            |
| ポーリング間隔            | 2秒→指数バックオフ最大30秒      |

### 形式別生成

| 形式     | ライブラリ                                           | 出力                                         |
| -------- | ---------------------------------------------------- | -------------------------------------------- |
| PDF      | Playwright(ヘッドレスChromium)で文書HTMLレンダリング | MinIO `docs-exports` バケット、24時間署名URL |
| DOCX     | `docx` ライブラリでDelta変換                         | 同上                                         |
| Markdown | `unified` ベースのDelta→Markdown変換器               | 同上                                         |

MinIOライフサイクルポリシーで24時間後に自動削除する。

### エラーコード

| コード    | HTTP | 意味                                    |
| --------- | ---- | --------------------------------------- |
| `EXP-001` | 429  | 利用者単位同時実行上限超過              |
| `EXP-002` | 500  | `render_error`                          |
| `EXP-003` | 500  | `memory_exhausted`                      |
| `EXP-004` | 503  | `storage_unavailable`                   |
| `EXP-005` | 408  | `timeout`                               |
| `EXP-006` | 200  | `cancelled_by_user`(成功応答内のreason) |

詳細は[19エラーコード登録簿](./19-error-code-registry.md)参照。

## テストID紐付け

| 契約ID          | 内容                                       | テストID          | テスト種別 | CIゲート   |
| --------------- | ------------------------------------------ | ----------------- | ---------- | ---------- |
| EXP-CONTRACT-01 | CTE+FOR UPDATE SKIP LOCKEDでstarvation回避 | T-EXP-001         | integ      | Vitest     |
| EXP-CONTRACT-02 | reaperによるrunning→queuedの指数バックオフ | T-EXP-002         | integ      | Vitest     |
| EXP-CONTRACT-03 | 3回試行後running→failed `worker_timeout`   | T-EXP-003         | integ      | Vitest     |
| EXP-CONTRACT-04 | 60秒タイムアウトでcancelled                | T-EXP-004         | integ      | Vitest     |
| EXP-CONTRACT-05 | 利用者上限超過で429 EXP-001                | T-EXP-005         | integ      | Vitest     |
| EXP-CONTRACT-06 | PDF/DOCX/Markdown各形式の生成E2E           | T-EXP-006/007/008 | e2e        | Playwright |

## トレーサビリティ

| 対応要件                 | 対応基本設計節 | 対応ADR                      |
| ------------------------ | -------------- | ---------------------------- |
| FR-07(エクスポート3形式) | §5.10          | ADR-0013、ADR-0015、ADR-0028 |
