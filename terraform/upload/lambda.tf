resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${local.app_name}-worker"
  retention_in_days = 14
}

resource "aws_lambda_function" "worker" {
  function_name = "${local.app_name}-worker"
  role          = aws_iam_role.worker_lambda.arn
  package_type  = "Image"
  image_uri     = "${data.aws_ecr_repository.server.repository_url}@${data.aws_ecr_image.worker.image_digest}"
  architectures = ["x86_64"]
  memory_size   = 1024
  timeout       = 10
  environment {
    variables = {
      AWS_LWA_READINESS_CHECK_PATH = "/health"
      DYNAMODB_TABLE               = data.aws_dynamodb_table.plans.name
      PORT                         = "8080"
      STORE                        = "dynamodb"
    }
  }
}

resource "aws_lambda_function_url" "worker" {
  function_name      = aws_lambda_function.worker.function_name
  authorization_type = "NONE"
  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["GET", "POST", "PUT"]
    allow_headers     = ["content-type"]
    max_age           = 86400
  }
}

output "worker_url" {
  value = aws_lambda_function_url.worker.function_url
}
