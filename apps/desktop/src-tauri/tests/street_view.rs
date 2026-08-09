use image::{Rgb, RgbImage};
use research_canvas_desktop_lib::{
    commands::street_view::{
        add_manual_street_view_region_at, apply_street_view_redaction_at,
        list_street_view_images_at, register_street_view_image_at,
        stage_street_view_image_at, StageStreetViewImageRequest,
    },
    db::repositories::{
        REDACTION_STATUS_PENDING, REDACTION_STATUS_REDACTED, StreetViewImageRecord,
        StreetViewRegion, StreetViewRepository,
    },
};
use tempfile::tempdir;

fn image_record(id: &str, artifact_path: &str) -> StreetViewImageRecord {
    StreetViewImageRecord {
        id: id.into(),
        profile_scope: "migration".into(),
        artifact_path: artifact_path.into(),
        captured_at: Some("2021-07-14T10:00:00Z".into()),
        latitude: Some(41.0082),
        longitude: Some(28.9784),
        heading_degrees: Some(120.0),
        redaction_status: REDACTION_STATUS_PENDING.into(),
        redaction_regions: vec![],
        redacted_artifact_path: None,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn write_test_png(media_root: &std::path::Path, name: &str) {
    let mut image = RgbImage::from_pixel(64, 64, Rgb([40, 80, 120]));
    // A high-contrast checkerboard patch in the top-left quadrant: blurring
    // must change the checkerboard colours (a uniform patch would be blur-
    // invariant and prove nothing).
    for y in 0..16 {
        for x in 0..16 {
            image.put_pixel(
                x,
                y,
                if (x + y) % 2 == 0 {
                    Rgb([200, 30, 30])
                } else {
                    Rgb([250, 240, 220])
                },
            );
        }
    }
    image
        .save(media_root.join(name))
        .expect("write fixture png");
}

fn write_test_jpeg(media_root: &std::path::Path, name: &str) {
    let mut image = RgbImage::from_pixel(64, 64, Rgb([90, 140, 60]));
    for y in 0..16 {
        for x in 0..16 {
            image.put_pixel(
                x,
                y,
                if (x + y) % 2 == 0 {
                    Rgb([220, 40, 40])
                } else {
                    Rgb([240, 230, 200])
                },
            );
        }
    }
    image
        .save(media_root.join(name))
        .expect("write fixture jpeg");
}

fn png_bytes() -> Vec<u8> {
    let mut image = RgbImage::from_pixel(32, 32, Rgb([70, 110, 160]));
    for y in 0..8 {
        for x in 0..8 {
            image.put_pixel(
                x,
                y,
                if (x + y) % 2 == 0 {
                    Rgb([210, 60, 50])
                } else {
                    Rgb([240, 230, 210])
                },
            );
        }
    }
    let mut buffer = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut buffer, image::ImageFormat::Png)
        .expect("encode fixture png");
    buffer.into_inner()
}

fn pixel(image: &RgbImage, x: u32, y: u32) -> Rgb<u8> {
    *image.get_pixel(x, y)
}

#[test]
fn street_view_redaction_pipeline_blurs_only_the_region() {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    std::fs::create_dir_all(&media_root).unwrap();
    write_test_png(&media_root, "crossing.png");
    let database_path = dir.path().join("street-view.sqlite");
    let database_path = database_path.to_string_lossy().to_string();

    let registered = register_street_view_image_at(
        &database_path,
        media_root.to_string_lossy().as_ref(),
        image_record("img-crossing", "crossing.png"),
    )
    .expect("register image");
    assert_eq!(registered.redaction_status, "pending");

    let with_region = add_manual_street_view_region_at(
        &database_path,
        "img-crossing",
        StreetViewRegion {
            x: 0.0,
            y: 0.0,
            width: 0.25,
            height: 0.25,
            reason: "face".into(),
            source: "manual".into(),
        },
    )
    .expect("add manual region");
    assert_eq!(with_region.redaction_regions.len(), 1);

    let redacted = apply_street_view_redaction_at(
        &database_path,
        media_root.to_string_lossy().as_ref(),
        "img-crossing",
    )
    .expect("apply redaction");
    assert_eq!(redacted.redaction_status, REDACTION_STATUS_REDACTED);
    assert_eq!(
        redacted.redacted_artifact_path.as_deref(),
        Some("redacted/img-crossing.png")
    );

    let output_path = media_root.join(redacted.redacted_artifact_path.unwrap());
    assert!(output_path.is_file(), "redacted artifact written");

    let output = image::open(&output_path).expect("decode redacted png").to_rgb8();
    // Inside the redaction region the checkerboard contrast is gone (blurred);
    // the pixel is no longer a pure checkerboard colour.
    let blurred_pixel = pixel(&output, 8, 8);
    assert_ne!(blurred_pixel, Rgb([200, 30, 30]));
    assert_ne!(blurred_pixel, Rgb([250, 240, 220]));
    // Outside the region the background is untouched.
    assert_eq!(pixel(&output, 40, 40), Rgb([40, 80, 120]));
    // The original artifact is never modified.
    let original = image::open(media_root.join("crossing.png"))
        .expect("decode original png")
        .to_rgb8();
    assert_eq!(pixel(&original, 8, 8), Rgb([200, 30, 30]));
}

#[test]
fn staged_import_bytes_register_as_real_artifacts() {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    std::fs::create_dir_all(&media_root).unwrap();
    let database_path = dir.path().join("street-view.sqlite");
    let database_path = database_path.to_string_lossy().to_string();

    let staged = stage_street_view_image_at(StageStreetViewImageRequest {
        media_root: media_root.to_string_lossy().to_string(),
        profile_scope: "migration".into(),
        file_name: "prague-crossing.png".into(),
        bytes: png_bytes(),
    })
    .expect("stage imported bytes");
    assert_eq!(staged.artifact_path, "street-view/migration/prague-crossing.png");
    let staged_file = media_root.join(&staged.artifact_path);
    assert!(staged_file.is_file(), "staged artifact exists at media root");

    let registered = register_street_view_image_at(
        &database_path,
        media_root.to_string_lossy().as_ref(),
        image_record("img-staged", &staged.artifact_path),
    )
    .expect("register staged artifact");
    assert_eq!(registered.artifact_path, staged.artifact_path);
    assert_eq!(registered.redaction_status, "pending");

    let listed = list_street_view_images_at(&database_path, "migration").expect("list");
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, "img-staged");
}

