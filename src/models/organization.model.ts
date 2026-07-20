import mongoose, { Schema, Document } from 'mongoose';

export interface IOrganization extends Document {
    name: string;
    code: string;
    description?: string;
    logoUrl?: string;
    headquartersAddress?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface IBranchRegion extends Document {
    orgId: mongoose.Types.ObjectId;
    name: string;
    code: string;
    country: string;
    state?: string;
    city: string;
    isActive: boolean;
}

export interface IDepartment extends Document {
    orgId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    name: string;
    code: string;
    headUserId?: mongoose.Types.ObjectId;
    isActive: boolean;
}

export interface ITeam extends Document {
    orgId: mongoose.Types.ObjectId;
    departmentId: mongoose.Types.ObjectId;
    name: string;
    code: string;
    leadUserId?: mongoose.Types.ObjectId;
    isActive: boolean;
}

const OrganizationSchema = new Schema<IOrganization>({
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    description: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    headquartersAddress: { type: String, default: '' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

const BranchRegionSchema = new Schema<IBranchRegion>({
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, required: true, uppercase: true },
    country: { type: String, required: true, default: 'India' },
    state: { type: String, default: '' },
    city: { type: String, required: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

const DepartmentSchema = new Schema<IDepartment>({
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'BranchRegion' },
    name: { type: String, required: true },
    code: { type: String, required: true, uppercase: true },
    headUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

const TeamSchema = new Schema<ITeam>({
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    name: { type: String, required: true },
    code: { type: String, required: true, uppercase: true },
    leadUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const Organization = mongoose.model<IOrganization>('Organization', OrganizationSchema);
export const BranchRegion = mongoose.model<IBranchRegion>('BranchRegion', BranchRegionSchema);
export const Department = mongoose.model<IDepartment>('Department', DepartmentSchema);
export const Team = mongoose.model<ITeam>('Team', TeamSchema);
