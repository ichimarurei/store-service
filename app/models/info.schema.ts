import mongoose, { Document, Schema } from 'mongoose';

const InfoAbout: Schema = new Schema(
    {
        line1: { type: String, required: false, default: '' },
        line2: { type: String, required: false, default: '' }
    },
    { _id: false }
);

const DebtConfig: Schema = new Schema(
    {
        customer: { type: Number, required: false, default: 0 },
        supplier: { type: Number, required: false, default: 0 }
    },
    { _id: false }
);

const Info: Schema = new Schema({
    name: { type: String, required: true },
    address: { type: String, required: false, default: '' },
    logo: { type: String, required: false, default: '' },
    about: { type: InfoAbout, required: false, default: null },
    debtConfigFrom: { type: DebtConfig, required: false, default: { customer: 0, supplier: 0 } }
});

interface IInfoAbout {
    line1?: string;
    line2?: string;
}

interface IDebtConfig {
    customer?: number;
    supplier?: number;
}

export interface InfoDocument extends Document {
    name: string;
    address?: string;
    logo?: string;
    about?: IInfoAbout;
    debtConfigFrom?: IDebtConfig;
}

export default mongoose.models.Info ?? mongoose.model<InfoDocument>('Info', Info);
