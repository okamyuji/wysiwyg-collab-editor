# 基本設計書

本書は、要求分析書と要件定義書を入力として、システム全体のアーキテクチャ、サブシステム構成、データベース設計、API設計、主要処理フロー、セキュリティ設計、品質ゲート構築方針を定める文書である。本書は責務とフロー概要を持ち、具体的なDDL、API契約、CAS SQL、アルゴリズムパラメータ、定数、エラーコードなどの実装契約は `docs/design/detailed/` 配下の詳細設計章で確定する。

## 1. アーキテクチャ全体像

### 1.1 設計方針

本システムの設計方針は以下の5点である。

1. 操作変換(OT)の中核機能はShareDBに委譲し、自前実装の範囲を最小化する。
2. 永続化先はPostgreSQLに統一し、ShareDBの操作履歴と業務データを同一データベースで扱う。
3. 複数アプリケーションサーバー間のリアルタイム同期はRedis Pub/Subで実現し、水平スケールに備える。
4. フロントエンドはVite+のエコシステムで開発、テスト、フォーマット、lintを統一し、品質ゲートをCIで強制する。
5. 装飾と構造化要素の追加は、Quill.jsのフォーマット拡張とBlot機構の枠内で完結させる。

### 1.2 全体構成図

システムの構成は以下のように整理できる。

```
+-------------------------------+        +--------------------------+
|        Browser Client         | <----> |      CDN / Reverse Proxy |
|  - Quill.js Editor            |  WSS   |  (TLS termination)       |
|  - ShareDB Client             |  HTTPS |                          |
|  - ServiceWorker (offline)    |        +-----------+--------------+
+-------------------------------+                    |
                                                     v
                                +--------------------+--------------------+
                                |        Application Server (Node.js)     |
                                |  - Express (REST + Session)             |
                                |  - ShareDB Server (WebSocket)           |
                                |  - sharedb-postgres adapter             |
                                |  - sharedb pubsub (Redis backend)       |
                                |  - Sharp (image thumbnails)             |
                                |  - Playwright / docx / unified (export)  |
                                +-----------+----------+------+-----------+
                                            |          |      |
                                            v          v      v
                                +-----------+---+ +----+--+ +-+-----------------+
                                |  PostgreSQL   | | Redis | | MinIO (S3互換)   |
                                |  (sharedb +   | |       | |  - 画像と添付    |
                                |   業務テーブル) | | (pub  | |                 |
                                |               | |  sub) | |                 |
                                +---------------+ +-------+ +-----------------+
```

### 1.3 配置

| 構成要素                 | 配置                                         | 数量                                                                              |
| ------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------- |
| ブラウザクライアント     | 利用者端末                                   | 不定                                                                              |
| リバースプロキシ         | 専用ノードまたはマネージドサービス           | 1台以上                                                                           |
| アプリケーションサーバー | コンテナで稼働                               | 2台以上                                                                           |
| PostgreSQL               | 専用ノードまたはマネージドサービス           | 1プライマリと1リードレプリカ                                                      |
| Redis                    | 専用ノードまたはマネージドサービス           | プライマリ1台、レプリカ1台、Sentinel 3台。本MVPはSentinel構成を最小台数で運用する |
| MinIO                    | 専用ノードまたはマネージドのS3互換ストレージ | 1台以上                                                                           |

## 2. サブシステム構成

### 2.1 フロントエンド

フロントエンドはVite+ベースのシングルページアプリケーションとして実装する。主要モジュールは以下のとおりである。

| モジュール               | 役割                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------- |
| UIシェル                 | ルーティング、認証ガード、レイアウト、ナビゲーション                                    |
| エディタ画面             | Quill.jsの初期化、ShareDBクライアントとの接続、装飾ツールバー、画像アップロード、表挿入 |
| プレゼンスレイヤ         | 接続中利用者一覧、カーソルと選択範囲のオーバーレイ                                      |
| コメントレイヤ           | コメントピン表示、サイドパネル、スレッドUI                                              |
| 提案レイヤ               | 提案モード切り替え、見え消し表示、受諾と却下ボタン                                      |
| 版履歴画面               | 版一覧、差分表示、復元操作                                                              |
| 共有モーダル             | 権限の付与対象となる利用者の追加、共有リンク発行と失効                                  |
| 認証画面                 | ログイン、新規登録、パスワードリセット                                                  |
| エクスポートクライアント | サーバーへエクスポート要求とダウンロード処理                                            |
| ServiceWorker            | キャッシュ管理、オフライン閲覧、ネット復帰時の同期                                      |

### 2.2 アプリケーションサーバー

アプリケーションサーバーはNode.jsとTypeScriptで実装する。Expressとsharedbの二つを単一プロセスで起動し、同じHTTPサーバーにマウントする。

| モジュール                 | 役割                                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTPサーバー(Express)      | REST APIエンドポイント、セッション管理、CSRFトークン発行                                                                                     |
| WebSocketサーバー(ShareDB) | OT処理、操作のブロードキャスト、プレゼンス、版番号管理                                                                                       |
| ShareDB Postgres Adapter   | 操作履歴とスナップショットの永続化                                                                                                           |
| ShareDB Redis Pub/Sub      | 複数アプリケーションサーバー間の操作配信同期                                                                                                 |
| 認証ミドルウェア           | セッション検証、CSRFトークン検証                                                                                                             |
| 認可ミドルウェア           | 文書アクセス権限の判定(REST層とWebSocket層の双方)                                                                                            |
| 画像処理サービス           | アップロード受信、Exif除去、Sharpによるサムネイル生成、MinIOへの保存                                                                         |
| エクスポートサービス       | PDF生成(Playwright)、DOCX生成(docxライブラリ)、Markdown生成(unifiedベース)                                                                   |
| 監査ログサービス           | 認証、文書操作、権限変更、共有リンク、コメント、提案、版操作、エクスポート、版圧縮、強制再ロード、キャッシュ無効化を網羅した監査ログ書き込み |
| メール送信サービス         | パスワードリセット、共有通知、招待(Nodemailer)                                                                                               |

### 2.3 ShareDB OTエンジン

ShareDBが提供する責務は以下のとおりである。

1. クライアントから受信した操作(Delta)の全体順序付け
2. 既に確定した操作との照らし合わせによる変換
3. 永続化アダプタ経由でのスナップショットと操作履歴の保存
4. Pub/Subアダプタ経由での他アプリケーションサーバーへの配信
5. クライアントへのブロードキャストとACK応答

本システムでは、ShareDBの操作タイプとして公式の `rich-text` タイプ(Quill.jsのDeltaに準拠)を使用する。本文OT以外のデータ(コメント、提案、版メタデータ、権限)はShareDBの管理対象外とし、通常のテーブルで管理する。

### 2.4 永続化層

PostgreSQLを採用する。ShareDBの操作履歴とスナップショットはShareDB Postgres Adapterが管理するテーブル群へ書き込まれる。業務データはこのテーブル群とは別のスキーマに格納する。

### 2.5 メッセージング層

Redisを採用する。用途は以下のとおりである。

1. ShareDBが複数アプリケーションサーバー間で操作を伝播するためのPub/Sub
2. セッションストア(express-sessionのRedisアダプタ)
3. レート制限カウンタ
4. ログイン試行回数の一時保存

### 2.6 オブジェクトストレージ

S3互換のMinIOを採用する。バケットは以下の2種類を用意する。

| バケット名   | 用途                                           |
| ------------ | ---------------------------------------------- |
| docs-images  | 文書に貼り付けられた画像と生成サムネイル       |
| docs-exports | エクスポート生成物の一時保存(24時間で自動削除) |

## 3. データベース設計

### 3.1 スキーマ全体方針

本章はADR-0004 PostgreSQL統一、ADR-0014 UUID v7主キー、ADR-0018監査ログ設計、ADR-0019バックアップ戦略、ADR-0025マイグレーション選定を前提とする。

PostgreSQLのスキーマは以下の2スキーマで構成する。

1. publicスキーマには業務テーブルを配置する。
2. sharedbスキーマにはShareDBの操作履歴(ops)とスナップショット(snapshots)を配置する。

業務テーブルの主キーはUUID v7に統一する(ADR-0014)。BIGINT IDENTITYはサイズ優位があるものの、URL露出時に他文書のIDを線形に推測でき情報漏えいリスクがあるため不採用とする。UUID v7は時刻部分は予測可能だが乱数部分が62bit確保されているため、ブルートフォース推測に対して実用上の安全性を持つ。

### 3.2 業務エンティティの論理モデル

主要な業務エンティティとその関係を以下に示す。本節はER相当の論理モデルを持つ。具体的なCREATE TABLE文、カラム型、CHECK制約、DEFAULT、UNIQUE INDEX、GENERATED列、CASCADE方針などのDDL本文と、所有テーブルごとの責任章は[詳細設計01データモデル所有マップ](./detailed/01-data-model-ddl.md)で確定する。各テーブルの完全DDLは所有章で確定する。

| エンティティ         | 役割                       | 主な関係と不変条件                                                                                                                                              | 所有詳細章                                        |
| -------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| users                | 利用者本体                 | 組織ロールは `user_roles` で別軸管理し、`users` には正規化目的でロール列を持たない                                                                              | [01](./detailed/01-data-model-ddl.md)             |
| user_roles           | 組織ロール付与             | `standard` は全登録利用者に既定付与、同一(user_id, role)のactive行は最大1件、文書RBACとは別軸                                                                   | [12](./detailed/12-support-cs-operations.md)      |
| documents            | 文書本体                   | 所有者は1名、ShareDBスナップショット最新版番号とメタデータ更新時刻を持つ、`cache_etag` は列として保持せず利用者文脈ごとに応答時算出する派生値とする             | [11](./detailed/11-document-lifecycle.md)         |
| document_permissions | 文書RBAC                   | (document_id, user_id)で一意、permission_levelはowner/editor/commenter/viewer                                                                                   | [11](./detailed/11-document-lifecycle.md)         |
| share_links          | 共有リンク                 | restricted/anyoneの2種、permission_levelはviewer/commenterに制限、最大30日有効                                                                                  | [09](./detailed/09-share-link-and-guest.md)       |
| guest_sessions       | ゲストセッション           | `share_links` に紐付き、IPアドレスはHMAC-SHA-256ハッシュで保持                                                                                                  | [09](./detailed/09-share-link-and-guest.md)       |
| revisions            | 版履歴                     | 自動版または明示版、明示版は `snapshot_payload` 必須、版番号までの全opsが `ops`/`archived_ops` か `snapshot_payload` で到達可能でなければならない不変条件を持つ | [06](./detailed/06-version-and-ops-compaction.md) |
| comments             | コメント                   | アンカー位置を持ち、author_idまたはguest_session_idのいずれかが排他                                                                                             | [05b](./detailed/05b-comments.md)                 |
| comment_replies      | コメント返信               | author_idまたはguest_session_idのいずれかが排他                                                                                                                 | [05b](./detailed/05b-comments.md)                 |
| suggestions          | 提案                       | 状態はpending/accepting/accepted/rejected/stale/expiredの6種、`accepting` は受諾の二段CASで第一CASが占有する一時状態、楽観排他バージョンで状態変更を直列化      | [05](./detailed/05-suggestion-two-phase-cas.md)   |
| images               | 画像メタデータ             | document_idに紐付き、サムネイル3サイズの参照を保持                                                                                                              | [08](./detailed/08-image-and-purge.md)            |
| export_jobs          | エクスポートジョブ         | 状態はqueued/running/succeeded/failed/cancelledの5種、reaperによる `running -> queued` 例外遷移を許可、ハートビートで孤児判定                                   | [07](./detailed/07-export-pipeline.md)            |
| archived_ops         | 圧縮退避ops                | `revisions.snapshot_payload` の充填責任を持つ圧縮ジョブが唯一の正本、グレース期間後のpurge保険チェックで不変条件違反を検出する                                  | [06](./detailed/06-version-and-ops-compaction.md) |
| audit_logs           | 監査ログ                   | seqはadvisory lockで単調採番、actor_kindはuser/guest/systemの3種でuser_idとguest_session_idは排他、ハッシュチェーンと13キーの正規形による改ざん検出を持つ       | [14](./detailed/14-audit-log-hash-chain.md)       |
| ack_seq_snapshots    | ACK seq永続化(コールド)    | ack_seqのコールドパス、ACK確定時にRedis書込と同期UPSERT、利用者またはゲストの排他                                                                               | [04](./detailed/04-realtime-ot-resilience.md)     |
| image_purge_queue    | 画像物理削除キュー         | 文書purgeと同一トランザクションでINSERT、グレース期間後にオブジェクト本体を削除、`(storage_key, original_image_id)` で冪等性                                    | [08](./detailed/08-image-and-purge.md)            |
| secret_versions      | 秘密鍵世代管理             | `secret_name` 別に世代番号を保持、`last_used_at` 基準のグレース付きで保持期間を確保                                                                             | [14](./detailed/14-audit-log-hash-chain.md)       |
| password_resets      | パスワードリセットトークン | トークンハッシュで保管、使用フラグで二重利用禁止、同一利用者の未使用は1件まで                                                                                   | [03](./detailed/03-auth-session-csrf.md)          |

