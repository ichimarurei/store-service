import mongoose from 'mongoose';

interface MongooseCache {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
}

const MONGODB_URI = process.env.MONGODB_URI ?? '';

let cached: MongooseCache = { conn: null, promise: null };

export default async function handshakeDB(): Promise<typeof mongoose> {
    if (!MONGODB_URI) {
        throw new Error('Please define MONGODB_URI !!!');
    }

    if (cached.conn) return cached.conn;

    try {
        cached.promise ??= mongoose.connect(MONGODB_URI, { timeoutMS: 30000, socketTimeoutMS: 60000, serverSelectionTimeoutMS: 30000 });
        cached.conn = await cached.promise;

        return cached.conn;
    } catch (_) {
        console.error(_);
        throw new Error('Cannot connect to MongoDB !!!');
    }
}
