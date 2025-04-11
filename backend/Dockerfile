# Use a specific slim image for smaller size
FROM python:3.10.6-slim-bullseye

WORKDIR /app

# Install essential system dependencies + ffmpeg (for audio conversion) + libsndfile1 (often useful for audio)
# Combine update, install, and clean in one layer to reduce image size
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    gnupg \
    unzip \
    ffmpeg \
    libsndfile1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Upgrade pip and install Python dependencies
# Install torch CPU first using the specified index
# Then install the rest
RUN python3 -m pip install --no-cache-dir --upgrade pip && \
    python3 -m pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    python3 -m pip install --no-cache-dir -r requirements.txt

# Environment variables (if needed, e.g., for display in some libs, though unlikely here)
# ENV DISPLAY=:99

# Copy the rest of the application code
COPY . /app

# Command to run the application
# Use the standard uvicorn command without --reload for production/stable containers
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Optional: Expose the port (good practice)
EXPOSE 8000