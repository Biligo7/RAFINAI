variable "subscription_id" {
  description = "Azure subscription ID. Required by the azurerm provider."
  type        = string
}

variable "project_name" {
  description = "Short project name used in resource names."
  type        = string
  default     = "aichat"
}

variable "environment_name" {
  description = "Environment name such as dev, test, prod."
  type        = string
  default     = "dev"
}

variable "location" {
  description = "Azure region."
  type        = string
  default     = "northeurope"
}

variable "resource_name_suffix" {
  description = "Short lowercase alphanumeric suffix used to make globally-unique resource names (ACR, SQL server). Pin a value once and keep it stable across applies. Suggestion: openssl rand -hex 3."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{3,12}$", var.resource_name_suffix))
    error_message = "resource_name_suffix must be 3-12 lowercase alphanumeric characters."
  }
}

variable "tags" {
  description = "Tags applied to all resources."
  type        = map(string)
  default     = {}
}

variable "acr_sku" {
  description = "Azure Container Registry SKU. Basic is cheapest and default."
  type        = string
  default     = "Basic"
  validation {
    condition     = contains(["Basic", "Standard", "Premium"], var.acr_sku)
    error_message = "acr_sku must be Basic, Standard, or Premium."
  }
}

variable "log_analytics_sku" {
  description = "Log Analytics Workspace SKU."
  type        = string
  default     = "PerGB2018"
}

variable "log_analytics_retention_days" {
  description = "Log Analytics retention in days."
  type        = number
  default     = 30
}

variable "frontend_min_replicas" {
  description = "Minimum frontend replicas. 0 saves cost but causes a ~2s Nginx cold start on the first hit after idle — usually tolerable since the SPA shows a loader."
  type        = number
  default     = 0
}

variable "frontend_max_replicas" {
  description = "Maximum frontend replicas."
  type        = number
  default     = 1
}

# Default is 1: backend cold start is ~10-30s (Node boot + Postgres connect +
# optional migrations), which is long enough to time out at the Container Apps
# edge and 504 the first /api/* request after idle. Keeping one replica warm
# avoids that and costs ~$10-15/mo on Burstable B1.
variable "backend_min_replicas" {
  description = "Minimum backend replicas. Keep >=1 to avoid 504s on the first request after idle."
  type        = number
  default     = 1
}

variable "backend_max_replicas" {
  description = "Maximum backend replicas."
  type        = number
  default     = 1
}

variable "frontend_cpu" {
  description = "Frontend vCPU."
  type        = number
  default     = 0.25
}

variable "frontend_memory" {
  description = "Frontend memory."
  type        = string
  default     = "0.5Gi"
}

variable "backend_cpu" {
  description = "Backend vCPU."
  type        = number
  default     = 0.25
}

variable "backend_memory" {
  description = "Backend memory."
  type        = string
  default     = "0.5Gi"
}

variable "frontend_target_port" {
  description = "Frontend container port."
  type        = number
  default     = 8080
}

variable "backend_target_port" {
  description = "Backend container port."
  type        = number
  default     = 3000
}

variable "use_bootstrap_images" {
  description = "When true, deploys public hello-world images before ACR images exist. The deploy workflow applies once with true, pushes images, then applies with false."
  type        = bool
  default     = true
}

variable "frontend_image_tag" {
  description = "Frontend image tag in ACR. Usually Git SHA."
  type        = string
  default     = "latest"
  validation {
    condition     = length(var.frontend_image_tag) > 0
    error_message = "frontend_image_tag must not be empty. If you passed -var=frontend_image_tag=$TAG, check that $TAG was set in your shell (run `echo $TAG` to verify)."
  }
}

variable "backend_image_tag" {
  description = "Backend image tag in ACR. Usually Git SHA."
  type        = string
  default     = "latest"
  validation {
    condition     = length(var.backend_image_tag) > 0
    error_message = "backend_image_tag must not be empty. If you passed -var=backend_image_tag=$TAG, check that $TAG was set in your shell (run `echo $TAG` to verify)."
  }
}

variable "postgres_version" {
  description = "PostgreSQL major version for Azure Postgres Flexible Server."
  type        = string
  default     = "16"
}

