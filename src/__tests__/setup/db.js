import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let replset;

export const connect = async () => {
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  const uri = replset.getUri();
  await mongoose.connect(uri, { dbName: "testdb" });
};

export const closeDatabase = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (replset) await replset.stop();
};

export const clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
};
