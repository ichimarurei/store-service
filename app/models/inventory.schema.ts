import mongoose, { Document, Schema, Types } from 'mongoose';
import productSchema from './product.schema';

const Inventory: Schema = new Schema({
    product: { type: Types.ObjectId, ref: productSchema.modelName, required: true },
    inventory: { type: Number, required: false, default: 0 },
    cost: { type: Number, required: false, default: 0 }
});

export interface InventoryDocument extends Document {
    product: Types.ObjectId;
    inventory?: number;
    cost?: number;
}

export default mongoose.models.Inventory ?? mongoose.model<InventoryDocument>('Inventory', Inventory);
