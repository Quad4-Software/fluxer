// SPDX-License-Identifier: AGPL-3.0-or-later

use anyhow::{Context, bail};
use std::env;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct Config {
    pub enabled: bool,
    pub poll_interval: Duration,
    pub compose_file: PathBuf,
    pub compose_dir: PathBuf,
    pub compose_project: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let enabled = env_bool("FLUXER_AUTO_UPDATE_ENABLED", true)?;
        let poll_secs = env::var("FLUXER_AUTO_UPDATE_POLL_INTERVAL")
            .unwrap_or_else(|_| "86400".into())
            .parse::<u64>()
            .context("FLUXER_AUTO_UPDATE_POLL_INTERVAL must be a positive integer")?;
        if poll_secs == 0 {
            bail!("FLUXER_AUTO_UPDATE_POLL_INTERVAL must be greater than zero");
        }

        let compose_file = PathBuf::from(
            env::var("FLUXER_COMPOSE_FILE").unwrap_or_else(|_| "/stack/docker-compose.yml".into()),
        );
        let compose_dir = env::var("FLUXER_COMPOSE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| compose_parent_dir(&compose_file));

        Ok(Self {
            enabled,
            poll_interval: Duration::from_secs(poll_secs),
            compose_file,
            compose_dir,
            compose_project: env::var("FLUXER_COMPOSE_PROJECT").unwrap_or_else(|_| "fluxer".into()),
        })
    }
}

fn compose_parent_dir(compose_file: &Path) -> PathBuf {
    compose_file
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("/stack"))
        .to_path_buf()
}

fn env_bool(key: &str, default: bool) -> anyhow::Result<bool> {
    match env::var(key) {
        Ok(value) => match value.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" | "on" => Ok(true),
            "0" | "false" | "no" | "off" => Ok(false),
            other => bail!("{key} must be a boolean, got {other}"),
        },
        Err(_) => Ok(default),
    }
}
