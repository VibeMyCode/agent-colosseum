fn main() {
    if let Some((_, wasm_path)) = gear_wasm_builder::WasmBuilder::new()
        .exclude_features(["std"])
        .with_forced_recommended_toolchain()
        .build()
    {
        sails_rs::ClientBuilder::<agent_colosseum_app::Program>::from_wasm_path(wasm_path)
            .build_idl();
    }
}
