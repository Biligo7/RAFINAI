output "environment_id" {
  value = azurerm_container_app_environment.main.id
}

output "environment_name" {
  value = azurerm_container_app_environment.main.name
}

output "frontend_name" {
  value = azurerm_container_app.frontend.name
}

output "backend_name" {
  value = azurerm_container_app.backend.name
}

output "frontend_fqdn" {
  value = azurerm_container_app.frontend.ingress[0].fqdn
}

output "backend_fqdn" {
  value = azurerm_container_app.backend.ingress[0].fqdn
}
