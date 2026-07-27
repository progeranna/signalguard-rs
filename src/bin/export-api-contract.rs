use signalguard_rs::api::contract::{ARTIFACT_PATH, render};
use std::{env, fs, path::PathBuf, process::ExitCode};

fn main() -> ExitCode {
    let mode = env::args().nth(1).unwrap_or_else(|| "--check".into());
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let path = root.join(ARTIFACT_PATH);
    let generated = render();
    match mode.as_str() {
        "--write" => {
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, generated).unwrap();
            println!("wrote {}", path.display());
            ExitCode::SUCCESS
        }
        "--check" => match fs::read(&path) {
            Ok(existing) if existing == generated => ExitCode::SUCCESS,
            Ok(_) => {
                eprintln!(
                    "{} is stale; run cargo run --quiet --bin export-api-contract -- --write",
                    path.display()
                );
                ExitCode::from(1)
            }
            Err(error) => {
                eprintln!("cannot read {}: {error}", path.display());
                ExitCode::from(1)
            }
        },
        _ => {
            eprintln!("usage: export-api-contract --write|--check");
            ExitCode::from(2)
        }
    }
}