セッション情報はPostgreSQLには物理テーブルを作らず、Redisで管理する(JSON値、TTLはセッション有効期限と同期)。Redisキー設計、TTL秒数、UPSERT契約は[詳細設計03認証セッションCSRF](./detailed/03-auth-session-csrf.md)で確定する。

### 3.3 インデックス戦略

主要なアクセスパターンとインデックス方針を以下に示す。具体的な `CREATE INDEX` 文、部分インデックス条件、複合キー順序は各所有章のDDL節で確定する。`audit_logs` のパーティショニングは本MVPでは導入しない(年間保持件数の見積もりが単一テーブルのインデックス効率の閾値内に収まるため)。導入が必要となった時点で差し替えADRを起票する。

| テーブル             | 主アクセスパターン                                | 詳細章                                            |
| -------------------- | ------------------------------------------------- | ------------------------------------------------- |
| users                | メール一意検索                                    | [01](./detailed/01-data-model-ddl.md)             |
| documents            | 所有者別最新順、削除済み抽出                      | [11](./detailed/11-document-lifecycle.md)         |
| document_permissions | 利用者別と文書別の権限検索                        | [11](./detailed/11-document-lifecycle.md)         |
| share_links          | トークン一意検索、文書別アクティブ抽出            | [09](./detailed/09-share-link-and-guest.md)       |
| guest_sessions       | リンク別最終アクセス順                            | [09](./detailed/09-share-link-and-guest.md)       |
| revisions            | 文書別版番号降順、文書+種別+作成順                | [06](./detailed/06-version-and-ops-compaction.md) |
| comments             | 文書別解決状態、文書別アンカー位置順              | [05b](./detailed/05b-comments.md)                 |
| comment_replies      | コメント別時系列                                  | [05b](./detailed/05b-comments.md)                 |
| suggestions          | 文書別状態+作成順、文書別状態+base_version        | [05](./detailed/05-suggestion-two-phase-cas.md)   |
| images               | 文書別                                            | [08](./detailed/08-image-and-purge.md)            |
| export_jobs          | アクティブ部分インデックス、文書別/利用者別状態順 | [07](./detailed/07-export-pipeline.md)            |
| archived_ops         | 文書別v_end降順、purge時刻順                      | [06](./detailed/06-version-and-ops-compaction.md) |
| audit_logs           | 利用者別/ゲスト別/対象別時系列                    | [14](./detailed/14-audit-log-hash-chain.md)       |

### 3.4aカラーパレット(FR-02と整合)

FR-02の文字色および背景色は、CSP `style-src-attr` のハッシュallowlistを有限に保つため、本MVPで16色固定パレットからの選択に限定する。任意HEXは受け付けない。アクセシビリティ要件(NFR-08第2項のWCAG 2.1 AAコントラスト比4.5対1以上)に整合させるため、本節は「役割番号ごとの推奨組合せ(文字色と背景色のペア)」と「異組合せの可否」の二段階で定義する。

役割番号nの推奨組合せ(同じ番号nの文字色HEXと背景色HEXの対)は、すべてWCAG 2.1 AA基準4.5以上を満たすよう設計する。文字色と背景色を異なる役割番号で組み合わせる場合(計16×16=256通り中、推奨16通りを除く240通り)は、ビルド時にすべての組合せのコントラスト比を算出し、4.5未満となる組合せをUI上で選択不能化する。本MVPの初期見積もりとして、推奨16通り+淡色背景8種類と濃色文字8種類の有効組合せ約64通り=合計約80通り以上を確保する設計とし、推奨16通りのみで運用が成立する。本パレットの追加と変更は新規ADRの起票で行う。

16色のHEX値、推奨組合せのコントラスト比表、ビルド時の組合せ算出ロジック、CSP `style-src-attr` のSHA-256ハッシュ算出との連携は[詳細設計17 i18n・アクセシビリティ・カラーパレット](./detailed/17-i18n-a11y-palette.md)で確定する。本節は責務と方針を持ち、契約は詳細設計の正本に従う。

### 3.4b容量上限超過拒否の監査ログ追記経路

NFR-01第2項(31名目以降の文書購読拒否)、NFR-01第3項(5001接続目以降のWebSocket接続拒否)、`style-src-attr` ハッシュ未登録によるブラウザCSP違反、`archived_ops` purge保険チェックでの不変条件違反検出は、いずれもNFR-05第1項により監査ログへ追記する。経路は以下に分類する。

| 拒否種別                                       | 検出主体                                                  | 監査ログ追記経路                                                                                                                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文書購読拒否(NFR-01第2項)                      | アプリケーションサーバー `verifyClient`/`connect` フック  | アプリ層で同期追記、actor_kind=user、action=`capacity_reject_subscribe`                                                                                                                                                         |
| WebSocket接続拒否(NFR-01第3項、アプリ層検出)   | アプリ層 `verifyClient` フック                            | アプリ層で同期追記、actor_kind=user、action=`capacity_reject_connect`                                                                                                                                                           |
| WebSocket接続拒否(NFR-01第3項、プロキシ層検出) | リバースプロキシのアクセスログ                            | Fluent BitがLokiと並行してアプリ層集約バッチ(1分間隔)へ転送、アプリ層がactor_kind=system、action=`capacity_reject_proxy` で1分窓ごとに集約追記                                                                                  |
| `style-src-attr` ハッシュ違反                  | ブラウザCSPレポート(`report-uri=/api/csp-report`)         | アプリ層が受信時にactor_kind=system、action=`csp_violation` で同期追記                                                                                                                                                          |
| `archived_ops` のpurge不変条件違反             | purgeバッチが `revisions.snapshot_payload IS NULL` を検出 | purgeバッチがpurgeを中止、Prometheusメトリクス `revision_reachability_violation_total` を+1、Alertmanagerルール `RevisionReachabilityViolation` がfiring、actor_kind=system、action=`reachability_violation` で監査ログ同期追記 |

本経路の整合性は第10.1節監査ログのハッシュチェーン運用設計および第10章監視とログのSLO/アラートと整合する。本節の各action(`capacity_reject_subscribe`、`capacity_reject_connect`、`capacity_reject_proxy`、`csp_violation`、`reachability_violation`)はNFR-05第1項の監査対象列挙にも明示済みであり、payload必須キーはNFR-05第9項payload表で確定する。本節を追加した目的は、容量上限拒否や保険チェック違反が監査ログに残らないままサービスが拒否を行うsilent rejectionを防ぐためである。

### 3.4 ShareDBスキーマ

ShareDB Postgres Adapterが標準で要求するスキーマは以下のとおりである。

| テーブル  | 用途                         |
| --------- | ---------------------------- |
| ops       | 各文書の操作履歴             |
| snapshots | 各文書の最新スナップショット |

採用するShareDB Postgres Adapterのバージョン、要求される正確なDDL、カラム名差異への対応は[詳細設計06版作成とops圧縮](./detailed/06-version-and-ops-compaction.md)で確定する。

## 4. API設計

### 4.1 REST API一覧

主要なエンドポイントを以下に整理する。すべて `application/json` を扱う。`Cookie` ヘッダによるセッション認証と、状態変更系では `X-CSRF-Token` ヘッダを必須とする。

| メソッド | パス                                                | 用途                                                                                                                                                                                                                                                                                                                            |
| -------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST     | /api/auth/register                                  | 新規利用者登録                                                                                                                                                                                                                                                                                                                  |
| POST     | /api/auth/login                                     | ログイン                                                                                                                                                                                                                                                                                                                        |
| POST     | /api/auth/logout                                    | ログアウト                                                                                                                                                                                                                                                                                                                      |
| POST     | /api/auth/password-reset/request                    | パスワードリセット要求                                                                                                                                                                                                                                                                                                          |
| POST     | /api/auth/password-reset/confirm                    | パスワードリセット確定                                                                                                                                                                                                                                                                                                          |
| GET      | /api/users/me                                       | 自分のプロフィール取得                                                                                                                                                                                                                                                                                                          |
| PATCH    | /api/users/me                                       | プロフィール更新                                                                                                                                                                                                                                                                                                                |
| GET      | /api/documents                                      | 自分がアクセス可能な文書一覧                                                                                                                                                                                                                                                                                                    |
| POST     | /api/documents                                      | 文書新規作成                                                                                                                                                                                                                                                                                                                    |
| GET      | /api/documents/:id                                  | 文書メタデータ取得                                                                                                                                                                                                                                                                                                              |
| PATCH    | /api/documents/:id                                  | タイトル変更ほか                                                                                                                                                                                                                                                                                                                |
| DELETE   | /api/documents/:id                                  | 文書削除(論理削除)                                                                                                                                                                                                                                                                                                              |
| GET      | /api/documents/:id/permissions                      | 権限一覧                                                                                                                                                                                                                                                                                                                        |
| PUT      | /api/documents/:id/permissions/:userId              | 権限付与または変更                                                                                                                                                                                                                                                                                                              |
| DELETE   | /api/documents/:id/permissions/:userId              | 権限剥奪                                                                                                                                                                                                                                                                                                                        |
| POST     | /api/documents/:id/share-links                      | 共有リンク発行                                                                                                                                                                                                                                                                                                                  |
| GET      | /api/documents/:id/share-links                      | 共有リンク一覧                                                                                                                                                                                                                                                                                                                  |
| DELETE   | /api/documents/:id/share-links/:linkId              | 共有リンク失効                                                                                                                                                                                                                                                                                                                  |
| GET      | /api/share-links/:token                             | 共有リンクトークンによる文書アクセス                                                                                                                                                                                                                                                                                            |
| GET      | /api/documents/:id/comments                         | コメント一覧                                                                                                                                                                                                                                                                                                                    |
| POST     | /api/documents/:id/comments                         | コメント作成                                                                                                                                                                                                                                                                                                                    |
| POST     | /api/documents/:id/comments/:commentId/replies      | 返信追加                                                                                                                                                                                                                                                                                                                        |
| PATCH    | /api/documents/:id/comments/:commentId              | 解決状態切り替え                                                                                                                                                                                                                                                                                                                |
| GET      | /api/documents/:id/suggestions                      | 提案一覧                                                                                                                                                                                                                                                                                                                        |
| POST     | /api/documents/:id/suggestions                      | 提案作成                                                                                                                                                                                                                                                                                                                        |
| POST     | /api/documents/:id/suggestions/:suggestionId/accept | 提案受諾                                                                                                                                                                                                                                                                                                                        |
| POST     | /api/documents/:id/suggestions/:suggestionId/reject | 提案却下                                                                                                                                                                                                                                                                                                                        |
| GET      | /api/documents/:id/revisions                        | 版一覧                                                                                                                                                                                                                                                                                                                          |
| POST     | /api/documents/:id/revisions                        | 明示版作成                                                                                                                                                                                                                                                                                                                      |
| GET      | /api/documents/:id/revisions/:revisionId            | 版の文書状態取得                                                                                                                                                                                                                                                                                                                |
| POST     | /api/documents/:id/revisions/:revisionId/restore    | 版を現在状態として復元                                                                                                                                                                                                                                                                                                          |
| POST     | /api/documents/:id/images                           | 画像アップロード(multipart/form-data)                                                                                                                                                                                                                                                                                           |
| POST     | /api/documents/:id/exports                          | エクスポート要求(PDF/DOCX/Markdown)                                                                                                                                                                                                                                                                                             |
| GET      | /api/exports/:exportId                              | エクスポート状況とダウンロードURL取得                                                                                                                                                                                                                                                                                           |
| DELETE   | /api/exports/:exportId                              | エクスポートジョブのキャンセル                                                                                                                                                                                                                                                                                                  |
| GET      | /api/healthz                                        | ヘルスチェック                                                                                                                                                                                                                                                                                                                  |
| POST     | /api/csp-report                                     | ブラウザのCSP違反レポート受信。CSRF例外とOrigin/Referer検証、レートリミット、payload集約による偽報告抑制、`action=csp_violation` のactor_kind=system固定での監査追記方針を持つ。Content-Type別の受信、検証5項目、集約モードpayload構造の具体契約は[詳細設計13 CSPとサニタイズ](./detailed/13-csp-and-sanitization.md)で確定する |

### 4.2 WebSocket API

WebSocketは `/sharedb` パスでハンドシェイクする。プロトコルはShareDBが定めるメッセージ形式に準拠する。クライアント側のSDKは `ShareDB/lib/client` を用いる。

