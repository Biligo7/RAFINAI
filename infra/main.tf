resource "azurerm_resource_group" "main" {
  name     = local.resource_group_name
  location = var.location
  tags     = local.base_tags
}

module "log_analytics" {
  source              = "./modules/log-analytics"
  name                = local.log_analytics_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = var.log_analytics_sku
  retention_days      = var.log_analytics_retention_days
  tags                = local.base_tags
}

module "acr" {
  source              = "./modules/acr"
  name                = local.acr_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = var.acr_sku
  tags                = local.base_tags
}

resource "azurerm_user_assigned_identity" "aca_pull" {
  name                = local.identity_name
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  tags                = local.base_tags
}

# Image pull role assignment. Container Apps uses this identity to pull from ACR.
resource "azurerm_role_assignment" "acr_pull" {
  scope                = module.acr.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.aca_pull.principal_id
}

# Optional Azure OpenAI account provisioned only when enable_azure_openai = true.
resource "azurerm_cognitive_account" "openai" {
  count = var.enable_azure_openai ? 1 : 0

  name                  = "aoai-${var.project_name}-${var.environment_name}-${local.suffix}"
  location              = azurerm_resource_group.main.location
  resource_group_name   = azurerm_resource_group.main.name
  kind                  = "OpenAI"
  sku_name              = var.azure_openai_sku_name
  custom_subdomain_name = "aoai-${var.project_name}-${var.environment_name}-${local.suffix}"
  tags                  = local.base_tags
}

module "sql" {
  source              = "./modules/sql"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  server_name         = local.sql_server_name
  database_name       = local.sql_database_name

  admin_login    = var.sql_admin_login
  admin_password = var.sql_admin_password

  postgres_version             = var.postgres_version
  sku_name                     = var.postgres_sku_name
  storage_mb                   = var.postgres_storage_mb
  backup_retention_days        = var.postgres_backup_retention_days
  geo_redundant_backup_enabled = var.postgres_geo_redundant_backup_enabled

  allow_azure_services_to_postgres = var.allow_azure_services_to_sql
  allowed_postgres_client_ips      = var.allowed_sql_client_ips
  tags                             = local.base_tags
}

module "container_apps" {
  source = "./modules/container-apps"

  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location

  environment_name           = local.container_apps_environment_name
  log_analytics_workspace_id = module.log_analytics.id

  acr_login_server     = module.acr.login_server
  acr_pull_identity_id = azurerm_user_assigned_identity.aca_pull.id

  frontend_app_name    = local.frontend_app_name
  backend_app_name     = local.backend_app_name
  frontend_target_port = var.frontend_target_port
  backend_target_port  = var.backend_target_port

  frontend_min_replicas = var.frontend_min_replicas
  frontend_max_replicas = var.frontend_max_replicas
  backend_min_replicas  = var.backend_min_replicas
  backend_max_replicas  = var.backend_max_replicas

  frontend_cpu    = var.frontend_cpu
  frontend_memory = var.frontend_memory
  backend_cpu     = var.backend_cpu
  backend_memory  = var.backend_memory

  use_bootstrap_images = var.use_bootstrap_images
  frontend_image_tag   = var.frontend_image_tag
  backend_image_tag    = var.backend_image_tag

  backend_internal_base_url = local.backend_internal_base_url

  ai_provider              = var.ai_provider
  ai_model                 = var.ai_model
  ai_system_prompt         = var.ai_system_prompt
  ai_temperature           = var.ai_temperature
  ai_max_tokens            = var.ai_max_tokens
  azure_openai_endpoint    = var.enable_azure_openai && length(azurerm_cognitive_account.openai) > 0 ? azurerm_cognitive_account.openai[0].endpoint : var.azure_openai_endpoint
  azure_openai_api_key     = var.enable_azure_openai && length(azurerm_cognitive_account.openai) > 0 ? azurerm_cognitive_account.openai[0].primary_access_key : var.azure_openai_api_key
  azure_openai_deployment  = var.azure_openai_deployment
  azure_openai_api_version = var.azure_openai_api_version
  openai_api_key           = var.openai_api_key
  openai_base_url          = var.openai_base_url
  openai_model             = var.openai_model
  app_environment          = var.environment_name

  sql_server_fqdn    = module.sql.server_fqdn
  sql_database_name  = module.sql.database_name
  sql_admin_login    = module.sql.admin_login
  sql_admin_password = var.sql_admin_password

  tags = local.base_tags

  depends_on = [azurerm_role_assignment.acr_pull]
}

module "monitor_custom_logs" {
  count = var.enable_custom_log_ingestion ? 1 : 0

  source                     = "./modules/monitor-custom-logs"
  resource_group_name        = azurerm_resource_group.main.name
  location                   = azurerm_resource_group.main.location
  log_analytics_workspace_id = module.log_analytics.id
  project_name               = var.project_name
  environment_name           = var.environment_name
  suffix                     = local.suffix
  tags                       = local.base_tags
}
