

data "aws_ssm_parameter" "cloudfront_distribution_id" {
  name = "${local.prefix_parameter}/CloudFront/DistributionId"
}

data "aws_dynamodb_table" "plans" {
  name = "tasting-shrek-menus"
}

data "aws_caller_identity" "current" {}

data "aws_s3_bucket" "images" {
  bucket = "tasting-shrek-images-${data.aws_caller_identity.current.account_id}"
}
