

data "aws_ssm_parameter" "cloudfront_distribution_id" {
  name = "${local.prefix_parameter}/CloudFront/DistributionId"
}

data "aws_dynamodb_table" "menus" {
  name = "${local.app_name_lower}-data"
}

data "aws_caller_identity" "current" {}

data "aws_s3_bucket" "images" {
  bucket = "${local.app_name_lower}-images-${data.aws_caller_identity.current.account_id}"
}
