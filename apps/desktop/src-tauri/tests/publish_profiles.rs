use research_canvas_desktop_lib::export::resolve_publish_profile;
use serde_json::json;

#[test]
fn resolves_publish_profile_defaults_and_explicit_overrides() {
    let defaults = resolve_publish_profile(json!({})).expect("default profile");
    assert!(defaults.include_resources);
    assert!(defaults.mobile_sequence_first);
    assert_eq!(defaults.theme, "paper");

    let explicit = resolve_publish_profile(json!({
        "includeResources": false,
        "mobileSequenceFirst": false,
        "theme": "ledger"
    }))
    .expect("explicit profile");
    assert!(!explicit.include_resources);
    assert!(!explicit.mobile_sequence_first);
    assert_eq!(explicit.theme, "ledger");
}
