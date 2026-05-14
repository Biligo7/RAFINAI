provider "azurerm" {
  features {
    # Comment out to keep logs after terraform destroy.
    log_analytics_workspace {
      permanently_delete_on_destroy = true
    }
    # Comment out to allow resource group deletion even if it still contains resources.
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
  subscription_id = var.subscription_id
}

provider "azapi" {}
