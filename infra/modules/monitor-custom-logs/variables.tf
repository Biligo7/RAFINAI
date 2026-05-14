variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "log_analytics_workspace_id" { type = string }
variable "project_name" { type = string }
variable "environment_name" { type = string }
variable "suffix" { type = string }

variable "tags" {
  type    = map(string)
  default = {}
}
