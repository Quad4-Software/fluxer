// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::{
    api::{
        client::{AdminApiClient, ApiResultExt},
        types::{
            BackupMetadata, InstanceConfigResponse, InstanceEmailSmtpTestRequest,
            InstanceHealthResponse, InstanceIntegrationTestResponse,
            InstanceS3IntegrationTestRequest,
        },
    },
    config::AdminConfig,
    middleware::{
        auth::AuthContext,
        csrf::CsrfToken,
        flash::{self, FlashData},
    },
    state::AppState,
    templates,
    utils::forms::MultiValueForm,
};
use axum::{
    Router,
    extract::{Query, Request, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::get,
};
use std::fs;

use super::ActionQuery;

#[derive(Default)]
struct InstanceOpsViewState {
    health: Option<InstanceHealthResponse>,
    backup: Option<BackupMetadata>,
    backup_error: Option<String>,
    instance_config: Option<InstanceConfigResponse>,
    smtp_result: Option<InstanceIntegrationTestResponse>,
    s3_result: Option<InstanceIntegrationTestResponse>,
    livekit_result: Option<InstanceIntegrationTestResponse>,
}

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/instance-ops",
        get(instance_ops_page).post(instance_ops_post),
    )
}

async fn instance_ops_page(
    State(state): State<AppState>,
    auth: axum::Extension<AuthContext>,
    csrf: axum::Extension<CsrfToken>,
) -> Response {
    let config = state.config();
    if !config.self_hosted {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    }
    let view = load_instance_ops_state(&state, &auth.0).await;
    render_instance_ops_page(config, &auth.0, &csrf.0.0, &view)
}

async fn instance_ops_post(
    State(state): State<AppState>,
    auth: axum::Extension<AuthContext>,
    csrf: axum::Extension<CsrfToken>,
    Query(action_query): Query<ActionQuery>,
    request: Request,
) -> Response {
    let config = state.config();
    let base = &config.base_path;
    if !config.self_hosted {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    }

    let action = action_query.action.as_deref().unwrap_or("");
    let client = AdminApiClient::new(state.http_client(), config, &auth.0.session);
    let mut view = load_instance_ops_state(&state, &auth.0).await;

    match action {
        "refresh_health" => {
            view.health = client
                .get_instance_health()
                .await
                .log_error("refresh instance health");
        }
        "test_smtp" => {
            let form = match MultiValueForm::from_request(request).await {
                Some(form) => form,
                None => {
                    return flash::redirect_with_flash(
                        &format!("{base}/instance-ops"),
                        FlashData::error("Invalid form data"),
                        config.is_production(),
                    );
                }
            };
            match build_smtp_test_request(&form) {
                Ok(request) => {
                    view.smtp_result =
                        client
                            .test_instance_smtp_config(&request)
                            .await
                            .ok()
                            .map(|response| InstanceIntegrationTestResponse {
                                ok: response.ok,
                                error: response.error,
                                detail: None,
                            });
                }
                Err(message) => {
                    return flash::redirect_with_flash(
                        &format!("{base}/instance-ops"),
                        FlashData::error(message),
                        config.is_production(),
                    );
                }
            }
        }
        "test_s3" => {
            view.s3_result = client
                .test_instance_s3_config(&InstanceS3IntegrationTestRequest { bucket: None })
                .await
                .log_error("test S3 config");
        }
        "test_livekit" => {
            view.livekit_result = client
                .test_instance_livekit_config()
                .await
                .log_error("test LiveKit config");
        }
        _ => {}
    }

    render_instance_ops_page(config, &auth.0, &csrf.0.0, &view)
}

async fn load_instance_ops_state(state: &AppState, auth: &AuthContext) -> InstanceOpsViewState {
    let config = state.config();
    let client = AdminApiClient::new(state.http_client(), config, &auth.session);
    let (backup, backup_error) = read_backup_metadata(config);
    InstanceOpsViewState {
        health: client
            .get_instance_health()
            .await
            .log_error("load instance health"),
        backup,
        backup_error,
        instance_config: client
            .get_instance_config()
            .await
            .log_error("load instance config for ops page"),
        ..InstanceOpsViewState::default()
    }
}

fn read_backup_metadata(config: &AdminConfig) -> (Option<BackupMetadata>, Option<String>) {
    let Some(path) = config.backup_meta_path.as_deref() else {
        return (None, None);
    };
    match fs::read_to_string(path) {
        Ok(contents) => match serde_json::from_str::<BackupMetadata>(&contents) {
            Ok(metadata) => (Some(metadata), None),
            Err(error) => (
                None,
                Some(format!("Failed to parse backup metadata: {error}")),
            ),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (None, None),
        Err(error) => (
            None,
            Some(format!("Could not read backup metadata at {path}: {error}")),
        ),
    }
}

fn render_instance_ops_page(
    config: &AdminConfig,
    auth: &AuthContext,
    csrf_token: &str,
    view: &InstanceOpsViewState,
) -> Response {
    let markup = templates::pages::instance_ops::instance_ops_page(
        config,
        auth,
        &templates::pages::instance_ops::InstanceOpsPageParams {
            csrf_token,
            health: view.health.as_ref(),
            backup: view.backup.as_ref(),
            backup_error: view.backup_error.as_deref(),
            smtp_config: view
                .instance_config
                .as_ref()
                .map(|config| &config.integrations.email),
            smtp_result: view.smtp_result.as_ref(),
            s3_result: view.s3_result.as_ref(),
            livekit_result: view.livekit_result.as_ref(),
        },
    );
    Html(markup.into_string()).into_response()
}

fn build_smtp_test_request(form: &MultiValueForm) -> Result<InstanceEmailSmtpTestRequest, String> {
    let host = form
        .clean("smtp_host")
        .ok_or_else(|| "SMTP host is required".to_owned())?;
    let port = form
        .first("smtp_port")
        .and_then(|value| value.trim().parse::<u16>().ok())
        .ok_or_else(|| "SMTP port must be between 1 and 65535".to_owned())?;
    let username = form
        .clean("smtp_username")
        .ok_or_else(|| "SMTP username is required".to_owned())?;
    let password = form
        .clean("smtp_password")
        .ok_or_else(|| "SMTP password is required for validation".to_owned())?;
    Ok(InstanceEmailSmtpTestRequest {
        host,
        port,
        username,
        password,
        secure: form.bool_value("smtp_secure"),
    })
}
