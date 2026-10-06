use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .runtime(tauri_runtime_wry::Wry::default())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      
      // Launch the Node.js backend sidecar with the hardware tier/environment
      // rules the Genesis Profiler wrote to BaseVault (Axiom 6).
      // The sidecar is referenced by its bare base name only; Tauri resolves the
      // target triple and platform extension (e.g. -linux, .exe) at build time.
      let profiler_command = app.shell().sidecar("neurosyncmega").unwrap()
        .args(["--profile"]);
        
      let output = tauri::async_runtime::block_on(async move {
        profiler_command.output().await
      }).expect("Failed to run hardware profiler");

      let stdout_str = String::from_utf8_lossy(&output.stdout);
      
      // Extract the JSON line from stdout (ignoring preceding log messages)
      let json_line = stdout_str.lines()
          .find(|line| line.starts_with('{'))
          .unwrap_or("{}");
      
      // Parse JSON from profiler (fallback to conservative defaults on this edge node if parsing fails)
      let parsed: serde_json::Value = serde_json::from_str(json_line).unwrap_or_else(|_| {
          serde_json::json!({
              "UV_THREADPOOL_SIZE": "3",
              "NODE_OPTIONS": "--max-old-space-size=1024"
          })
      });

      let uv_threadpool = parsed["UV_THREADPOOL_SIZE"].as_str().unwrap_or("3").to_string();
      let node_options = parsed["NODE_OPTIONS"].as_str().unwrap_or("--max-old-space-size=1024").to_string();

      // Spawn the main sidecar with enforced constraints
      let sidecar_command = app.shell().sidecar("neurosyncmega").unwrap()
          .env("UV_THREADPOOL_SIZE", uv_threadpool)
          .env("NODE_OPTIONS", node_options);
          
      let (mut rx, mut _child) = sidecar_command.spawn().expect("Failed to spawn sidecar");

      tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
          if let CommandEvent::Stdout(line) = event {
            println!("[sidecar] {}", String::from_utf8_lossy(&line));
          } else if let CommandEvent::Stderr(line) = event {
            eprintln!("[sidecar error] {}", String::from_utf8_lossy(&line));
          }
        }
      });

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
