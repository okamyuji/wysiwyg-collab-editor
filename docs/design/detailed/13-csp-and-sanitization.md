# 13 CSPとサニタイズ

## スコープ

Content-Security-Policyヘッダの全ディレクティブ確定値、`style-src-attr` のハッシュallowlist方針、CSP違反レポート受信エンドポイント、サニタイズライブラリと適用範囲を集約する。

## 契約

### CSPヘッダ

| ディレクティブ    | 値                                                    |
| ----------------- | ----------------------------------------------------- |
| `default-src`     | `'self'`                                              |
| `script-src`      | `'self' 'nonce-<request-nonce>'`                      |
| `style-src`       | `'self' 'nonce-<request-nonce>'`                      |
| `style-src-attr`  | `'unsafe-hashes' 'sha256-<allowlisted-hashes>'`(後述) |
| `img-src`         | `'self' data: <minio-domain>`                         |
| `connect-src`     | `'self' wss://<own-domain>`                           |
| `frame-ancestors` | `'none'`                                              |
| `object-src`      | `'none'`                                              |
| `base-uri`        | `'self'`                                              |
| `report-uri`      | `/api/csp-report`                                     |

`nonce` はリクエストごとに `crypto.randomBytes(16).toString('base64')` で発行する。同一nonceの複数リクエスト再利用は禁ずる。

### `style-src-attr` ハッシュallowlistの算出

Quill 2系は色・背景色・字下げ・整列を要素の `style="..."` 属性で表現するため、`style-src` のnonceは属性値に効かない(CSP3仕様)。属性値の許可は `style-src-attr` で個別制御する。

```text
属性値ハッシュ算出: sha256(utf8_bytes(style_attribute_value))
```

ビルド時に[17 i18n・アクセシビリティ・カラーパレット](./17-i18n-a11y-palette.md)の16色パレット組合せをすべて列挙し、Quillが発行するインラインstyle属性値の全集合のSHA-256ハッシュをCSPヘッダへ登録する。未登録の属性値はブラウザが遮断する。許容リストはビルド成果物 `dist/csp-style-hashes.json` に書き出し、サーバー起動時に読み込む。

### CSP違反レポート受信

| 項目           | 値                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| エンドポイント | `POST /api/csp-report`                                                                                                                                             |
| Content-Type   | `application/csp-report` と `application/reports+json` の双方を受け付ける                                                                                          |
| CSRFトークン   | 例外(`X-CSRF-Token` 検証無効化)                                                                                                                                    |
| 代替検証       | (i)Origin検証、(ii)Refererドメイン一致、(iii)1分間1IPあたり10件レートリミット、(iv)payloadサイズ8KiB上限、(v)同一 `blocked_uri+violated_directive` 組合せの1分集約 |
| 監査ログ追記   | action=`csp_violation`、actor_kind=`system` 固定                                                                                                                   |
| payload集約    | 1分窓ごとに `window_start`/`window_end`/`aggregated_count` を含めて1レコード生成                                                                                   |

集約モードのpayloadサンプル

```json
{
  "blocked_uri": "inline",
  "violated_directive": "style-src-attr",
  "window_start": "2026-06-28T10:00:00Z",
  "window_end": "2026-06-28T10:01:00Z",
  "aggregated_count": 17,
  "reporter_ip_hash": "..."
}
```

### サニタイズ

| 対象              | ライブラリ                  | 適用点                                                                                      |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------- |
| HTMLレンダリング  | `dompurify`                 | コメント本文、suggestion delta描画(クライアント側)                                          |
| Markdown生成      | `unified`+`rehype-sanitize` | エクスポートMarkdown形式                                                                    |
| 画像Exif          | `sharp`                     | 画像アップロード時の自動除去([08画像アップロードと自動削除キュー](./08-image-and-purge.md)) |
| URLバリデーション | 自前関数                    | リンク挿入時に `javascript:`、`data:`、`vbscript:` を拒否                                   |

`dangerouslySetInnerHTML` の利用は禁止する(ESLintルールで強制)。

### エラーコード

| コード    | HTTP | 意味                                  |
| --------- | ---- | ------------------------------------- |
| `CSP-001` | 400  | CSPレポートのOrigin不一致             |
| `CSP-002` | 429  | CSPレポートのレート制限超過           |
| `CSP-003` | 413  | CSPレポートのpayload 8KiB超過         |
| `CSP-004` | 400  | サニタイズで弾かれたコメント/Markdown |

詳細は[19エラーコード登録簿](./19-error-code-registry.md)参照。

## テストID紐付け

| 契約ID          | 内容                                        | テストID  | テスト種別 | CIゲート   |
| --------------- | ------------------------------------------- | --------- | ---------- | ---------- |
| CSP-CONTRACT-01 | nonceのリクエストごと発行と再利用拒否       | T-CSP-001 | integ      | Vitest     |
| CSP-CONTRACT-02 | `style-src-attr` ハッシュ未登録属性値の遮断 | T-CSP-002 | e2e        | Playwright |
| CSP-CONTRACT-03 | CSPレポートの1分集約                        | T-CSP-003 | integ      | Vitest     |
| CSP-CONTRACT-04 | CSPレポートのレート制限超過429              | T-CSP-004 | integ      | Vitest     |
| CSP-CONTRACT-05 | dompurifyによるXSSペイロード除去            | T-CSP-005 | unit       | Vitest     |
| CSP-CONTRACT-06 | リンク挿入で `javascript:` 拒否             | T-CSP-006 | unit       | Vitest     |

## トレーサビリティ

| 対応要件                                       | 対応基本設計節 | 対応ADR            |
| ---------------------------------------------- | -------------- | ------------------ |
| NFR-04第3項(XSS耐性)、NFR-04第14項(ペンテスト) | §7             | ADR-0017、ADR-0026 |