ShareDB接続のライフサイクルにおける認可点と拒否時挙動は以下のとおり責務分担で固定する。本表は本書とADR-0010の双方で正式記述として扱う。具体的なCloseコード値、HTTPステータス、拒否経路の実装契約は[詳細設計03認証セッションCSRF](./detailed/03-auth-session-csrf.md)と[詳細設計04 OT変換規則と再接続プロトコル](./detailed/04-realtime-ot-resilience.md)で確定する。

| 段階                        | ShareDBフック                          | 判定対象                                                                                                                                                                                                     | 認証判定                               | 認可判定                                                                                                                | 拒否時の挙動                                                                  |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| WebSocketアップグレード前段 | Express層 `verifyClient`(wsオプション) | セッションCookie(認証済み利用者用)または `Sec-WebSocket-Protocol: guest-token.<token>` サブプロトコル(ゲスト用)。Cookie `Path=/share/<token>` は `/sharedb` へ届かないためゲスト判定は本サブプロトコルで行う | あり、無効ならHTTPアップグレードを拒否 | なし(リソース未指定)                                                                                                    | アップグレード拒否、監査ログ記録                                              |
| ShareDB接続確立             | `connect`                              | 受信したagentのカスタムメタデータ                                                                                                                                                                            | あり、verifyClient結果を再確認         | なし                                                                                                                    | 認証Closeコードで接続クローズ、監査ログ記録                                   |
| 文書購読要求                | `receivePresence`前段の `read`         | document_id、利用者ID                                                                                                                                                                                        | セッション既存を前提                   | document_permissionsとshare_linksを参照しviewer以上の権限を判定                                                         | 認可Closeコードで購読不可、監査ログ記録                                       |
| スナップショット取得        | `fetch`                                | document_id、利用者ID                                                                                                                                                                                        | セッション既存を前提                   | readと同じ判定                                                                                                          | 認可Closeコードで購読要求を拒否、監査ログ記録                                 |
| 操作受信                    | `submit`                               | document_id、操作種別、利用者ID                                                                                                                                                                              | セッション既存を前提                   | editor以上の権限がない場合は拒否(提案モード操作も同じ判定)                                                              | 認可Closeコードで当該操作のみ拒否、監査ログ記録                               |
| 操作適用                    | `apply`                                | document_id、変換後の操作、利用者ID                                                                                                                                                                          | セッション既存を前提                   | submitと同じ判定の再確認(セッション中の権限剥奪を捕捉)                                                                  | 認可Closeコードで当該操作のみ破棄、クライアントへ再同期指示送信、監査ログ記録 |
| プレゼンス受信              | `receivePresence`                      | document_id、利用者ID、プレゼンスデータ                                                                                                                                                                      | セッション既存を前提                   | viewer以上に閲覧プレゼンスを許可、commenter以上はカーソルと選択を伴うプレゼンス、editor以上は提案編集中の位置情報を許可 | 認可Closeコードで当該プレゼンスを破棄、監査ログ記録                           |
| プレゼンス送信              | `sendPresence`                         | document_id、利用者ID(認証済みのみ、ゲストは送信不可)                                                                                                                                                        | セッション既存を前提                   | viewer以上の権限を再確認、ゲストセッションは拒否                                                                        | 認可Closeコードで当該プレゼンスを破棄、監査ログ記録                           |
| 画像配信URL発行             | RESTミドルウェア                       | document_id、image_id、利用者またはゲストセッション                                                                                                                                                          | セッション存在                         | viewer以上の権限を確認                                                                                                  | 認可エラー応答、署名付きURLを発行せず、監査ログ記録                           |
| エクスポート要求            | RESTミドルウェア                       | document_id、利用者ID(認証済みのみ)                                                                                                                                                                          | セッション存在                         | viewer以上の権限を確認、ゲストセッションは拒否                                                                          | 認可エラー応答、ジョブ非発行、監査ログ記録                                    |

すべての段階で、共通モジュールの同一関数を呼び出して判定する(ADR-0010)。`apply` フックでも再確認するのはセッション継続中に権限剥奪や共有リンク失効が発生した場合に即座に拒否へ移行するためである。拒否時にはサーバーからクライアントへ `unauthorized` イベントを送り、クライアントは当該文書のエディタを閉じて権限なし画面へ遷移する。

プレゼンス情報はShareDBのプレゼンスAPIを利用し、文書ごとに発行されるチャネルを通じて伝播する。

### 4.3 WebSocketのエラーコード規約

サーバーから返すCloseコードとクライアント挙動の対応は責務分担で固定する。コードはWebSocketのCloseコードとして4000-4999の独自定義範囲で割り当てる。HTTP接続前の401や410と同じ意味づけを意図的に揃えている。

| 区分                  | 意味                                       | クライアント挙動概要                       |
| --------------------- | ------------------------------------------ | ------------------------------------------ |
| 認証Closeコード       | 認証未確立または失効                       | ログイン画面へ遷移                         |
| 認可Closeコード       | 認可拒否(権限不足)                         | 当該文書のエディタを閉じ権限なし画面へ遷移 |
| 文書不存在Closeコード | 文書が存在しない                           | 一覧画面へ戻る                             |
| アイドルClose         | サーバー側で接続が長時間アイドルと判定     | 即時の再接続を指数バックオフで試行         |
| 永久消失Close         | 共有リンク失効または文書削除済み           | 案内画面を表示し再アクセスを許可しない     |
| レート制限Close       | レートリミット超過                         | 指定秒の待機後に再試行                     |
| 内部エラーClose       | サーバー内部エラー                         | 指数バックオフで再接続                     |
| メンテClose           | サーバー一時不可(メンテナンスまたは過負荷) | 待機して再接続                             |

具体的なCloseコード値、サーバー側アイドル判定秒数、初回バックオフ秒数は[詳細設計04 OT変換規則と再接続プロトコル](./detailed/04-realtime-ot-resilience.md)、各Closeコードに対応するエラー識別子は[詳細設計19エラーコード登録簿](./detailed/19-error-code-registry.md)で確定する。

## 5. 主要処理フロー

### 5.1 ログインフロー

1. クライアントは `/api/auth/login` へメールアドレスとパスワードをPOSTする。
2. サーバーはレート制限カウンタをRedisで確認し、上限超過時には429を返す。
3. usersテーブルからメールアドレスで照合し、Argon2idでパスワードを検証する。
4. 検証成功時には、express-sessionのRedisストアにセッションを生成し、Cookieを返す。
5. 検証失敗時にはRedisの失敗カウンタを増加させ、5回連続失敗で `locked_until` を更新する。
6. 監査ログサービスへログイン成功または失敗を記録する。

### 5.2 文書作成フロー

1. クライアントは `/api/documents` へタイトルをPOSTする。
2. サーバーはdocumentsテーブルへレコードを挿入し、ShareDBに対して新規文書の初期化操作を発行する。
3. 自分自身のowner権限をdocument_permissionsへ挿入する。
4. 初期スナップショットがShareDB Postgres AdapterによりShareDB.snapshotsへ保存される。
5. 監査ログを記録する。
6. クライアントへ作成された文書のIDを返す。

### 5.3 リアルタイム編集フロー

1. クライアントはエディタを開いたタイミングで `/sharedb` へWebSocket接続する。
2. クライアントは文書IDを指定して `subscribe` する。サーバーは認可を判定し、許可された場合は最新スナップショットとそれ以降の操作を送信する。
3. 利用者がエディタへ入力すると、Quill.jsが `text-change` イベントを発火し、Delta操作を生成する。
4. クライアントのShareDB Docが `submitOp` で操作をサーバーへ送信する。送信時、クライアントは各操作にclient_seq(クライアントセッション固有の単調増加整数)を付与し、送信済み未ACK操作をメモリ内バッファに保持する(IndexedDBには持たない、FR-09第4項に従う)。サーバーは当該文書当該利用者の各クライアントセッションごとに最後にACKしたclient_seqを二段(Redisホットパスと `ack_seq_snapshots` コールドパス)に永続化する。ACK確定時にサーバーはRedis書込みと `ack_seq_snapshots` UPSERTを同期実行する(非同期はNFR-03第3項を破るため不可)。再接続時はRedis→PostgreSQLの順に復元し、どちらにも無い場合のみ強制再ロード(`force_reload`)を発令する。クライアントは未ACK操作をクリップボードへ退避し最新スナップショットを再取得する。複数並列タブの衝突回避のため、クライアントは初回WebSocket接続時のclient_session_idを再接続時にも再使用する。NFR-03第3項「サーバーが受領済みの操作は失われない」は、`ops` と `snapshots` の永続化と本ack_seq二段同期保持により保証される。具体的なRedisキー設計、TTL秒数、コールドパス保持期間、同期書込みSQLは[詳細設計04 OT変換規則と再接続プロトコル](./detailed/04-realtime-ot-resilience.md)で確定する。
5. サーバーは受信した操作に対し、他クライアントの未確定操作との変換を実施する。
6. 変換後の操作をShareDB.opsへ追記し、ShareDB.snapshotsを更新する。サーバーは追記成功後にACKメッセージ(client_seqと確定後の版番号を含む)をクライアントへ返す。
7. Redis Pub/Sub経由で他アプリケーションサーバーへ操作を配信する。
8. 各アプリケーションサーバーは、自分が接続している全クライアントへ操作をブロードキャストする。
9. クライアントは受信した操作をエディタへ適用する。ACK受信時には、ローカルの未ACKバッファから該当 `client_seq` を削除する。

### 5.3.1 切断と再接続のレジリエンスプロトコル

ネットワーク切断、Pub/Sub障害、サーバー再起動を含むあらゆる中断から、クライアントとサーバーは以下の手順で確実に収束する。本節は本文OTの中核品質を保証するため、実装時に必須とする。

切断を検知する手順は以下のとおりである。

1. クライアントはWebSocketの `close` または `error` イベントを切断検知の起点とする。
2. 切断検知時、クライアントは送信済みかつ未ACKの操作をメモリ内バッファに保持したまま、エディタ入力を即座に無効化する。切断中の新規入力は受け付けない(MVPの設計境界はFR-09第4項「オフライン編集はMVPの対象外」に従う)。
3. クライアントは画面に「再接続中、編集無効」の表示を出し、編集領域は読み取り専用に切り替える。送信済み未ACKバッファはIndexedDBに永続化しない(ブラウザリロード時には未ACK分は破棄され、再接続後にサーバーから最新スナップショットを再取得する)。新規編集の永続化は行わないため、オフラインキューの設計概念は本MVPでは持たない。

再接続戦略は以下のとおりである。

1. 再接続はエクスポネンシャルバックオフで試行する。初回値・上限値・最大試行回数は[詳細設計04 OT変換規則と再接続プロトコル](./detailed/04-realtime-ot-resilience.md)で確定する。
2. 上限到達後はクライアントへ「再接続失敗」を通知し、利用者が手動で再試行する画面遷移を行う。
3. 再接続成功時は、最後にサーバーから受信した版番号を `since` パラメータとして渡して `subscribe` し直す。

サーバー側の状態回復手順は以下のとおりである。

1. ShareDBはサーバーローカルにスナップショットを保持する。Redis Pub/Subの中断中に他サーバーで進行した操作は、自サーバーのローカルスナップショットに反映されていない可能性がある。
2. サーバーは `subscribe` 受信時に、クライアントが渡した `since` 以降のopsをShareDB.opsから取得する。Pub/Sub中断中の操作もここから取得できる。
3. クライアントの最終受信版番号がローカルスナップショットより新しい場合(自分の前回送信後の他者操作)、漏れているopsを永続化層から版番号昇順で取得する。送信は版番号順を保ったまま100件単位のフレームに分け、各フレームのACK受領後に次フレームを送るウィンドウ制御(window size=1)で輻輳を抑える。クライアント側で適用バッファが上限(1000ops)に達した場合は一時バックプレッシャを発し、サーバーは送信を一時停止する。
4. ローカルスナップショットがopsとの整合性を失っていることを検出した場合(版番号不連続など)、サーバーは自プロセスのスナップショットを破棄して永続化層から再構築する。

クライアント側の再送と整合の手順は以下のとおりである。

1. 再接続成功後、クライアントは未ACK操作を `client_seq` の昇順で再送する。
2. サーバーは受信した操作の `client_seq` を確認し、当該文書当該利用者の最後にACKした `client_seq` 以下の操作は無視する(冪等性)。
3. サーバー側で当該操作が既に適用済みの場合、ACKのみを返す。
4. 未ACK操作の再送と並行して、サーバーから受信した他者操作のうち、自分の未ACK操作と版が前後する場合は、Quill.jsのDelta `transform` でローカルに変換を適用する。
5. 切断中は新規入力を受け付けないため、再送はサーバーが既に受領済みの送信済み未ACK操作に限られる(MVPの設計境界はFR-09第4項に従う)。

強制再ロード条件は以下のとおりである。

