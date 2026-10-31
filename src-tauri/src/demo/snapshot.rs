//! WKWebView renders its own pixels: no Screen Recording permission needed.
use block2::RcBlock;
use objc2::runtime::NSObjectProtocol;
use objc2::{MainThreadMarker, msg_send, sel};
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_foundation::{NSDictionary, NSError};
use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};
use std::sync::mpsc;
use std::time::Duration;

use super::Rect;

/// PNG of the visible page, or of `rect` in it. Blocks: never call on the main thread.
pub fn png<R: tauri::Runtime>(
    webview: &tauri::WebviewWindow<R>,
    rect: Option<Rect>,
) -> Result<Vec<u8>, String> {
    let (tx, rx) = mpsc::channel();
    webview
        .with_webview(move |platform| {
            // SAFETY: on macOS `inner` is the live WKWebView; this closure runs on the main thread.
            let wk = unsafe { &*platform.inner().cast::<WKWebView>() };
            let tx = tx.clone();
            let done = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
                // SAFETY: WebKit passes either a valid image or a valid error.
                let got = match unsafe { (image.as_ref(), error.as_ref()) } {
                    (Some(image), _) => encode(image),
                    (None, Some(e)) => Err(e.localizedDescription().to_string()),
                    (None, None) => Err("snapshot gave no image".into()),
                };
                let _ = tx.send(got);
            });
            let mtm = MainThreadMarker::new().expect("with_webview runs on the main thread");
            // SAFETY: a fresh configuration; WKWebView view coordinates are CSS pixels at zoom 1.
            unsafe {
                let config = WKSnapshotConfiguration::new(mtm);
                // Waiting for a screen update hangs while the window is occluded.
                config.setAfterScreenUpdates(false);
                if let Some(r) = rect {
                    config.setRect(CGRect::new(
                        CGPoint::new(r.x, r.y),
                        CGSize::new(r.width, r.height),
                    ));
                }
                wk.takeSnapshotWithConfiguration_completionHandler(Some(&config), &done);
            }
        })
        .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(10))
        .map_err(|_| "snapshot timed out".to_string())?
}

/// A covered window stops WebKit painting and `requestAnimationFrame`, so xterm never draws.
/// WebKit SPI, debug-only: absent, frames of a covered window come out stale.
pub fn keep_rendering<R: tauri::Runtime>(webview: &tauri::WebviewWindow<R>) -> Result<(), String> {
    webview
        .with_webview(|platform| {
            // SAFETY: as in `png`.
            let wk = unsafe { &*platform.inner().cast::<WKWebView>() };
            if wk.respondsToSelector(sel!(_setWindowOcclusionDetectionEnabled:)) {
                // SAFETY: the selector exists and takes a BOOL.
                let _: () = unsafe { msg_send![wk, _setWindowOcclusionDetectionEnabled: false] };
            } else {
                eprintln!("demo: WebKit lacks occlusion SPI; keep the window uncovered");
            }
        })
        .map_err(|e| e.to_string())
}

fn encode(image: &NSImage) -> Result<Vec<u8>, String> {
    let tiff = image.TIFFRepresentation().ok_or("no TIFF")?;
    let rep = NSBitmapImageRep::imageRepWithData(&tiff).ok_or("no bitmap")?;
    // SAFETY: an empty properties dictionary is valid for PNG.
    let png = unsafe {
        rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
    }
    .ok_or("no PNG")?;
    Ok(png.to_vec())
}
