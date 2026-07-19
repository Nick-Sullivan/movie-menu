data "aws_ecr_repository" "server" {
  name = local.app_name_lower
}

resource "terraform_data" "push_server_image" {
  triggers_replace = {
    source_hash = sha256(join("", [
      for f in sort(fileset("${path.root}/../../server", "**")) :
      filesha256("${path.root}/../../server/${f}")
      if !startswith(f, "target/")
    ]))
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -e
      aws ecr get-login-password --region ap-southeast-2 \
        | docker login --username AWS --password-stdin ${split("/", data.aws_ecr_repository.server.repository_url)[0]}
      docker build --network=host -t ${data.aws_ecr_repository.server.repository_url}:latest ${path.root}/../../server
      docker push ${data.aws_ecr_repository.server.repository_url}:latest
      UNTAGGED=$(aws ecr list-images --region ap-southeast-2 --repository-name ${data.aws_ecr_repository.server.name} --filter tagStatus=UNTAGGED --query 'imageIds[*]' --output json)
      if [ "$UNTAGGED" != "[]" ]; then
        aws ecr batch-delete-image --region ap-southeast-2 --repository-name ${data.aws_ecr_repository.server.name} --image-ids "$UNTAGGED"
      fi
    EOT
  }
}

data "aws_ecr_image" "worker" {
  repository_name = local.app_name_lower
  image_tag       = "latest"
  depends_on      = [terraform_data.push_server_image]
}
