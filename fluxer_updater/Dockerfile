# SPDX-License-Identifier: AGPL-3.0-or-later

FROM rust:1-bookworm AS builder

WORKDIR /usr/src/app

COPY . .

RUN cargo build --release -p fluxer-updater

FROM docker:27.5.1-cli@sha256:851f91d241214e7c6db86513b270d58776379aacc5eb9c4a87e5b47115e3065c

ARG BUILD_VERSION=""

WORKDIR /usr/local/bin

COPY --from=builder /usr/src/app/target/release/fluxer-updater /usr/local/bin/fluxer-updater

ENV BUILD_VERSION="${BUILD_VERSION}"

ENTRYPOINT ["/usr/local/bin/fluxer-updater"]
