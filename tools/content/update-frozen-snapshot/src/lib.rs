// SPDX-License-Identifier: AGPL-3.0-or-later

use anyhow::{Context, Result, bail};
use base64::Engine;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

const FROZEN_CONST_SUFFIXES: &[(&str, &str)] = &[
    ("STABLE_SNAPSHOT_SHA", "CANARY_SNAPSHOT_SHA"),
    ("STABLE_INDEX_HTML", "CANARY_INDEX_HTML"),
    ("STABLE_SW_JS", "CANARY_SW_JS"),
    ("STABLE_VERSION_JSON", "CANARY_VERSION_JSON"),
];

pub fn promote_stable_from_canary(frozen_snapshots_path: &Path) -> Result<()> {
    let content = fs::read_to_string(frozen_snapshots_path)
        .with_context(|| format!("failed to read {}", frozen_snapshots_path.display()))?;
    let updated = promote_stable_from_canary_source(&content)?;
    if updated == content {
        bail!("stable snapshot already matches canary; no changes written");
    }
    fs::write(frozen_snapshots_path, updated)
        .with_context(|| format!("failed to write {}", frozen_snapshots_path.display()))?;
    Ok(())
}

fn promote_stable_from_canary_source(content: &str) -> Result<String> {
    let mut updated = content.to_owned();
    for (stable_name, canary_name) in FROZEN_CONST_SUFFIXES {
        let canary_block = extract_const_block(content, canary_name)
            .with_context(|| format!("missing canary block {canary_name}"))?;
        let stable_block = extract_const_block(&updated, stable_name)
            .with_context(|| format!("missing stable block {stable_name}"))?;
        let replacement = canary_block.replacen(canary_name, stable_name, 1);
        if !updated.contains(&stable_block) {
            bail!("stable block {stable_name} disappeared while promoting");
        }
        updated = updated.replacen(&stable_block, &replacement, 1);
    }
    Ok(updated)
}

fn extract_const_block(content: &str, const_name: &str) -> Result<String> {
    let marker = format!("const {const_name}:");
    let start = content
        .find(&marker)
        .with_context(|| format!("could not find {marker}"))?;
    let after_marker = &content[start..];
    let end = after_marker
        .find("\";\n")
        .or_else(|| after_marker.find("\";\r\n"))
        .with_context(|| format!("could not find end of {const_name} block"))?;
    Ok(after_marker[..end + 3].to_owned())
}

pub fn generate_snapshot_source(static_dir: &Path) -> Result<String> {
    if !static_dir.is_dir() {
        bail!("{} is not a directory", static_dir.display());
    }

    let index_html = read_file(&static_dir.join("index.html"))?;
    let sw_js = read_file(&static_dir.join("sw.js"))?;
    let version_json = read_file(&static_dir.join("version.json"))?;
    let sha = snapshot_sha(&index_html, &sw_js, &version_json);

    let mut output = String::new();
    output.push_str(&format!("const SNAPSHOT_SHA: &str = \"{sha}\";\n\n"));
    output.push_str(&format!(
        "// -- base64-encoded index.html ({} bytes) --\n",
        index_html.len()
    ));
    output.push_str(&format_const(
        "STABLE_INDEX_HTML",
        &base64_standard(&index_html),
    ));
    output.push_str(&format!(
        "// -- base64-encoded sw.js ({} bytes) --\n",
        sw_js.len()
    ));
    output.push_str(&format_const("STABLE_SW_JS", &base64_standard(&sw_js)));
    output.push_str(&format!(
        "// -- base64-encoded version.json ({} bytes) --\n",
        version_json.len()
    ));
    output.push_str(&format_const(
        "STABLE_VERSION_JSON",
        &base64_standard(&version_json),
    ));

    Ok(output)
}

fn read_file(path: &Path) -> Result<Vec<u8>> {
    if !path.exists() {
        bail!("{} does not exist", path.display());
    }
    fs::read(path).with_context(|| format!("failed to read {}", path.display()))
}

fn snapshot_sha(index_html: &[u8], sw_js: &[u8], version_json: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(index_html);
    hasher.update(sw_js);
    hasher.update(version_json);
    bytes_to_lower_hex(&hasher.finalize())
}

fn bytes_to_lower_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn base64_standard(data: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(data)
}

