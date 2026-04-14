FROM python:3.12-slim AS base

# System deps for curl_cffi (nghttp2) + Playwright runtime shims
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libnghttp2-dev \
    libssl-dev \
    libffi-dev \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml README.md ./
COPY arb_worker ./arb_worker
COPY tests ./tests

# Install core + stealth extras. Playwright browsers pulled separately
# only if PLAYWRIGHT_ENABLED=1 at runtime.
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -e ".[stealth]"

# Bake chromium only if the deploy target wants Phase F scrapers.
ARG INSTALL_CHROMIUM=0
RUN if [ "$INSTALL_CHROMIUM" = "1" ]; then \
      python -m playwright install --with-deps chromium; \
    fi

ENV PYTHONUNBUFFERED=1 \
    ARB_LOG_LEVEL=INFO

# Railway sets PORT automatically but the worker has no HTTP surface —
# it runs the APScheduler loop forever.
CMD ["python", "-m", "arb_worker", "run"]
