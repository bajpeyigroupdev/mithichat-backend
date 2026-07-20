import { User } from '../models/user.model';
import { Employee } from '../models/employee.model';
import { RecruitmentApplication } from '../models/recruitmentApplication.model';
import { generateSecureHash } from '../utils/passwordHelper';
import { generateUniqueId } from '../utils/generator';
import { Logger } from '../utils/logger';

export async function automateEmployeeCreationOnApproval(applicationId: string) {
    try {
        const app = await RecruitmentApplication.findOne({
            $or: [{ _id: applicationId }, { applicationId }]
        });

        if (!app || app.status !== 'approved') {
            return { success: false, message: 'Application is not approved or not found' };
        }

        // Check if user account already exists by email
        let user = await User.findOne({ email: app.applicant.email.toLowerCase() });

        if (!user) {
            const newUserId = await generateUniqueId();
            const defaultPassword = await generateSecureHash('Welcome@123');
            const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
            const employeeCode = `EMP${newUserId}${randomCode}`;

            user = await User.create({
                userId: newUserId,
                name: app.applicant.name,
                email: app.applicant.email.toLowerCase(),
                phoneNumber: app.applicant.phone,
                password: defaultPassword,
                role: app.role === 'customer-service' ? 'customerSupport' : app.role,
                gender: app.applicant.gender || 'other',
                employeeCode,
                isActive: true,
                emailVerified: true
            });
        }

        // Check if employee record already exists
        let employee = await Employee.findOne({ userId: user._id });
        if (!employee) {
            employee = await Employee.create({
                employeeCode: user.employeeCode || `EMP-${user.userId}`,
                userId: user._id,
                applicationId: app.applicationId,
                designation: `${app.role.toUpperCase()} Lead`,
                status: 'active_employee',
                joiningDate: new Date(),
                offerLetterUrl: `https://api.mithichat.live/policies/offer-${app.applicationId}.pdf`
            });
        }

        return { success: true, user, employee };
    } catch (error: any) {
        await Logger('automateEmployeeCreationOnApproval', error);
        return { success: false, message: error.message || 'Failed to automate employee lifecycle' };
    }
}
