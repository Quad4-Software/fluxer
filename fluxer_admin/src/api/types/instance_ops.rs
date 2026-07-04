// SPDX-License-Identifier: AGPL-3.0-or-later

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
pub struct InstanceServiceHealthStatus {
    pub name: String,
    pub ok: bool,
    pub latency_ms: Option<i64>,
    pub detail: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct InstanceHealthResponse {
    pub checked_at: String,
    pub services: Vec<InstanceServiceHealthStatus>,
    pub active_jobs: InstanceActiveJobsSummary,
}

#[derive(Clone, Debug, Deserialize)]
pub struct InstanceActiveJobsSummary {
    pub queued: u32,
    pub running: u32,
}

#[derive(Clone, Debug, Deserialize)]
pub struct InstanceIntegrationTestResponse {
    pub ok: bool,
    pub error: Option<String>,
    pub detail: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct InstanceS3IntegrationTestRequest {
    pub bucket: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct BackupMetadata {
    pub timestamp: String,
    pub success: bool,
    pub backup_dir: String,
    pub size_bytes: u64,
    pub components: BackupMetadataComponents,
}

#[derive(Clone, Debug, Deserialize)]
pub struct BackupMetadataComponents {
    pub postgres: BackupComponentStatus,
    pub s3: BackupS3ComponentStatus,
}

#[derive(Clone, Debug, Deserialize)]
pub struct BackupComponentStatus {
    pub success: bool,
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct BackupS3ComponentStatus {
    pub success: bool,
    pub buckets: Vec<String>,
    pub path: String,
    pub size_bytes: u64,
}
