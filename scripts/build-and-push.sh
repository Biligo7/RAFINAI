#!/usr/bin/env bash
# Build the frontend and backend images and push them to ACR.
#
# Run from the project root after `terraform apply` has created the registry.
#
# By default, builds locally with Docker. If Docker isn't available (not
# installed, daemon not running, or permission denied on the socket), falls
# back to `az acr build`, which builds remotely inside ACR. Force a mode
# with BUILD_MODE=local | remote | auto (default: auto).

set -euo pipefail

INFRA_DIR="${INFRA_DIR:-infra}"
TAG="${TAG:-$(git rev-parse HEAD 2>/dev/null || date -u +%Y%m%d%H%M%S)}"
BUILD_MODE="${BUILD_MODE:-auto}"

ACR_NAME=$(terraform -chdir="$INFRA_DIR" output -raw acr_name)
LOGIN_SERVER=$(terraform -chdir="$INFRA_DIR" output -raw acr_login_server)

has_local_docker() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

case "$BUILD_MODE" in
  local)
    mode=local
    echo "==> BUILD_MODE=local: forcing local Docker build/push (will fail if Docker is unavailable)."
    ;;
  remote)
    mode=remote
    echo "==> BUILD_MODE=remote: building remotely in ACR via 'az acr build' (no local Docker needed)."
    ;;
  auto)
    if has_local_docker; then
      mode=local
      echo "==> Docker detected locally; building and pushing with Docker. Override with BUILD_MODE=remote to build in ACR instead."
    else
      mode=remote
      echo "==> Docker is not available (not installed, daemon down, or permission denied on /var/run/docker.sock)."
      echo "    Falling back to remote build via 'az acr build' — no Docker daemon required."
    fi
    ;;
  *)
    echo "Unknown BUILD_MODE: $BUILD_MODE (expected: auto, local, remote)" >&2
    exit 1
    ;;
esac

echo "==> Registry:  $LOGIN_SERVER"
echo "==> Image tag: $TAG (+ :latest)"

if [[ "$mode" == local ]]; then
  echo "==> ACR login (needed so 'docker push' can authenticate): $ACR_NAME"
  az acr login --name "$ACR_NAME"
else
  echo "==> Skipping 'az acr login' — 'az acr build' authenticates via your existing 'az login' session."
fi

for image in backend frontend; do
  if [[ "$mode" == local ]]; then
    echo "==> [$image] building locally with Docker -> $LOGIN_SERVER/$image:{$TAG,latest}"
    docker build \
      -t "$LOGIN_SERVER/$image:$TAG" \
      -t "$LOGIN_SERVER/$image:latest" \
      "./$image"

    echo "==> [$image] pushing both tags to $LOGIN_SERVER"
    docker push "$LOGIN_SERVER/$image:$TAG"
    docker push "$LOGIN_SERVER/$image:latest"
  else
    echo "==> [$image] uploading build context to ACR ($ACR_NAME) and building remotely -> $image:{$TAG,latest}"
    az acr build \
      --registry "$ACR_NAME" \
      --image "$image:$TAG" \
      --image "$image:latest" \
      "./$image"
  fi
  echo "==> [$image] done."
done

# The container apps' image and ingress.target_port are owned by
# `az containerapp update` (Terraform has `ignore_changes` set on them — see
# infra/modules/container-apps/main.tf), so `terraform apply` is intentionally
# NOT how you roll to a new image.
RG=$(terraform -chdir="$INFRA_DIR" output -raw resource_group_name)
BACKEND_APP=$(terraform -chdir="$INFRA_DIR" output -raw backend_container_app_name)
FRONTEND_APP=$(terraform -chdir="$INFRA_DIR" output -raw frontend_container_app_name)

cat <<NEXT

Done. To roll the running Container Apps to these images:

  az containerapp update --name "$BACKEND_APP"  --resource-group "$RG" --image "$LOGIN_SERVER/backend:$TAG"
  az containerapp ingress update --name "$BACKEND_APP"  --resource-group "$RG" --target-port 3000

  az containerapp update --name "$FRONTEND_APP" --resource-group "$RG" --image "$LOGIN_SERVER/frontend:$TAG"
  az containerapp ingress update --name "$FRONTEND_APP" --resource-group "$RG" --target-port 8080

Each update creates a new revision; the previous one drains in ~30s.
NEXT
