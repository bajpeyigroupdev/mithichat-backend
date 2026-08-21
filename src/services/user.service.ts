import { User } from "../models/user.model";
import { cacheService } from "../utils/cache";

interface GetAllHostsOptions {
  role: string;
  page: number;
  limit: number;
  tab?: string;
  language?: string; // Explicit language filter
}

export const getAllHostsService = async ({
  role,
  page,
  limit,
  userId, // <-- pass the logged-in user's ID here
  tab = 'All',
  language,
}: GetAllHostsOptions & { userId?: string }) => {
  // Create cache key based on parameters
  const cacheKey = `hosts:${role}:${page}:${limit}:${userId || 'none'}:${tab}`;

  // Try to get from cache first (2 minute TTL for host list)
  const cached = cacheService.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Debug Logging
  if (userId) {
    console.log(`🔍 getAllHostsService called for userId: ${userId} (Role: ${role}) - Excluding self`);
  }

  const skip = (page - 1) * limit;

  // Base filter
  let filter: any = { role: "host", isDeleted: false }; // 🧠 Remove isOnline: true default

  if (language) {
    // Hosts map languages as an array, match explicitly or via regex
    filter.languages = { $regex: new RegExp(`^${language}$`, 'i') };
  }

  let fields =
    "userId name image isOnline audio audioPrice videoPrice language languages hobbies isActive bio country role";

  // Role-based access
  switch (role) {
    case "superAdmin":
      fields += " isBlocked";
      break;

    case "admin":
      filter.isBlocked = false;
      break;

    case "user":
    case "host":
      filter.isBlocked = false;
      // 🧠 CHANGED: Show hosts if they are 'isActive' (Available for calls) 
      // even if socket (isOnline) is disconnected due to background.
      // We will rely on Push Notifications to wake them.
      filter.isActive = true;
      // filter.isOnline = true; // ❌ Removed strict online check

      // 🧠 Exclude the current host's own record
      if (userId) {
        // Handle both ObjectId string and Numeric userId
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(userId);
        if (isObjectId) {
          filter._id = { $ne: userId };
        } else {
          // If it's not an ObjectId, assume it's the numeric userId
          // (or handle both if uncertain)
          filter.userId = { $ne: userId };
        }
      }
      break;

    default:
      throw new Error("Access Denied");
  }

  // Count total hosts
  const totalHosts = await User.countDocuments(filter);


  // Sorting Logic
  let sort: any = { isOnline: -1, createdAt: -1 }; // Default (All/Star)

  if (tab === 'New') {
    sort = { createdAt: -1 }; // Newest first
  } else if (tab === 'Trending') {
    sort = { coins: -1, isOnline: -1 }; // Most rich/popular first
  }

  // Fetch hosts
  const hosts = await User.find(filter)
    .select(fields)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  // 🧠 BACKWARD COMPATIBILITY:
  // Old APKs use 'isOnline' to show the Green Dot.
  // Since we now rely on 'isActive' (Push Notifications) for backgrounded hosts,
  // we effectively treat them as "Online" if they are 'isActive'.
  const mappedHosts = hosts.map((host: any) => ({
    ...host,
    isOnline: !!host.isActive, // Enforce 'online' display if they are Active
  }));

  const result = {
    hosts: mappedHosts,
    totalHosts,
    currentPage: page,
    totalPages: Math.ceil(totalHosts / limit),
    limit,
  };

  // Cache the result for 2 minutes
  cacheService.set(cacheKey, result, 120);

  return result;
};

/**
 * Invalidate host cache when host status changes
 */
export const invalidateHostCache = () => {
  cacheService.invalidatePattern('hosts:');
};

