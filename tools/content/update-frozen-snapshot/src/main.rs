// SPDX-License-Identifier: AGPL-3.0-or-later

use anyhow::Result;
use fluxer_content_update_frozen_snapshot::{generate_snapshot_source, promote_stable_from_canary};
use std::env;
use std::path::PathBuf;
use std::process;

fn main() {
    if let Err(err) = run() {
        eprintln!("error: {err:#}");
        process::exit(1);
    }
}

fn run() -> Result<()> {
    let mut args = env::args_os();
    let program = args
        .next()
        .and_then(|value| PathBuf::from(value).file_name().map(|name| name.to_owned()))
        .and_then(|name| name.into_string().ok())
        .unwrap_or_else(|| "fluxer-content-update-frozen-snapshot".to_owned());

    let Some(first) = args.next() else {
        print_usage(&program);
        process::exit(1);
    };

    if first == "promote-stable" {
        let Some(frozen_snapshots_path) = args.next() else {
            eprintln!("usage: {program} promote-stable <frozen_snapshots.rs>");
            process::exit(1);
        };
        if args.next().is_some() {
            eprintln!("usage: {program} promote-stable <frozen_snapshots.rs>");
            process::exit(1);
        }
        promote_stable_from_canary(&PathBuf::from(frozen_snapshots_path))?;
        println!("promoted canary frozen snapshot to stable");
        return Ok(());
    }

    if args.next().is_some() {
        print_usage(&program);
        process::exit(1);
    }

    let output = generate_snapshot_source(&PathBuf::from(first))?;
    print!("{output}");
    Ok(())
}

fn print_usage(program: &str) {
    eprintln!("usage:");
    eprintln!("  {program} <static_dir>");
    eprintln!("  {program} promote-stable <frozen_snapshots.rs>");
}
