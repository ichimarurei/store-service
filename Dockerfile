# Stage 1: Base image with all dependencies
FROM node:20-alpine AS builder

# Set the working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy environment file
COPY .env.deploy ./.env

# Stage 2: Runner
FROM node:20-alpine AS runner

# Set the working directory
WORKDIR /app

# Copy built files and necessary assets from builder
COPY . .
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.env ./.env

# Expose the port Fastify runs on
EXPOSE 8001

# Start the Fastify server
CMD ["npm", "start"]