import mongoose, { Document, Schema } from 'mongoose';

const Category: Schema = new Schema({ name: { type: String, required: true } });

export interface CategoryDocument extends Document {
    name: string;
}

export default mongoose.models.Category ?? mongoose.model<CategoryDocument>('Category', Category);
