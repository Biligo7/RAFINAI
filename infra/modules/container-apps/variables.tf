variable "resource_group_name" { type = string }
variable "location" { type = string }

variable "environment_name" { type = string }
variable "log_analytics_workspace_id" { type = string }

variable "acr_login_server" { type = string }
variable "acr_pull_identity_id" { type = string }

variable "frontend_app_name" { type = string }
variable "backend_app_name" { type = string }
variable "frontend_target_port" { type = number }
variable "backend_target_port" { type = number }

variable "frontend_min_replicas" { type = number }
variable "frontend_max_replicas" { type = number }
variable "backend_min_replicas" { type = number }
variable "backend_max_replicas" { type = number }
variable "frontend_cpu" { type = number }
variable "frontend_memory" { type = string }
variable "backend_cpu" { type = number }
variable "backend_memory" { type = string }

variable "use_bootstrap_images" { type = bool }
variable "frontend_image_tag" { type = string }
variable "backend_image_tag" { type = string }

variable "backend_internal_base_url" { type = string }

variable "ai_provider" { type = string }
variable "ai_model" { type = string }
variable "ai_system_prompt" { type = string }
variable "ai_temperature" { type = number }
variable "ai_max_tokens" { type = number }
variable "azure_openai_endpoint" { type = string }
variable "azure_openai_api_key" {
  type      = string
  sensitive = true
}
variable "azure_openai_deployment" { type = string }
variable "azure_openai_api_version" { type = string }
variable "openai_api_key" {
  type      = string
  sensitive = true
}
variable "openai_base_url" { type = string }
variable "openai_model" { type = string }

variable "app_environment" { type = string }

variable "sql_server_fqdn" { type = string }
variable "sql_database_name" { type = string }
variable "sql_admin_login" { type = string }
variable "sql_admin_password" {
  type      = string
  sensitive = true
}

variable "tags" {
  type    = map(string)
  default = {}
}
