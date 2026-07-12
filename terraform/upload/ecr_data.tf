data "aws_ecr_repository" "server" {
  name = local.app_name_lower
}

data "aws_ecr_image" "worker" {
  repository_name = local.app_name_lower
  image_tag       = "latest"
}
