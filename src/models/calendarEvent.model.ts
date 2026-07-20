import mongoose, { Schema, Document } from 'mongoose';

export type EventType = 'interview' | 'meeting' | 'holiday' | 'event' | 'leave' | 'task';

export interface ICalendarEvent extends Document {
    title: string;
    description?: string;
    eventType: EventType;
    startDate: Date;
    endDate: Date;
    organizerId: mongoose.Types.ObjectId;
    attendees?: string[];
    locationUrl?: string;
    isAllDay?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const CalendarEventSchema = new Schema<ICalendarEvent>({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    eventType: {
        type: String,
        required: true,
        enum: ['interview', 'meeting', 'holiday', 'event', 'leave', 'task'],
        default: 'meeting',
        index: true
    },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, required: true },
    organizerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    attendees: [{ type: String }],
    locationUrl: { type: String, default: '' },
    isAllDay: { type: Boolean, default: false }
}, { timestamps: true });

export const CalendarEvent = mongoose.model<ICalendarEvent>('CalendarEvent', CalendarEventSchema);
