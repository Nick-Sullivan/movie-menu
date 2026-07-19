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
      DYNAMODB_TABLE               = data.aws_dynamodb_table.menus.name
      IMAGES_BUCKET                = data.aws_s3_bucket.images.bucket
      PORT                         = "8080"
      STORE                        = "dynamodb"
    }
  }
}

resource "aws_lambda_permission" "worker_public_url" {
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.worker.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "worker_public_url_invoke" {
  statement_id             = "AllowPublicFunctionUrlInvoke"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.worker.function_name
  principal                = "*"
  invoked_via_function_url = true
}

resource "aws_lambda_function_url" "worker" {
  function_name      = aws_lambda_function.worker.function_name
  authorization_type = "NONE"
}

output "worker_url" {
  value = aws_lambda_function_url.worker.function_url
}
