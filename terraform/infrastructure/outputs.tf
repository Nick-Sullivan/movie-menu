output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.server.repository_url
}
