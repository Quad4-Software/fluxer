// SPDX-License-Identifier: AGPL-3.0-or-later

use super::client::{AdminApiClient, ApiResult};
use super::types::{
    InstanceHealthResponse, InstanceIntegrationTestResponse, InstanceS3IntegrationTestRequest,
};

impl AdminApiClient {
    pub async fn get_instance_health(&self) -> ApiResult<InstanceHealthResponse> {
        self.get("/admin/instance-health", None).await
    }

    pub async fn test_instance_s3_config(
        &self,
        request: &InstanceS3IntegrationTestRequest,
    ) -> ApiResult<InstanceIntegrationTestResponse> {
        self.post_typed("/admin/instance-config/integrations/s3/test", request)
            .await
    }

    pub async fn test_instance_livekit_config(&self) -> ApiResult<InstanceIntegrationTestResponse> {
        self.post_typed(
            "/admin/instance-config/integrations/livekit/test",
            &serde_json::json!({}),
        )
        .await
    }
}