1. サーバーが版番号の不整合を検出し、クライアント側の状態を信頼できないと判定した場合、サーバーは `force_reload` メッセージを送る。クライアントはローカルの未ACK操作を含む全状態を破棄し、最新スナップショットを取得し直す。
2. クライアント側で未ACK操作のローカル適用がDelta `transform` でリベース不能と判定された場合、クライアントは自発的に `force_reload` を選択する。利用者へは「他者の編集と競合したため、自分の編集を再適用する必要がある」旨を表示し、未確定編集をクリップボードへ退避する。
3. 強制再ロードは監査ログへ記録する(対象種別 `document`、操作種別 `force_reload`、payloadに利用者IDと版番号差分)。

Redis Pub/Sub障害時の収束方針は以下のとおりである。

1. Redis Pub/Subが一時的に停止しても、各アプリケーションサーバーのShareDBはローカルでop処理を継続する(永続化層への書き込みは可能なため)。ただし他サーバー接続のクライアントへの伝播は止まる。
2. Pub/Sub復旧後、ShareDBは新規opsから配信を再開する。Pub/Sub中断中に他サーバーで進行した操作は、上記の `since` 再同期で個別クライアントへ配信される。
3. 障害状態の検知は、Redisクライアントの再接続イベントとPub/Subハートビートで行う。検知時にはアプリケーションログへ警告、メトリクスを更新、運用アラートを発火する。

接続のヘルスチェック方針は以下のとおりである。

1. クライアントは定期的にアプリケーションレベルのハートビート(pingメッセージ)をサーバーへ送る。
2. サーバーは一定時間ハートビートが届かない接続をアイドルとみなしてアイドルCloseコードでクローズする。クライアントの自発切断判定との間にサーバー側優先順位猶予を確保することで、二重切断と監査ログの二重記録を抑制する。
3. クライアントはハートビート応答が連続して得られない場合に切断とみなし、再接続戦略へ遷移する。

ハートビート間隔、サーバーアイドル判定秒数、クライアント自発切断判定秒数、優先順位猶予秒数、再接続戦略の具体は[詳細設計04 OT変換規則と再接続プロトコル](./detailed/04-realtime-ot-resilience.md)で確定する。

### 5.4 競合解消フロー(OT変換規則)

挿入対挿入の競合は、要件定義書FR-01の規則に従う。すなわち、先行する操作A = 挿入(pa, la)と後続する操作B = 挿入(pb, lb)のとき、tie-break規則は3条件で決定論的に確定する。条件1:pb < paのときB' = 挿入(pb, lb)で位置不変。条件2:pb > paのときB' = 挿入(pb + la, lb)で位置をla分だけ後ろにシフト。条件3:pb == paのとき `(user_id, client_seq)` の辞書順で小さい方をA扱いとし、大きい方の操作Bの位置をla分だけシフトさせる(=B' = 挿入(pb + la, lb))。逆に小さい方Bは位置不変(=B' = 挿入(pb, lb))。本3条件は要件定義書FR-01および要求分析書 第10章のOT前提と同一の正本である。なお `client_seq` は同一クライアントセッション内の単調増加整数であり、`user_id` はguest_session_idを含めた発信元識別子とする。B' = 挿入(pb', lb)のpb'は上記3条件のいずれかで一意に決まり、`pb >= paならpb + la` のような同位置挿入を常に後ろへずらす一般化は採用しない(本書では本3条件のみが正本である)。

削除対挿入、削除対削除、属性変更との交差は、`rich-text` 操作タイプ(Quill.jsのDeltaライブラリ)の `transform` 関数の実装に委ねる。`transform` の挙動は事実上の業界標準であり、ShareDBの文書上で互換性が保証されている。

### 5.5 コメント追加フロー

1. クライアントは選択範囲を保持した状態でコメント開始ボタンを押す。
2. クライアントは `/api/documents/:id/comments` へ範囲とコメント本文をPOSTする。
3. サーバーは認可判定を実施する。認証済み利用者の場合はcommenter以上の権限、ゲストセッションの場合は当該共有リンクの権限種別がcommenterであることを確認する。権限不足ならHTTP 403。
4. サーバーはcommentsテーブルへ挿入する。author_idまたはauthor_guest_session_idのいずれかを必ず設定する。
5. 同時に、サーバー主導の業務イベント配信チャネル(本書ではShareDBのプレゼンスとは別系統のRedis Pub/Sub `events:document:<doc_id>` チャネル)を通じて、他クライアントへコメント追加イベントを通知する。ゲストセッションもコメント追加権限を持つため、ShareDBの `sendPresence` (認証済み利用者のみ許可)とは経路を分離する。
6. 他クライアントは通知を受け取り、コメントレイヤを再描画する。
7. 本文への編集が発生した場合、クライアント側のコメントアンカーはDeltaのtransform規則によって自動追従する。サーバー側のアンカー位置は、定期的にクライアントから送信される現在位置で更新する。
8. 監査ログへ「コメント追加」を、author_kindと作成者IDまたはゲストセッションID付きで記録する。

### 5.6 提案モードフロー

提案作成の手順は以下のとおりである。

1. クライアントは提案モードに切り替える。
2. 利用者の入力は本文OTへは送信せず、クライアント側のローカルバッファに溜める。
3. 5秒間の無操作で1提案を確定し、`/api/documents/:id/suggestions` へPOSTする。POST時には、提案Deltaに加えて当該提案を組み立てた時点でクライアントが認識していたShareDBの版番号を `base_version` として送る。
4. サーバーはsuggestionsテーブルへ挿入する。挿入レコードには、`base_version`、Delta操作集合、提案者ID、初期状態 `pending` を必ず保持する。
5. サーバーはShareDBのプレゼンスチャネル経由で他クライアントへ通知し、UIの再描画を促す。

提案受諾はリベース手順と二段CAS方式で実行する。フロー概要は以下のとおりである。

1. 編集権限を持つ利用者が受諾を行うと、サーバーは1HTTPリクエスト内のトランザクション境界で処理する。
2. `base_version` から現在のShareDB最新版までの本文opsをShareDB.opsから取得し、Quill.jsのDelta `transform` で提案Deltaをリベースする。リベース不能(アンカー範囲削除済みまたはtransform結果が空)時は提案を `stale` 遷移CASで原子的に遷移させ、受諾要求はHTTP 409で応答する。
3. リベース成功時、提案受諾は二段CAS方式で原子性を確保する。本文submitOpを第一CAS(claim)と第二CAS(confirm)で挟み、submitOp失敗時には補償CASで `pending` に復帰させる。これにより本文submitOpと提案状態が任意のクライアントから観測される時点で常に整合し、リトライ時の二重適用は不可能になる。
4. 状態列の `accepting` は第一CASで占有される一時状態である。状態別時刻列(accepted_at等)は持たず、`status_changed_at` のみを更新する。
5. 受諾は監査ログへ記録する。

各CAS SQL本文、`status` 値の遷移、エラーコード、Deltaサイズ上限、バッチパラメータは[詳細設計05提案モード二段CAS](./detailed/05-suggestion-two-phase-cas.md)で確定する。本節は責務とフロー概要を持ち、契約は詳細設計の正本に従う。

却下はDelta適用を行わず提案を `rejected` に遷移させ、監査ログへ記録する。自動stale化バッチは10分間隔で `base_version` から現在版までのopsが追従可能か判定し、追従不能を検出した提案は提案者と編集権限保持者へ通知のうえ `stale` 遷移させる。

### 5.7 版作成と復元フロー

明示版作成の手順は以下のとおりである。

1. 明示版作成は `/api/documents/:id/revisions` のPOSTで開始される。サーバーは現在のShareDB版番号を取得し、revisionsテーブルへ種別 `explicit` で記録する。
2. 明示版は無期限保持とし、自動圧縮の削除対象に含めない。

自動版作成の挙動は以下のとおりである。

1. 自動版は、最後の版から一定時間以上かつ一定操作以上の条件を満たした際、サーバーのスケジューラが種別 `auto` で作成する。
2. 自動版は文書1件あたり一定件数までを保持する。要件定義書 第8章 項番3および要件定義書FR-06第6項の確定値を採用する。上限到達時に最古の自動版区間のopsを `archived_ops` へ退避(圧縮)し、対応する `revisions.snapshot_payload` を埋めてから対象自動版レコードを削除する。圧縮と版レコード削除は同一トランザクションで実施し、`archived_ops` のグレース期間中はops本体も保持されるため復元の到達可能性は連続的に保たれる(第5.7.1節と整合)。具体的な時間/操作/上限/グレース期間の数値は[詳細設計06版作成とops圧縮](./detailed/06-version-and-ops-compaction.md)で確定する。

復元の手順は以下のとおりである。

1. 復元は、対象版時点のスナップショットを取得し、現在のスナップショットとの差分Deltaを計算し、その差分を新規 `submitOp` としてShareDBへ送る。これにより過去状態が新たな操作として記録され、元の履歴は失われない。
2. 復元前に、対象版時点のスナップショットが現在のops圧縮ポリシーで残存していることを確認する。残存しない場合は復元不可とし、UIで利用者へ通知する。
3. 復元中に他者編集が並走した場合、`submitOp` 時にShareDBが自動的にOT変換で吸収する。submit失敗時には現在の最新版を再取得して差分Deltaを再計算するリトライを最大3回行う。3回連続失敗の場合は復元を中止し利用者へ通知する。

### 5.7.1 ops圧縮との整合性

opsの蓄積を抑えるため、自動版の上限超過時に古い区間のopsを統合する圧縮を行う。本節は圧縮が引き起こす再接続、差分閲覧、復元との整合性を以下の項目を列挙して定義する。

圧縮の前提条件は以下のとおりである。

1. 圧縮対象の区間は、当該文書の最も古い自動版から、削除対象として選定された自動版直前までのopsとする。明示版が当該区間内に存在する場合、明示版の直前で区間を区切り、明示版以前のopsは保持する。
2. 圧縮の境界は、必ず既存スナップショット(版)の版番号で切る。任意のop境界では切らない。これにより圧縮後も版とop列の整合性が保たれる。

active clientの確認は以下の手順で行う。

1. 圧縮対象区間に含まれる版番号にWebSocket購読中のクライアントが存在しないことを確認する。確認は当該文書のShareDBサブスクリプション一覧から行う。
2. 存在する場合、当該クライアントを最新版へ強制再ロード(5.3.1節の `force_reload`)してから圧縮を実行する。
3. オフラインクライアントが存在する可能性に備え、圧縮実行から一定のグレース期間は当該区間の古いopsを論理削除(物理保持)し、強制再ロード対応の余裕を取る。グレース期間経過後に物理削除する。具体的なグレース期間秒数は[詳細設計06版作成とops圧縮](./detailed/06-version-and-ops-compaction.md)で確定する。

snapshotへのrebase手順は以下のとおりである。

1. 圧縮対象区間の終端版番号 `v_end` でのスナップショット `snapshot_end` をShareDB.snapshotsから取得する。
2. 区間内の自動版のうち、保持対象外と選定された版を削除候補としてマークする。明示版と、`v_end` 版に対応するスナップショットは保持する。
3. opsテーブルから削除候補区間のopsを `archived_ops` テーブルへ移動する(動的にテーブル名は変えず、`(document_id, v_start, v_end)` の組で行を識別する)。圧縮ロールバック用の論理保管である。
4. ShareDB.snapshotsは `v_end` の状態をそのまま残し、それ以前のスナップショット参照は廃止する。
5. 当該区間の `v_end` 版に対応する `revisions` 行の `snapshot_payload` 列に、`snapshot_end` の正規化JSONをUPDATEで書き込む。これにより後続のpurgeで `archived_ops.ops` が物理削除されても、当該版以降の任意版復元が `revisions.snapshot_payload` を起点として可能となる。`snapshot_payload` の算出は本ステップでのみ行い、purgeバッチでは行わない(基準スナップショットが消失後に再算出できないため)。本ステップが成功しない場合は本トランザクション全体をロールバックし、削除候補のマーキングと退避を取り消す。正規化アルゴリズムの具体は[詳細設計06版作成とops圧縮](./detailed/06-version-and-ops-compaction.md)で確定する。
6. revisionsテーブルから削除候補の自動版レコードを削除する。本ステップは前ステップの `snapshot_payload` 充填が成功した版についてのみ実行する。

整合性検証の手順は以下のとおりである。

1. 圧縮実行前後で、当該文書の最新版のスナップショットがハッシュ一致することを必ず検証する。検証失敗時は圧縮処理を中止し、archived_opsから書き戻すロールバックを実行する。
2. 整合性検証は、スナップショットをキー順序を一意に定めた正規化JSON(json-canonicalizeを使用)に変換してからSHA-256で比較する。素のJSON.stringifyはキー順序が処理系依存となり信頼できないため使用しない。
3. ロールバック時は、archived_opsの内容をShareDB.opsへ復元し、削除した自動版レコードをrevisionsへ復元し、本節手順5でUPDATEしたv_end版 `revisions.snapshot_payload` を旧値(UPDATE前はNULL)へ戻す。3点すべてを同一トランザクション内で取り消すことで、不変条件の状態を圧縮実施前と完全に一致させる。

