// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::{
    api::types::{
        BackupMetadata, InstanceEmailIntegrationResponse, InstanceHealthResponse,
        InstanceIntegrationTestResponse,
    },
    config::AdminConfig,
    middleware::auth::AuthContext,
    templates::{
        components::{
            badge::{BadgeVariant, badge},
            form::csrf_input,
            page_container::page_header,
            section_card::section_card_simple,
        },
        layout::admin_layout,
    },
};
use maud::{Markup, html};

pub struct InstanceOpsPageParams<'a> {
    pub csrf_token: &'a str,
    pub health: Option<&'a InstanceHealthResponse>,
    pub backup: Option<&'a BackupMetadata>,
    pub backup_error: Option<&'a str>,
    pub smtp_config: Option<&'a InstanceEmailIntegrationResponse>,
    pub smtp_result: Option<&'a InstanceIntegrationTestResponse>,
    pub s3_result: Option<&'a InstanceIntegrationTestResponse>,
    pub livekit_result: Option<&'a InstanceIntegrationTestResponse>,
}

pub fn instance_ops_page(
    config: &AdminConfig,
    auth: &AuthContext,
    params: &InstanceOpsPageParams<'_>,
) -> Markup {
    let base = &config.base_path;
    let content = html! {
        (page_header(
            "Instance Operations",
            Some("Health checks, integration tests, and backup status for self-hosted deployments"),
        ))
        div class="space-y-6" {
            (health_section(base, params.csrf_token, params.health))
            (backup_section(params.backup, params.backup_error))
            (integration_tests_section(base, params.csrf_token, params.smtp_config, params.smtp_result, params.s3_result, params.livekit_result))
        }
    };
    admin_layout(config, auth, "Instance Operations", "instance-ops", None, content)
}

fn health_section(base: &str, csrf_token: &str, health: Option<&InstanceHealthResponse>) -> Markup {
    section_card_simple(
        "Service health",
        html! {
            @match health {
                Some(health) => {
                    p class="text-sm text-neutral-500 mb-4" {
                        "Last checked: " (health.checked_at)
                    }
                    div class="overflow-x-auto" {
                        table class="min-w-full divide-y divide-neutral-200 text-sm" {
                            thead {
                                tr {
                                    th class="px-3 py-2 text-left font-medium text-neutral-500" { "Service" }
                                    th class="px-3 py-2 text-left font-medium text-neutral-500" { "Status" }
                                    th class="px-3 py-2 text-left font-medium text-neutral-500" { "Latency" }
                                    th class="px-3 py-2 text-left font-medium text-neutral-500" { "Detail" }
                                }
                            }
                            tbody class="divide-y divide-neutral-100" {
                                @for service in &health.services {
                                    tr {
                                        td class="px-3 py-2 font-medium text-neutral-900" { (service.name) }
                                        td class="px-3 py-2" {
                                            @if service.ok {
                                                (badge("Healthy", BadgeVariant::Success))
                                            } @else {
                                                (badge("Unhealthy", BadgeVariant::Danger))
                                            }
                                        }
                                        td class="px-3 py-2 text-neutral-600" {
                                            @match service.latency_ms {
                                                Some(ms) => { (ms) " ms" }
                                                None => { "-" }
                                            }
                                        }
                                        td class="px-3 py-2 text-neutral-600" {
                                            (service.detail.as_deref().unwrap_or("-"))
                                        }
                                    }
                                }
                            }
                        }
                    }
                    p class="text-sm text-neutral-500 mt-4" {
                        "Active jobs: " (health.active_jobs.running) " running, "
                        (health.active_jobs.queued) " queued"
                    }
                }
                None => {
                    p class="text-sm text-neutral-500" {
                        "Could not load instance health from the API."
                    }
                }
            }
            form method="post" action={(base) "/instance-ops?action=refresh_health"} class="mt-4" {
                (csrf_input(csrf_token))
                button type="submit"
                    class="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-400 hover:text-neutral-900" {
                    "Refresh health"
                }
            }
        },
    )
}

fn backup_section(backup: Option<&BackupMetadata>, backup_error: Option<&str>) -> Markup {
    section_card_simple(
        "Data backup",
        html! {
            p class="text-sm text-neutral-500 mb-4" {
                "Shows metadata from the latest ./backup-data.sh run on the host."
            }
            @if let Some(error) = backup_error {
                p class="text-sm text-red-600 mb-3" { (error) }
            }
            @match backup {
                Some(backup) => {
                    div class="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm" {
                        div {
                            span class="text-neutral-500" { "Timestamp" }
                            div class="font-medium text-neutral-900" { (backup.timestamp) }
                        }
                        div {
                            span class="text-neutral-500" { "Status" }
                            div {
                                @if backup.success {
                                    (badge("Success", BadgeVariant::Success))
                                } @else {
                                    (badge("Failed", BadgeVariant::Danger))
                                }
                            }
                        }
                        div {
                            span class="text-neutral-500" { "Directory" }
                            div class="font-medium text-neutral-900 break-all" { (backup.backup_dir) }
                        }
                        div {
                            span class="text-neutral-500" { "Total size" }
                            div class="font-medium text-neutral-900" { (format_bytes(backup.size_bytes)) }
                        }
                    }
                    p class="text-sm text-neutral-500 mt-4" {
                        "Postgres: "
                        @if backup.components.postgres.success { "ok" } @else { "failed" }
                        " (" (format_bytes(backup.components.postgres.size_bytes)) "); "
                        "S3: "
                        @if backup.components.s3.success { "ok" } @else { "failed" }
                        " (" (format_bytes(backup.components.s3.size_bytes)) ")"
                    }
                }
                None if backup_error.is_none() => {
                    p class="text-sm text-neutral-500" {
                        "No backup metadata found. Run ./backup-data.sh on the host."
                    }
                }
                None => {}
            }
        },
    )
}

