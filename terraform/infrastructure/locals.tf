locals {
  app_name       = "TheMovieMenu"
  app_name_lower = "the-movie-menu"
  aws_region     = "ap-southeast-2"
  tags = {
    Project     = "The Movie Menu"
    Environment = "production"
  }
}