#[test]
fn staged_import_rejects_non_images_and_traversal_names() {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    std::fs::create_dir_all(&media_root).unwrap();

    let not_an_image = stage_street_view_image_at(StageStreetViewImageRequest {
        media_root: media_root.to_string_lossy().to_string(),
        profile_scope: "migration".into(),
        file_name: "notes.txt".into(),
        bytes: b"not an image at all".to_vec(),
    });
    assert!(not_an_image.is_err(), "text bytes are rejected");

    let wrong_magic = stage_street_view_image_at(StageStreetViewImageRequest {
        media_root: media_root.to_string_lossy().to_string(),
        profile_scope: "migration".into(),
        file_name: "fake.png".into(),
        bytes: b"PNG but actually text".to_vec(),
    });
    assert!(wrong_magic.is_err(), "mismatched magic bytes are rejected");

    let traversal = stage_street_view_image_at(StageStreetViewImageRequest {
        media_root: media_root.to_string_lossy().to_string(),
        profile_scope: "migration".into(),
        file_name: "../../outside.png".into(),
        bytes: png_bytes(),
    });
    assert!(traversal.is_err(), "path traversal names are rejected");

    let empty = stage_street_view_image_at(StageStreetViewImageRequest {
        media_root: media_root.to_string_lossy().to_string(),
        profile_scope: "migration".into(),
        file_name: "empty.png".into(),
        bytes: vec![],
    });
    assert!(empty.is_err(), "empty payloads are rejected");
}

#[test]
fn street_view_register_rejects_missing_artifacts_and_non_portable_paths() {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    std::fs::create_dir_all(&media_root).unwrap();
    write_test_png(&media_root, "ok.png");
    let database_path = dir.path().join("street-view.sqlite");
    let database_path = database_path.to_string_lossy().to_string();

    let missing = register_street_view_image_at(
        &database_path,
        media_root.to_string_lossy().as_ref(),
        image_record("img-missing", "not-there.png"),
    )
    .expect_err("missing source must be rejected");
    assert!(missing.contains("not found"));

    let absolute = image_record("img-abs", "ok.png");
    let mut absolute = absolute;
    absolute.artifact_path = "/etc/passwd".into();
    let rejected = register_street_view_image_at(
        &database_path,
        media_root.to_string_lossy().as_ref(),
        absolute,
    )
    .expect_err("absolute path must be rejected");
    assert!(rejected.contains("non-portable"));

    let traversal = image_record("img-trav", "ok.png");
    let mut traversal = traversal;
    traversal.artifact_path = "media/../../secrets.png".into();
    let rejected = register_street_view_image_at(
        &database_path,
        media_root.to_string_lossy().as_ref(),
        traversal,
    )
    .expect_err("traversal must be rejected");
    assert!(rejected.contains("non-portable"));
}