差分閲覧と復元への影響は以下のとおりである。

1. 圧縮された区間内の任意の中間状態はもはや再現できない。利用者が当該区間内の自動版に対する差分閲覧や復元を試みた場合、UI上で「圧縮済みのため閲覧不可」と通知する。
2. 明示版は圧縮対象外であるため、明示版間の差分閲覧と明示版への復元は常に可能である。

ロールバック手順は以下のとおりである。

1. 圧縮処理は文書ごとにPostgreSQLのadvisory lockを取得したうえで実行する。同一文書への圧縮ジョブが並行起動した場合、後発はロック待機ののち先発のコミット結果を見て自身の処理範囲を再判定する。1個ずつのトランザクションとし、失敗時の影響範囲を局所化する。lock関数の2引数版を採用する具体的なbigint分割の手順、ロック競合時の挙動、整合性検証の具体ハッシュ算出ロジックは[詳細設計06版作成とops圧縮](./detailed/06-version-and-ops-compaction.md)で確定する。
2. archived_opsテーブルはグレース期間経過後に物理削除する。グレース期間内は手動ロールバックで復旧可能とする。purgeバッチは物理削除前に当該区間の `v_end` 版 `revisions.snapshot_payload IS NOT NULL` を保険チェックする。NULLが残っていた場合はpurgeを中止し、Prometheusカウンタをインクリメントしアラートを発火、actor_kind=system、action=`reachability_violation` で監査ログへ同期追記する(第3.4b節の監査ログ追記経路と整合)。snapshot_payloadの事後再計算は不可能(基準スナップショットが圧縮時点でしか保持されない)ため、purgeバッチは検出と通報のみを担当し、再計算は試みない。具体的なメトリクス名、アラートルール名、グレース期間は[詳細設計06版作成とops圧縮](./detailed/06-version-and-ops-compaction.md)と[詳細設計16バックアップ・DR・監視](./detailed/16-backup-dr-monitoring.md)で確定する。
3. 圧縮ジョブの実行ログはアプリケーションログと監査ログへ記録する。

### 5.8 画像アップロードフロー

1. クライアントは画像ファイルを `/api/documents/:id/images` へmultipart/form-dataでPOSTする。
2. サーバーはMIMEタイプと拡張子を二重チェックし、サイズ上限を検証する。
3. Exifを除去し、3サイズのサムネイルを生成する。
4. オリジナルと3サムネイルをMinIOへ保存する。
5. 画像メタデータをimagesテーブルへ挿入する。
6. クライアントへ画像URLを返す。
7. クライアントはエディタへ画像のBlot挿入操作を送信する。

### 5.9 共有リンク発行フロー

1. クライアントは `/api/documents/:id/share-links` へリンク種別(restrictedまたはanyone)、権限種別(viewerまたはcommenter)、有効期限をPOSTする。権限種別がeditor以上の場合はサーバーがHTTP 400で拒否する。
2. サーバーは有効期限が30日上限を超えていないかを検証する。超過時はHTTP 400で拒否する。
3. サーバーは `crypto.randomBytes(32).toString('base64url')` でbase64url 43文字のトークンを生成する。
4. share_linksテーブルへ挿入し、監査ログへ記録する。
5. クライアントへ共有URL ( `/share/:token` の形式)を返す。

共有リンク経由のアクセスは以下のとおりに分岐する。

1. `/share/:token` へのリクエストで、サーバーはトークンを検索する。有効期限切れまたは失効済みの場合はHTTP 410 Goneを返し、監査ログへ記録する。
2. リンク種別がrestrictedの場合、サーバーは利用者の認証セッションを確認する。未認証ならログイン画面へリダイレクトし、ログイン後に元のリンクへ再遷移する。認証後は通常の認可判定に進む。
3. リンク種別がanyoneの場合、サーバーはゲストセッションを発行する。既存のゲストセッションCookieがあれば再利用し、なければguest_sessionsレコードを作成する。Cookieは共有リンクのパスに限定し、有効期限はリンクの有効期限と同じとする。同時にサーバーは当該ゲストセッション用の短命WebSocketトークンを発行し、共有リンクページのHTMLレスポンスにmetaタグで埋め込む。クライアントSDKは本トークンを読み取り、WebSocket接続時にサブプロトコルとして送信する。サーバーの `verifyClient` はCookie(認証済み利用者用)と本サブプロトコル(ゲスト用)のいずれかが有効であれば接続を許可する。要件定義書NFR-04第13項と整合する。具体的なCookie属性、トークン署名アルゴリズム、ペイロード構造、有効期限、サブプロトコル形式は[詳細設計09共有リンクとゲストセッション](./detailed/09-share-link-and-guest.md)で確定する。
4. ゲストセッションのアクセスは、文書編集を行えず、コメント権限が付与された場合のみコメントの追加返信解決を行える。
5. ゲストセッションの操作は、ゲストセッションIDで監査ログへ記録する。
6. ゲストアクセスではServiceWorkerによるキャッシュを行わない設定でレスポンスヘッダを返す(`Cache-Control: no-store`)。

共有リンクの失効は以下のとおりに進む。

1. 失効は `revoked_at` の更新で行う。失効後の共有URLアクセスはHTTP 410 Goneとなる。
2. 失効時、当該文書のすべてのアクティブなゲストセッション(当該リンクから発行された)に対してWebSocket接続を強制クローズ(エラーコード4410、共有リンク失効)する。
3. 失効は監査ログへ記録する。

### 5.10 エクスポートフロー

エクスポート機能は、本文編集のWebSocket応答性を損なわないために、アプリケーションサーバーとは独立したエクスポートワーカー専用コンテナで動作する。デプロイ単位はADR-0028の確定値に従い、アプリケーションサーバーは `app-server` イメージ(Distrolessベース)、エクスポートワーカーは `export-worker` イメージ(debian-slimベース、Playwright同梱)の2種類とする。両者は同一HostかつKubernetesの異なるDeploymentとしてデプロイし、PostgreSQLの `export_jobs` テーブルでジョブ受け渡しを行う(キュー機能はDBで実装、BullMQやRedisキューは導入しない)。状態機械とワーカー分離は必須とする。MVP段階ではこの2種類2レプリカの最小構成で運用する。

ジョブ登録の手順は以下のとおりである。

1. クライアントは `/api/documents/:id/exports` へ形式(pdf/docx/markdown)を指定してPOSTする。
2. サーバーは文書アクセス権限を確認したうえで、export_jobsテーブルへレコードを挿入する。初期状態は `queued` とし、ジョブIDを返す。
3. レスポンスは即時返却し、本APIは生成完了を待たない。

ワーカープールの構成は以下のとおりである。

1. エクスポートワーカーは `export-worker` イメージ(debian-slimベース)で独立コンテナとして起動する(ADR-0028)。各ワーカープロセスはPlaywrightの子プロセスを内部で起動するモデルとし、計算負荷とPlaywrightの大きなメモリをアプリケーションサーバーから物理的に分離する。アプリケーションサーバー内の `worker_threads` は使用しない(以前案からの変更点であり、デプロイ単位の二重化を避けるため別コンテナに統一した)。
2. 同時実行ジョブ数はワーカーコンテナ1プロセスあたり最大2件に制限する。本数値は実運用で見直す。利用者単位の上限2件、文書単位の上限1件と組み合わせ、ジョブ受付時の評価順序は、文書単位制約 → 利用者単位制約 → プロセス単位制約の順とする(優先度キューではなく制約評価の順番である)。
3. ジョブはexport_jobsテーブルを `SELECT ... FOR UPDATE SKIP LOCKED` で取得することで、複数ワーカーコンテナ間の重複実行を防ぐ。利用者単位のランクをCTEで付与してからround-robin分散することにより、待機ジョブが多い利用者の先頭ジョブを優先しつつ複数利用者間でのstarvationを回避する。`next_attempt_at` 条件によりreaperで `queued` に戻された毒ジョブは指数バックオフ後の時刻まで再取得されない。

CTE+`FOR UPDATE SKIP LOCKED` の具体SQL本文、候補件数の上限根拠、reaperによる `running -> queued` 例外遷移の具体CAS UPDATE文、`heartbeat_at` 判定値や `attempt_count` 上限、`next_attempt_at` のバックオフ算出は[詳細設計07エクスポートパイプライン](./detailed/07-export-pipeline.md)で確定する。本節は責務とフロー概要を持ち、契約は詳細設計の正本に従う。

状態遷移は以下のとおりである。

1. `queued`: ジョブ登録直後の初期状態。
2. `running`: ワーカーが取得し処理中。`started_at` を更新する。
3. `succeeded`: 生成完了。`finished_at` と `output_storage_key` を更新する。
4. `failed`: 生成失敗。`finished_at` と `failure_reason` を更新する。
5. `cancelled`: 利用者またはタイムアウト経由でキャンセル。`finished_at` と `failure_reason` を更新する。
6. 通常の状態遷移は単方向で、`queued -> running`、`running -> succeeded`、`running -> failed`、`queued -> cancelled`、`running -> cancelled` のみを許可する。
7. 例外として、reaper(孤児ジョブ復旧バッチ)による `running -> queued` を1経路だけ許可する。reaperはハートビート停滞かつ試行回数上限未満のジョブを孤児と判定して `queued` に戻し、上限到達済みの孤児は `failed` に遷移させる。`worker_id` と `heartbeat_at` のクリア、`attempt_count` 加算、`next_attempt_at` への指数バックオフ書込みは同一UPDATE内で行う。本例外遷移を許可せず通常遷移のみとした場合、worker異常終了ジョブが永久にrunningのまま滞留する障害が生じるため、本例外は必須である。具体的な停滞判定秒数、試行回数上限、バックオフ計算、reaper UPDATE文は[詳細設計07エクスポートパイプライン](./detailed/07-export-pipeline.md)で確定する。

タイムアウトとキャンセルの方針は以下のとおりである。

1. 1ジョブあたりの実行タイムアウトは60秒とする。超過時は `cancelled` 遷移し、`failure_reason = "timeout"` を記録する。
2. 利用者は `/api/exports/:exportId` へDELETEを送ることでキャンセル要求できる。`queued` 状態なら即時 `cancelled`、`running` 状態ならワーカーへキャンセルシグナルを送り、ワーカーは可能な範囲で安全に終了する。
3. Playwrightは子プロセスとして起動し、メインのワーカースレッドからプロセスシグナルで終了制御する。タイムアウトと利用者キャンセルの両方で確実に終了する。

進捗ポーリングの方針は以下のとおりである。

1. クライアントは `/api/exports/:exportId` へGETでポーリングし、状態と進捗を取得する。
2. ポーリング間隔は指数バックオフで延長する。初期値と上限値は[詳細設計07エクスポートパイプライン](./detailed/07-export-pipeline.md)で確定する。
3. `succeeded` のとき、レスポンスにダウンロード用の署名付きURLを含める。

成功時の保存処理は以下のとおりである。

1. PDFはPlaywrightでヘッドレスChromiumを起動し、文書のレンダリング結果をPDF化する。
2. DOCXは `docx` ライブラリでDelta構造を変換する。
3. Markdownは `unified` ベースのDelta to Markdown変換器を実装する。
4. 生成物はMinIOのdocs-exportsバケットへ保存し、24時間有効の署名付きURLを返す。
5. 24時間経過後はMinIOのライフサイクルポリシーで自動削除する。

失敗時の扱いは以下のとおりである。

1. failure_reasonは構造化された文字列識別子(`timeout`、`memory_exhausted`、`render_error`、`unsupported_format`、`storage_unavailable`、`cancelled_by_user`)で記録する。
2. 利用者へは画面でfailure_reasonを翻訳した日本語メッセージを表示する。
3. アプリケーションログへ詳細スタックを記録する。

並列度制限の方針は以下のとおりである。

1. 利用者単位で同時実行中のジョブ数は2件までとする。3件目を要求した場合はHTTP 429で拒否する。
2. 文書単位で同時実行中のジョブ数は1件までとする。2件目を要求した場合は重複として既存ジョブのIDを返す。

### 5.11 オフライン閲覧フロー

オンライン中のキャッシュ取得方針は以下のとおりである。

1. 認証済み利用者が文書を開くと、ServiceWorkerが直近のスナップショットと画像をCacheStorageに格納する。restricted型共有リンクで認証済み利用者がアクセスする場合は通常の認証済みフローと同等の扱いとし、Cookie認証経由のキャッシュ動作とする(キャッシュ対象)。anyone型共有リンクのゲストアクセスではキャッシュを行わない(レスポンスヘッダ `Cache-Control: no-store` で抑止する)。
2. キャッシュ対象は、文書5件、画像50枚、UIシェル最新版1つに限定する(ADR-0012)。

