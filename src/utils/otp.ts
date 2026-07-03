import { transporter } from "../configs/emailConfig";
import { config } from "../configs/envConfig";

export const generateOtp = (length: number = 6): string => {
    return Math.floor(10 ** (length - 1) + Math.random() * 9 * (10 ** (length - 1))).toString();
};

// Generic Email Sender Function
export const sendEmail = async (email: string, subject: string, message: string) => {
    const generatedTime = new Date().toISOString().replace("T", " ").split(".")[0];

    const mailOptions = {
        from: `"Talk Live" <${config.EMAIL_USER}>`,
        to: email,
        subject,
        html: `
        <p>Dear MithiChatLive user,</p>
        <p>${message}</p>
        <p>(Generated at ${generatedTime})</p>
        <hr>
        <p>This is an auto-generated email. Do not reply to this email.</p>
        `,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        return { message: "Email sent successfully", info };
    } catch (error) {
        console.error("Error sending email:", error);
        return { message: "Failed to send email", error };
    }
};

// Function to send different types of emails
export const sendCustomEmail = async (
    type: "otp" | "forgotPassword" | "agencyApproved" | "agencyRejected" | "hostApproved" | "hostRejected",
    email: string,
    data?: any
  ) => {
    const subjects: Record<string, string> = {
      otp: `${data?.otp} is OTP for MithiChatLive Email verification`,
      forgotPassword: `${data?.otp} is OTP for MithiChatLive account forgot password`,
      agencyApproved: `Your Agency Application for ${data?.agencyName} is Approved`,
      agencyRejected: `Your Agency Application for ${data?.agencyName} is Rejected`,
      hostApproved: `Your Host Application for ${data?.hostName} is Approved`,
      hostRejected: `Your Host Application for ${data?.hostName} is Rejected`,
    };
  
    const messages: Record<string, string> = {
      otp: `Your MithiChatLive Account One Time PIN is: <strong>${data?.otp}</strong>, and is valid for <strong>10 minutes</strong>.`,
      forgotPassword: `Your MithiChatLive Account change password One Time PIN is: <strong>${data?.otp}</strong>, and is valid for <strong>10 minutes</strong>.`,
      agencyApproved: `Congratulations! Your agency application has been approved. 
        <br><br> Please complete your registration using this link: <a href="${data?.formUrl}">${data?.formUrl}</a> (valid for 7 days).`,
      agencyRejected: `We regret to inform you that your agency application has been rejected. If you have any concerns, please contact support.`,
      hostApproved: `Congratulations! Your host application has been approved. 
        <br><br> Please complete your registration using this link: <a href="${data?.formUrl}">${data?.formUrl}</a> (valid for 7 days).`,
      hostRejected: `We regret to inform you that your host application has been rejected. If you have any concerns, please contact support.`,
    };
  
    return await sendEmail(email, subjects[type], messages[type]);
  };
  

// Function to send OTP for email verification
export const sendOtpForEmailVerification = async (email: string, otp: string) => {
    const subject = `${otp} is your OTP for MithiChatLive Email Verification`;
    const message = `Your MithiChatLive Account One Time PIN (OTP) is: <strong>${otp}</strong>. It is valid for <strong>10 minutes</strong>. Please do not share it with anyone.`;

    return await sendEmail(email, subject, message);
};

