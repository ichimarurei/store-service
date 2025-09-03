import mongoose, { Document, Schema } from 'mongoose';

const Supplier: Schema = new Schema({
    name: { type: String, required: true },
    phone: { type: String, required: false, default: '' },
    address: { type: String, required: false, default: '' }
});

export interface SupplierDocument extends Document {
    name: string;
    phone?: string;
    address?: string;
}

export default mongoose.models.Supplier ?? mongoose.model<SupplierDocument>('Supplier', Supplier);
