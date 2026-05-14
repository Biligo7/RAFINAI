output "id" {
  value = azurerm_log_analytics_workspace.main.id
}

output "name" {
  value = azurerm_log_analytics_workspace.main.name
}

output "workspace_id" {
  value = azurerm_log_analytics_workspace.main.workspace_id
}

output "primary_shared_key" {
  value     = azurerm_log_analytics_workspace.main.primary_shared_key
  sensitive = true
}
