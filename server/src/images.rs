use std::time::{Duration, SystemTime, UNIX_EPOCH};

use aws_sdk_s3::presigning::PresigningConfig;
use aws_sdk_s3::types::MetadataDirective;
use uuid::Uuid;

/// Upload URLs are used immediately by the client that requested them.
const PUT_EXPIRY: Duration = Duration::from_secs(15 * 60);
/// View URLs are minted per request by the GET /images/{key} redirect and
/// followed immediately by the browser.
const GET_EXPIRY: Duration = Duration::from_secs(5 * 60);
/// Skip the lifecycle-resetting self-copy when the object was already
/// (re)written this recently — a room of viewers joining at once should
/// trigger at most one copy per image per day.
const REFRESH_MIN_AGE_SECS: i64 = 24 * 60 * 60;

pub struct PresignedUpload {
    pub key: String,
    pub url: String,
}

/// Meal images in S3: presigned upload/view URLs, plus the self-copy that
/// keeps an image alive under the bucket's 7-day lifecycle expiry.
pub struct ImageStore {
    client: aws_sdk_s3::Client,
    bucket: String,
}

impl ImageStore {
    pub fn new(client: aws_sdk_s3::Client, bucket: String) -> Self {
        Self { client, bucket }
    }

    /// Mint a fresh key and a presigned PUT URL the browser uploads to
    /// directly. The content type is part of the signature, so the upload
    /// must send the same Content-Type header.
    pub async fn presign_put(&self, content_type: &str) -> Result<PresignedUpload, String> {
        let key = Uuid::new_v4().simple().to_string();
        let presigned = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(&key)
            .content_type(content_type)
            .presigned(presigning(PUT_EXPIRY)?)
            .await
            .map_err(|e| e.to_string())?;
        Ok(PresignedUpload {
            key,
            url: presigned.uri().to_string(),
        })
    }

    pub async fn presign_get(&self, key: &str) -> Result<String, String> {
        let presigned = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .presigned(presigning(GET_EXPIRY)?)
            .await
            .map_err(|e| e.to_string())?;
        Ok(presigned.uri().to_string())
    }

    /// Reset the lifecycle clock on `key` by copying the object onto itself.
    /// S3 only allows a self-copy when something changes, so the metadata is
    /// REPLACEd (re-stating the content type, which REPLACE would otherwise
    /// drop). No-op when the object is younger than a day.
    pub async fn refresh(&self, key: &str) -> Result<(), String> {
        let head = self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if let Some(last_modified) = head.last_modified() {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            if now - last_modified.secs() < REFRESH_MIN_AGE_SECS {
                return Ok(());
            }
        }

        self.client
            .copy_object()
            .bucket(&self.bucket)
            .key(key)
            .copy_source(format!("{}/{}", self.bucket, key))
            .metadata_directive(MetadataDirective::Replace)
            .content_type(head.content_type().unwrap_or("application/octet-stream"))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn presigning(expiry: Duration) -> Result<PresigningConfig, String> {
    PresigningConfig::expires_in(expiry).map_err(|e| e.to_string())
}

/// Keys are always the 32-hex-char form minted by `presign_put`; anything
/// else in a stored menu or URL is not ours.
pub fn is_valid_key(key: &str) -> bool {
    key.len() == 32 && key.bytes().all(|b| b.is_ascii_hexdigit())
}
