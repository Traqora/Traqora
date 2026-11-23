# -------------------------------------------------------------------
# External Uptime Probe for Public Endpoints  (Issue #597)
# -------------------------------------------------------------------
# Lightweight HTTP health-check probes that run externally and alert
# via AlertManager when the public API is unreachable.
#
# Requires:
#   - GCP project with Cloud Monitoring API enabled
#   - GOOGLE_CREDENTIALS or Application Default Credentials
#
# Usage:
#   terraform init
#   terraform plan -var="notification_channel_id=<PagerDuty channel>"
#   terraform apply
# -------------------------------------------------------------------

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# -------------------------------------------------------------------
# Variables
# -------------------------------------------------------------------

variable "project_id" {
  description = "GCP project ID for Cloud Monitoring"
  type        = string
}

variable "notification_channel_id" {
  description = "AlertManager / PagerDuty notification channel ID"
  type        = string
}

variable "public_api_base_url" {
  description = "Public API base URL (no trailing slash)"
  type        = string
  default     = "https://api.traqora.io"
}

variable "alert_policy_display_name" {
  description = "Display name for the uptime alert policy"
  type        = string
  default     = "Traqora Public API Uptime"
}

variable "check_period" {
  description = "Seconds between uptime checks (60, 300, 600, or 900)"
  type        = number
  default     = 60
}

# -------------------------------------------------------------------
# Uptime Checks
# -------------------------------------------------------------------

resource "google_monitoring_uptime_check_config" "health" {
  display_name = "Traqora API Health Check"
  timeout      = "10s"
  period       = var.check_period

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
    request_method = "GET"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(var.public_api_base_url, "https://", "")
    }
  }
}

resource "google_monitoring_uptime_check_config" "api_health" {
  display_name = "Traqora API v1 Health Check"
  timeout      = "10s"
  period       = var.check_period

  http_check {
    path         = "/api/v1/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
    request_method = "GET"
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(var.public_api_base_url, "https://", "")
    }
  }
}

resource "google_monitoring_uptime_check_config" "search" {
  display_name = "Traqora Flight Search Endpoint"
  timeout      = "15s"
  period       = var.check_period

  http_check {
    path         = "/api/v1/flights/search"
    port         = 443
    use_ssl      = true
    validate_ssl = true
    request_method = "GET"

    # Flight search should respond within 5 seconds
    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = replace(var.public_api_base_url, "https://", "")
    }
  }
}

# -------------------------------------------------------------------
# Alert Policy
# -------------------------------------------------------------------

resource "google_monitoring_alert_policy" "uptime" {
  display_name = var.alert_policy_display_name
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failed"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\""
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      duration        = "120s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_NEXT_OLDER"
      }

      trigger {
        count = 1
      }
    }
  }

  conditions {
    display_name = "SSL certificate expiring soon"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/ssl_cert_expire_time\" AND resource.type=\"uptime_url\""
      comparison      = "COMPARISON_LT"
      threshold_value = 2592000  # 30 days in seconds
      duration        = "600s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_NEXT_OLDER"
      }

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [var.notification_channel_id]

  alert_strategy {
    auto_close = "1800s"  # Auto-close after 30 minutes
  }
}

# -------------------------------------------------------------------
# Dashboard (Cloud Monitoring)
# -------------------------------------------------------------------

resource "google_monitoring_dashboard" "uptime" {
  dashboard_json = jsonencode({
    displayName = "Traqora — Uptime Overview"
    gridLayout = {
      columns = 2
      widgets = [
        {
          title = "Uptime Check Results (24h)"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\""
                  aggregation = {
                    alignmentPeriod    = "300s"
                    perSeriesAligner   = "ALIGN_NEXT_OLDER"
                    crossSeriesReducer = "REDUCE_MEAN"
                  }
                }
              }
              legendTemplate = "{{display_name}}"
            }]
            timeshiftDuration = "0s"
            yAxis = {
              label = "Check Passed (0/1)"
              scale = "LINEAR"
            }
          }
        },
        {
          title = "Uptime Check Latency (24h)"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"monitoring.googleapis.com/uptime_check/latency\" AND resource.type=\"uptime_url\""
                  aggregation = {
                    alignmentPeriod    = "300s"
                    perSeriesAligner   = "ALIGN_PERCENTILE_95"
                    crossSeriesReducer = "REDUCE_MEAN"
                  }
                }
              }
              legendTemplate = "{{display_name}} p95"
            }]
            timeshiftDuration = "0s"
            yAxis = {
              label = "Latency (ms)"
              scale = "LINEAR"
            }
          }
        }
      ]
    }
  })
}
