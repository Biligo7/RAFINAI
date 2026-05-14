locals {
  bootstrap_image = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
  bootstrap_port  = 80

  frontend_image = var.use_bootstrap_images ? local.bootstrap_image : "${var.acr_login_server}/frontend:${var.frontend_image_tag}"
  backend_image  = var.use_bootstrap_images ? local.bootstrap_image : "${var.acr_login_server}/backend:${var.backend_image_tag}"

  frontend_target_port = var.use_bootstrap_images ? local.bootstrap_port : var.frontend_target_port
  backend_target_port  = var.use_bootstrap_images ? local.bootstrap_port : var.backend_target_port

  # Backend env vars. Sensitive values (API keys, SQL password) are wired as
  # Container App secrets in the resource block, not plain env values.
  backend_env_plain = [
    { name = "NODE_ENV", value = "production" },
    { name = "APP_ENV", value = var.app_environment },
    { name = "PORT", value = tostring(var.backend_target_port) },
    { name = "LOG_LEVEL", value = "info" },
    { name = "AI_PROVIDER", value = var.ai_provider },
    { name = "AI_MODEL", value = var.ai_model },
    { name = "AI_SYSTEM_PROMPT", value = var.ai_system_prompt },
    { name = "AI_TEMPERATURE", value = tostring(var.ai_temperature) },
    { name = "AI_MAX_TOKENS", value = tostring(var.ai_max_tokens) },
    { name = "AZURE_OPENAI_ENDPOINT", value = var.azure_openai_endpoint },
    { name = "AZURE_OPENAI_DEPLOYMENT", value = var.azure_openai_deployment },
    { name = "AZURE_OPENAI_API_VERSION", value = var.azure_openai_api_version },
    { name = "OPENAI_BASE_URL", value = var.openai_base_url },
    { name = "OPENAI_MODEL", value = var.openai_model },
    { name = "PG_HOST", value = var.sql_server_fqdn },
    { name = "PG_PORT", value = "5432" },
    { name = "PG_DATABASE", value = var.sql_database_name },
    { name = "PG_USER", value = var.sql_admin_login },
    { name = "PG_SSL", value = "true" },
    { name = "RUN_MIGRATIONS_ON_STARTUP", value = "true" },
    { name = "AUTH_ENABLED", value = "false" },
  ]

  # Conditional secret refs — Container Apps requires the secret name referenced
  # to exist, so we only emit env entries when the matching secret was supplied.
  backend_env_secret_refs = concat(
    var.azure_openai_api_key != "" ? [{ name = "AZURE_OPENAI_API_KEY", secretName = "azure-openai-api-key" }] : [],
    var.openai_api_key != "" ? [{ name = "OPENAI_API_KEY", secretName = "openai-api-key" }] : [],
    [{ name = "PG_PASSWORD", secretName = "pg-admin-password" }],
  )

  backend_secrets = concat(
    var.azure_openai_api_key != "" ? [{ name = "azure-openai-api-key", value = var.azure_openai_api_key }] : [],
    var.openai_api_key != "" ? [{ name = "openai-api-key", value = var.openai_api_key }] : [],
    [{ name = "pg-admin-password", value = var.sql_admin_password }],
  )
}

resource "azurerm_container_app_environment" "main" {
  name                       = var.environment_name
  resource_group_name        = var.resource_group_name
  location                   = var.location
  log_analytics_workspace_id = var.log_analytics_workspace_id
  tags                       = var.tags
}

resource "azurerm_container_app" "frontend" {
  name                         = var.frontend_app_name
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [var.acr_pull_identity_id]
  }

  registry {
    server   = var.acr_login_server
    identity = var.acr_pull_identity_id
  }

  ingress {
    external_enabled = true
    target_port      = local.frontend_target_port
    transport        = "auto"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.frontend_min_replicas
    max_replicas = var.frontend_max_replicas

    container {
      name   = "frontend"
      image  = local.frontend_image
      cpu    = var.frontend_cpu
      memory = var.frontend_memory

      env {
        name  = "BACKEND_BASE_URL"
        value = var.backend_internal_base_url
      }
    }
  }

  # Image and target port are owned by the deploy-frontend pipeline (it pushes
  # the real image to ACR and runs `az containerapp update` + ingress update).
  # Terraform sets the bootstrap defaults at create time, then leaves these
  # fields alone so subsequent infra applies don't revert the live image.
  lifecycle {
    ignore_changes = [
      template[0].container[0].image,
      ingress[0].target_port,
    ]
  }
}

resource "azurerm_container_app" "backend" {
  name                         = var.backend_app_name
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [var.acr_pull_identity_id]
  }

  registry {
    server   = var.acr_login_server
    identity = var.acr_pull_identity_id
  }

  ingress {
    external_enabled = false # Only frontend can contact the backend
    target_port      = local.backend_target_port
    transport        = "auto"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  dynamic "secret" {
    for_each = local.backend_secrets
    content {
      name  = secret.value.name
      value = secret.value.value
    }
  }

  template {
    min_replicas = var.backend_min_replicas
    max_replicas = var.backend_max_replicas

    container {
      name   = "backend"
      image  = local.backend_image
      cpu    = var.backend_cpu
      memory = var.backend_memory

      dynamic "env" {
        for_each = local.backend_env_plain
        content {
          name  = env.value.name
          value = env.value.value
        }
      }

      dynamic "env" {
        for_each = local.backend_env_secret_refs
        content {
          name        = env.value.name
          secret_name = env.value.secretName
        }
      }
    }
  }

  # See the frontend block above. The deploy-backend pipeline owns image and
  # target port; Terraform initialises them at create time then steps back.
  lifecycle {
    ignore_changes = [
      template[0].container[0].image,
      ingress[0].target_port,
    ]
  }
}
