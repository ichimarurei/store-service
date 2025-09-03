import mongoose, { Document, Schema } from 'mongoose';

const File: Schema = new Schema({
    name: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
    data: { type: Buffer, required: true }
});

export interface FileDocument extends Document {
    name: string;
    size: number;
    type: string;
    data: Buffer;
}

export default mongoose.models.File ?? mongoose.model<FileDocument>('File', File);
