import { Schema, Model } from 'mongoose';
import { AuditEvent, Actor, Target } from '@audit-framework/core';


const actorSchema = new Schema<Actor>({
    type: {
        type: String
    },
    name: {
        type: String
    },
    email: {
        type: String
    },
    ip: {
        type: String
    },
    userAgent: {
        type: String
    },
    metadata: Schema.Types.Mixed,

}, { _id: false })

const targetSchema = new Schema<Target>({
    type: {
        type: String
    },
    name: {
        type: String
    },
    metadata: Schema.Types.Mixed
}, { _id: false })


const eventSchema = new Schema<AuditEvent>({
    id: {
        type: String,
    },
    action: {
        type: String
    },
    status: {
        type: String,
        enum: ['success', 'failure']
    },
    actor: {
        type: actorSchema,
        required: true
    },
    target: {
        type: targetSchema
    },
    changes: {
        type: {
            before: Schema.Types.Mixed,
            after: Schema.Types.Mixed
        }
    },
    metadata: {
        type: Schema.Types.Mixed
    }

});

export const EventModel = new Model('Events', eventSchema);