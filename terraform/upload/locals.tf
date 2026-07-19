
locals {
  # Uploading here for now
  prefix_parameter = "/WebsiteCv/production"

  build_folder   = "${path.root}/../../client/dist"
  app_name       = "TheMovieMenu"
  app_name_lower = "the-movie-menu"
  s3_bucket      = "nickdavesullivan.com"
  base_path      = "the-movie-menu"
  tags = {
    Project     = "The Movie Menu"
    Environment = "production"
  }
}
