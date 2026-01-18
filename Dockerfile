FROM node:20-slim

WORKDIR /app

# Install dependencies for Playwright
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Install Playwright browsers
RUN npx playwright install chromium

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm build

# Environment variables
ENV MONGODB_URI=mongodb://kaizoku:guuk12jona@46.224.117.251:27017/anidb?authSource=admin
ENV CONCURRENCY=10
ENV SKIP_EXISTING=false

# Run the populate script
CMD ["node", "dist/scripts/populate-mappings.js"]
