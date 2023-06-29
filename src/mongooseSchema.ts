import { baseSchema } from '../../debate-zone-micro-service-common-library/src/mongoose/baseSchema';
import { Document, model, Types } from 'mongoose';
import { CollectionsEnum } from '../../debate-zone-micro-service-common-library/src/enums/collectionsEnum';
import { Media } from './types';

const mongooseSchema = baseSchema.add({
    debateZoneId: {
        required: Types.ObjectId,
        ref: CollectionsEnum.DEBATE_ZONE,
    },
    hostUserId: {
        required: Types.ObjectId,
        ref: CollectionsEnum.USER,
    },
    savePath: {
        type: String,
    },
});

mongooseSchema.index({ debateZoneId: 1, hostUserId: 1 }, { unique: true });

export type MediaDocument = Document & Media;

export const mediaModel = model<MediaDocument>(
    CollectionsEnum.MEDIA,
    mongooseSchema,
);