オフライン中の挙動は以下のとおりである。

1. ネットワーク切断時には、ServiceWorkerがキャッシュからレスポンスを返し、編集操作は無効化UIで弾く。
2. オフライン中のUIは、ツールバーをグレーアウトし、画面上部に「オフライン状態のため閲覧のみ可能」と明示する。

ネットワーク復帰時のキャッシュ整合性確認の手順は以下のとおりである。

1. ネットワーク復帰時、ServiceWorkerは当該文書の `cache_etag` をサーバーへ問い合わせる。
2. サーバーは、当該利用者の当該文書に対する現在の権限と、文書の最新 `cache_etag` を返す。
3. 権限が剥奪済みの場合、サーバーはHTTP 403を返し、`X-Cache-Invalidate: document/<doc_id>` ヘッダを付与する。クライアントは当該文書のキャッシュエントリを即時に削除し、画面を権限なし表示へ切り替える。
4. 文書が削除済みの場合、サーバーはHTTP 410を返し、同様にキャッシュを削除して一覧画面へ遷移する。
5. 権限が保持されており、`cache_etag` が変化していなければ、キャッシュを引き続き利用する。
6. `cache_etag` が変化している場合、最新スナップショットを取得して再キャッシュする。

ログアウト時のキャッシュ無効化の手順は以下のとおりである。

1. ログアウト処理(POST /api/auth/logout)成功時に、クライアントはServiceWorkerへキャッシュクリア指示を送る。
2. ServiceWorkerは当該利用者がアクセスしていたすべての文書キャッシュ、画像キャッシュ、ゲストセッションCookieを削除する。
3. UIシェルは残してよい(再ログイン後の初期表示を速くするため)。
4. ログアウトが失敗した場合は再試行を促し、キャッシュ削除は完了するまで継続する。
5. ServiceWorker自体の更新は、Workboxの `skipWaiting` + `clientsClaim` を併用し、`updateViaCache: 'none'` の設定で起動時に必ず最新版をフェッチする。precacheManifestの世代はビルドハッシュで差替し、古い世代のキャッシュは新世代起動時に自動削除する。

共有リンク失効と権限剥奪の波及は以下のとおりである。

1. 共有リンク失効時、当該リンクから発行されたゲストセッションへWebSocketで失効通知を送る。クライアントは即時に当該文書のキャッシュとCookieを削除する。
2. 権限剥奪時、当該利用者の当該文書へのWebSocketを4403で切断する。クライアントは切断時に当該文書のキャッシュを削除する。
3. 通知が届かないオフラインクライアントには、次回のオンライン復帰時の `cache_etag` 問い合わせで上記の権限剥奪または文書削除が検出され、キャッシュが削除される。

`cache_etag` の計算と更新。

1. `cache_etag` は文書テーブルの列としては保持せず、利用者文脈ごとにサーバーが応答時に算出する派生値とする(NFR-09第9項の要件式と整合)。算出には文書の最新版番号、メタデータ更新時刻、当該利用者の権限種別、リクエスト経路の共有リンクID(ゲスト時)を入力に含めることで利用者文脈ごとに一意な値となる。`CACHE_ETAG_SECRET` は秘密管理基盤で管理する。
2. サーバーは応答時にリクエストの認証情報から `permission_level` と `share_link_id` を解決して算出値をHTTPレスポンスの `ETag` ヘッダに含める。文書本文やメタデータ、権限の変更があると算出入力のいずれかが変わるため、ETagが自動的に変化する。利用者の権限剥奪後は新たな `permission_level` で算出された値が返され、剥奪前にキャッシュされた値と一致しないためキャッシュは正しく無効化される。

具体的なHMAC算出式、`CACHE_ETAG_SECRET` 管理、応答時のヘッダ付与契約は[詳細設計10オフライン閲覧](./detailed/10-offline-readonly.md)で確定する。

### 5.12 文書管理フロー

要件定義書FR-12に対応する文書ライフサイクル管理のフローは以下のとおりである。本節は責務と処理順序を持ち、契約は[詳細設計11文書ライフサイクルと物理削除](./detailed/11-document-lifecycle.md)で確定する。

1. 新規作成 `POST /api/documents`。サーバーはauthnでセッション確認後、`documents` 行と所有者の `document_permissions` 行を同一トランザクションで挿入し、監査ログへ同期記録する。
2. タイトル変更 `PATCH /api/documents/:id`。所有者のみ可(要件定義書FR-12第2項。本MVPでは編集権限保持者にタイトル変更は許可しない)。`metadata_updated_at` の更新によりETagが自動的に変化する。
3. 論理削除 `DELETE /api/documents/:id`。所有者のみ可。`deleted_at` を設定して削除済み文書はFR-13のCS代理復元対象として30日のグレース期間を持つ。WebSocketで当該文書を購読中の全クライアントに `force_reload` を送る。
4. 復元 `POST /api/documents/:id/restore`。所有者またはCS担当のみ可。30日のグレース期間を超過した場合は復元不可。CS代理復元と通常復元はactionで識別する。
5. 所有者変更 `PATCH /api/documents/:id/owner`。所有者のみ可。`document_permissions` の所有者を新所有者に変更し、旧所有者はeditor権限に降格する。
6. 一覧 `GET /api/documents`。本MVPは全文検索なし(将来拡張は要件定義書§3.14第1項)。`document_permissions` をJOINして利用者がアクセスできる文書を最終更新時刻降順で返却する。レスポンスはcursor paginationに統一する(page方式は連続ページネーション中の挿入と削除でレコード重複や欠落が発生するため不採用)。
7. 30日後の物理削除は `document_purge` バッチが日次で担当する。1トランザクション内で関連エンティティ(`comments`、`comment_replies`、`suggestions`、`revisions`、`archived_ops`、`document_permissions`、`share_links`、`images` 行、`export_jobs`、`ack_seq_snapshots`)を削除し、`documents` 本体を削除し、監査ログへactor_kind=systemとして記録する。画像オブジェクト本体は本トランザクション内では削除せず `image_purge_queue` へINSERTして別ジョブが48時間後に削除する。保持対象は `audit_logs`(NFR-05第2項の1年保持を優先、`target_kind='document' AND target_id=$id` で参照可能なまま残り保持期間満了後に通常の日次バッチで削除される)。本ジョブはadvisory lockで重複起動を防ぎ、冪等性により失敗時は次回再試行で吸収する。

各APIの具体UPDATE/INSERT文、cursor形式、ページサイズ上限値、cron時刻、削除順序の完全手順、`image_purge_queue` INSERT契約、HTTPステータスコード詳細は[詳細設計11文書ライフサイクルと物理削除](./detailed/11-document-lifecycle.md)で確定する。

### 5.13 サポート運用フロー

要件定義書FR-13に対応するサポート運用のフローは以下のとおりである。本フローはすべて操作者の `user_roles` を必須チェックする。本節は責務と認可境界を持ち、契約は[詳細設計12サポート運用範囲](./detailed/12-support-cs-operations.md)で確定する。

1. ユーザーロール付与 `POST /api/admin/users/:id/roles`。操作者は `operations_admin` 必須。`user_roles` へINSERTし、partial UNIQUE indexにより同一(user_id, role)のactive重複を拒否する。
2. ユーザーロール失効 `DELETE /api/admin/users/:id/roles/:role`。操作者は `operations_admin` 必須。当該行の `revoked_at` を設定する。
3. 監査ログ閲覧 `GET /api/admin/audit-logs?filter=<...>`。操作者は `operations_admin` または `security_admin` または `cs_admin` の少なくとも1つ必須。`operations_admin` と `security_admin` は全件閲覧可、`cs_admin` は範囲限定(依頼元利用者または問い合わせ対象文書)とする。CS担当の任意全文検索は許可しない。閲覧アクション自体も監査ログへ記録する。要求分析カテゴリ17の「当該文書範囲閲覧」と要件定義書FR-13第2項に従う。
4. 共有リンクの代理失効 `POST /api/admin/share-links/:token/revoke`。操作者は `cs_admin` 必須。当該リンクの `revoked_at` を設定し、対応するゲストセッションへWebSocketで失効通知する。
5. 文書の代理復元 `POST /api/admin/documents/:id/restore`。操作者は `cs_admin` 必須。第5.12節 第4項の通常復元と同一処理だが、action=`document_restore_by_cs`(payloadに対象document_idと依頼元利用者IDと問い合わせID)で監査ログ記録する。
6. 秘密管理基盤の世代操作 `POST /api/admin/secret-versions/:secret_name/rotate`。操作者は `operations_admin` 必須。`secret_versions` テーブルへ新世代をINSERTし、`last_used_at` の更新は当該ソルトで監査ログ追記された時点でのみトリガとする(本書第3.2節secret_versions DDLと整合)。監査ログへaction=`secret_version_rotate`(payloadにsecret_nameとnew_version、old_version)で記録する。

## 6. 認証と認可の設計

### 6.1 認証設計

認証はメールパスワードによるセッションCookie方式である。Cookie属性はHttpOnly、Secure、SameSite=Laxを必須とする。セッションストアはRedisを採用し、express-sessionのconnect-redisアダプタを利用する。CSRFトークンはcsrf-csrfミドルウェアで発行し、状態変更系のREST APIではヘッダで検証する。

### 6.2 認可設計

文書アクセスの判定は以下の階層で行う。

1. REST API層では、認可ミドルウェアがリクエスト対象の文書IDと利用者IDからdocument_permissionsを参照する。共有リンクのケースではshare_linksを参照する。
2. WebSocket層では、HTTPアップグレード前段の `verifyClient` と、ShareDBの `connect`、`read`、`fetch`、`submit`、`commit`、`apply`、`sendPresence`、`receivePresence`、`afterWrite` の全10点で判定を行う。判定の性質は三分類とし、要件定義書NFR-04第9項と整合する。`verifyClient`、`connect`、`read`、`fetch`、`submit`、`commit`、`apply`、`sendPresence`、`receivePresence` の9点は認可必須(失敗時は当該操作を拒否)である。`afterWrite` の1点は事後監査専用であり、権限判定の対象外で監査ログ書き込みと改ざん検出チェーン追記の用途に限定する。フック一覧と判定対象は第4.2節の表を正規記述とする。
3. 権限の判定結果はリクエスト単位でキャッシュせず、毎回参照する。本ADR-0010およびMVP段階ではRedisキャッシュを導入しない。導入トリガはホット文書でDBのCPU使用率70パーセントを越えた場合とし、その時点で差し替えADRを起票し、無効化伝播設計を明示する。

権限種別ごとに許可される操作は要件定義書の第3.7節に従う。

## 7. セキュリティ設計

セキュリティ設計の主要事項は以下のとおりである。

1. TLS終端はリバースプロキシで実施し、TLS 1.3を必須、TLS 1.2は古い暗号スイートを無効化したうえで互換のみ許容する。アプリケーションサーバー間は内部ネットワークのみで通信する。
2. CSPは `default-src 'self'` を基本とし、`script-src` ではnonceを発行する。`'unsafe-inline'` の `script-src` は禁ずる。`style-src` は `'self'` とnonceのみで運用し、Quill.jsが動的に挿入する `<style>` 要素にもサーバー発行の同一nonceを付与するラッパを実装する。一方、Quill 2系の色、背景色、字下げ、整列は要素の `style="..."` 属性で表現するため、`style-src` のnonceは属性値に効かない(CSP3仕様で属性値は `style-src-attr` 管轄)。本MVPは `style-src-attr` を別ディレクティブとして発行し、`'unsafe-hashes'` + Quillが発行する属性値のSHA-256ハッシュallowlistで個別許可する(`'unsafe-inline'` の `style-src-attr` は禁ずる)。許容ハッシュ集合の算出と更新はビルド時のテストフィクスチャから抽出する。CSPヘッダの完全な値、SHA-256ハッシュ算出と17章カラーパレットとの連携、`img-src` で許可するMinIOドメイン取り扱いは[詳細設計13 CSPとサニタイズ](./detailed/13-csp-and-sanitization.md)で確定する(ADR-0017と整合)。
3. HTTPセキュリティヘッダはhelmetで集約発行する(要件定義書NFR-04第11項、本書第7章で実装責務を一元管理する。ADR-0009はCI品質ゲートを扱うものであり本項とは独立である)。HSTS、X-Content-Type-Options、X-Frame-Options(DENY)、Referrer-Policy(strict-origin-when-cross-origin)、Permissions-Policyを必ず付与する。
4. 入力サニタイズはサーバー側で `isomorphic-dompurify` を用い、クライアント側でもQuill.jsのclipboardモジュールでサニタイズする。
5. ファイルアップロードでは、Content-Typeとファイル拡張子と先頭バイトの3点照合を行う。
6. レートリミットはexpress-rate-limit + rate-limit-redisを用い、認証系API、パスワードリセット、共有リンクアクセス、ShareDB接続、エクスポート要求のそれぞれに別系統の上限を設ける(具体値は要件定義書NFR-04)。
7. CSRF対策はcsrf-csrfミドルウェアで、HMAC方式のDouble Submit Cookieを用いる。状態変更系のREST APIはX-CSRF-Tokenヘッダで検証する。WebSocket接続は同一オリジン要求(Originヘッダ照合)を必須とする。
8. パスワードはArgon2idでハッシュ化する。OWASP Password Storage Cheat Sheetの推奨パラメータを基準値として採用する。具体パラメータ(メモリ、反復、並列度、出力長、ソルト長)は[詳細設計03認証セッションCSRF](./detailed/03-auth-session-csrf.md)で確定する。
9. シークレット(DBパスワード、Cookieシークレット、署名鍵)は環境変数または外部シークレットマネージャから渡し、リポジトリには含めない。gitleaksでCI上で検査する。
10. ペネトレーションテストは、本番リリース前と主要機能追加時に外部委託で実施する(要件定義書NFR-04)。

