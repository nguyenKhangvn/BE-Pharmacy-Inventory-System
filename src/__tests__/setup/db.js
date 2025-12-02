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

  // Clear all collections except users (to keep test users)
  const clearPromises = Object.entries(collections).map(
    ([name, collection]) => {
      if (name === "users") {
        // Keep test users by not deleting them
        return Promise.resolve();
      }
      return collection.deleteMany({});
    }
  );

  await Promise.all(clearPromises);
};
