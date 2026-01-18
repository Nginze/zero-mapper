# Quick Start Guide - Populate Anime Mappings

## 1. Install Dependencies

```bash
pnpm install
```

This will install the required packages: `mongoose` and `p-limit`.

## 2. Set Up MongoDB

Make sure MongoDB is running on your system:

```bash
# Check if MongoDB is running
mongosh

# If not installed, install MongoDB:
# Ubuntu/Debian:
sudo apt-get install mongodb

# macOS:
brew install mongodb-community

# Start MongoDB:
# Ubuntu/Debian:
sudo systemctl start mongodb

# macOS:
brew services start mongodb-community
```

Or use MongoDB Atlas (cloud):
1. Go to https://www.mongodb.com/cloud/atlas
2. Create a free cluster
3. Get your connection string

## 3. Configure Environment Variables

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your settings
nano .env
```

Minimal configuration:
```env
MONGODB_URI=mongodb://localhost:27017/anime-mappings
TMDB_API_KEY=61e2290429798c561450eb56b26de19b
CONCURRENT_REQUESTS=10
SKIP_EXISTING=true
```

## 4. Run the Script

```bash
# Run directly (recommended)
pnpm run populate

# Or build first, then run
pnpm run populate:build
```

## 5. Monitor Progress

You'll see real-time output like:

```
🚀 Starting Anime Mapping Population Script
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Configuration:
  MongoDB URI: mongodb://localhost:27017/anime-mappings
  Concurrent Requests: 10
  Retry Attempts: 3
  Batch Size: 100
  Skip Existing: true
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Loaded 20000 AniList IDs
✅ Connected to MongoDB

📊 Progress: 150/20000 (0.75%)
✅ Successful: 142
❌ Failed: 5
⏭️  Skipped: 3
⏱️  Elapsed: 45s
🚀 Rate: 3.33 items/s
⏰ ETA: 5955s (99.3 min)
```

## 6. Wait for Completion

With 20,000 IDs and default settings, expect:
- **Time**: 3-4 hours
- **Success Rate**: 85-95%

You can safely interrupt (Ctrl+C) and resume later by running the script again with `SKIP_EXISTING=true`.

## 7. Query Your Data

After completion, connect to MongoDB and query:

```javascript
// Using mongosh
mongosh

use anime-mappings

// Find by AniList ID
db.animemappings.findOne({ anilistId: 21 })

// Count total mappings
db.animemappings.countDocuments()

// Find successful mappings
db.animemappings.countDocuments({ error: { $exists: false } })

// Find errors
db.animemappings.find({ error: { $exists: true } }).limit(10)
```

## Troubleshooting

**MongoDB Connection Failed:**
```bash
# Check MongoDB status
sudo systemctl status mongodb

# Or check if MongoDB is listening
netstat -an | grep 27017
```

**Rate Limiting Issues:**
- Reduce `CONCURRENT_REQUESTS` to 5 in `.env`
- Increase `RETRY_DELAY` to 5000

**Script Running Too Slow:**
- Increase `CONCURRENT_REQUESTS` to 20
- Increase `BATCH_SIZE` to 200

**Want to Update Existing Mappings:**
```bash
# In .env, change:
SKIP_EXISTING=false
```

## Performance Optimization

For faster processing on a powerful machine:

```env
CONCURRENT_REQUESTS=30
BATCH_SIZE=300
RETRY_ATTEMPTS=2
RETRY_DELAY=1000
```

For slower/conservative processing:

```env
CONCURRENT_REQUESTS=5
BATCH_SIZE=50
RETRY_ATTEMPTS=5
RETRY_DELAY=5000
```

## Next Steps

See [README-MAPPINGS.md](./README-MAPPINGS.md) for detailed documentation.
