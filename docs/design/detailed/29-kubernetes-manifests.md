# 29 Kubernetes manifest

## スコープ

`manifests/` 配下のKubernetes manifest本文を集約する。kustomizeで `base/` + `overlays/{staging,production}/` を構成し、本番デプロイ時はoverlayのpatchで環境差を吸収する。

## ディレクトリ構成

```text
manifests/
├── base/
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml.example       # 実体は外部secret manager
│   ├── app-server-deployment.yaml
│   ├── app-server-service.yaml
│   ├── app-server-hpa.yaml
│   ├── export-worker-deployment.yaml
│   ├── ingress.yaml
│   ├── network-policies.yaml
│   ├── pdb.yaml                   # PodDisruptionBudget
│   └── kustomization.yaml
├── overlays/
│   ├── staging/
│   │   ├── kustomization.yaml
│   │   └── ingress-patch.yaml
│   └── production/
│       ├── kustomization.yaml
│       └── ingress-patch.yaml
└── alerts/
    └── prometheus-rules.yaml      # 詳細16のアラート
```

## `base/namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: wysiwyg-collab
  labels:
    app.kubernetes.io/part-of: wysiwyg-collab-editor
```

## `base/app-server-deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-server
  namespace: wysiwyg-collab
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxUnavailable: 0, maxSurge: 1 }
  selector:
    matchLabels: { app: app-server }
  template:
    metadata:
      labels: { app: app-server }
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        fsGroup: 65532
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: app-server
          image: ghcr.io/your-org/wysiwyg-app-server:REPLACE_WITH_IMAGE_TAG
          imagePullPolicy: IfNotPresent
          ports:
            - { name: http, containerPort: 3000 }
            - { name: metrics, containerPort: 9100 }
          env:
            - { name: NODE_ENV, value: production }
            - { name: LOG_LEVEL, value: info }
          envFrom:
            - configMapRef: { name: app-server-config }
            - secretRef: { name: app-server-secrets }
          resources:
            requests: { cpu: 200m, memory: 256Mi }
            limits: { cpu: 1000m, memory: 1Gi }
          livenessProbe:
            httpGet: { path: /api/healthz, port: 3000 }
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet: { path: /api/healthz, port: 3000 }
            initialDelaySeconds: 3
            periodSeconds: 5
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: [ALL] }
```

## `base/app-server-service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: app-server
  namespace: wysiwyg-collab
spec:
  selector: { app: app-server }
  ports:
    - { name: http, port: 80, targetPort: 3000 }
    - { name: metrics, port: 9100, targetPort: 9100 }
  type: ClusterIP
```

## `base/app-server-hpa.yaml`

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: app-server
  namespace: wysiwyg-collab
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: app-server }
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 70 } }
    - type: Resource
      resource: { name: memory, target: { type: Utilization, averageUtilization: 75 } }
```

## `base/export-worker-deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: export-worker
  namespace: wysiwyg-collab
spec:
  replicas: 2
  selector:
    matchLabels: { app: export-worker }
  template:
    metadata:
      labels: { app: export-worker }
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: export-worker
          image: ghcr.io/your-org/wysiwyg-export-worker:REPLACE_WITH_IMAGE_TAG
          envFrom:
            - configMapRef: { name: app-server-config }
            - secretRef: { name: app-server-secrets }
          resources:
            requests: { cpu: 500m, memory: 1Gi }
            limits: { cpu: 2000m, memory: 3Gi }
          securityContext:
            allowPrivilegeEscalation: false
            capabilities: { drop: [ALL] }
```

## `base/ingress.yaml`

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-server
  namespace: wysiwyg-collab
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "120"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "120"
    nginx.ingress.kubernetes.io/server-snippet: |
      proxy_set_header X-Forwarded-Proto https;
spec:
  ingressClassName: nginx
  tls:
    - hosts: [REPLACE_WITH_PROD_HOST]
      secretName: app-server-tls
  rules:
    - host: REPLACE_WITH_PROD_HOST
      http:
        paths:
          - {
              path: /,
              pathType: Prefix,
              backend: { service: { name: app-server, port: { number: 80 } } },
            }
```

## `base/network-policies.yaml`

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: wysiwyg-collab
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: app-server-allow
  namespace: wysiwyg-collab
spec:
  podSelector: { matchLabels: { app: app-server } }
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: ingress-nginx } }
      ports: [{ port: 3000 }]
    - from:
        - podSelector: { matchLabels: { app: prometheus } }
      ports: [{ port: 9100 }]
  egress:
    - to:
        - namespaceSelector: {}
          podSelector: { matchLabels: { app: postgres } }
      ports: [{ port: 5432 }]
    - to:
        - namespaceSelector: {}
          podSelector: { matchLabels: { app: redis } }
      ports: [{ port: 6379 }]
    - to:
        - namespaceSelector: {}
          podSelector: { matchLabels: { app: minio } }
      ports: [{ port: 9000 }]
    - to:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: kube-system } }
          podSelector: { matchLabels: { k8s-app: kube-dns } }
      ports: [{ port: 53, protocol: UDP }]
    - to:
        - namespaceSelector: {}
      ports: [{ port: 587 }] # SMTP (overlayでさらに制限可)
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: proxy-reject-batch-internal
  namespace: wysiwyg-collab
