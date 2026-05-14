output "data_collection_endpoint_id" {
  value = azurerm_monitor_data_collection_endpoint.main.id
}

output "data_collection_rule_id" {
  value = azurerm_monitor_data_collection_rule.main.id
}

output "logs_ingestion_endpoint" {
  value = azurerm_monitor_data_collection_endpoint.main.logs_ingestion_endpoint
}

output "stream_name" {
  value = "Custom-AiAppEvents_CL"
}
