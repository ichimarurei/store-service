import mongoose, { Document, Schema, Types } from 'mongoose';
import { Author, IAuthor } from './author';
import customerSchema from './customer.schema';
import productSchema from './product.schema';
import unitSchema from './unit.schema';

const ItemQty: Schema = new Schema(
    {
        unit: { type: Types.ObjectId, required: true, ref: unitSchema.modelName },
        qty: { type: Number, required: true }
    },
    { _id: false }
);

const Item: Schema = new Schema(
    {
        product: { type: Types.ObjectId, required: true, ref: productSchema.modelName },
        salesQty: { type: ItemQty, required: true, _id: false },
        bonusQty: { type: ItemQty, required: false, default: null, _id: false },
        price: { type: Number, required: true },
        discount: { type: Number, required: false, default: 0 }
    },
    { _id: false }
);

const Sales: Schema = new Schema({
    reference: { type: String, required: false, default: '' }, // source document | reference of the document
    customer: { type: Types.ObjectId, required: false, ref: customerSchema.modelName, default: null },
    products: { type: [Item], required: true, default: [], _id: false },
    subPrice: { type: Number, required: true },
    finalPrice: { type: Number, required: true },
    paid: { type: Number, required: true },
    change: { type: Number, required: false, default: 0 },
    tax: { type: Number, required: false, default: 0 },
    date: { type: Date, required: false, default: null },
    author: { type: Author, required: true, _id: false }
});

interface IItemQty {
    unit: Types.ObjectId;
    qty: number;
}

interface IItem {
    product: Types.ObjectId;
    salesQty: IItemQty;
    bonusQty?: IItemQty;
    price: number;
    discount?: number;
}

export interface SalesDocument extends Document {
    reference?: string;
    customer?: Types.ObjectId | null;
    products: IItem[];
    subPrice: number;
    finalPrice: number;
    paid: number;
    change?: number;
    tax?: number;
    date?: Date | null;
    author: IAuthor;
}

export default mongoose.models.Sales ?? mongoose.model<SalesDocument>('Sales', Sales);
