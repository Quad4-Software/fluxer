# SPDX-License-Identifier: AGPL-3.0-or-later

FROM python:3.13-alpine AS builder

WORKDIR /src

COPY fluxer_docs/requirements.txt fluxer_docs/requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
	&& python -m pip install --no-cache-dir -r fluxer_docs/requirements.txt

COPY fluxer_docs/zensical.toml fluxer_docs/zensical.toml
COPY fluxer_docs/docs fluxer_docs/docs
COPY fluxer_docs/scripts fluxer_docs/scripts
COPY fluxer_static/fonts fluxer_docs/docs/assets/fonts

WORKDIR /src/fluxer_docs
RUN zensical build --clean \
	&& python scripts/write_csp_header.py site /tmp/security-headers.conf

FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime

COPY fluxer_docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /tmp/security-headers.conf /etc/nginx/conf.d/security-headers.conf
COPY --from=builder /src/fluxer_docs/site /usr/share/nginx/html

EXPOSE 8080
