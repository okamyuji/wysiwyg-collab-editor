# 12サポート運用範囲

## スコープ

`user_roles` による管理ロール、6種類の管理APIエンドポイント、CS担当の監査ログ閲覧範囲制限を集約する。

## 契約

### `user_roles` DDL(基盤層、03章と連携)

```sql
CREATE TABLE user_roles (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL
              CHECK (role IN ('standard','operations_admin','security_admin','cs_admin')),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by  UUID NOT NULL REFERENCES users(id),
  revoked_at  TIMESTAMPTZ
);
-- 同一(user_id, role)のactive行は最大1件
CREATE UNIQUE INDEX user_roles_active_unique
  ON user_roles(user_id, role) WHERE revoked_at IS NULL;
```

`standard` は全登録利用者に既定で付与される。組織ロールは文書RBAC(`document_permissions.permission_level`)と独立した別軸である。

### 管理API一覧

| エンドポイント                                        | 必要ロール                                                 | 主処理                                                            | 監査ログaction            |
| ----------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------- |
| `POST /api/admin/users/:id/roles`                     | `operations_admin`                                         | `INSERT INTO user_roles(...)`                                     | `user_role_grant`         |
| `DELETE /api/admin/users/:id/roles/:role`             | `operations_admin`                                         | `UPDATE user_roles SET revoked_at=now() WHERE revoked_at IS NULL` | `user_role_revoke`        |
| `GET /api/admin/audit-logs?filter=<...>`              | `operations_admin`または `security_admin`または `cs_admin` | 後述の範囲限定                                                    | `audit_log_view`          |
| `POST /api/admin/share-links/:token/revoke`           | `cs_admin`                                                 | `UPDATE share_links SET revoked_at=now()` + WS通知                | `share_link_revoke_by_cs` |
| `POST /api/admin/documents/:id/restore`               | `cs_admin`                                                 | 11章の復元と同一処理                                              | `document_restore_by_cs`  |
| `POST /api/admin/secret-versions/:secret_name/rotate` | `operations_admin`                                         | `INSERT INTO secret_versions(...)` 新世代                         | `secret_version_rotate`   |

### 監査ログ閲覧範囲

| ロール             | 閲覧範囲 | 必須クエリ                                          |
| ------------------ | -------- | --------------------------------------------------- |
| `operations_admin` | 全件     | (なし)                                              |
| `security_admin`   | 全件     | (なし)                                              |
| `cs_admin`         | 範囲限定 | `user_id=$X` または `document_id=$X` のいずれか必須 |

`cs_admin` のSQLは以下に強制する。

```sql
SELECT * FROM audit_logs
 WHERE (actor.user_id = $param_user_id OR target_id = $param_user_id)
    OR (target_kind = 'document' AND target_id = $param_document_id)
 ORDER BY seq DESC
 LIMIT 100;
```

任意全文検索は許可しない。CS担当の `support_ticket_id` クエリパラメータをNOT NULLで必須化する。

閲覧アクション自体も以下のpayloadで監査追記する。

```json
{
  "viewer_role": "cs_admin",
  "query_filter": "user_id=...",
  "result_id_range": ["uuid1", "uuid2"],
  "support_ticket_id": "TICKET-XXX"
}
```

### `secret_versions` 操作

`secret_versions` テーブル本体の所有章は[14監査ログとハッシュチェーン](./14-audit-log-hash-chain.md)とする。本章は世代追加API契約のみを持つ。

```sql
INSERT INTO secret_versions (id, secret_name, version, key_material, issued_at)
VALUES (gen_random_uuid(), $secret_name,
        (SELECT COALESCE(MAX(version), 0) + 1 FROM secret_versions WHERE secret_name=$secret_name),
        $new_key_material,
        now());
```

ローテーションは四半期ごとに `operations_admin` が実行する。

### エラーコード

| コード    | HTTP | 意味                                  |
| --------- | ---- | ------------------------------------- |
| `CSO-001` | 403  | 必要ロール不保有                      |
| `CSO-002` | 400  | `cs_admin` の必須クエリパラメータ不足 |
| `CSO-003` | 400  | `support_ticket_id` 不足              |
| `CSO-004` | 409  | 同一ロールの重複付与                  |

詳細は[19エラーコード登録簿](./19-error-code-registry.md)参照。

## テストID紐付け

| 契約ID          | 内容                                     | テストID  | テスト種別 | CIゲート |
| --------------- | ---------------------------------------- | --------- | ---------- | -------- |
| CSO-CONTRACT-01 | `operations_admin` 以外のロール付与で403 | T-CSO-001 | integ      | Vitest   |
| CSO-CONTRACT-02 | `cs_admin` の必須クエリ欠落で400 CSO-002 | T-CSO-002 | integ      | Vitest   |
| CSO-CONTRACT-03 | `cs_admin` 監査ログ閲覧の範囲限定SQL強制 | T-CSO-003 | integ      | Vitest   |
| CSO-CONTRACT-04 | 閲覧アクション自体の監査追記             | T-CSO-004 | integ      | Vitest   |
| CSO-CONTRACT-05 | `share_link_revoke_by_cs` でWS通知       | T-CSO-005 | integ      | Vitest   |
| CSO-CONTRACT-06 | `secret_version_rotate` で新世代INSERT   | T-CSO-006 | integ      | Vitest   |

## トレーサビリティ

| 対応要件                                | 対応基本設計節 | 対応ADR    |
| --------------------------------------- | -------------- | ---------- |
| FR-13(サポート運用)、要求分析カテゴリ17 | §5.13          | (要件由来) |
