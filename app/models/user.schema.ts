import mongoose, { Document, Schema } from 'mongoose';
import { Privilege } from '../lib/global';

const User: Schema = new Schema({
    name: { type: String, required: true },
    phone: { type: String, required: false, default: '' },
    address: { type: String, required: false, default: '' },
    photo: { type: String, required: false, default: '' },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    privilege: { type: String, enum: Privilege, required: false, default: Privilege.Admin },
    active: { type: Boolean, required: false, default: false }
});

export interface UserDocument extends Document {
    username: string;
    password: string;
    name: string;
    photo?: string;
    phone?: string;
    address?: string;
    privilege?: Privilege;
    active?: boolean;
}

export default mongoose.models.User ?? mongoose.model<UserDocument>('User', User);