## 8. ディレクトリ構造

リポジトリのディレクトリ構成案を以下に示す。実装段階で微調整される可能性がある。

```
wysiwyg-collab-editor/
├── apps/
│   ├── server/                       # Node.js application server
│   │   ├── src/
│   │   │   ├── http/                 # Express handlers
│   │   │   ├── ws/                   # ShareDB wiring
│   │   │   ├── auth/                 # Session, CSRF
│   │   │   ├── documents/            # Business modules
│   │   │   ├── comments/
│   │   │   ├── suggestions/
│   │   │   ├── revisions/
│   │   │   ├── permissions/
│   │   │   ├── images/
│   │   │   ├── exports/
│   │   │   ├── audit/
│   │   │   ├── infra/                # PG client, Redis client, MinIO client
│   │   │   └── main.ts
│   │   ├── migrations/
│   │   ├── test/                     # Vitest+ unit tests
│   │   └── package.json
│   └── web/                          # Vite+ SPA
│       ├── src/
│       │   ├── components/
│       │   │   ├── editor/
│       │   │   ├── presence/
│       │   │   ├── comments/
│       │   │   ├── suggestions/
│       │   │   ├── revisions/
│       │   │   ├── share/
│       │   │   └── auth/
│       │   ├── hooks/
│       │   ├── lib/                  # ShareDB client wrapper, Quill setup
│       │   ├── pages/
│       │   ├── styles/
│       │   ├── service-worker/
│       │   └── main.ts
│       ├── test/                     # Vitest+ component tests
│       └── package.json
├── e2e/                              # Playwright E2E
│   ├── tests/
│   ├── playwright.config.ts
│   └── package.json
├── infra/
│   ├── docker-compose.yml            # postgres / redis / minio for dev
│   ├── nginx/
│   └── ci/
├── .gitleaks.toml
├── package.json
└── README.md
```

## 9. デプロイ構成

デプロイ単位は以下のとおりである。

| 構成要素                 | デプロイ単位                                                                      | イメージ                                    | レプリカ最小            | スケール単位              | 監視                                                                         |
| ------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| アプリケーションサーバー | Kubernetes Deployment `app-server`                                                | Distrolessベース(ADR-0028)                  | 2                       | WebSocket同時接続数       | HTTPアクセスログ、操作ACK遅延、PrometheusメトリクスとSLO第10章               |
| エクスポートワーカー     | Kubernetes Deployment `export-worker`                                             | debian-slimベース、Playwright同梱(ADR-0028) | 2                       | export_jobs `queued` 件数 | ジョブ所要時間、worker_id別失敗率、heartbeat欠落数、reaper起動回数(第5.10節) |
| Vite+ビルド成果物        | 静的ファイルをリバースプロキシ配下のディレクトリ、またはCDNへ配置する             | -                                           | -                       | 配信量                    | キャッシュヒット率                                                           |
| PostgreSQL               | マネージドサービスまたは自前運用。スキーママイグレーションはnode-pg-migrateで実施 | -                                           | 1(プライマリ)+1(待機系) | コネクション数            | クエリレイテンシp95、レプリケーション遅延                                    |
| Redis                    | マネージドサービスまたは自前運用                                                  | -                                           | 1+1                     | キー数、メモリ使用率      | スループット、メモリ使用率                                                   |
| MinIO                    | 自前運用。Standalone構成からスタートし、必要に応じて分散モードへ                  | -                                           | 1                       | 容量                      | ディスク使用率、リクエスト失敗率                                             |

アプリケーションサーバーとエクスポートワーカーは別Deploymentであり、独立にスケール、デプロイ、再起動できる。両者はexport_jobsテーブルを介してジョブ受け渡しを行う。CI/CDは両イメージを並列ビルドし、両者の合格を待ってからローリングデプロイをトリガする。

## 10. 監視とログ

監視とログ集約の方針は以下のとおりである。具体的な保存先製品名、保持日数、リングバッファサイズ、内部エンドポイントパス、Prometheusメトリクス名、SLO閾値、アラート閾値の数値は[詳細設計16バックアップ・DR・監視](./detailed/16-backup-dr-monitoring.md)で確定する。

1. アプリケーションのHTTPアクセスログ、ShareDB接続ログ、業務操作ログ、監査ログを構造化JSONで出力する。利用者IDとリクエストIDを必ず含める。
2. ログはFluent Bitエージェントで集約し、外部ログ基盤へ転送する。アプリケーションログと監査ログは保持期間が異なり、監査ログはPostgreSQLが正本で外部基盤は検索補助の二次系とする。Fluent Bit障害時はNodeのローカルディスクへリングバッファでスプールし、オーバーフロー時はドロップカウンタを発火する。外部基盤障害時はFluent Bitが指数バックオフで再試行する。リバースプロキシの拒否ログはFluent Bitの分岐出力で集約用と内部HTTPSエンドポイントへ同時転送し、アプリ層が `capacity_reject_proxy` のactor_kind=systemレコードとして監査ログへ追記する。本内部エンドポイントは外部公開せず、NetworkPolicyで同一Namespace内からの送信のみ許容する。
3. メトリクスはPrometheusフォーマットで出力する。
4. SLI(サービス品質指標)としてWebSocket接続成功率、操作ACK遅延、REST API応答時間、エクスポート成功率、認証成功率、版到達可能性不変条件違反検出数、容量上限拒否カウンタ(subscribe/connect/proxyの3系統)、CSP違反レポート受信数を計測する。これらは第3.4b節および要件定義書NFR-05と整合する。
5. SLO(サービス品質目標)は接続成功率、ACK遅延、応答時間、成功率の各SLIに対して設定する。
6. アラート閾値はエラーバーンレートのFast burn/Slow burnと個別カウンタ増加を組み合わせる。版到達可能性違反は即時ページング(Critical)、容量拒否カウンタとCSP違反カウンタは継続超過でWarning発火とする。アラート定義はPrometheusとAlertmanagerのYAMLで管理する。
7. ログとメトリクスは利用者個人情報(本文中のテキストなど)を含めない。文書本文や添付内容はログに出さない。

### 10.1 監査ログのハッシュチェーン運用設計

監査ログの改ざん検出は以下の責務分担で実装する。

1. 起点(genesis)を持ち、各レコードはprev_hashとentry_hashを通じて先行レコードと連結される。
2. 連結仕様はHMAC-SHA-256でAUDIT_HASH_SALTを鍵、prev_hashとレコード正規形の連結を入力とする。レコード正規形はRFC 8785 JCSで正規化し、Unicode正規化はNFCを適用する。これによりactor/action/target/timestamp/IPハッシュ/順序などの全フィールドの改ざんが検出可能となる。
3. 並行追記制御は固定キーのadvisory lockでseqの単調性を保証する。
4. 検証バッチは日次で実行され、`seq` 昇順でチェーンを走査する。
5. 検証権限は運用管理者と情報セキュリティ担当のみとする。
6. 改ざん検出時は隔離・バックアップ復元・salt_versionローテーションの3段階で対応する。
7. salt_versionは「最終使用日基準」で保持期間と並行世代数を運用する。四半期ごとの能動ローテーションを標準とし、発行日基準は採用しない(旧salt_versionで追記が続いた場合に検証ギャップが発生するため)。

`record_canonical` のキー集合13項目、HMACメッセージのBYTEA連結記法、advisory lockの具体キー値、検証バッチの所要時間目安、salt保持期間の具体日数、`verify_audit_chain` の擬似コードは[詳細設計14監査ログとハッシュチェーン](./detailed/14-audit-log-hash-chain.md)で確定する。本節は責務分担と運用方針を持ち、契約は詳細設計の正本に従う。

## 11. 品質ゲートの設計

CIパイプライン上で実行する品質ゲートは以下の系統で構成する。Vite+ CLIの `vp check`、`vp test`、`vp build` を直接利用する。

### 11.1 必達ゲートの分類

1. gitleaksによる秘密情報混入検査。
2. node-pg-migrateによるマイグレーションSQLの構文と適用順序検証(migrate-dryrun)。
3. pnpm auditによるSCA(既知CVEを含む依存解析、OWASP A06)。
4. Vite+の `vp check`(型検査とリンタ)。
5. Vite+の `vp test`(ステートメントカバレッジ80パーセント以上)。
6. Vite+の `vp build`(本番ビルドの成功)。
7. SemgrepによるSAST(OWASP TOP 10対応ルールセットを必達)。
8. Trivyによるコンテナとファイルシステムの脆弱性スキャン。
9. PlaywrightによるE2E主要導線テスト。
10. OWASP ZAP BaselineによるDAST(プレビュー環境への受動スキャン)。

OWASP TOP 10の全10カテゴリ(A01〜A10)に対する検出ツールの対応マッピング、Semgrep/Trivy/ZAPの具体設定、SAST/SCA/DAST/コンテナ脆弱性の責務分担は[詳細設計18 CI品質ゲート](./detailed/18-ci-quality-gates.md)の「OWASP TOP 10検査フェーズ」節で確定する。週次フルスキャン(ZAP Active Scan +ペネトレーションテスト)は本MVPの主CIには含めず、別ジョブとして運用する。

### 11.2 失敗時の扱い

いずれの必達ゲートが失敗した場合も、本番デプロイを禁ずる。プルリクエストのマージ前に失敗を解消することを必須とする。例外運用は本MVPでは認めない。

### 11.3 詳細設計への委任

各ジョブの実行コマンド、依存関係(直列/並列)、カバレッジ閾値の具体値、PlaywrightのretriesとquarantineタグやNode.jsバージョン、Vite+依存バージョンの固定方針、OWASP TOP 10対応ツール設定(Semgrep、Trivy、ZAP Baseline、`pnpm audit` の各設定ファイルとシビアリティ閾値)、SAST/SCA/DAST/コンテナ脆弱性検査の対応マッピング、週次フルスキャン運用は[詳細設計18 CI品質ゲート](./detailed/18-ci-quality-gates.md)で確定する。本節は責務と必達性を持ち、契約は詳細設計の正本に従う。

### 11.5 ADRトレーサビリティ

本書の章節とADRの対応関係を以下に示す。

| 章節                            | 関連ADR                                |
| ------------------------------- | -------------------------------------- |
| 1章 全体像                      | ADR-0001、ADR-0002、ADR-0015           |
| 2.2アプリケーションサーバー     | ADR-0002、ADR-0015                     |
| 2.3 ShareDB OTエンジン          | ADR-0001、ADR-0002                     |
| 2.4永続化層                     | ADR-0004、ADR-0014                     |
| 2.5メッセージング層             | ADR-0005                               |
| 2.6オブジェクトストレージ       | ADR-0007、ADR-0019、ADR-0024           |
| 3章 データベース設計            | ADR-0004、ADR-0014、ADR-0018、ADR-0025 |
| 4章API設計                      | ADR-0010                               |
| 5.3.1切断と再接続               | ADR-0001、ADR-0002、ADR-0005           |
| 5.4 OT変換規則                  | ADR-0001、ADR-0003                     |
| 5.5コメント追加                 | ADR-0010                               |
| 5.6提案モード                   | ADR-0003、ADR-0011                     |
| 5.7版作成と復元 / 5.7.1 ops圧縮 | ADR-0002、ADR-0016                     |
| 5.8画像アップロード             | ADR-0007、ADR-0024                     |
| 5.9共有リンク                   | ADR-0006、ADR-0010                     |
| 5.10エクスポート                | ADR-0013、ADR-0015                     |
| 5.11オフライン閲覧              | ADR-0012                               |
| 6章 認証と認可                  | ADR-0006、ADR-0010、ADR-0017、ADR-0027 |
| 7章 セキュリティ                | ADR-0017、ADR-0026、ADR-0027           |
| 8章 ディレクトリ構造            | ADR-0028                               |
| 9章 デプロイ構成                | ADR-0028                               |
| 10章 監視とログ / 10.1監査ログ  | ADR-0018、ADR-0021                     |
| 11章 品質ゲート                 | ADR-0008、ADR-0009                     |
| 12章 ライブラリ選定             | 全ADR                                  |

