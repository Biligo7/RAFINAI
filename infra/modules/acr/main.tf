resource "azurerm_container_registry" "main" {
  name                = var.name
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = var.sku
  # Admin user is disabled. Container Apps pulls images via the user-assigned
  # managed identity created in the root module.
  admin_enabled = false
  tags          = var.tags
}