variable "postgres_sku_name" {
  description = "Postgres Flexible Server compute SKU. B_Standard_B1ms is the cheapest always-on tier (~$12-15/mo). Use GP_Standard_D2s_v3 for production."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "postgres_storage_mb" {
  description = "Storage in MB. Minimum 32768 (32 GB)."
  type        = number
  default     = 32768
}

variable "postgres_backup_retention_days" {
  description = "Backup retention in days. 7-35 supported."
  type        = number
  default     = 7
  validation {
    condition     = var.postgres_backup_retention_days >= 7 && var.postgres_backup_retention_days <= 35
    error_message = "postgres_backup_retention_days must be between 7 and 35."
  }
}

variable "postgres_geo_redundant_backup_enabled" {
  description = "Geo-redundant backups for Postgres Flexible Server. Off keeps cost down."
  type        = bool
  default     = false
}

variable "sql_admin_login" {
  description = "Postgres admin login name."
  type        = string
  default     = "pgadmin"
}

variable "sql_admin_password" {
  description = "Postgres admin password. Pass via TF_VAR_sql_admin_password (GitHub environment secret) or -var. Must satisfy Azure Postgres Flexible Server complexity rules (mix of upper/lower/digit/special)."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.sql_admin_password) >= 12
    error_message = "sql_admin_password must be at least 12 characters."
  }
}

variable "allow_azure_services_to_sql" {
  description = "Dev-friendly: allow Azure-origin traffic to reach Postgres. Disable for production and use private networking or explicit firewall rules."
  type        = bool
  default     = true
}

variable "allowed_sql_client_ips" {
  description = "Optional firewall rules for Postgres access by name."
  type = map(object({
    start_ip = string
    end_ip   = string
  }))
  default = {}
}

variable "ai_provider" {
  description = "mock, azure_openai, or openai_compatible."
  type        = string
  default     = "mock"
  validation {
    condition     = contains(["mock", "azure_openai", "openai_compatible"], var.ai_provider)
    error_message = "ai_provider must be mock, azure_openai, or openai_compatible."
  }
}

variable "ai_model" {
  description = "Safe model label shown in UI."
  type        = string
  default     = "mock-gpt"
}

variable "ai_system_prompt" {
  description = "Default system prompt."
  type        = string
  default     = "You are a helpful AI assistant."
}

variable "ai_temperature" {
  description = "Default sampling temperature."
  type        = number
  default     = 0.2
}

variable "ai_max_tokens" {
  description = "Default max output tokens."
  type        = number
  default     = 1000
}

variable "azure_openai_endpoint" {
  description = "Azure OpenAI endpoint. Required if ai_provider is azure_openai and enable_azure_openai is false."
  type        = string
  default     = ""
}

variable "azure_openai_api_key" {
  description = "Azure OpenAI API key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "azure_openai_deployment" {
  description = "Azure OpenAI chat model deployment name."
  type        = string
  default     = ""
}

variable "azure_openai_api_version" {
  description = "Azure OpenAI API version."
  type        = string
  default     = "2024-10-21"
}

variable "openai_api_key" {
  description = "OpenAI-compatible API key."
  type        = string
  default     = ""
  sensitive   = true
}

variable "openai_base_url" {
  description = "OpenAI-compatible base URL."
  type        = string
  default     = ""
}

variable "openai_model" {
  description = "OpenAI-compatible model name."
  type        = string
  default     = ""
}

variable "enable_custom_log_ingestion" {
  description = "Create custom log ingestion resources. Off by default."
  type        = bool
  default     = false
}

variable "enable_azure_openai" {
  description = "Optionally provision an Azure OpenAI account. Off by default to avoid quota/region issues."
  type        = bool
  default     = false
}

variable "azure_openai_sku_name" {
  description = "SKU for the Azure OpenAI account when enable_azure_openai = true."
  type        = string
  default     = "S0"
}

variable "enable_key_vault" {
  description = "Optionally provision Key Vault. Off by default to keep the default deployment simple."
  type        = bool
  default     = false
}

variable "enable_private_networking" {
  description = "Optionally add VNet/private endpoints. Off by default."
  type        = bool
  default     = false
}
