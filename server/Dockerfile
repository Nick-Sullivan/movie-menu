FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 AS adapter

FROM rust:1.96.0 AS builder
WORKDIR /build
COPY . .
RUN cargo build --release --bin server

FROM public.ecr.aws/docker/library/debian:trixie-slim
COPY --from=adapter /lambda-adapter /opt/extensions/lambda-adapter
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /build/target/release/server /app/server
ENV PORT=8080
ENV AWS_LWA_READINESS_CHECK_PATH=/health
CMD ["/app/server"]
