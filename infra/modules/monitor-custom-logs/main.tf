terraform {
  required_providers {
    azapi = {
      source  = "Azure/azapi"
      version = "~> 2.0"
    }
  }
}

# Custom log ingestion plumbing for an `AiAppEvents_CL` table. This is OFF by
# default. Enable it via enable_custom_log_ingestion = true at the root level
# when you want app-level structured events to land in their own table.
#
# The pipeline is:
#   App → Data Collection Endpoint → Data Collection Rule → custom table.
#
# Wiring the backend to actually push to this DCE requires a managed-identity
# token + the Log Ingestion REST API. That code is intentionally not in the
# default backend; see docs/operations.md for how to enable it.

resource "azurerm_monitor_data_collection_endpoint" "main" {
  name                = "dce-${var.project_name}-${var.environment_name}-${var.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  kind                = "Linux"
  tags                = var.tags
}

resource "azapi_resource" "custom_table" {
  type      = "Microsoft.OperationalInsights/workspaces/tables@2022-10-01"
  name      = "AiAppEvents_CL"
  parent_id = var.log_analytics_workspace_id

  body = {
    properties = {
      schema = {
        name = "AiAppEvents_CL"
        columns = [
          { name = "TimeGenerated", type = "datetime" },
          { name = "RequestId", type = "string" },
          { name = "EventType", type = "string" },
          { name = "Severity", type = "string" },
          { name = "Message", type = "string" },
          { name = "PropertiesJson", type = "string" },
        ]
      }
      retentionInDays      = 30
      totalRetentionInDays = 30
    }
  }
}

resource "azurerm_monitor_data_collection_rule" "main" {
  name                        = "dcr-${var.project_name}-${var.environment_name}-${var.suffix}"
  resource_group_name         = var.resource_group_name
  location                    = var.location
  data_collection_endpoint_id = azurerm_monitor_data_collection_endpoint.main.id
  tags                        = var.tags

  destinations {
    log_analytics {
      workspace_resource_id = var.log_analytics_workspace_id
      name                  = "law-dest"
    }
  }

  data_flow {
    streams       = ["Custom-AiAppEvents_CL"]
    destinations  = ["law-dest"]
    output_stream = "Custom-AiAppEvents_CL"
  }

  stream_declaration {
    stream_name = "Custom-AiAppEvents_CL"
    column {
      name = "TimeGenerated"
      type = "datetime"
    }
    column {
      name = "RequestId"
      type = "string"
    }
    column {
      name = "EventType"
      type = "string"
    }
    column {
      name = "Severity"
      type = "string"
    }
    column {
      name = "Message"
      type = "string"
    }
    column {
      name = "PropertiesJson"
      type = "string"
    }
  }

  depends_on = [azapi_resource.custom_table]
}
