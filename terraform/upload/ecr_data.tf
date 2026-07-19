data "aws_ecr_repository" "server" {
  name = local.app_name_lower
}

resource "terraform_data" "push_server_image" {
  triggers_replace = [timestamp()]
  provisioner "local-exec" {
    command = <<-EOT
      aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin ${split("/", data.aws_ecr_repository.server.repository_url)[0]}
      docker tag ${local.app_name_lower}:latest ${data.aws_ecr_repository.server.repository_url}:latest
      docker push ${data.aws_ecr_repository.server.repository_url}:latest
    EOT
  }
}

data "aws_ecr_image" "worker" {
  repository_name = local.app_name_lower
  image_tag       = "latest"
  depends_on      = [terraform_data.push_server_image]
}
