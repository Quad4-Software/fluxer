// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::config::Config;
use anyhow::{Context, bail};
use serde_json::Value;
use std::process::Command;
use std::time::{Duration, Instant};
use tokio::time::sleep;
use tracing::{debug, info, warn};

const ROLLING_RESTART_ORDER: &[&str] = &[
    "snowflakes-shard",
    "users-shard",
    "messages-shard",
    "gifs-shard",
    "unfurl-shard",
    "snowflakes",
    "users",
    "messages",
    "gifs",
    "unfurl",
    "static-proxy",
    "media-proxy",
    "gateway",
    "api",
    "worker",
    "admin",
    "app-proxy",
];

pub fn list_auto_update_services(config: &Config) -> anyhow::Result<Vec<String>> {
    let output = run_compose(config, &["config", "--format", "json"])?;
    if !output.status.success() {
        bail!(
            "docker compose config failed: {}",
            stderr_or_stdout(&output)
        );
    }

    let parsed: Value = serde_json::from_slice(&output.stdout).context("parse compose config")?;
    let services = parsed
        .get("services")
        .and_then(Value::as_object)
        .context("compose config missing services")?;

    let mut names = Vec::new();
    for (name, spec) in services {
        if service_auto_update_enabled(spec) {
            names.push(name.clone());
        }
    }
    names.sort();
    Ok(names)
}

pub fn sort_services(mut services: Vec<String>) -> Vec<String> {
    let rank = |name: &str| -> usize {
        ROLLING_RESTART_ORDER
            .iter()
            .position(|candidate| *candidate == name)
            .unwrap_or(ROLLING_RESTART_ORDER.len())
    };
    services.sort_by_key(|name| (rank(name), name.clone()));
    services
}

pub fn pull_service(config: &Config, service: &str) -> anyhow::Result<bool> {
    let image = service_image(config, service)?;
    let before = local_image_id(&image)?;
    debug!(service, image, before = before.as_deref().unwrap_or("none"), "checking image");

    let output = run_compose(config, &["pull", service])?;
    if !output.status.success() {
        bail!(
            "docker compose pull {service} failed: {}",
            stderr_or_stdout(&output)
        );
    }

    let after = local_image_id(&image)?;
    let updated = before != after;
    if updated {
        info!(service, image, "pulled newer image");
    } else {
        debug!(service, image, "image already current");
    }
    Ok(updated)
}

pub fn recreate_service(config: &Config, service: &str) -> anyhow::Result<()> {
    let output = run_compose(
        config,
        &["up", "-d", "--no-deps", "--force-recreate", "--remove-orphans", service],
    )?;
    if !output.status.success() {
        bail!(
            "docker compose up for {service} failed: {}",
            stderr_or_stdout(&output)
        );
    }
    Ok(())
}

pub async fn wait_for_service(
    config: &Config,
    service: &str,
    timeout: Duration,
) -> anyhow::Result<()> {
    let deadline = Instant::now() + timeout;
    loop {
        match service_health(config, service)? {
            ServiceHealth::Healthy => return Ok(()),
            ServiceHealth::NoHealthcheck => {
                sleep(Duration::from_secs(5)).await;
                return Ok(());
            }
            ServiceHealth::Starting | ServiceHealth::Unknown => {
                if Instant::now() >= deadline {
                    bail!("timed out waiting for {service} to become healthy");
                }
                sleep(Duration::from_secs(5)).await;
            }
            ServiceHealth::Unhealthy => {
                warn!(service, "service reported unhealthy after recreate");
                return Ok(());
            }
        }
    }
}

enum ServiceHealth {
    Healthy,
    Starting,
    Unhealthy,
    NoHealthcheck,
    Unknown,
}

fn service_health(config: &Config, service: &str) -> anyhow::Result<ServiceHealth> {
    let output = run_compose(config, &["ps", "--format", "json", service])?;
    if !output.status.success() {
        bail!(
            "docker compose ps for {service} failed: {}",
            stderr_or_stdout(&output)
        );
    }

    let line = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if line.is_empty() {
        return Ok(ServiceHealth::Unknown);
    }

    let value: Value = serde_json::from_str(&line).context("parse docker compose ps json")?;
    let Some(state) = value.get("State").and_then(Value::as_str) else {
        return Ok(ServiceHealth::Unknown);
    };
    if state != "running" {
        return Ok(ServiceHealth::Starting);
    }

    match value.get("Health").and_then(Value::as_str) {
        None | Some("") => Ok(ServiceHealth::NoHealthcheck),
        Some("healthy") => Ok(ServiceHealth::Healthy),
        Some("starting") => Ok(ServiceHealth::Starting),
        Some("unhealthy") => Ok(ServiceHealth::Unhealthy),
        Some(_) => Ok(ServiceHealth::Unknown),
    }
}

fn service_image(config: &Config, service: &str) -> anyhow::Result<String> {
    let output = run_compose(config, &["config", "--format", "json"])?;
    if !output.status.success() {
        bail!(
            "docker compose config failed: {}",
            stderr_or_stdout(&output)
        );
    }

    let parsed: Value = serde_json::from_slice(&output.stdout).context("parse compose config")?;
    let image = parsed
        .pointer(&format!("/services/{service}/image"))
        .and_then(Value::as_str)
        .with_context(|| format!("service {service} has no image in compose config"))?;
    Ok(image.to_string())
}

fn service_auto_update_enabled(spec: &Value) -> bool {
    let Some(labels) = spec.get("labels").and_then(Value::as_object) else {
        return false;
    };
    label_is_true(labels, "fluxer.auto_update")
}

fn label_is_true(labels: &serde_json::Map<String, Value>, key: &str) -> bool {
    labels
        .get(key)
        .and_then(Value::as_str)
        .is_some_and(|value| matches!(value.trim().to_ascii_lowercase().as_str(), "true" | "1" | "yes"))
}

fn local_image_id(image: &str) -> anyhow::Result<Option<String>> {
    let output = Command::new("docker")
        .args(["image", "inspect", image, "--format", "{{.Id}}"])
        .output()
        .context("run docker image inspect")?;
    if output.status.success() {
        let id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok((!id.is_empty()).then_some(id));
    }
    if String::from_utf8_lossy(&output.stderr).contains("No such image") {
        return Ok(None);
    }
    bail!(
        "docker image inspect failed for {image}: {}",
        stderr_or_stdout(&output)
    );
}

fn run_compose(config: &Config, args: &[&str]) -> anyhow::Result<std::process::Output> {
    let mut command = Command::new("docker");
    command.arg("compose");
    command.arg("-f").arg(&config.compose_file);
    command.arg("--project-directory").arg(&config.compose_dir);
    command.arg("-p").arg(&config.compose_project);
    command.args(args);
    command
        .output()
        .with_context(|| format!("run docker compose {}", args.join(" ")))
}

fn stderr_or_stdout(output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stderr.is_empty() {
        return stderr;
    }
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}
