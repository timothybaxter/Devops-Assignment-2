FROM nginx:alpine

# Install necessary tools
RUN apk add --no-cache \
    python3 \
    py3-pip \
    aws-cli

# Create directory for videos
RUN mkdir -p /usr/share/nginx/html/videos && \
    chown -R nginx:nginx /usr/share/nginx/html/videos && \
    chmod 755 /usr/share/nginx/html/videos

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose ports
EXPOSE 80

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]