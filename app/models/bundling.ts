import { Schema, Types } from 'mongoose';
import unitSchema from './unit.schema';

const Bundle: Schema = new Schema(
    {
        amount: { type: Number, required: true },
        unit: { type: Types.ObjectId, required: true, ref: unitSchema.modelName }
    },
    { _id: false }
);

export const Bundling: Schema = new Schema(
    {
        node: { type: Bundle, required: true, _id: false },
        contain: { type: Bundle, required: true, _id: false }
    },
    { _id: false }
);

interface IBundle {
    amount?: number;
    unit?: Types.ObjectId;
}

export interface IBundling {
    node?: IBundle;
    contain?: IBundle;
}
