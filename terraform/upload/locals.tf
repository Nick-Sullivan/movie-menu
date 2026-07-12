
locals {
  # Uploading here for now
  prefix_parameter = "/WebsiteCv/production"

  build_folder   = "${path.root}/../../client/dist"
  app_name       = "TastingShrek"
  app_name_lower = "tasting-shrek"
  s3_bucket      = "nickdavesullivan.com"
  base_path      = "tasting-shrek"
  tags = {
    Project     = "Tasting Shrek"
    Environment = "production"
  }
}
