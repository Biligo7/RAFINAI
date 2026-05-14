output "resource_group_name" {
  value = azurerm_resource_group.main.name
}

output "acr_name" {
  value = module.acr.name
}

output "acr_login_server" {
  value = module.acr.login_server
}

output "container_apps_environment_name" {
  value = module.container_apps.environment_name
}

output "frontend_container_app_name" {
  value = module.container_apps.frontend_name
}

output "backend_container_app_name" {
  value = module.container_apps.backend_name
}

output "frontend_url" {
  value = "https://${module.container_apps.frontend_fqdn}"
}

output "backend_internal_fqdn" {
  value = module.container_apps.backend_fqdn
}

output "sql_server_fqdn" {
  value = module.sql.server_fqdn
}

output "sql_database_name" {
  value = module.sql.database_name
}

output "sql_admin_login" {
  value = module.sql.admin_login
}

# sql_admin_password is intentionally not exposed as an output. It is supplied
# by the operator via TF_VAR_sql_admin_password.

output "log_analytics_workspace_name" {
  value = module.log_analytics.name
}
