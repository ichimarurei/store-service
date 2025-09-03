import { Schema, Types } from 'mongoose';
import userSchema from './user.schema';

const Log: Schema = new Schema(
    {
        by: { type: Types.ObjectId, required: true, ref: userSchema.modelName },
        time: { type: Date, required: true }
    },
    { _id: false }
);

export const Author: Schema = new Schema(
    {
        created: { type: Log, required: false, default: null, _id: false },
        edited: { type: Log, required: false, default: null, _id: false },
        deleted: { type: Log, required: false, default: null, _id: false }
    },
    { _id: false }
);

interface ILog {
    by: Types.ObjectId;
    time: Date;
}

export interface IAuthor {
    created?: ILog;
    edited?: ILog;
    deleted?: ILog;
}
