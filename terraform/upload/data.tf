

data "aws_ssm_parameter" "cloudfront_distribution_id" {
  name = "${local.prefix_parameter}/CloudFront/DistributionId"
}

data "aws_dynamodb_table" "plans" {
  name = "tasting-shrek-menus"
}
