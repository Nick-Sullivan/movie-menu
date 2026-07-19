data "aws_caller_identity" "current" {}

locals {
  images_bucket_name = "${local.app_name_lower}-images-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "images" {
  bucket = local.images_bucket_name
}

resource "aws_s3_bucket_public_access_block" "images" {
  bucket                  = aws_s3_bucket.images.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "images" {
  bucket = aws_s3_bucket.images.id
  rule {
    id     = "expire-images"
    status = "Enabled"
    filter {}
    expiration {
      days = 7 # matches menu TTL
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "images" {
  bucket = aws_s3_bucket.images.id
  cors_rule {
    allowed_methods = ["PUT", "GET"]
    allowed_origins = ["*"]
    allowed_headers = ["content-type"]
    max_age_seconds = 86400
  }
}
