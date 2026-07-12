FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 AS adapter

FROM rust:1.96.0 AS builder
WORKDIR /build
COPY . .
RUN cargo build --release --bin server

FROM public.ecr.aws/lambda/provided:al2023
COPY --from=adapter /lambda-adapter /opt/extensions/lambda-adapter
COPY --from=builder /build/target/release/server /var/runtime/bootstrap
ENV PORT=8080
ENV AWS_LWA_READINESS_CHECK_PATH=/health
