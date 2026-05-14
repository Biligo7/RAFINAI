locals {
  suffix = var.resource_name_suffix

  base_tags = merge({
    project     = var.project_name
    environment = var.environment_name
    managedBy   = "terraform"
  }, var.tags)

  resource_group_name = "rg-${var.project_name}-${var.environment_name}-${local.suffix}"

  log_analytics_name              = "law-${var.project_name}-${var.environment_name}-${local.suffix}"
  acr_name                        = lower(replace("acr${var.project_name}${var.environment_name}${local.suffix}", "-", ""))
  identity_name                   = "id-aca-pull-${var.project_name}-${var.environment_name}-${local.suffix}"
  container_apps_environment_name = "cae-${var.project_name}-${var.environment_name}-${local.suffix}"

  # Stable, predictable Container App names so the frontend Nginx config can
  # reference the backend by service-discovery name.
  frontend_app_name = "aca-${var.project_name}-frontend-${var.environment_name}"
  backend_app_name  = "aca-${var.project_name}-backend-${var.environment_name}"

  sql_server_name   = "pg-${var.project_name}-${var.environment_name}-${local.suffix}"
  sql_database_name = "${var.project_name}_${var.environment_name}"

  # The frontend reaches the backend by service-discovery name inside the
  # shared environment. http (not https) because internal ingress terminates
  # TLS at the environment edge for external apps only.
  backend_internal_base_url = "http://${local.backend_app_name}"
}