#[test]
fn street_view_repository_validates_regions_and_coordinates() {
    let dir = tempdir().unwrap();
    let db = research_canvas_desktop_lib::db::connection::Database::open(
        dir.path().join("street-view.sqlite"),
    )
    .unwrap();
    let repo = StreetViewRepository::new(db.connection());

    let mut record = image_record("img-region", "capture.png");
    record.redaction_regions = vec![StreetViewRegion {
        x: 0.9,
        y: 0.9,
        width: 0.2,
        height: 0.2,
        reason: "manual".into(),
        source: "manual".into(),
    }];
    let error = repo.register(record).expect_err("overflowing region rejected");
    assert!(error.to_string().contains("normalized frame"));

    let mut bad_lat = image_record("img-lat", "capture.png");
    bad_lat.latitude = Some(91.0);
    let error = repo.register(bad_lat).expect_err("latitude rejected");
    assert!(error.to_string().contains("latitude"));

    let listed = repo.list_for_profile("migration").unwrap();
    assert!(listed.is_empty(), "invalid records never persist");
}

#[test]
fn street_view_list_round_trips_through_the_command() {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    std::fs::create_dir_all(&media_root).unwrap();
    write_test_png(&media_root, "one.png");
    write_test_png(&media_root, "two.png");
    let database_path = dir.path().join("street-view.sqlite");
    let database_path = database_path.to_string_lossy().to_string();
    let media_root = media_root.to_string_lossy().to_string();

    register_street_view_image_at(&database_path, &media_root, image_record("img-one", "one.png"))
        .expect("register one");
    register_street_view_image_at(&database_path, &media_root, image_record("img-two", "two.png"))
        .expect("register two");

    let listed = list_street_view_images_at(&database_path, "migration").expect("list");
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0].id, "img-one");
    assert_eq!(listed[1].latitude, Some(41.0082));
    assert!(list_street_view_images_at(&database_path, "bootstrapping")
        .expect("other profile")
        .is_empty());
}

#[test]
fn street_view_redaction_pipeline_handles_jpeg_fieldwork_imagery() {
    let dir = tempdir().unwrap();
    let media_root = dir.path().join("media");
    std::fs::create_dir_all(&media_root).unwrap();
    write_test_jpeg(&media_root, "crossing.jpg");
    let database_path = dir.path().join("street-view.sqlite");
    let database_path = database_path.to_string_lossy().to_string();
    let media_root_string = media_root.to_string_lossy().to_string();

    let registered = register_street_view_image_at(
        &database_path,
        &media_root_string,
        image_record("img-jpeg", "crossing.jpg"),
    )
    .expect("register jpeg image");
    assert_eq!(registered.artifact_path, "crossing.jpg");

    let with_region = add_manual_street_view_region_at(
        &database_path,
        "img-jpeg",
        StreetViewRegion {
            x: 0.0,
            y: 0.0,
            width: 0.25,
            height: 0.25,
            reason: "license_plate".into(),
            source: "manual".into(),
        },
    )
    .expect("add region to jpeg");
    assert_eq!(with_region.redaction_regions.len(), 1);

    let redacted = apply_street_view_redaction_at(
        &database_path,
        &media_root_string,
        "img-jpeg",
    )
    .expect("apply redaction to jpeg");
    assert_eq!(redacted.redaction_status, REDACTION_STATUS_REDACTED);

    let output_path = media_root.join(
        redacted
            .redacted_artifact_path
            .expect("redacted artifact path"),
    );
    assert!(output_path.is_file());
    let output = image::open(&output_path).expect("decode redacted png").to_rgb8();
    // The checkerboard contrast inside the region is gone after the blur.
    let blurred = pixel(&output, 8, 8);
    assert_ne!(blurred, Rgb([220, 40, 40]));
    assert_ne!(blurred, Rgb([240, 230, 200]));
    // Outside the region the JPEG background survives (within codec tolerance).
    let outside = pixel(&output, 40, 40);
    assert!(outside.0[0] > 60 && outside.0[1] > 110 && outside.0[2] > 40);
}