fn integration_tests_section(
    base: &str,
    csrf_token: &str,
    smtp_config: Option<&InstanceEmailIntegrationResponse>,
    smtp_result: Option<&InstanceIntegrationTestResponse>,
    s3_result: Option<&InstanceIntegrationTestResponse>,
    livekit_result: Option<&InstanceIntegrationTestResponse>,
) -> Markup {
    section_card_simple(
        "Integration tests",
        html! {
            p class="text-sm text-neutral-500 mb-4" {
                "Run connectivity checks against configured integrations."
            }
            div class="space-y-4" {
                div class="rounded-lg border border-neutral-200 p-4" {
                    h3 class="text-sm font-semibold text-neutral-900 mb-2" { "SMTP" }
                    p class="text-sm text-neutral-500 mb-3" {
                        "Uses the SMTP settings saved in Instance Config."
                    }
                    (integration_result(smtp_result))
                    form method="post" action={(base) "/instance-ops?action=test_smtp"} class="space-y-3" {
                        (csrf_input(csrf_token))
                        div class="grid grid-cols-1 gap-3 sm:grid-cols-2" {
                            input type="text" name="smtp_host" required
                                value=[smtp_config.and_then(|config| config.smtp.host.as_deref())]
                                placeholder="smtp.example.com"
                                class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
                            input type="number" name="smtp_port" required min="1" max="65535"
                                value=[smtp_config.and_then(|config| config.smtp.port.map(|port| port.to_string()))]
                                placeholder="587"
                                class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
                            input type="text" name="smtp_username" required
                                value=[smtp_config.and_then(|config| config.smtp.username.as_deref())]
                                placeholder="user@example.com"
                                class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
                            input type="password" name="smtp_password" required
                                placeholder="SMTP password"
                                class="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
                        }
                        label class="inline-flex items-center gap-2 text-sm text-neutral-700" {
                            input type="checkbox" name="smtp_secure" value="true"
                                checked[smtp_config
                                    .map(|config| config.smtp.secure.unwrap_or(true))
                                    .unwrap_or(true)];
                            "Use TLS"
                        }
                        button type="submit"
                            class="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-400 hover:text-neutral-900" {
                            "Test SMTP connection"
                        }
                    }
                }
                div class="rounded-lg border border-neutral-200 p-4" {
                    h3 class="text-sm font-semibold text-neutral-900 mb-2" { "S3 storage" }
                    p class="text-sm text-neutral-500 mb-3" {
                        "Uploads and deletes a small probe object in the uploads bucket."
                    }
                    (integration_result(s3_result))
                    form method="post" action={(base) "/instance-ops?action=test_s3"} {
                        (csrf_input(csrf_token))
                        button type="submit"
                            class="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-400 hover:text-neutral-900" {
                            "Test S3 upload"
                        }
                    }
                }
                div class="rounded-lg border border-neutral-200 p-4" {
                    h3 class="text-sm font-semibold text-neutral-900 mb-2" { "LiveKit" }
                    p class="text-sm text-neutral-500 mb-3" {
                        "Verifies API credentials by listing rooms on configured voice servers."
                    }
                    (integration_result(livekit_result))
                    form method="post" action={(base) "/instance-ops?action=test_livekit"} {
                        (csrf_input(csrf_token))
                        button type="submit"
                            class="inline-flex items-center justify-center rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-400 hover:text-neutral-900" {
                            "Test LiveKit connectivity"
                        }
                    }
                }
            }
        },
    )
}

fn integration_result(result: Option<&InstanceIntegrationTestResponse>) -> Markup {
    html! {
        @if let Some(result) = result {
            div class="mb-3" {
                @if result.ok {
                    (badge("Passed", BadgeVariant::Success))
                } @else {
                    (badge("Failed", BadgeVariant::Danger))
                }
                @if let Some(detail) = result.detail.as_deref() {
                    p class="text-sm text-neutral-600 mt-2" { (detail) }
                }
                @if let Some(error) = result.error.as_deref() {
                    @if !result.ok {
                        p class="text-sm text-red-600 mt-2" { (error) }
                    }
                }
            }
        }
    }
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{bytes} B")
    }
}
