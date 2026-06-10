const express = require('express');
const { MongoClient } = require('mongodb');
const { createClient } = require('redis');
const app = express();

const mongoUrl = process.env.MONGO_URL || 'mongodb://mongo:27017/test';
const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

app.get('/', async (req, res) => {
  let mongoStatus = 'Disconnected';
  let redisStatus = 'Disconnected';

  try {
    const mongoClient = await MongoClient.connect(mongoUrl);
    await mongoClient.db().admin().ping();
    mongoStatus = 'Connected';
    mongoClient.close();
  } catch (err) {
    mongoStatus = `Error: ${err.message}`;
  }

  try {
    const redisClient = createClient({ url: redisUrl });
    await redisClient.connect();
    await redisClient.ping();
    redisStatus = 'Connected';
    redisClient.quit();
  } catch (err) {
    redisStatus = `Error: ${err.message}`;
  }

  res.json({
    service: 'API',
    mongo: mongoStatus,
    redis: redisStatus
  });
});

app.listen(4000, () => console.log('API listening on port 4000'));
