# Build stage. The output is static files, so build on the CI runner's own
# platform even when the final image is arm64 (much faster than emulation).
FROM --platform=$BUILDPLATFORM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# The release the image is built from (vX.Y.Z, or sha-<commit> for a build
# of main), which the app puts in its error reports (src/lib/errorReporting.ts).
ARG IBP_VERSION=dev
ENV VITE_APP_VERSION=$IBP_VERSION

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built static files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

# Nginx runs automatically with the default CMD
