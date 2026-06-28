# 16バックアップ・DR・監視

## スコープ

PostgreSQL/MinIO/Redisのバックアップ方針、RTO/RPO目標値、Prometheusメトリクス、SLI/SLO、アラート閾値を集約する。

## 契約

### バックアップ

| 対象       | 方式                                                | 頻度                        | 保管                       | 保持期間             |
| ---------- | --------------------------------------------------- | --------------------------- | -------------------------- | -------------------- |
| PostgreSQL | 物理バックアップ(pg_basebackup) + WAL継続アーカイブ | 物理: 日次2時、WAL: 5分間隔 | S3互換ストレージ別バケット | 30日                 |
| PostgreSQL | 論理バックアップ(pg_dump)                           | 週次土曜2時                 | S3互換ストレージ別バケット | 12週                 |
| MinIO      | バケット間ミラー(別リージョン)                      | リアルタイム                | 別リージョンMinIO          | (ライフサイクル準拠) |
| Redis      | RDBスナップショット                                 | 30分間隔                    | ローカルディスク+S3        | 7日                  |

### DR目標(MVP)

| 指標              | 目標値 | 根拠                         |
| ----------------- | ------ | ---------------------------- |
| RTO(復旧時間目標) | 4時間  | 物理バックアップ+ WAL再生    |
| RPO(復旧時点目標) | 5分    | WALアーカイブ間隔            |
| 監査ログのRPO     | 0      | advisory lock下のsync commit |

### Prometheusメトリクス

```text
# カウンタ
revision_reachability_violation_total
capacity_reject_subscribe_total
capacity_reject_connect_total
capacity_reject_proxy_total
csp_violation_total
log_drop_count

# ヒストグラム
ot_ack_latency_seconds (le=0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2)
rest_response_seconds (le=0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)
export_duration_seconds (le=1, 5, 10, 30, 60, 120, 300)

# ゲージ
websocket_connections_active
queued_export_jobs
```

### SLI/SLO

| SLI                 | SLO       | 計測                         |
| ------------------- | --------- | ---------------------------- |
| WebSocket接続成功率 | 99.9%     | 接続成功/接続試行            |
| 操作ACK遅延p95      | 400ms以内 | `ot_ack_latency_seconds` p95 |
| REST API応答p95     | 500ms以内 | `rest_response_seconds` p95  |
| エクスポート成功率  | 99%       | succeeded/(succeeded+failed) |
| 認証成功率          | 99%       | 認証成功/認証試行            |

### アラート閾値

| アラート                        | 重大度   | 閾値                              | 発火後                                                                            |
| ------------------------------- | -------- | --------------------------------- | --------------------------------------------------------------------------------- |
| `WebSocketSloFastBurn`          | Critical | 1時間で1%バジェット消費           | 即時ページング                                                                    |
| `WebSocketSloSlowBurn`          | Warning  | 6時間で5%バジェット消費           | 24時間以内対応                                                                    |
| `OtAckLatencyHigh`              | Warning  | p95 800ms超過5分継続              | 30分以内対応                                                                      |
| `PostgresUnavailable`           | Critical | 接続失敗任意                      | 即時ページング                                                                    |
| `RedisUnavailable`              | Critical | 接続失敗任意                      | 即時ページング                                                                    |
| `DiskHigh`                      | Warning  | 使用率80%超過                     | 24時間以内対応                                                                    |
| `MemoryHigh`                    | Warning  | 使用率85%超過                     | 24時間以内対応                                                                    |
| `ForceReloadHigh`               | Warning  | 強制再ロード発生率1%超過15分継続  | 30分以内対応                                                                      |
| `RevisionReachabilityViolation` | Critical | カウンタ1以上増加                 | 即時ページング、復旧手順は[06版作成とops圧縮](./06-version-and-ops-compaction.md) |
| `CapacityRejectHigh`            | Warning  | 容量拒否カウンタ15分平均が秒間1超 | 容量計画見直し                                                                    |
| `CspViolationHigh`              | Warning  | CSP違反15分総数10超               | CSP方針見直し                                                                     |
| `ImagePurgeFailureRepeated`     | Warning  | `attempt_count >= 5` の行存在     | 24時間以内対応                                                                    |

アラート定義は `manifests/alerts/*.yml` に配置する。

### ログ集約

| 項目           | 値                                                                     |
| -------------- | ---------------------------------------------------------------------- |
| 出力           | 構造化JSON(`pino`)                                                     |
| 必須フィールド | `user_id`、`request_id`、`trace_id`                                    |
| 集約           | Fluent Bit → Grafana Loki(Helm、Kubernetes同一クラスタ)                |
| アプリログ保持 | 30日                                                                   |
| 監査ログ正本   | PostgreSQL(1年)、Lokiは検索補助二次系                                  |
| 障害時バッファ | NodeローカルディスクLRU 512MiB、オーバーフロー時 `log_drop_count` 発火 |
| Loki障害時     | Fluent Bit指数バックオフ再試行                                         |
| 個人情報       | 本文・添付内容はログに出さない                                         |

### エラーコード

| コード    | 重大度   | 意味                   |
| --------- | -------- | ---------------------- |
| `OPS-001` | Critical | バックアップジョブ失敗 |
| `OPS-002` | Critical | WALアーカイブ失敗      |
| `OPS-003` | Warning  | Lokiへの転送遅延30秒超 |

## テストID紐付け

| 契約ID          | 内容                                        | テストID  | テスト種別 | CIゲート   |
| --------------- | ------------------------------------------- | --------- | ---------- | ---------- |
| OPS-CONTRACT-01 | バックアップジョブ失敗で `OPS-001` アラート | T-OPS-001 | meta       | 自己テスト |
| OPS-CONTRACT-02 | リストア演習(RTO 4時間以内)                 | T-OPS-002 | meta       | 月次手動   |
| OPS-CONTRACT-03 | 主要メトリクスの公開                        | T-OPS-003 | integ      | Vitest     |

## トレーサビリティ

| 対応要件                     | 対応基本設計節 | 対応ADR                      |
| ---------------------------- | -------------- | ---------------------------- |
| NFR-06(可用性)、NFR-07(運用) | §10、§10.1     | ADR-0019、ADR-0020、ADR-0021 |
