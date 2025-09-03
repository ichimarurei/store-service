import mongoose, { Document, Schema } from 'mongoose';

const Customer: Schema = new Schema({
    name: { type: String, required: true },
    phone: { type: String, required: false, default: '' },
    address: { type: String, required: false, default: '' },
    city: { type: String, required: false, default: '' }
});

export interface CustomerDocument extends Document {
    name: string;
    phone?: string;
    address?: string;
    city?: string;
}

export default mongoose.models.Customer ?? mongoose.model<CustomerDocument>('Customer', Customer);
