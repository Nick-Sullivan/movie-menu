resource "aws_dynamodb_table" "menus" {
  name         = "${local.app_name_lower}-menus"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}

# The table predates the FilmPlan → Menu rename; keep its state address in step.
moved {
  from = aws_dynamodb_table.plans
  to   = aws_dynamodb_table.menus
}
