resource "azurerm_postgresql_flexible_server" "main" {
  name                = var.server_name
  resource_group_name = var.resource_group_name
  location            = var.location

  version             = var.postgres_version
  administrator_login = var.admin_login
  # tfsec:ignore:azure-database-postgres-no-password-auth
  administrator_password = var.admin_password

  sku_name   = var.sku_name
  storage_mb = var.storage_mb

  backup_retention_days        = var.backup_retention_days
  geo_redundant_backup_enabled = var.geo_redundant_backup_enabled

  # Public network access is enabled for the dev-friendly default. For
  # production, set this to false and add private endpoints.
  public_network_access_enabled = true

  tags = var.tags

  lifecycle {
    ignore_changes = [
      zone,
    ]
  }
}

resource "azurerm_postgresql_flexible_server_database" "main" {
  name      = var.database_name
  server_id = azurerm_postgresql_flexible_server.main.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

# Allow Azure-origin services (Container Apps, Functions, etc.) to reach
# Postgres without a private link. The 0.0.0.0 sentinel rule is the canonical
# way to express this.
resource "azurerm_postgresql_flexible_server_firewall_rule" "azure_services" {
  count = var.allow_azure_services_to_postgres ? 1 : 0

  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "explicit" {
  for_each = var.allowed_postgres_client_ips

  name             = each.key
  server_id        = azurerm_postgresql_flexible_server.main.id
  start_ip_address = each.value.start_ip
  end_ip_address   = each.value.end_ip
}
