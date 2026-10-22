# Foreshock in the cloud (Render, Railway, Fly.io, or any Docker host).
# Public safe mode is on: accounts and settings can't be changed through the link.
FROM python:3.12-slim
WORKDIR /app
COPY . .
ENV FORESHOCK_PUBLIC=1 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "server/server.py", "--host", "0.0.0.0", "--no-browser"]
