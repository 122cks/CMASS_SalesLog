# Use official Python slim image
FROM python:3.11-slim

# set working directory
WORKDIR /app

# copy only requirements first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# copy app sources
COPY . /app

# Expose port
EXPOSE 5000

# Ensure the SQLite DB path exists and is writable
RUN mkdir -p /app && touch /app/visits.db || true

# Use gunicorn for production
CMD ["gunicorn", "app:app", "-b", "0.0.0.0:5000", "--workers", "3", "--threads", "2", "--log-level", "info"]
