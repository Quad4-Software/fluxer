// SPDX-License-Identifier: AGPL-3.0-or-later

mod compose;
mod config;

use anyhow::Context;
use compose::{
    list_auto_update_services, pull_service, recreate_service, sort_services, wait_for_service,
};
use config::Config;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{info, warn};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env()?;
    if !config.enabled {
        warn!("FLUXER_AUTO_UPDATE_ENABLED is false; exiting");
        return Ok(());
    }

    info!(
        poll_interval_secs = config.poll_interval.as_secs(),
        compose_file = %config.compose_file.display(),
        project = %config.compose_project,
        "fluxer updater started"
    );

    loop {
        if let Err(error) = run_update_cycle(&config).await {
            warn!(%error, "update cycle failed");
        }
        sleep(config.poll_interval).await;
    }
}

async fn run_update_cycle(config: &Config) -> anyhow::Result<()> {
    let services =
        list_auto_update_services(config).context("list services marked for auto-update")?;
    if services.is_empty() {
        warn!("no compose services carry the fluxer.auto_update label");
        return Ok(());
    }

    let ordered = sort_services(services);
    let mut updated = 0usize;

    for service in ordered {
        let pulled = pull_service(config, &service)
            .with_context(|| format!("pull image for service {service}"))?;
        if !pulled {
            continue;
        }

        info!(service, "new image available; recreating container");
        recreate_service(config, &service)
            .with_context(|| format!("recreate service {service}"))?;
        wait_for_service(config, &service, Duration::from_secs(300))
            .await
            .with_context(|| format!("wait for service {service}"))?;
        updated += 1;
    }

    if updated > 0 {
        info!(updated, "update cycle finished");
    } else {
        info!("no image updates available");
    }

    Ok(())
}
