import mongoose, { Document, Schema, Types } from 'mongoose';
import { Author, IAuthor } from './author';
import productSchema from './product.schema';
import supplierSchema from './supplier.schema';
import unitSchema from './unit.schema';

const Item: Schema = new Schema(
    {
        product: { type: Types.ObjectId, required: true, ref: productSchema.modelName },
        unit: { type: Types.ObjectId, required: true, ref: unitSchema.modelName },
        qty: { type: Number, required: true },
        cost: { type: Number, required: false, default: 0 },
        discount: { type: Number, required: false, default: 0 }
    },
    { _id: false }
);

const Receipt: Schema = new Schema({
    reference: { type: String, required: false, default: '' }, // source document | reference of the document
    supplier: { type: Types.ObjectId, required: false, ref: supplierSchema.modelName, default: null },
    products: { type: [Item], required: true, default: [], _id: false },
    date: { type: Date, required: false, default: null },
    author: { type: Author, required: true, _id: false }
});

interface IItem {
    product: Types.ObjectId;
    unit: Types.ObjectId;
    qty: number;
    cost?: number;
    discount?: number;
}

export interface ReceiptDocument extends Document {
    reference?: string;
    supplier?: Types.ObjectId | null;
    products: IItem[];
    date?: Date | null;
    author: IAuthor;
}

export default mongoose.models.Receipt ?? mongoose.model<ReceiptDocument>('Receipt', Receipt);
