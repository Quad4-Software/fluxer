// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::common::{CommandSpec, run_command};
use anyhow::{Context, Result, bail};
use clap::Args;
use std::collections::BTreeMap;
use std::env;
use std::path::{Path, PathBuf};

const SELF_HOSTING_DIR: &str = "deploy/self-hosting";

const SHELL_SCRIPTS: &[&str] = &[
    "setup.sh",
    "install.sh",
    "upgrade.sh",
    "backup-data.sh",
    "restore-data.sh",
];

const COMPOSE_FILES: &[&str] = &["docker-compose.yml", "docker-compose.coolify.yml"];

#[derive(Debug, Args)]
pub struct DeployValidationArgs {}

pub fn run(_args: DeployValidationArgs) -> Result<()> {
    run_deploy_validation(&repo_root()?)
}

pub fn run_deploy_validation(root: &Path) -> Result<()> {
    let self_hosting = root.join(SELF_HOSTING_DIR);
    validate_shell_scripts(&self_hosting)?;
    validate_compose_files(&self_hosting)?;
    Ok(())
}

fn validate_shell_scripts(self_hosting: &Path) -> Result<()> {
    for script in SHELL_SCRIPTS {
        let path = self_hosting.join(script);
        if !path.is_file() {
            bail!("missing self-hosting script: {}", path.display());
        }
        run_command(
            CommandSpec::new("bash")
                .args(["-n", path.to_string_lossy().as_ref()])
                .current_dir(self_hosting),
        )
        .with_context(|| format!("bash syntax check failed for {script}"))?;
    }
    Ok(())
}

fn validate_compose_files(self_hosting: &Path) -> Result<()> {
    for compose_file in COMPOSE_FILES {
        let path = self_hosting.join(compose_file);
        if !path.is_file() {
            bail!("missing compose file: {}", path.display());
        }
        let mut spec = CommandSpec::new("docker")
            .args([
                "compose",
                "-f",
                path.to_string_lossy().as_ref(),
                "config",
                "--quiet",
            ])
            .current_dir(self_hosting);
        for (key, value) in compose_validation_env() {
            spec = spec.env(key, value);
        }
        run_command(spec).with_context(|| format!("docker compose config failed for {compose_file}"))?;
    }
    Ok(())
}

fn compose_validation_env() -> BTreeMap<&'static str, &'static str> {
    BTreeMap::from([
        ("FLUXER_DOMAIN", "ci.example.com"),
        ("FLUXER_CADDY_SITE_ADDRESS", "ci.example.com"),
        ("POSTGRES_PASSWORD", "ci-postgres-password"),
        ("MEILI_MASTER_KEY", "ci-meili-master-key"),
        ("FLUXER_S3_ACCESS_KEY", "ci-s3-access-key"),
        ("FLUXER_S3_SECRET_KEY", "ci-s3-secret-key"),
        ("FLUXER_SUDO_MODE_SECRET", "ci-sudo-mode-secret"),
        ("FLUXER_CONNECTION_INITIATION_SECRET", "ci-connection-initiation-secret"),
        ("FLUXER_GATEWAY_RPC_AUTH_TOKEN", "ci-gateway-rpc-auth-token"),
        ("FLUXER_MEDIA_PROXY_SECRET_KEY", "ci-media-proxy-secret-key"),
        (
            "FLUXER_MEDIA_PROXY_UPLOAD_RELAY_SECRET_BASE64",
            "Y2ktdXBsb2FkLXJlbGF5LXNlY3JldA==",
        ),
        ("FLUXER_ADMIN_SECRET_KEY_BASE", "ci-admin-secret-key-base"),
        ("FLUXER_ADMIN_OAUTH_CLIENT_SECRET", "ci-admin-oauth-client-secret"),
        ("FLUXER_VAPID_PUBLIC_KEY", "ci-vapid-public-key"),
        ("FLUXER_VAPID_PRIVATE_KEY", "ci-vapid-private-key"),
        ("FLUXER_CAPTCHA_ALTCHA_HMAC_SECRET", "ci-altcha-hmac-secret"),
        ("LIVEKIT_API_KEY", "fluxer"),
        ("LIVEKIT_API_SECRET", "ci-livekit-api-secret"),
    ])
}

fn repo_root() -> Result<PathBuf> {
    env::var("GITHUB_WORKSPACE")
        .map(PathBuf::from)
        .or_else(|_| env::current_dir())
        .context("Failed to resolve repository root")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn repo_root() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|path| path.parent())
            .expect("repo root")
            .to_path_buf()
    }

    #[test]
    fn compose_validation_env_includes_required_secrets() {
        let env = compose_validation_env();
        for key in [
            "FLUXER_DOMAIN",
            "POSTGRES_PASSWORD",
            "MEILI_MASTER_KEY",
            "FLUXER_CAPTCHA_ALTCHA_HMAC_SECRET",
        ] {
            assert!(env.contains_key(key), "missing env key: {key}");
        }
    }

    #[test]
    fn self_hosting_scripts_exist() {
        let root = repo_root().join(SELF_HOSTING_DIR);
        for script in SHELL_SCRIPTS {
            assert!(
                root.join(script).is_file(),
                "expected script to exist: {script}"
            );
        }
    }

    #[test]
    fn self_hosting_compose_files_exist() {
        let root = repo_root().join(SELF_HOSTING_DIR);
        for compose_file in COMPOSE_FILES {
            assert!(
                root.join(compose_file).is_file(),
                "expected compose file to exist: {compose_file}"
            );
        }
    }
}
