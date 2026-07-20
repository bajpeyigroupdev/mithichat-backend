import mongoose, { Schema, Document } from 'mongoose';

export interface IInterviewSchedule extends Document {
    applicationId: string;
    candidateName: string;
    candidateEmail: string;
    interviewerId: mongoose.Types.ObjectId;
    interviewerName: string;
    scheduledAt: Date;
    durationMinutes: number;
    meetingUrl?: string;
    status: 'scheduled' | 'rescheduled' | 'completed' | 'cancelled';
    scorecard?: {
        rating: number; // 1 to 5
        feedbackNotes: string;
        recommendation: 'strong_hire' | 'hire' | 'no_hire';
    };
    createdAt: Date;
    updatedAt: Date;
}

const InterviewScheduleSchema = new Schema<IInterviewSchedule>({
    applicationId: { type: String, required: true, index: true },
    candidateName: { type: String, required: true },
    candidateEmail: { type: String, required: true },
    interviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    interviewerName: { type: String, required: true },
    scheduledAt: { type: Date, required: true },
    durationMinutes: { type: Number, default: 30 },
    meetingUrl: { type: String, default: '' },
    status: {
        type: String,
        required: true,
        enum: ['scheduled', 'rescheduled', 'completed', 'cancelled'],
        default: 'scheduled',
        index: true
    },
    scorecard: {
        rating: { type: Number, min: 1, max: 5 },
        feedbackNotes: { type: String, default: '' },
        recommendation: { type: String, enum: ['strong_hire', 'hire', 'no_hire'] }
    }
}, { timestamps: true });

export const InterviewSchedule = mongoose.model<IInterviewSchedule>('InterviewSchedule', InterviewScheduleSchema);
