import mongoose, { Document, Schema, Types } from 'mongoose';
import { Author, IAuthor } from './author';
import { Bundling, IBundling } from './bundling';
import categorySchema from './category.schema';
import unitSchema from './unit.schema';

const Product: Schema = new Schema({
    name: { type: String, required: true },
    category: { type: Types.ObjectId, ref: categorySchema.modelName, required: true },
    unit: { type: Types.ObjectId, ref: unitSchema.modelName, required: true },
    bundle: { type: Bundling, required: false, default: null, _id: false },
    images: { type: [String], required: false, default: [] },
    inventory: { type: Number, required: false, default: 0 },
    variant: { type: [String], required: false, default: [] },
    initialCost: { type: Number, required: false, default: 0 }, // from old system
    cost: { type: [Number], required: false, default: [0, 0] },
    author: { type: Author, required: true, _id: false }
});

export interface ProductDocument extends Document {
    name: string;
    category: Types.ObjectId;
    unit: Types.ObjectId;
    bundle?: IBundling | null;
    images?: string[];
    inventory?: number;
    cost?: number[];
    variant?: string[];
    initialCost?: number; // from old system
    author: IAuthor;
}

export default mongoose.models.Product ?? mongoose.model<ProductDocument>('Product', Product);
