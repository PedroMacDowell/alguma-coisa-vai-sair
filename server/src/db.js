const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || '';
const MONGO_DB = process.env.MONGO_DB || 'school_register';

let client = null;
let db = null;

async function connect() {
  if (!MONGO_URI) return null;
  if (db) return db;
  client = new MongoClient(MONGO_URI, { maxPoolSize: 10 });
  await client.connect();
  db = client.db(MONGO_DB);
  return db;
}

function getDb() {
  if (!db) throw new Error('MongoDB not connected. Call connect() first.');
  return db;
}

function getCollection(name) {
  return getDb().collection(name);
}

async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

module.exports = {
  connect,
  getDb,
  getCollection,
  close,
};
