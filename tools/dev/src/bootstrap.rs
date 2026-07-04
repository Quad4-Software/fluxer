// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::desktop::install_desktop;
use crate::gateway::setup_gateway_config;
use crate::paths::{ensure_state_dirs, ensure_writable_dev_paths, which};
use crate::proc::{PNPM_INSTALL_ENV, RunOptions, run_capture, run_command, wait_http, wait_tcp};
use crate::smoke::{bootstrap_schema_and_object_store, run_smoke, wait_s3_api};
use anyhow::{Result, bail};
use std::process::Output;

const REQUIRED_PNPM_MAJOR: &str = "11";

pub async fn bootstrap(skip_install: bool, skip_desktop_install: bool) -> Result<()> {
    ensure_state_dirs()?;
    ensure_writable_dev_paths()?;
    if !skip_install {
        ensure_pnpm_toolchain()?;
        run_command(
            &["pnpm", "install", "--frozen-lockfile"],
            RunOptions {
                env: PNPM_INSTALL_ENV
                    .iter()
                    .map(|(key, value)| ((*key).to_owned(), Some((*value).to_owned())))
                    .collect(),
                ..RunOptions::default()
            },
        )?;
        if !skip_desktop_install {
            install_desktop()?;
        }
    }
    setup_gateway_config()?;
    wait_core_infra().await?;
    bootstrap_schema_and_object_store().await?;
    run_smoke(false, false).await?;
    println!("Fluxer dev bootstrap complete.");
    Ok(())
}

pub async fn post_start() -> Result<()> {
    ensure_state_dirs()?;
    ensure_writable_dev_paths()?;
    setup_gateway_config()?;
    run_smoke(true, false).await
}

pub async fn wait_core_infra() -> Result<()> {
    wait_tcp("Valkey", "valkey", 6379, 120).await?;
    wait_tcp("NATS", "nats", 4222, 120).await?;
    wait_tcp("LiveKit", "livekit", 7880, 120).await?;
    crate::media_proxy::ensure_dev_object_store(true, 120).await?;
    wait_tcp("SeaweedFS S3", "127.0.0.1", 8333, 120).await?;
    wait_http(
        "SeaweedFS master",
        "http://127.0.0.1:9333/cluster/status",
        120,
    )
    .await?;
    wait_s3_api(120).await
}

fn command_output_text(output: &Output) -> String {
    let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    text
}

fn pnpm_major_version() -> Option<String> {
    let output = run_capture(&["pnpm", "--version"], Vec::new(), false).ok()?;
    if !output.status.success() {
        return None;
    }
    let version = command_output_text(&output).trim().to_owned();
    version.split('.').next().map(str::to_owned)
}

fn ensure_pnpm_toolchain() -> Result<()> {
    if pnpm_major_version().as_deref() == Some(REQUIRED_PNPM_MAJOR) {
        println!("Using existing pnpm {REQUIRED_PNPM_MAJOR}.x installation");
        return Ok(());
    }

    if which("corepack").is_none() {
        bail!(
            "pnpm {REQUIRED_PNPM_MAJOR}.x is required but was not found on PATH, and corepack is not installed. \
Install pnpm (for example via your package manager) or install corepack, then re-run bootstrap."
        );
    }

    let enable = run_capture(&["corepack", "enable"], Vec::new(), false)?;
    if !enable.status.success() {
        let details = command_output_text(&enable).trim().to_owned();
        if pnpm_major_version().as_deref() == Some(REQUIRED_PNPM_MAJOR) {
            println!("corepack enable failed; continuing with existing pnpm installation");
            return Ok(());
        }
        bail!(
            "corepack enable failed and pnpm {REQUIRED_PNPM_MAJOR}.x is not available.\n\
{details}\n\
On Arch Linux, either run `sudo corepack enable` once or install pnpm from your package manager, \
then re-run `task bootstrap -- --skip-install` if dependencies are already installed."
        );
    }

    run_command(
        &["corepack", "prepare", "pnpm@11.9.0", "--activate"],
        RunOptions::default(),
    )?;

    if pnpm_major_version().as_deref() != Some(REQUIRED_PNPM_MAJOR) {
        bail!(
            "corepack setup completed but pnpm {REQUIRED_PNPM_MAJOR}.x is still not available on PATH"
        );
    }

    Ok(())
}