spec:
  podSelector: { matchLabels: { app: app-server } }
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector: { matchLabels: { app: fluent-bit } }
      ports: [{ port: 3000, protocol: TCP }]
```

## `base/pdb.yaml`

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: app-server
  namespace: wysiwyg-collab
spec:
  minAvailable: 1
  selector: { matchLabels: { app: app-server } }
```

## `base/configmap.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-server-config
  namespace: wysiwyg-collab
data:
  APP_BASE_URL: "https://REPLACE_WITH_PROD_HOST"
  SESSION_COOKIE_DOMAIN: "REPLACE_WITH_PROD_HOST"
  DB_HOST: "postgres.wysiwyg-collab.svc.cluster.local"
  DB_PORT: "5432"
  DB_NAME: "wysiwyg_collab"
  DB_SSL_MODE: "require"
  DB_POOL_MAX: "20"
  REDIS_URL: "rediss://redis.wysiwyg-collab.svc.cluster.local:6379/0"
  REDIS_TLS: "true"
  S3_ENDPOINT: "https://minio.wysiwyg-collab.svc.cluster.local:9000"
  S3_REGION: "us-east-1"
  S3_BUCKET_IMAGES: "docs-images"
  S3_BUCKET_EXPORTS: "docs-exports"
  S3_FORCE_PATH_STYLE: "true"
  AUDIT_CURRENT_SALT_VERSION: "1"
  EXPORT_WORKER_REPLICAS: "2"
  EXPORT_WORKER_CONCURRENCY: "2"
  LOG_LEVEL: "info"
```

## `base/secrets.yaml.example`

```yaml
# 実体は ExternalSecrets/SealedSecrets 等で別管理。本ファイルは契約のみ。
apiVersion: v1
kind: Secret
metadata:
  name: app-server-secrets
  namespace: wysiwyg-collab
type: Opaque
stringData:
  SESSION_SECRET: REPLACE_FROM_VAULT
  CSRF_SECRET: REPLACE_FROM_VAULT
  CACHE_ETAG_SECRET: REPLACE_FROM_VAULT
  IP_HASH_SECRET: REPLACE_FROM_VAULT
  GUEST_WS_TOKEN_SECRET: REPLACE_FROM_VAULT
  AUDIT_HASH_SALT_v1: REPLACE_FROM_VAULT
  DB_USER: REPLACE_FROM_VAULT
  DB_PASSWORD: REPLACE_FROM_VAULT
  REDIS_PASSWORD: REPLACE_FROM_VAULT
  S3_ACCESS_KEY: REPLACE_FROM_VAULT
  S3_SECRET_KEY: REPLACE_FROM_VAULT
  SMTP_USER: REPLACE_FROM_VAULT
  SMTP_PASSWORD: REPLACE_FROM_VAULT
  LOKI_BEARER_TOKEN: REPLACE_FROM_VAULT
  PROXY_REJECT_BEARER_TOKEN: REPLACE_FROM_VAULT
```

## `base/kustomization.yaml`

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: wysiwyg-collab
resources:
  - namespace.yaml
  - configmap.yaml
  - secrets.yaml.example
  - app-server-deployment.yaml
  - app-server-service.yaml
  - app-server-hpa.yaml
  - export-worker-deployment.yaml
  - ingress.yaml
  - network-policies.yaml
  - pdb.yaml
```

## `alerts/prometheus-rules.yaml`

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: wysiwyg-collab
  namespace: wysiwyg-collab
spec:
  groups:
    - name: wysiwyg.slo
      rules:
        - alert: WebSocketSloFastBurn
          expr: |
            (1 - sum(rate(websocket_handshake_success_total[1h])) / sum(rate(websocket_handshake_total[1h]))) > 0.01
          for: 5m
          labels: { severity: critical }
          annotations: { summary: "WebSocket SLO fast burn" }
        - alert: OtAckLatencyHigh
          expr: histogram_quantile(0.95, sum(rate(ot_ack_latency_seconds_bucket[5m])) by (le)) > 0.8
          for: 5m
          labels: { severity: warning }
          annotations: { summary: "OT ACK p95 > 800ms" }
        - alert: RevisionReachabilityViolation
          expr: increase(revision_reachability_violation_total[5m]) > 0
          for: 0m
          labels: { severity: critical }
          annotations:
            summary: "version reachability invariant violated"
            runbook: "docs/design/detailed/06-version-and-ops-compaction.md"
        - alert: CapacityRejectHigh
          expr: sum(rate(capacity_reject_subscribe_total[15m]) + rate(capacity_reject_connect_total[15m]) + rate(capacity_reject_proxy_total[15m])) > 1
          for: 15m
          labels: { severity: warning }
        - alert: CspViolationHigh
          expr: increase(csp_violation_total[15m]) > 10
          for: 0m
          labels: { severity: warning }
```

## トレーサビリティ

| 対応要件       | 対応基本設計節 | 対応ADR  |
| -------------- | -------------- | -------- |
| NFR-06、NFR-07 | §9             | ADR-0028 |
