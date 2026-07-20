import mongoose, { Schema, Document } from 'mongoose';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'under_review' | 'completed' | 'escalated';

export interface ITaskComment {
    authorId: mongoose.Types.ObjectId;
    authorName: string;
    text: string;
    createdAt: Date;
}

export interface IEnterpriseTask extends Document {
    taskId: string;
    title: string;
    description?: string;
    assignedTo: mongoose.Types.ObjectId;
    assignedToName: string;
    assignedBy: mongoose.Types.ObjectId;
    assignedByName: string;
    departmentId?: mongoose.Types.ObjectId;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate?: Date;
    comments: ITaskComment[];
    createdAt: Date;
    updatedAt: Date;
}

const TaskCommentSchema = new Schema<ITaskComment>({
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const EnterpriseTaskSchema = new Schema<IEnterpriseTask>({
    taskId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignedToName: { type: String, required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedByName: { type: String, required: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium',
        index: true
    },
    status: {
        type: String,
        enum: ['todo', 'in_progress', 'under_review', 'completed', 'escalated'],
        default: 'todo',
        index: true
    },
    dueDate: { type: Date },
    comments: [TaskCommentSchema]
}, { timestamps: true });

export const EnterpriseTask = mongoose.model<IEnterpriseTask>('EnterpriseTask', EnterpriseTaskSchema);
