type RegistrySeed = {
  pageId: string;
  name: string;
  category: string;
  actions: string[];
  fields: Array<{ key: string; label: string }>;
  columns: Array<{ key: string; label: string }>;
  buttons: Array<{ key: string; label: string }>;
  tabs: Array<{ key: string; label: string }>;
  filters: Array<{ key: string; label: string }>;
  widgets: Array<{ key: string; label: string }>;
  metadata: { route: string; menu: string; submenu: string };
};

const field = (key: string, label = key) => ({ key, label });
const COMMON_LIST_FIELDS = [
  field("name", "Name"),
  field("email", "Email"),
  field("phoneNumber", "Phone"),
  field("role", "Role"),
  field("employeeCode", "Employee / Referral Code"),
  field("status", "Status"),
  field("createdAt", "Created At"),
];
const COMMON_ACTIONS = ["View", "Create", "Edit", "Approve", "Reject", "Block", "Delete", "Export"];
const COMMON_BUTTONS = ["create", "view", "edit", "approve", "reject", "block", "delete", "permission"].map((key) => field(key));
const COMMON_FILTERS = ["search", "status", "date", "role"].map((key) => field(key));

const definitions: Array<[string, string, string, string, string, string[]?]> = [
  ["/dashboard", "Dashboard", "Dashboard", "Core Console", "Dashboard"],
  ["/users", "User List", "Users", "Users & Roles", "Users", ["coins", "diamonds", "level", "country", "gender", "image"]],
  ["/operators/create", "Create Operator", "Users", "Users & Roles", "Operator"],
  ["/operators/request", "Operator Requests", "Users", "Users & Roles", "Operator"],
  ["/operators", "Operator List", "Users", "Users & Roles", "Operator"],
  ["/super-admins/create", "Create Super Admin", "Users", "Users & Roles", "Super Admin"],
  ["/super-admins/request", "Super Admin Requests", "Users", "Users & Roles", "Super Admin"],
  ["/super-admins", "Super Admin List", "Users", "Users & Roles", "Super Admin"],
  ["/admins/create", "Create Admin", "Users", "Users & Roles", "Admin"],
  ["/admins/request", "Admin Requests", "Users", "Users & Roles", "Admin"],
  ["/admins", "Admin List", "Users", "Users & Roles", "Admin"],
  ["/agencies/create", "Create Agency", "Users", "Users & Roles", "Agency"],
  ["/agencies/request", "Agency Requests", "Users", "Users & Roles", "Agency"],
  ["/agencies", "Agency List", "Users", "Users & Roles", "Agency"],
  ["/hosts/create", "Create Host", "Users", "Users & Roles", "Host"],
  ["/hosts/request", "Host Requests", "Users", "Users & Roles", "Host"],
  ["/hosts", "Host List", "Users", "Users & Roles", "Host", ["level", "coins", "isActive", "isBusy"]],
  ["/host-management", "Host Management", "Users", "Users & Roles", "Host"],
  ["/sellers/create", "Create Seller", "Users", "Users & Roles", "Seller"],
  ["/sellers/request", "Seller Requests", "Users", "Users & Roles", "Seller"],
  ["/sellers", "Seller List", "Users", "Users & Roles", "Seller"],
  ["/customer-support/create", "Create Customer Support", "Users", "Users & Roles", "Customer Support"],
  ["/customer-support/request", "Customer Support Requests", "Users", "Users & Roles", "Customer Support"],
  ["/customer-support", "Customer Support List", "Users", "Users & Roles", "Customer Support"],
  ["/reports", "Reports", "Reports", "Operations & Support", "Reports"],
  ["/help-support", "Help & Support", "Reports", "Operations & Support", "Help & Support"],
  ["/deletions", "Account Deletions", "Reports", "Operations & Support", "Account Deletions"],
  ["/bans/id", "ID Ban", "Notifications", "Security & Verification", "ID Ban"],
  ["/bans/device", "Device Ban", "Notifications", "Security & Verification", "Device Ban"],
  ["/events", "Events", "Notifications", "Security & Verification", "Event"],
  ["/messages/system", "System Messages", "Notifications", "Security & Verification", "System Message"],
  ["/messages/activity", "Activity Messages", "Notifications", "Security & Verification", "Activity"],
  ["/kyc", "KYC Verification", "Notifications", "Security & Verification", "KYC", ["panNumber", "aadharNumber", "panImage", "aadharFrontImage", "aadharBackImage", "rejectionReason"]],
  ["/withdrawals", "Withdrawals", "Finance", "Finance & Recharges", "Withdrawal", ["amount", "coinsDeducted", "method", "details", "transactionId", "rejectionReason"]],
  ["/recharges/user", "User Recharge", "Finance", "Finance & Recharges", "Diamond Recharge"],
  ["/recharges/seller", "Seller Recharge", "Finance", "Finance & Recharges", "Diamond Recharge"],
  ["/organization/chart", "Organization Chart", "Users", "Enterprise Management", "Organization"],
  ["/organization/branches", "Branches", "Users", "Enterprise Management", "Organization"],
  ["/organization/departments", "Departments", "Users", "Enterprise Management", "Organization"],
  ["/organization/teams", "Teams", "Users", "Enterprise Management", "Organization"],
  ["/tasks", "Task Management", "Users", "Enterprise Management", "Tasks"],
  ["/settings", "Settings", "Settings", "Enterprise Suite", "Settings"],
  ["/settings/workflows", "Workflows", "Settings", "Enterprise Suite", "Workflows"],
  ["/security/permissions", "Permission Builder", "Settings", "Enterprise Suite", "Permissions"],
  ["/security/templates", "Role Templates", "Settings", "Enterprise Suite", "Permissions"],
  ["/security/compare", "Compare Users", "Settings", "Enterprise Suite", "Permissions"],
  ["/referrals/links", "Referral Links", "Settings", "Enterprise Suite", "Referrals"],
  ["/ai/insights", "AI Insights", "Dashboard", "AI Command Center", "AI"],
  ["/ai/automation", "AI Automation", "Dashboard", "AI Command Center", "AI"],
  ["/analytics/live-map", "Live User Map", "Reports", "Analytics", "Analytics"],
  ["/health", "System Health", "Reports", "Analytics", "Health"],
  ["/owner", "Owner Console", "Dashboard", "Executive Command", "Owner"],
  ["/finance/ledger", "Finance Ledger", "Dashboard", "Executive Command", "Finance"],
  ["/compliance", "Compliance & GDPR", "Dashboard", "Executive Command", "Compliance"],
  ["/logs", "System Logs", "Developer", "System Control", "Logs"],
  ["/security/logs", "Audit Logs", "Developer", "System Control", "Logs"],
  ["/api-center", "API Center", "Developer", "System Control", "API"],
];

export const PAGE_PERMISSION_REGISTRY: RegistrySeed[] = definitions.map(
  ([route, name, category, menu, submenu, extraFields = []]) => {
    const fields = [...COMMON_LIST_FIELDS, ...extraFields.map((key) => field(key))];
    return {
      pageId: route.replace(/^\//, ""),
      name,
      category,
      actions: COMMON_ACTIONS,
      fields,
      columns: fields,
      buttons: COMMON_BUTTONS,
      tabs: ["all", "pending", "active", "approved", "rejected"].map((key) => field(key)),
      filters: COMMON_FILTERS,
      widgets: route === "/dashboard"
        ? ["totalUsers", "activeHosts", "todayMinutes", "revenue"].map((key) => field(key))
        : [],
      metadata: { route, menu, submenu },
    };
  }
);
