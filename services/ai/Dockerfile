FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
ENV FINANCIAL_DATA_DIR=/data/financial
RUN pip install --no-cache-dir . && useradd --create-home appuser
USER appuser
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
