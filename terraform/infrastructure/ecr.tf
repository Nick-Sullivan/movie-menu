resource "aws_ecr_repository" "server" {
  name                 = local.app_name_lower
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "server" {
  repository = aws_ecr_repository.server.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep only the latest tagged image"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["latest"]
          countType     = "imageCountMoreThan"
          countNumber   = 1
        }
        action = { type = "expire" }
      }
    ]
  })
}

resource "terraform_data" "docker_push" {
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
      aws ecr get-login-password --region ${local.aws_region} \
        | docker login --username AWS --password-stdin ${aws_ecr_repository.server.repository_url}
      docker build --network=host -t ${aws_ecr_repository.server.repository_url}:latest ${path.root}/../../server
      docker push ${aws_ecr_repository.server.repository_url}:latest
      UNTAGGED=$(aws ecr list-images --region ${local.aws_region} --repository-name ${aws_ecr_repository.server.name} --filter tagStatus=UNTAGGED --query 'imageIds[*]' --output json)
      if [ "$UNTAGGED" != "[]" ]; then
        aws ecr batch-delete-image --region ${local.aws_region} --repository-name ${aws_ecr_repository.server.name} --image-ids "$UNTAGGED"
      fi
    EOT
  }

  depends_on = [aws_ecr_repository.server]
}

data "aws_ecr_image" "worker" {
  repository_name = aws_ecr_repository.server.name
  image_tag       = "latest"
  depends_on      = [terraform_data.docker_push]
}

resource "aws_ecr_repository_policy" "lambda_pull" {
  repository = aws_ecr_repository.server.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "LambdaECRImageRetrievalPolicy"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
        ]
      }
    ]
  })
}
