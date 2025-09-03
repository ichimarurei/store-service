import mongoose, { Document, Schema } from 'mongoose';

const Unit: Schema = new Schema({
    name: { type: String, required: true },
    short: { type: String, required: false, default: '' }
});

export interface UnitDocument extends Document {
    name: string;
    short?: string;
}

export default mongoose.models.Unit ?? mongoose.model<UnitDocument>('Unit', Unit);
