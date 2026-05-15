FROM python:3.12-slim-bookworm AS base
WORKDIR /app

# Keep public CA bundle current (helps some TLS setups).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./

# Corporate / MITM proxies often lack the signing CA inside the image, so pip
# fails with SSLCertVerificationError. Pass build args from docker-compose
# (or `docker build --build-arg ...`) — see docker-compose backend.build.args.
ARG PIP_EXTRA_INSTALL_ARGS=
RUN pip install --upgrade pip \
    && pip install --no-cache-dir ${PIP_EXTRA_INSTALL_ARGS} -r requirements.txt

COPY app/ ./app/

RUN groupadd --system --gid 1001 appuser \
    && useradd --system --uid 1001 --gid appuser appuser

USER appuser

ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/healthz')"

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3000"]