## 12. ライブラリ選定一覧

採用ライブラリの一覧は以下のとおりである。

採用ライブラリは「2026-06-28時点で活発に保守されているもの」のみを選定する。陳腐化(アーカイブ済み、メンテナンス停止、後継推奨済み)の選定は本書で禁ずる。

本表のmajor.minorと用途のみが本書の責務である。確定版数(major.minor.patch)、minor/major更新ポリシー、SCA(`pnpm audit`)による即時上げの基準は[詳細設計20定数登録簿](./detailed/20-constants-registry.md)の「ランタイムとツールのバージョン」「アプリ層ライブラリのバージョン」「セキュリティスキャナのバージョン」「バージョン更新ポリシー」節で確定する。

| 領域                         | ライブラリ                                                                       | 用途                                                     | 補足                                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 実行環境                     | Node.js Active LTS                                                               | サーバーランタイム                                       | 本MVPは2026-06-28時点のActive LTS(Node.js 24)を採用する。Current(Node.js 26)は2026-10にLTSへ移行予定のため、移行時に差し替えADRを起票する。ESMモジュール `"type": "module"` を必須 |
| 言語                         | TypeScript 6系                                                                   | サーバーとフロントエンド共通                             | strict、noUncheckedIndexedAccess、exactOptionalPropertyTypesを必須                                                                                                                 |
| パッケージマネージャ         | pnpm 11系                                                                        | モノレポ依存解決                                         | npm/yarnは不採用                                                                                                                                                                   |
| データベース本体             | PostgreSQL 18系                                                                  | 業務データとShareDB                                      | UUID v7はPostgreSQL 18系の組み込み生成またはNode.js側で生成(ADR-0014)、PostgreSQLはUUID型で受領、JSONB GINインデックスを活用                                                       |
| キャッシュ・PubSub           | Redis 8系                                                                        | セッション、Pub/Sub、レートリミット                      | Redis 7系以前は機能不足のため不採用                                                                                                                                                |
| HTTPセキュリティヘッダ       | helmet 8系                                                                       | CSP、HSTS、X-Frame-Optionsなど標準ヘッダ送出             | 個別実装はせずhelmetに集約                                                                                                                                                         |
| TLS                          | TLS 1.3 (1.2は互換のみ)                                                          | リバースプロキシで終端                                   | 古いCBC暗号スイートを無効化                                                                                                                                                        |
| サーバーフレームワーク       | express 5系                                                                      | HTTP API                                                 | express 4系は2024年に5系へ世代交代済み                                                                                                                                             |
| OTエンジン                   | ShareDB 6系                                                                      | OT処理コア                                               | 6系メジャー以降を採用                                                                                                                                                              |
| OT永続化アダプタ             | sharedb-postgres 6系                                                             | PostgreSQL永続化                                         | ShareDB公式リポジトリ                                                                                                                                                              |
| OT Pub/Sub                   | sharedb-redis-pubsub                                                             | 複数サーバー間同期                                       | ShareDB公式リポジトリ配下                                                                                                                                                          |
| PostgreSQLドライバ           | pg (node-postgres)                                                               | データベース接続                                         | pg-promiseは依存重く本MVPでは採用しない                                                                                                                                            |
| マイグレーション             | node-pg-migrate 8系                                                              | スキーマ管理                                             | プレーンSQLで管理                                                                                                                                                                  |
| セッション                   | express-session 1系, connect-redis 9系                                           | セッション管理                                           | connect-redis 9系はioredis 5系対応                                                                                                                                                 |
| CSRF                         | csrf-csrf 4系                                                                    | CSRFトークンの発行と検証                                 | csurfは公式にアーカイブ済みのため不採用。Double Submit Cookie + HMAC方式                                                                                                           |
| パスワード                   | Argon2id (node-Argon2id) 0系                                                     | パスワードハッシュ                                       | OWASP Password Storage Cheat SheetがArgon2idを第一推奨。bcryptは互換目的のみ受容                                                                                                   |
| レートリミット               | express-rate-limit 8系+ rate-limit-redis 5系                                     | 認証APIとShareDB保護                                     | rate-limit-redisでRedisストア共用                                                                                                                                                  |
| 入力スキーマ検証             | zod 4系                                                                          | RESTリクエスト/レスポンス検証                            | バリデーション+型推論                                                                                                                                                              |
| 画像処理                     | sharp 0.35系                                                                     | サムネイル生成、Exif除去                                 | libvipsベースの実装                                                                                                                                                                |
| メール送信                   | nodemailer 7系                                                                   | パスワードリセット、通知                                 | SMTPに加えTransport抽象化を保持                                                                                                                                                    |
| エクスポートPDF              | playwright 1系                                                                   | ヘッドレスChromium経由のPDF出力                          | E2Eで採用するPlaywrightと同じバイナリ管理に統一しブラウザ管理を一本化する。Puppeteerは本MVPでは採用しない                                                                          |
| エクスポートDOCX             | docx 9系                                                                         | Word形式生成                                             | OOXMLスキーマ準拠                                                                                                                                                                  |
| エクスポートMarkdown         | unified 11系、remark-stringify 11系、remark-gfm 4系                              | Markdown生成                                             | GFM準拠                                                                                                                                                                            |
| サニタイズ                   | DOMPurify 3系 / isomorphic-dompurify 3系                                         | HTMLサニタイズ                                           | サーバー側はjsdom連携で実行                                                                                                                                                        |
| 正規化JSON                   | canonicalize 3系                                                                 | スナップショット比較とハッシュチェーン用の決定的JSON生成 | RFC 8785準拠                                                                                                                                                                       |
| 監査ログ整形                 | pino-pretty (開発時のみ)                                                         | 開発時の構造化ログ整形                                   | 本番ではJSON出力のまま                                                                                                                                                             |
| ログ                         | pino 10系                                                                        | 構造化ログ                                               | 10系の安定版                                                                                                                                                                       |
| メトリクス                   | prom-client 15系                                                                 | Prometheusメトリクス                                     | 15系の安定版                                                                                                                                                                       |
| ヘルスチェック               | terminus                                                                         | グレースフルシャットダウン                               | SIGTERMを受けてWebSocket終了を順序付け                                                                                                                                             |
| エディタ                     | quill 2系                                                                        | WYSIWYGエディタ                                          | 1系はメンテナンス停止のため2系を採用                                                                                                                                               |
| 表モジュール                 | quill-better-table 1系                                                           | 表の挿入と操作                                           | Quill 2系対応のメンテナンス版を採用                                                                                                                                                |
| エディタ操作                 | quill-delta                                                                      | Delta変換                                                | Quill 2系は型定義同梱。ShareDBのrich-textと互換                                                                                                                                    |
| ShareDBクライアント          | ShareDB/lib/client                                                               | クライアント側OT処理                                     | sharedb本体に同梱                                                                                                                                                                  |
| ServiceWorker                | workbox 7系                                                                      | キャッシュ管理                                           | `vite-plugin-pwa`(Workbox 7系対応)を使用してVite+ビルドへ統合する                                                                                                                  |
| ビルド/開発/lint/format/test | Vite+ (VoidZero) 0系                                                             | フロントエンド統合基盤                                   | 素のViteと混同しない                                                                                                                                                               |
| 国際化                       | i18next 26系                                                                     | UI言語切替                                               | クライアントとサーバーで共有                                                                                                                                                       |
| E2E                          | Playwright 1系                                                                   | E2EテストとPDF生成で同じバイナリを共有                   | PDF生成側と同期する                                                                                                                                                                |
| 秘密情報スキャン             | gitleaks 8系                                                                     | CI上の秘密情報検査                                       | gitleaks/gitleaksリポジトリ管理                                                                                                                                                    |
| SAST                         | semgrep 1系                                                                      | OWASP TOP 10対応の静的解析(詳細18)                       | semgrep/semgrepリポジトリ管理                                                                                                                                                      |
| コンテナ脆弱性               | Trivy 0系                                                                        | コンテナとファイルシステムの脆弱性スキャン(詳細18)       | aquasecurity/trivyリポジトリ管理                                                                                                                                                   |
| DAST                         | OWASP ZAP 2系                                                                    | 受動スキャンと能動スキャン(詳細18)                       | zaproxy/zaproxyリポジトリ管理                                                                                                                                                      |
| オブジェクトストレージ       | MinIO                                                                            | S3互換オブジェクトストレージ                             | minio/minioリポジトリ管理                                                                                                                                                          |
| コンテナ                     | Docker、Distrolessベース(app-server)、debian-slim(export-worker、Playwright同梱) | 本番イメージ                                             | AlpineはmuslベースでPlaywright付属Chromiumと非互換のため不採用                                                                                                                     |

確定版数とアップグレードポリシー(patch自動、minorは本表+CI pass、majorは差し替えADR起票)は[詳細設計20定数登録簿](./detailed/20-constants-registry.md)で集約管理する。陳腐化が判明した時点で、新規ADRで差し替えを起票する。

## 13. 付録: 自己レビュー記録

本付録は本書を作成した際の自己レビュー結果を、確定版の本文と区別して保持する正式な記録である(コミット履歴やPRレビューでは検証可能性が落ちるため、本文書内に同梱する方針へ改めた)。本書第1章から第12章は確定版の規範部であり、本付録は是正過程の参照情報である。両者の役割を以下の表に明示する。

| 区分             | 該当節         | 性質                           |
| ---------------- | -------------- | ------------------------------ |
| 規範部           | 第1章〜第12章  | 確定版。実装と検証の唯一の正本 |
| 自己レビュー記録 | 第13章(本付録) | 是正の経緯。実装基準にはしない |

本基本設計書を作成したのち、6つの観点から自己レビューを行い、検出した問題点と是正対応を以下に記録した。

### 13.1 レビュー観点1: 要件定義書のFR-01からFR-13との対応

問題点として、初版では機能要件IDと設計章節の対応が示されていなかった。是正として、第5章(主要処理フロー)を機能要件IDの順に並べ替え、それぞれFR-01からFR-13を網羅する形に再構成した(§5.1〜§5.11はFR-01〜FR-11、§5.12はFR-12文書管理、§5.13はFR-13サポート運用)。

### 13.2 レビュー観点2: OT変換規則の中核

問題点として、初版では添付資料の挿入規則をテキストで述べただけで、削除規則と属性変更規則の扱いが曖昧であった。是正として、第5.4節を独立させ、挿入規則は明示的に記述しつつ、削除と属性変更は `rich-text` 操作タイプのtransform関数に委譲する旨を明記した。

### 13.3 レビュー観点3: 認証と認可の二重判定

問題点として、初版では認可判定がREST層のみで述べられており、WebSocket層(ShareDB)での同等判定が抜けていた。是正として、第6.2節に、REST層とWebSocket層の双方で判定する方針を明記し、第2.2節のモジュール表にも認可ミドルウェアの責務として加えた。

### 13.4 レビュー観点4: 品質ゲートのCIジョブ設計

問題点として、初版では品質ゲートを列挙しただけで、CIジョブの依存関係と並列性が不明確であった。是正として、第11章にゲートの順序、独立性、並列実行可否、停止条件を表に整理した。

### 13.5 レビュー観点5: エクスポートの非同期化と保存先(改訂)

問題点として、初版ではエクスポートを同期処理として描き、長時間処理時の挙動が不明だった。是正として、第5.10節に独立 `export-worker` コンテナ(ADR-0028とADR-0013、ADR-0015の確定値に従う)による非同期ジョブモデルと、Playwrightをコンテナ内子プロセスとして起動する構成、状態機械、孤児ジョブ回復(reaper)、優先順位制約評価を整理した。当初は `worker_threads` 案で記述していたが、ADR-0028のコンテナ基盤確定によりデプロイ単位の二重化が判明したため、ADR-0013、ADR-0015、本書を `export-worker` 別コンテナに統一した。生成物の保存先(docs-exportsバケット)と署名付きURL有効期限(24時間)も明記した。

### 13.6 レビュー観点6: ライブラリ選定の網羅性

問題点として、初版ではライブラリ選定がフロー説明の中に散在し、全体像が見えなかった。是正として、第12章に選定一覧を表として集約し、領域、ライブラリ名、用途の3列で整理した。

### 13.7 残存する確認事項

本基本設計書では、要件定義書の第8章で示した既定値6項目をそのまま前提として採用している。本書の責務は責務分担とフロー概要までであり、ファイル単位とクラス単位の具体的な実装手順は `docs/design/detailed/` 配下の詳細設計章群で確定する。
