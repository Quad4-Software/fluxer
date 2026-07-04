# SPDX-License-Identifier: AGPL-3.0-or-later
variable "BUILD_VERSION" { default = "" }
variable "BUILD_COMMIT" { default = "" }
variable "PUBLIC_ASSET_BASE_URL" { default = "" }
variable "PUBLIC_FORK_REPO_URL" { default = "https://github.com/Quad4-Software/fluxer" }
variable "FLUXER_APP_PROXY_TIME_FREEZE_ENABLED" { default = "true" }
variable "IMAGE_REPO" { default = "" }
variable "CACHE_FROM" { default = "" }
variable "CACHE_TO" { default = "" }

group "default" {
	targets = ["app-proxy", "app-dist"]
}

target "app-proxy" {
	dockerfile = "fluxer_app_proxy/Dockerfile"
	context    = "."
	platforms  = ["linux/amd64"]
	tags       = IMAGE_REPO != "" ? ["${IMAGE_REPO}:${BUILD_VERSION}"] : []
	output     = ["type=registry"]
	cache-from = CACHE_FROM != "" ? [CACHE_FROM] : []
	cache-to   = CACHE_TO != "" ? [CACHE_TO] : []
	args = {
		BUILD_VERSION                         = BUILD_VERSION
		BUILD_COMMIT                          = BUILD_COMMIT
		PUBLIC_ASSET_BASE_URL                 = PUBLIC_ASSET_BASE_URL
		PUBLIC_FORK_REPO_URL                  = PUBLIC_FORK_REPO_URL
		FLUXER_APP_PROXY_TIME_FREEZE_ENABLED = FLUXER_APP_PROXY_TIME_FREEZE_ENABLED
	}
}

target "app-dist" {
	inherits = ["app-proxy"]
	target   = "app-dist"
	tags     = []
	output   = ["type=local,dest=app-dist-output"]
}
