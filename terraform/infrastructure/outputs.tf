output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.server.repository_url
}

output "images_bucket_name" {
  description = "S3 bucket holding uploaded meal images"
  value       = aws_s3_bucket.images.bucket
}
