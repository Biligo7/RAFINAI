variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "server_name" { type = string }
variable "database_name" { type = string }

variable "admin_login" { type = string }

variable "admin_password" {
  type      = string
  sensitive = true
}

variable "postgres_version" {
  type    = string
  default = "16"
}

variable "sku_name" {
  description = "Postgres Flexible Server compute SKU. Burstable B1ms is the cheapest always-on tier."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "storage_mb" {
  description = "Storage in MB. Minimum 32768 (32 GB)."
  type        = number
  default     = 32768
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "geo_redundant_backup_enabled" {
  type    = bool
  default = false
}

variable "allow_azure_services_to_postgres" {
  type    = bool
  default = true
}

variable "allowed_postgres_client_ips" {
  type = map(object({
    start_ip = string
    end_ip   = string
  }))
  default = {}
}

variable "tags" {
  type    = map(string)
  default = {}
}