fn break_lines(value: &str, width: usize) -> Vec<&str> {
    value
        .as_bytes()
        .chunks(width)
        .map(|chunk| std::str::from_utf8(chunk).expect("base64 should be ascii"))
        .collect()
}

fn format_const(name: &str, data: &str) -> String {
    let escaped = break_lines(data, 100).join("\\\n");
    format!("const {name}: &str = \"\\\n{escaped}\\\n\";\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn emits_snapshot_constants_with_combined_sha() {
        let dir = tempdir().unwrap();
        let index_html = b"<!doctype html><html><body>fixture</body></html>";
        let sw_js = b"\"use strict\";\nself.addEventListener('install', () => {});\n";
        let version_json = br#"{"sha":"fixture","buildNumber":7}"#;
        fs::write(dir.path().join("index.html"), index_html).unwrap();
        fs::write(dir.path().join("sw.js"), sw_js).unwrap();
        fs::write(dir.path().join("version.json"), version_json).unwrap();

        let output = generate_snapshot_source(dir.path()).unwrap();
        let expected_sha = snapshot_sha(index_html, sw_js, version_json);

        assert!(output.starts_with(&format!(
            "const SNAPSHOT_SHA: &str = \"{expected_sha}\";\n\n"
        )));
        assert!(output.contains("// -- base64-encoded index.html (48 bytes) --"));
        assert!(output.contains("// -- base64-encoded sw.js (58 bytes) --"));
        assert!(output.contains("// -- base64-encoded version.json (33 bytes) --"));
        assert!(output.contains(&format_const(
            "STABLE_INDEX_HTML",
            &base64_standard(index_html)
        )));
        assert!(output.contains(&format_const("STABLE_SW_JS", &base64_standard(sw_js))));
        assert!(output.contains(&format_const(
            "STABLE_VERSION_JSON",
            &base64_standard(version_json)
        )));
    }

    #[test]
    fn wraps_base64_constants_at_100_columns() {
        let data = "a".repeat(205);
        let formatted = format_const("TEST", &data);
        let lines = formatted.lines().collect::<Vec<_>>();

        assert_eq!(lines[0], "const TEST: &str = \"\\");
        assert_eq!(lines[1], format!("{}\\", "a".repeat(100)));
        assert_eq!(lines[2], format!("{}\\", "a".repeat(100)));
        assert_eq!(lines[3], format!("{}\\", "a".repeat(5)));
        assert_eq!(lines[4], "\";");
    }

    #[test]
    fn reports_non_directory_static_path() {
        let dir = tempdir().unwrap();
        let err = generate_snapshot_source(&dir.path().join("missing"))
            .unwrap_err()
            .to_string();

        assert!(err.contains("missing is not a directory"));
    }

    #[test]
    fn reports_missing_required_file() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("index.html"), b"index").unwrap();

        let err = generate_snapshot_source(dir.path())
            .unwrap_err()
            .to_string();

        assert!(err.contains("sw.js does not exist"));
    }

    #[test]
    fn promote_stable_from_canary_copies_canary_blocks() {
        let source = "\
const STABLE_SNAPSHOT_SHA: &str = \"old-stable\";\n\
const CANARY_SNAPSHOT_SHA: &str = \"new-canary\";\n\
const STABLE_INDEX_HTML: &str = \"\\\nold\\\n\";\n\
const CANARY_INDEX_HTML: &str = \"\\\ncanary\\\n\";\n\
const STABLE_SW_JS: &str = \"\\\nold-sw\\\n\";\n\
const CANARY_SW_JS: &str = \"\\\ncanary-sw\\\n\";\n\
const STABLE_VERSION_JSON: &str = \"\\\nold-version\\\n\";\n\
const CANARY_VERSION_JSON: &str = \"\\\ncanary-version\\\n\";\n";
        let promoted = promote_stable_from_canary_source(source).unwrap();
        assert!(promoted.contains("const STABLE_SNAPSHOT_SHA: &str = \"new-canary\";"));
        assert!(promoted.contains("const STABLE_INDEX_HTML: &str = \"\\\ncanary\\\n\";"));
        assert!(promoted.contains("const STABLE_SW_JS: &str = \"\\\ncanary-sw\\\n\";"));
        assert!(promoted.contains("const STABLE_VERSION_JSON: &str = \"\\\ncanary-version\\\n\";"));
        assert!(promoted.contains("const CANARY_SNAPSHOT_SHA: &str = \"new-canary\";"));
    }
}
