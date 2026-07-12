
module "template_files" {
  source   = "hashicorp/dir/template"
  base_dir = local.build_folder
}

resource "aws_s3_object" "static_files" {
  for_each     = module.template_files.files
  bucket       = local.s3_bucket
  key          = "${local.base_path}/${each.key}"
  content_type = each.value.content_type
  source       = each.value.source_path
  content      = each.value.content
  etag         = each.value.digests.md5
}


resource "terraform_data" "clear_cloudfront_cache" {
  depends_on       = [aws_s3_object.static_files]
  triggers_replace = [timestamp()]
  provisioner "local-exec" {
    command = "aws cloudfront create-invalidation --distribution-id ${data.aws_ssm_parameter.cloudfront_distribution_id.value} --paths '/${local.base_path}/*'"
  }
}

output "deployment_url" {
  value = "https://nickdavesullivan.com/${local.base_path}/"
}
