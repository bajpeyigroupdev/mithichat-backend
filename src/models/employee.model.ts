import mongoose, { Schema, Document } from 'mongoose';

export type EmployeeStatus = 'offer_sent' | 'joining_pending' | 'training' | 'active_employee' | 'suspended' | 'resigned' | 'terminated';
export type EmployeeType = 'full_time' | 'part_time' | 'contract' | 'intern';

export interface IEmployee extends Document {
    employeeCode: string;
    userId: mongoose.Types.ObjectId;
    applicationId?: string;
    orgId?: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    departmentId?: mongoose.Types.ObjectId;
    teamId?: mongoose.Types.ObjectId;
    reportingManagerId?: mongoose.Types.ObjectId;
    employeeType: EmployeeType;
    designation: string;
    grade?: string;
    salaryBand?: string;
    salaryPackage?: number;
    workLocation?: string;
    joiningDate?: Date;
    exitDate?: Date;
    status: EmployeeStatus;
    offerLetterUrl?: string;
    emergencyContact?: {
        name: string;
        phone: string;
        relation: string;
    };
    createdAt: Date;
    updatedAt: Date;
}

const EmployeeSchema = new Schema<IEmployee>({
    employeeCode: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    applicationId: { type: String, index: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization' },
    branchId: { type: Schema.Types.ObjectId, ref: 'BranchRegion' },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
    teamId: { type: Schema.Types.ObjectId, ref: 'Team' },
    reportingManagerId: { type: Schema.Types.ObjectId, ref: 'User' },
    employeeType: {
        type: String,
        enum: ['full_time', 'part_time', 'contract', 'intern'],
        default: 'full_time'
    },
    designation: { type: String, required: true },
    grade: { type: String, default: 'E1' },
    salaryBand: { type: String, default: 'L1' },
    salaryPackage: { type: Number, default: 0 },
    workLocation: { type: String, default: 'Remote / HQ' },
    joiningDate: { type: Date, default: Date.now },
    exitDate: { type: Date },
    status: {
        type: String,
        required: true,
        enum: ['offer_sent', 'joining_pending', 'training', 'active_employee', 'suspended', 'resigned', 'terminated'],
        default: 'active_employee',
        index: true
    },
    offerLetterUrl: { type: String, default: '' },
    emergencyContact: {
        name: { type: String, default: '' },
        phone: { type: String, default: '' },
        relation: { type: String, default: '' }
    }
}, { timestamps: true });

export const Employee = mongoose.model<IEmployee>('Employee', EmployeeSchema);
