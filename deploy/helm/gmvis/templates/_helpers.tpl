{{/* Standard labels applied to every resource. */}}
{{- define "gmvis.labels" -}}
app.kubernetes.io/name: gmvis
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: gmvis
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{/* Selector labels for the web workload (immutable once deployed). */}}
{{- define "gmvis.selectorLabels" -}}
app.kubernetes.io/name: gmvis
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: web
{{- end -}}

{{/* Full image reference. Fails fast if image.tag was not provided. */}}
{{- define "gmvis.image" -}}
{{- $repo := required "image.repository must be set" .Values.image.repository -}}
{{- $tag := required "image.tag must be set — CI passes it via `argocd app set -p image.tag=sha-…`; for local renders add `--set image.tag=test`" .Values.image.tag -}}
{{ $repo }}:{{ $tag }}
{{- end -}}
